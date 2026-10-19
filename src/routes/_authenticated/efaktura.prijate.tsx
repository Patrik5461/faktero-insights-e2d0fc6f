import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, RefreshCw, FileInput, ExternalLink, Eye, Download, X, Paperclip } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NahladPdfOkno } from "@/components/faktero/NahladPdfOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  listPrijateEfakturyFn,
  nahladPrijatejEfakturyFn,
  prilohaPrijatejEfakturyFn,
  prilohyPrijatejEfakturyFn,
  stiahniPrijateEfakturyFn,
  zaevidujPrijatuEfakturuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import { formatujMenu } from "@/lib/faktero/mena";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

export const Route = createFileRoute("/_authenticated/efaktura/prijate")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté eFaktúry — Faktero") }] }),
  component: ReceivedPage,
});

function suma(hodnota: unknown, mena: string | null): string {
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return "—";
  return formatujMenu(n, mena ?? "EUR");
}

/** Stav rozobratia dokladu — nie stav úhrady. */
function StavDokladu({ stav }: { stav: string | null }) {
  const zle = stav === "parse_error" || stav === "rejected";
  return (
    <span className={`text-xs ${zle ? "text-destructive" : "text-muted-foreground"}`}>
      {stav ?? "—"}
    </span>
  );
}

type Nahlad = { url: string; nazov: string; prilozene: boolean };

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
  const zaeviduj = useServerFn(zaevidujPrijatuEfakturuFn);
  const [evidujem, setEvidujem] = useState<string | null>(null);
  const nahladFn = useServerFn(nahladPrijatejEfakturyFn);
  const [nacitavamNahlad, setNacitavamNahlad] = useState<string | null>(null);
  const [nahlad, setNahlad] = useState<Nahlad | null>(null);
  const [prilohyOkno, setPrilohyOkno] = useState<{ id: string; cislo: string } | null>(null);

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

  /** Z prijatej eFaktúry spraví prijatú faktúru — inak by sa prepisovala ručne. */
  async function zaevidujDoklad(receivedId: string) {
    if (!companyId) return;
    setEvidujem(receivedId);
    try {
      const r: any = await zaeviduj({ data: { company_id: companyId, received_id: receivedId } });
      toast.success(
        r.pripojena
          ? t("Táto faktúra už medzi prijatými bola (prišla inou cestou) — eFaktúra je pripojená k nej, druhá sa nezakladá.")
          : r.uzExistovala
            ? t("Táto eFaktúra už zaevidovaná je — otváram ju.")
            : t("Zaevidované ako prijatá faktúra. Skontrolujte sumy a dátumy."),
      );
      q.refetch();
      window.open(`/prijate-faktury/${r.invoiceId}`, "_blank", "noopener,noreferrer");
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

  return (
    <>
      <PageHeader
        title={t("Prijaté eFaktúry")}
        description={t("eFaktúry doručené od vašich dodávateľov cez sieť Peppol.")}
        action={
          <button
            onClick={stiahniNove}
            disabled={stahujem || !companyId}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${stahujem ? "animate-spin" : ""}`} />{" "}
            {stahujem ? t("Sťahujem…") : t("Stiahnuť nové")}
          </button>
        }
      />
      <PageBody>
        {!q.isLoading && riadky.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Inbox className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("Zatiaľ tu nič nie je")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("Doručené eFaktúry sa sem stiahnu tlačidlom hore. Firma musí byť spárovaná s ePoštákom — spraví sa to na prehľade eFaktúry.")}
            </p>
          </div>
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
                  <th className="p-3 text-right">{t("Akcie")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {t("Načítavam…")}
                    </td>
                  </tr>
                )}
                {riadky.map((r) => (
                  <tr key={r.id}>
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
