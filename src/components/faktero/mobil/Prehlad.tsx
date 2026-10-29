import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  Car,
  ChevronDown,
  FilePlus2,
  FileText,
  Inbox,
  Landmark,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { beziacaJazda } from "@/lib/mobile/auto-jazdy-sync";
import { jeOtvorena, jePoSplatnosti, sucetDokladov } from "@/lib/faktero/faktury-sumy";
import { domacaMena } from "@/lib/faktero/kurzy";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import {
  hraniceMesiaca,
  spocitajMesiac,
  type BlocekMesiaca,
  type CislaMesiaca,
  type FakturaMesiaca,
  type PrijataMesiaca,
} from "@/lib/mobile/cisla-mesiaca";
import {
  Card,
  ListCard,
  ListRow,
  PrazdnyStav,
  QuickAction,
  SectionHeader,
  suma,
  type Ton,
} from "./ui";
import { PrebiehaJazda } from "./PrebiehaJazda";
import { OznamEfaktury } from "./OznamEfaktury";
import { dotazNezaevidovanych } from "@/lib/faktero/efaktura/upozornenie-prijatej";

/**
 * Úvodná obrazovka appky (smer „A · Svetlý a pokojný").
 *
 * Odpovedá na otázky v poradí, v akom si ich človek kladie: koľko mi dlhujú
 * (veľká zelená karta), ako stojí mesiac (riadok čísel), čo chcem spraviť
 * (dlaždice), čo mám vybaviť a čo sa naposledy stalo.
 *
 * Sumy aj počty v karte a v zoznamoch vznikajú zo zoznamu faktúr a dokladov,
 * ktoré si appka aj tak ťahá. Čísla za mesiac idú priamo z databázy tými
 * istými pravidlami ako nástenka na webe (`cisla-mesiaca`). Keď zlyhá sieť,
 * obrazovka ostane prázdna a nepovie nepravdu — nula neuhradených a „nič
 * nečaká" vyzerajú rovnako a to je horšie než prázdno.
 */

type Faktura = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total: number | string;
  currency: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  type: string;
  paid_at?: string | null;
};

type Doklad = {
  id: string;
  supplier_name: string | null;
  total_amount: number | string | null;
  currency: string | null;
  created_at: string;
};

type Riadok = {
  id: string;
  nazov: string;
  popis: string;
  suma: string;
  ton: Ton;
  kedy: string;
  cas: string;
};

const DNES = () => new Date().toISOString().slice(0, 10);

export function Prehlad({
  firma,
  viacFiriem = false,
  onZmenitFirmu,
  oznamy,
  onNovaFaktura,
  onSkener,
  onJazda,
  onBanka,
  onFaktury,
  onDoklady,
}: {
  firma: { id: string; name: string };
  /** Pri viacerých firmách sa dá názov firmy ťuknutím prepnúť. */
  viacFiriem?: boolean;
  onZmenitFirmu?: () => void;
  /** Pásy nad obsahom — nová verzia, naplánované zrušenie účtu. */
  oznamy?: ReactNode;
  onNovaFaktura: () => void;
  onSkener: () => void;
  /** Chýba pri firme, ktorá knihu jázd nemá (nemecká) — rýchla akcia Jazda sa vynechá. */
  onJazda?: () => void;
  /** Banka nemá miesto v spodnej lište — preto je tu ako rýchla akcia. */
  onBanka?: () => void;
  onFaktury: () => void;
  onDoklady: () => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const nacitajFaktury = useOperacia("faktury-zoznam");
  const nacitajDoklady = useOperacia("vydavky-zoznam");
  const [faktury, setFaktury] = useState<Faktura[] | null>(null);
  const [doklady, setDoklady] = useState<Doklad[] | null>(null);
  const [mesiac, setMesiac] = useState<CislaMesiaca | null>(null);
  const [jazdaBezi, setJazdaBezi] = useState(false);
  /* Prijaté eFaktúry, ktoré ešte nikto nezaevidoval — to isté, čo počíta menu na webe. */
  const [efaktury, setEfaktury] = useState(0);

  useEffect(() => {
    let zrusene = false;
    /*
      Volania naraz a každé si nesie vlastný pád. Keby boli v jednom `try`,
      chyba pri dokladoch by zmazala aj faktúry — a práve tie sú dôvod,
      prečo sem človek ide.
    */
    void (async () => {
      try {
        const z = (await nacitajFaktury({ data: { company_id: firma.id } })) as Faktura[];
        if (!zrusene) setFaktury(z);
      } catch {
        if (!zrusene) setFaktury([]);
      }
    })();
    void (async () => {
      try {
        const z = (await nacitajDoklady({ data: { company_id: firma.id } })) as Doklad[];
        if (!zrusene) setDoklady(z);
      } catch {
        if (!zrusene) setDoklady([]);
      }
    })();
    setMesiac(null);
    void nacitajCislaMesiaca(firma.id)
      .then((c) => !zrusene && setMesiac(c))
      .catch(() => {
        /* bez signálu riadok čísel jednoducho chýba */
      });
    void beziacaJazda()
      .then((j) => !zrusene && setJazdaBezi(!!j))
      .catch(() => {});
    setEfaktury(0);
    void Promise.resolve(dotazNezaevidovanych(supabase, firma.id, "id", true))
      .then((r: { count: number | null; error: unknown }) => {
        if (!zrusene && !r.error) setEfaktury(r.count ?? 0);
      })
      .catch(() => {
        /* bez signálu riadok jednoducho chýba */
      });
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  const mena = mesiac?.mena ?? faktury?.[0]?.currency ?? "EUR";

  /*
    Neuhradené a po splatnosti tými istými pravidlami ako web: koncept,
    zrušená, zálohová a dobropis nie sú pohľadávka; po splatnosti sa počíta
    z dátumu, lebo stav `overdue` nikto nezapisuje.
  */
  const neuhradene = useMemo(() => {
    const zoznam = (faktury ?? []).filter((f) => jeOtvorena(f));
    return { pocet: zoznam.length, spolu: sucetDokladov(zoznam, "total") };
  }, [faktury]);

  const poSplatnosti = useMemo(() => {
    const den = DNES();
    const zoznam = (faktury ?? []).filter((f) => jePoSplatnosti(f, den));
    return { pocet: zoznam.length, spolu: sucetDokladov(zoznam, "total") };
  }, [faktury]);

  /* Doklad bez dodávateľa alebo bez sumy sa neprečítal celý — patrí na oči. */
  const naKontrolu = useMemo(
    () => (doklady ?? []).filter((d) => !d.supplier_name || d.total_amount == null).length,
    [doklady],
  );

  const aktivita = useMemo<Riadok[]>(() => {
    const zFaktur = (faktury ?? []).slice(0, 8).map((f) => ({
      id: `f:${f.id}`,
      nazov: f.customer_name ?? "—",
      popis: t("ph.fakturaCislo", { cislo: f.invoice_number }),
      suma: `+${suma(f.total, f.currency, loc)}`,
      ton: "zelena" as Ton,
      kedy: f.issue_date,
      cas: "",
    }));
    const zDokladov = (doklady ?? []).slice(0, 8).map((d) => ({
      id: `d:${d.id}`,
      nazov: d.supplier_name ?? "—",
      popis: t("ph.doklad"),
      suma: `−${suma(d.total_amount, d.currency, loc)}`,
      ton: "neutral" as Ton,
      kedy: (d.created_at ?? "").slice(0, 10),
      cas: "",
    }));
    return [...zFaktur, ...zDokladov]
      .sort((a, b) => b.kedy.localeCompare(a.kedy))
      .slice(0, 5)
      .map((r) => ({ ...r, cas: kedySlovom(r.kedy, loc, t) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faktury, doklady, loc]);

  /* Tvar slova „faktúra" rieši pravidlo jazyka, nie táto obrazovka. */
  const pocetFaktur = (pocet: number) =>
    `${pocet} ${mnozne(pocet, {
      one: t("spolocne.faktura1"),
      few: t("spolocne.faktura2"),
      other: t("spolocne.faktura5"),
    })}`;

  const nacitava = faktury === null || doklady === null;
  const maCoVybavit =
    poSplatnosti.pocet > 0 || naKontrolu > 0 || efaktury > 0 || (jazdaBezi && !!onJazda);

  /* Len čísla, ktoré sa dali spočítať — chýbajúce sa vynechajú, nehádajú. */
  const stlpce = mesiac
    ? (
        [
          ["ph.mesiac.trzby", mesiac.trzby, false],
          ["ph.mesiac.naklady", mesiac.naklady, false],
          ["ph.mesiac.dph", mesiac.dph, false],
          ["ph.mesiac.neuhradene", mesiac.neuhradene, true],
        ] as const
      ).filter(([, v]) => v !== null)
    : [];

  return (
    <div className="flex flex-1 flex-col bg-app-pozadie">
      <header
        className="flex items-center justify-between gap-3 px-5 pb-1"
        style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}
      >
        <div className="min-w-0">
          <p className="text-[13px] text-app-text-2">{dnesSlovom(loc)}</p>
          {/*
            Za koho sa pracuje — doklad uložený do zlej firmy sa hľadá ťažko,
            takže to musí byť vidieť stále. Pri viacerých firmách sa dá
            odtiaľto rovno prepnúť.
          */}
          <button
            type="button"
            onClick={viacFiriem ? onZmenitFirmu : undefined}
            aria-label={viacFiriem ? t("panel.zmenitFirmu") : undefined}
            data-prepnut-firmu={viacFiriem ? "" : undefined}
            className={`-mx-1 flex min-h-[40px] max-w-full items-center gap-1.5 rounded-app-sm px-1 text-left ${
              viacFiriem ? "active:bg-app-ramik" : "cursor-default"
            }`}
          >
            <h1 className="min-w-0 truncate text-[22px] font-extrabold leading-tight tracking-tight text-app-text">
              {firma.name}
            </h1>
            {viacFiriem && <ChevronDown className="h-4 w-4 shrink-0 text-app-text" strokeWidth={2.5} />}
          </button>
        </div>
      </header>

      {oznamy && <div className="space-y-2 px-4 pt-2">{oznamy}</div>}
      <div className="px-4 pt-2 empty:hidden">
        <OznamEfaktury firmaId={firma.id} />
      </div>

      <main className="flex-1 space-y-5 px-4 pb-6 pt-3">
        <PrebiehaJazda onOtvor={onJazda} />

        {/* Hlavná karta — jediná veľká plocha na obrazovke, preto zelená. */}
        <button
          type="button"
          onClick={onFaktury}
          data-hlavna-karta
          className="flex w-full flex-col gap-3.5 rounded-app-lg bg-app-zelena-plocha p-[22px] text-left text-white transition active:scale-[0.99]"
        >
          <span className="text-[13px] text-white/85">{t("ph.neuhradeneFaktury")}</span>
          <span className="text-[38px] font-extrabold leading-none tracking-tight tabular-nums">
            {nacitava ? "—" : suma(neuhradene.spolu, mena, loc)}
          </span>
          {!nacitava && (
            <span className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-semibold">
                {pocetFaktur(neuhradene.pocet)}
              </span>
              {poSplatnosti.pocet > 0 && (
                <span className="rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-[#b42318]">
                  {t("ph.fakturyPoSplatnosti", { pocet: poSplatnosti.pocet })}
                </span>
              )}
            </span>
          )}
        </button>

        {/* Čísla za mesiac — kompaktne, štyri vedľa seba ako v návrhu „C". */}
        {stlpce.length > 0 && mesiac && (
          <Card className="px-4 py-3" >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-app-text">{mesiacSlovom(loc)}</span>
              <span className="truncate text-[12px] text-app-text-2">{t("ph.mesiac.poznamka", { mena: mesiac.mena })}</span>
            </div>
            <dl
              data-cisla-mesiaca
              className="mt-2 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${stlpce.length}, minmax(0, 1fr))` }}
            >
              {stlpce.map(([kluc, hodnota, cervena]) => (
                <div key={kluc} className="min-w-0">
                  <dt className="truncate text-[12px] text-app-text-2">{t(kluc)}</dt>
                  <dd
                    className={`truncate text-[15px] font-extrabold tabular-nums tracking-tight ${
                      cervena && (hodnota ?? 0) > 0 ? "text-app-chyba" : "text-app-text"
                    }`}
                  >
                    {kratkaSuma(hodnota ?? 0, loc)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        <section aria-label={t("ph.rychleAkcie")}>
          <div
            className={`grid gap-2.5 ${
              onBanka && onJazda ? "grid-cols-4" : onBanka || onJazda ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <QuickAction icon={FilePlus2} label={t("ph.faktura")} onClick={onNovaFaktura} />
            <QuickAction icon={Camera} label={t("ph.skenovat")} onClick={onSkener} />
            {onJazda && <QuickAction icon={Car} label={t("ph.jazda")} onClick={onJazda} />}
            {onBanka && <QuickAction icon={Landmark} label={t("tab.banka")} onClick={onBanka} />}
          </div>
        </section>

        <section>
          <SectionHeader title={t("ph.naVybavenie")} />
          {maCoVybavit ? (
            <ListCard>
              {poSplatnosti.pocet > 0 && (
                <ListRow
                  icon={TriangleAlert}
                  ikonaTon="cervena"
                  title={t("ph.fakturyPoSplatnosti", { pocet: poSplatnosti.pocet })}
                  subtitle={pocetFaktur(poSplatnosti.pocet)}
                  right={suma(poSplatnosti.spolu, mena, loc)}
                  chevron
                  onClick={onFaktury}
                />
              )}
              {naKontrolu > 0 && (
                <ListRow
                  icon={Receipt}
                  ikonaTon="pozor"
                  title={t("ph.dokladyNaKontrolu", { pocet: naKontrolu })}
                  subtitle={t("tab.doklady")}
                  chevron
                  onClick={onDoklady}
                />
              )}
              {efaktury > 0 && (
                <ListRow
                  icon={Inbox}
                  ikonaTon="pozor"
                  title={t("ph.efakturyNaZaevidovanie", { pocet: efaktury })}
                  subtitle={t("ph.efakturyNaZaevidovaniePopis")}
                />
              )}
              {jazdaBezi && onJazda && (
                <ListRow icon={Car} title={t("ph.jazdaNeukoncena")} chevron onClick={onJazda} />
              )}
            </ListCard>
          ) : (
            <Card className="px-4 py-5">
              <p className="text-[15px] font-semibold text-app-text">{t("ph.vsetkoVybavene")}</p>
              <p className="mt-1 text-[13px] text-app-text-2">{t("ph.vsetkoVybavenePopis")}</p>
            </Card>
          )}
        </section>

        <section>
          <SectionHeader title={t("ph.poslednaAktivita")} />
          {aktivita.length > 0 ? (
            <ListCard>
              {aktivita.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.nazov}
                  subtitle={r.popis}
                  right={r.suma}
                  rightTon={r.ton}
                  rightSub={<span className="text-[12px] text-app-text-2">{r.cas}</span>}
                  onClick={r.id.startsWith("f:") ? onFaktury : onDoklady}
                />
              ))}
            </ListCard>
          ) : (
            <PrazdnyStav
              icon={FileText}
              title={t("ph.ziadnaAktivita")}
              popis={t("ph.ziadnaAktivitaPopis")}
            />
          )}
        </section>

        {!nacitava && faktury?.length === 0 && doklady?.length === 0 && (
          <p className="flex items-center justify-center gap-2 text-[12px] text-app-text-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {firma.name}
          </p>
        )}
      </main>
    </div>
  );
}

/**
 * Doklady tohto mesiaca na riadok čísel.
 *
 * Priamo zo Supabase (RLS), rovnako ako nástenka na webe — žiadna nová
 * serverová operácia. Po stránkach, lebo PostgREST vráti najviac 1 000
 * riadkov a firma s väčším obratom by inak mala polovičné tržby.
 */
async function nacitajCislaMesiaca(companyId: string): Promise<CislaMesiaca> {
  const { od, do: doDna } = hraniceMesiaca();
  const [firma, faktury, prijate, blocky] = await Promise.all([
    supabase.from("companies").select("vat_payer, country").eq("id", companyId).maybeSingle(),
    vsetkyRiadky<FakturaMesiaca>((z, k) =>
      supabase
        .from("invoices")
        .select(
          "id, type, status, currency, total, subtotal, vat_total, total_eur, subtotal_eur, vat_total_eur, paid_at, deleted_at",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("issue_date", od)
        .lt("issue_date", doDna)
        .order("id")
        .range(z, k) as any,
    ),
    /* Prijatá faktúra patrí do mesiaca dodania, bez neho do mesiaca vystavenia — ako na webe. */
    vsetkyRiadky<PrijataMesiaca>((z, k) =>
      supabase
        .from("purchase_invoices")
        .select("id, type, status, currency, amount_without_vat, amount_without_vat_eur, deleted_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or(
          `and(delivery_date.gte.${od},delivery_date.lt.${doDna}),and(delivery_date.is.null,issue_date.gte.${od},issue_date.lt.${doDna})`,
        )
        .order("id")
        .range(z, k) as any,
    ),
    vsetkyRiadky<BlocekMesiaca>((z, k) =>
      supabase
        .from("expense_documents")
        .select("id, currency, net_amount, total_amount, vat_amount")
        .eq("company_id", companyId)
        .gte("issue_date", od)
        .lt("issue_date", doDna)
        .order("id")
        .range(z, k) as any,
    ),
  ]);
  if (firma.error) throw new Error(firma.error.message);
  return spocitajMesiac({
    faktury,
    prijate,
    blocky,
    domaca: domacaMena((firma.data as { country?: string | null } | null)?.country),
    platitelDph: !!(firma.data as { vat_payer?: boolean } | null)?.vat_payer,
  });
}

/** „Streda 15. októbra" — dátum do hlavičky, nie do tabuľky. */
function dnesSlovom(loc: string): string {
  const d = new Date();
  const veta = d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
  return veta.charAt(0).toUpperCase() + veta.slice(1);
}

/** „Október 2026" — nad riadkom čísel. */
function mesiacSlovom(loc: string): string {
  const veta = new Date().toLocaleDateString(loc, { month: "long", year: "numeric" });
  return veta.charAt(0).toUpperCase() + veta.slice(1);
}

/**
 * Suma bez centov a bez meny — do štyroch stĺpcov na 375 px sa „12 480,00 €"
 * nezmestí. Mena je v hlavnej karte; zaokrúhľuje sa, nič sa neskracuje na „tis.".
 */
function kratkaSuma(v: number, loc: string): string {
  return new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(v);
}

/** Dnes, včera, inak dátum — v zozname aktivity nikto nečíta celý dátum. */
function kedySlovom(den: string, loc: string, t: (k: "ph.dnes" | "ph.vcera") => string): string {
  if (!den) return "";
  const dnes = DNES();
  if (den === dnes) return t("ph.dnes");
  const v = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (den === v) return t("ph.vcera");
  const d = new Date(den);
  return Number.isNaN(d.getTime()) ? den : d.toLocaleDateString(loc, { day: "numeric", month: "numeric" });
}
