import { preloz } from "@/lib/i18n/jazyk";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, RefreshCw, FileInput, ExternalLink, Eye, Download, X, Paperclip, Send, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NahladPdfOkno } from "@/components/faktero/NahladPdfOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  listPrijateEfakturyFn,
  nahladPrijatejEfakturyFn,
  prilohaPrijatejEfakturyFn,
  prilohyPrijatejEfakturyFn,
  stiahniPrijateBisFn,
  stiahniPrijateEfakturyFn,
  zaevidujPrijatuEfakturuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { formatujMenu } from "@/lib/faktero/mena";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import {
  NalezyKontrolyEfaktury,
  OdznakKontrolyEfaktury,
} from "@/components/faktero/NalezyKontrolyEfaktury";
import { nacitajUlozenuKontrolu } from "@/lib/faktero/efaktura/kontrola/ulozenie";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { odkazNaZaradenie } from "@/lib/faktero/efaktura/zaevidovanie-efaktury";

export const Route = createFileRoute("/_authenticated/efaktura/prijate")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté eFaktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: ReceivedPage,
});

/** Deň v miestnom čase — `received_at` je v UTC a po polnoci by patril včerajšku. */
function denLokalne(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function suma(hodnota: unknown, mena: string | null): string {
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return "—";
  return formatujMenu(n, mena ?? "EUR");
}

/** Stav rozobratia dokladu — nie stav úhrady. */
/* Stav po slovensky — zoznam ukazoval kódy „parsed“, „matched“. */
const NAZVY_STAVOV: Record<string, string> = {
  received: "Prijatá",
  parsed: "Na zaevidovanie",
  parse_error: "Nečitateľná",
  matched: "Zaevidovaná",
  accepted: "Akceptovaná",
  rejected: "Odmietnutá",
  archived: "Archivovaná",
};

function StavDokladu({ stav }: { stav: string | null }) {
  const { t } = useT();
  const zle = stav === "parse_error" || stav === "rejected";
  const nazov = stav ? NAZVY_STAVOV[stav] : null;
  return (
    <span className={`text-xs ${zle ? "text-destructive" : "text-muted-foreground"}`}>
      {nazov ? t(nazov) : (stav ?? "—")}
    </span>
  );
}

type Nahlad = { url: string; nazov: string; prilozene: boolean };

/**
 * Nálezy automatickej kontroly jednej prijatej eFaktúry — uložené pri príjme,
 * načítajú sa až po rozbalení (zoznam ťahá len počty).
 */
function NalezyPrijatej({ receivedId }: { receivedId: string }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["efaktura-prijata-kontrola", receivedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efaktura_received_documents")
        .select("kontrola_vysledok, skontrolovane_at")
        .eq("id", receivedId)
        .maybeSingle();
      if (error) throw error;
      return {
        kontrola: nacitajUlozenuKontrolu(data?.kontrola_vysledok),
        kedy: data?.skontrolovane_at ?? null,
      };
    },
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>;
  const k = q.data?.kontrola;
  if (!k) return <p className="text-sm text-muted-foreground">{t("Výsledok kontroly nie je k dispozícii.")}</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t(
          "Automatická kontrola podľa EN 16931 a Peppol BIS Billing 3.0 pri prijatí. eFaktúra je prijatá aj s chybami — chyby sú na strane dodávateľa, dajte mu o nich vedieť.",
        )}
        {q.data?.kedy ? ` ${t("Skontrolované {kedy}.", { kedy: new Date(q.data.kedy).toLocaleString("sk-SK") })}` : ""}
      </p>
      <NalezyKontrolyEfaktury nalezy={k.nalezy} pocetChyb={k.pocetChyb} pocetVarovani={k.pocetVarovani} />
      {k.orezane > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Ďalšie nálezy sa neuložili: {n}.", { n: k.orezane })}
        </p>
      )}
    </div>
  );
}

type PrilohaPrijatej = {
  index: number;
  nazov: string;
  mime: string | null;
  popis: string | null;
  velkost: number | null;
  odkaz: string | null;
};

/**
 * Prílohy prijatej eFaktúry (BG-24) — PDF faktúry, výkazy, dodacie listy.
 * Sú len v uloženom XML, tak sa načítajú až po otvorení okna.
 */
function PrilohyPrijatejOkno({
  companyId,
  receivedId,
  cislo,
  onClose,
}: {
  companyId: string;
  receivedId: string;
  cislo: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const zoznamFn = useServerFn(prilohyPrijatejEfakturyFn);
  const stiahniFn = useServerFn(prilohaPrijatejEfakturyFn);
  const [prilohy, setPrilohy] = useState<PrilohaPrijatej[] | null>(null);
  const [stahujem, setStahujem] = useState<number | null>(null);
  useZatvorNaEscape(onClose);

  useEffect(() => {
    let zive = true;
    zoznamFn({ data: { company_id: companyId, received_id: receivedId } })
      .then((r: any) => zive && setPrilohy(r.prilohy as PrilohaPrijatej[]))
      .catch((e) => {
        if (!zive) return;
        toast.error((e as Error).message);
        setPrilohy([]);
      });
    return () => {
      zive = false;
    };
  }, [companyId, receivedId]);

  async function stiahni(p: PrilohaPrijatej) {
    setStahujem(p.index);
    try {
      const r: any = await stiahniFn({
        data: { company_id: companyId, received_id: receivedId, index: p.index },
      });
      const bajty = Uint8Array.from(atob(r.obsah), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bajty], { type: r.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nazov;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStahujem(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Prílohy eFaktúry")}
        className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold">
            {t("Prílohy eFaktúry")} {cislo}
          </h3>
          <button onClick={onClose} aria-label={t("Zavrieť")} className="rounded-md p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {prilohy === null ? (
          <p className="text-sm text-muted-foreground">{t("Načítavam…")}</p>
        ) : prilohy.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Dodávateľ k eFaktúre nič nepriložil.")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {prilohy.map((p) => (
              <li key={p.index} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <div className="break-all font-medium">{p.nazov}</div>
                  <div className="text-xs text-muted-foreground">
                    {[p.popis, p.mime, velkost(p.velkost)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {p.velkost != null ? (
                  <button
                    onClick={() => stiahni(p)}
                    disabled={stahujem === p.index}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />{" "}
                    {stahujem === p.index ? t("Sťahujem…") : t("Stiahnuť")}
                  </button>
                ) : p.odkaz && /^https?:\/\//i.test(p.odkaz) ? (
                  <a
                    href={p.odkaz}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {t("Otvoriť odkaz")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReceivedPage() {
  const { t } = useT();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stahujem, setStahujem] = useState(false);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);

  const listFn = useServerFn(listPrijateEfakturyFn);
  const stiahni = useServerFn(stiahniPrijateEfakturyFn);
  const bisFn = useServerFn(stiahniPrijateBisFn);
  const [bisBusy, setBisBusy] = useState(false);
  /** Zobrazené eFaktúry v pôvodnom XML pre „Import z BIS“ v Pohode. */
  async function stiahniBis() {
    if (!companyId) return;
    setBisBusy(true);
    try {
      const r = await bisFn({ data: { company_id: companyId, ids: zobrazene.map((x: any) => x.id) } });
      downloadFile(r.fileName, r.content, "application/zip", "base64");
      toast.success(t("Stiahnuté eFaktúry: {n}. V Pohode: Súbor → Dátová komunikácia → Import z BIS.", { n: r.pocet }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Stiahnutie zlyhalo"));
    } finally {
      setBisBusy(false);
    }
  }
  const zaeviduj = useServerFn(zaevidujPrijatuEfakturuFn);
  const [evidujem, setEvidujem] = useState<string | null>(null);
  const nahladFn = useServerFn(nahladPrijatejEfakturyFn);
  const [nacitavamNahlad, setNacitavamNahlad] = useState<string | null>(null);
  const [nahlad, setNahlad] = useState<Nahlad | null>(null);
  const [prilohyOkno, setPrilohyOkno] = useState<{ id: string; cislo: string } | null>(null);
  const [rozbalene, setRozbalene] = useState<string | null>(null);
  const lf = useListFilters();
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const podla = lf.filter("podla") || "vystavenie";

  async function otvorNahlad(receivedId: string) {
    if (!companyId) return;
    setNacitavamNahlad(receivedId);
    try {
      const r: any = await nahladFn({ data: { company_id: companyId, received_id: receivedId } });
      const bajty = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bajty], { type: "application/pdf" }));
      setNahlad({ url, nazov: r.nazov, prilozene: r.prilozene });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNacitavamNahlad(null);
    }
  }

  function zavriNahlad() {
    setNahlad((n) => {
      if (n) URL.revokeObjectURL(n.url);
      return null;
    });
  }

  /** Zaeviduje prijatú eFaktúru tam, kam to firma nastavila (eFaktúra → Príjem). */
  async function zaevidujDoklad(receivedId: string) {
    if (!companyId) return;
    const chyby = Number(kontroly.get(receivedId)?.kontrola_chyby ?? 0);
    if (
      chyby > 0 &&
      !(await potvrd(
        t(
          "Automatická kontrola našla v tejto eFaktúre chyby ({n}). Sumy, DPH alebo povinné údaje nemusia byť správne. Zaevidovať ju aj tak?",
          { n: chyby },
        ),
        { potvrdit: t("Zaevidovať aj tak") },
      ))
    ) {
      setRozbalene(receivedId);
      return;
    }
    setEvidujem(receivedId);
    try {
      const r: any = await zaeviduj({ data: { company_id: companyId, received_id: receivedId } });
      const odkaz = odkazNaZaradenie(r);
      const doNespracovanych = r.kam === "nespracovane";
      // Toast s odkazom tam, kam doklad išiel — aj keď sa doklad neotvára.
      toast.success(
        r.pripojena
          ? doNespracovanych
            ? t("Táto faktúra už čaká v Nespracovaných (prišla inou cestou) — eFaktúra je pripojená k nej, druhá sa nezakladá.")
            : t("Táto faktúra už medzi prijatými bola (prišla inou cestou) — eFaktúra je pripojená k nej, druhá sa nezakladá.")
          : r.uzExistovala
            ? t("Táto eFaktúra už zaevidovaná je.")
            : doNespracovanych
              ? t("Odložené do Nespracovaných dokladov na kontrolu.")
              : r.typ === "proforma"
                ? t("Zaevidované ako prijatá zálohová faktúra.")
                : t("Zaevidované ako prijatá faktúra. Skontrolujte sumy a dátumy."),
        {
          duration: 8000,
          action: {
            label: doNespracovanych ? t("Otvoriť v Nespracovaných") : t("Otvoriť doklad"),
            onClick: () => window.open(odkaz, "_blank", "noopener,noreferrer"),
          },
        },
      );
      if (chyby > 0)
        toast.warning(
          t("Pozor: eFaktúra má podľa automatickej kontroly chyby ({n}) — skontrolujte sumy a DPH na prijatej faktúre.", { n: chyby }),
          { duration: 10000 },
        );
      q.refetch();
      void kontrolyQ.refetch();
      // Odznaky Prijaté eFaktúry, Nespracované a Moje úlohy sa tým zmenili.
      obnovPoctyMenu();
      if (r.otvorit) window.open(odkaz, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEvidujem(null);
    }
  }

  const q = useQuery({
    queryKey: ["efaktura-prijate", companyId],
    queryFn: () => listFn({ data: { company_id: companyId! } }),
    enabled: !!companyId,
  });

  async function stiahniNove() {
    if (!companyId) return;
    setStahujem(true);
    try {
      const r: any = await stiahni({ data: { company_id: companyId } });
      const n = r.novych;
      const kusy = t(
        n === 1 ? "{n} faktúra" : n > 1 && n < 5 ? "{n} faktúry" : "{n} faktúr",
        { n },
      );
      toast.success(
        n
          ? t("Stiahnuté: {kusy}.", { kusy }) +
              (r.preskocenych ? " " + t("Už uložené: {n}.", { n: r.preskocenych }) : "")
          : t("Nič nové — všetko doručené už máte."),
      );
      if (r.zaevidovanych)
        toast.success(t("Automaticky zaevidované: {n}.", { n: r.zaevidovanych }));
      void kontrolyQ.refetch();
      if (n || r.zaevidovanych) obnovPoctyMenu();
      // Problémy sa nezamlčia: doklad, ktorý sa nepodarilo stiahnuť, by inak
      // ticho chýbal a nikto by nevedel, že vôbec bol.
      if (r.problemy?.length)
        toast.error(t("Nepodarilo sa: {zoznam}", { zoznam: r.problemy.join(" · ") }), {
          duration: 12000,
        });
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStahujem(false);
    }
  }

  const riadky = (q.data ?? []) as any[];

  /* Počty z automatickej kontroly — rovnaký výber ako zoznam (posledných 200). */
  const kontrolyQ = useQuery({
    queryKey: ["efaktura-prijate-kontroly", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("efaktura_received_documents")
        .select("id, kontrola_chyby, kontrola_varovania")
        .eq("company_id", companyId!)
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
  const kontroly = new Map((kontrolyQ.data ?? []).map((k) => [k.id, k]));

  // Hľadanie a obdobie len prechádzajú načítané eFaktúry.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = riadky.filter((r) => {
    const datum =
      podla === "prijatie" ? r.received_at : podla === "splatnost" ? r.due_date : r.issue_date;
    const den = datum
      ? podla === "prijatie"
        ? denLokalne(datum)
        : String(datum).slice(0, 10)
      : "";
    if (obdobieOd && (!den || den < obdobieOd)) return false;
    if (obdobieDo && (!den || den > obdobieDo)) return false;
    if (!hladane) return true;
    return [r.document_number, r.sender_name, r.sender_participant_id]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(hladane));
  });

  /* Firma „len odosielanie“ prijíma u iného poskytovateľa — tu nič nepribudne. */
  const profilQ = useQuery({
    queryKey: ["efaktura-profil-rezim", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("efaktura_profiles")
        .select("rezim, prijem_poskytovatel")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!companyId,
  });
  const lenOdosielanie = profilQ.data?.rezim === "len_odosielanie";
  const poskytovatel = profilQ.data?.prijem_poskytovatel ?? null;

  return (
    <>
      <PageHeader
        title={t("Prijaté eFaktúry")}
        description={t("eFaktúry doručené od vašich dodávateľov cez sieť Peppol.")}
        action={
          lenOdosielanie ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
          {riadky.length > 0 && (
            <button
              onClick={() => void stiahniBis()}
              disabled={bisBusy}
              title={t("Pôvodné XML zobrazených eFaktúr v ZIP-e — Pohoda ich načíta povelom Import z BIS.")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t("XML pre Pohodu (BIS)")}
            </button>
          )}
          <Link
            to="/efaktura"
            hash="prijem"
            title={t("Kam sa zaevidovaná eFaktúra zaradí, automatické zaevidovanie")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary"
          >
            <Settings2 className="h-4 w-4" /> {t("Nastavenia príjmu")}
          </Link>
          <button
            onClick={stiahniNove}
            disabled={stahujem || !companyId}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${stahujem ? "animate-spin" : ""}`} />{" "}
            {stahujem ? t("Sťahujem…") : t("Stiahnuť nové")}
          </button>
          </div>
          )
        }
      />
      <PageBody>
        {lenOdosielanie && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="font-medium">
                {poskytovatel
                  ? t("Len odosielanie — prijaté eFaktúry prichádzajú k {poskytovatel}", { poskytovatel })
                  : t("Len odosielanie — prijaté eFaktúry prichádzajú k vášmu poskytovateľovi príjmu")}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("Z Faktera eFaktúry len odosielate. Doručené eFaktúry aj odpovede odberateľov nájdete u poskytovateľa, u ktorého ich prijímate.")}
              </p>
            </div>
          </div>
        )}
        {riadky.length > 0 && (
          <DocumentListToolbar
            lf={lf}
            searchPlaceholder="Hľadať dodávateľa alebo číslo"
            filters={[
              {
                key: "obdobie",
                label: "Obdobie",
                type: "dateRange",
                dateFieldOptions: [
                  { value: "vystavenie", label: "dátumu vystavenia" },
                  { value: "prijatie", label: "dátumu prijatia" },
                  { value: "splatnost", label: "dátumu splatnosti" },
                ],
              },
            ]}
          />
        )}
        {!q.isLoading && riadky.length === 0 ? (
          lenOdosielanie ? null : (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Inbox className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("Zatiaľ tu nič nie je")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("Doručené eFaktúry sa sem stiahnu tlačidlom hore. Firma musí byť spárovaná s ePoštákom — spraví sa to na prehľade eFaktúry.")}
            </p>
          </div>
          )
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Doručené")}</th>
                  <th className="p-3">{t("Dodávateľ")}</th>
                  <th className="p-3">{t("Doklad")}</th>
                  <th className="p-3">{t("Vystavená")}</th>
                  <th className="p-3">{t("Splatnosť")}</th>
                  <th className="p-3 text-right">{t("Suma")}</th>
                  <th className="p-3">{t("Stav")}</th>
                  <th className="p-3">{t("Kontrola")}</th>
                  <th className="p-3 text-right">{t("Akcie")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      {t("Načítavam…")}
                    </td>
                  </tr>
                )}
                {riadky.length > 0 && zobrazene.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      {t("Nič nevyhovuje filtru.")}
                    </td>
                  </tr>
                )}
                {zobrazene.map((r) => (
                  <Fragment key={r.id}>
                  <tr>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.received_at ? new Date(r.received_at).toLocaleString("sk-SK") : "—"}
                    </td>
                    <td className="p-3">
                      {r.sender_name ?? "—"}
                      {r.sender_participant_id && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.sender_participant_id}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{r.document_number ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.issue_date ? datumNaDoklade(r.issue_date) : "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.due_date ? datumNaDoklade(r.due_date) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{suma(r.total, r.currency)}</td>
                    <td className="p-3">
                      <StavDokladu stav={r.status} />
                    </td>
                    <td className="p-3">
                      <OdznakKontrolyEfaktury
                        chyby={kontroly.get(r.id)?.kontrola_chyby}
                        varovania={kontroly.get(r.id)?.kontrola_varovania}
                        rozbalene={rozbalene === r.id}
                        onClick={() => setRozbalene((x) => (x === r.id ? null : r.id))}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => otvorNahlad(r.id)}
                          disabled={nacitavamNahlad === r.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                        >
                          <Eye className="h-3.5 w-3.5" />{" "}
                          {nacitavamNahlad === r.id ? t("Načítavam…") : t("Náhľad")}
                        </button>
                        <button
                          onClick={() => setPrilohyOkno({ id: r.id, cislo: r.document_number ?? "" })}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {t("Prílohy")}
                        </button>
                        {r.matched_supplier_invoice_id ? (
                          <a
                            href={`/prijate-faktury/${r.matched_supplier_invoice_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> {t("Otvoriť doklad")}
                          </a>
                        ) : r.nespracovany_id ? (
                          <a
                            href={`/nespracovane/${r.nespracovany_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> {t("V Nespracovaných")}
                          </a>
                        ) : (
                          <button
                            onClick={() => zaevidujDoklad(r.id)}
                            disabled={evidujem === r.id}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <FileInput className="h-3.5 w-3.5" />{" "}
                            {evidujem === r.id ? t("Evidujem…") : t("Zaevidovať")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {rozbalene === r.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={9} className="p-3">
                        <NalezyPrijatej receivedId={r.id} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
      {prilohyOkno && companyId && (
        <PrilohyPrijatejOkno
          companyId={companyId}
          receivedId={prilohyOkno.id}
          cislo={prilohyOkno.cislo}
          onClose={() => setPrilohyOkno(null)}
        />
      )}
      {nahlad && (
        <NahladPdfOkno
          url={nahlad.url}
          nazov={nahlad.nazov}
          poznamka={
            nahlad.prilozene
              ? null
              : t("Dodávateľ k eFaktúre PDF nepriložil — náhľad je vykreslený z údajov eFaktúry.")
          }
          onClose={zavriNahlad}
        />
      )}
    </>
  );
}
