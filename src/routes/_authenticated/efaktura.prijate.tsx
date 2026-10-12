import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, RefreshCw, FileInput, ExternalLink, Eye, Download, X } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import {
  listPrijateEfakturyFn,
  nahladPrijatejEfakturyFn,
  stiahniPrijateEfakturyFn,
  zaevidujPrijatuEfakturuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";

export const Route = createFileRoute("/_authenticated/efaktura/prijate")({
  head: () => ({ meta: [{ title: "Prijaté eFaktúry — Faktero" }] }),
  component: ReceivedPage,
});

function suma(hodnota: unknown, mena: string | null): string {
  const n = Number(hodnota);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ${mena ?? "EUR"}`;
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

/** Okno s náhľadom eFaktúry — PDF od dodávateľa, alebo vykreslené z XML. */
function NahladOkno({ nahlad, onClose }: { nahlad: Nahlad; onClose: () => void }) {
  useZatvorNaEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Náhľad ${nahlad.nazov}`}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{nahlad.nazov}</div>
            {!nahlad.prilozene && (
              <div className="text-xs text-muted-foreground">
                Dodávateľ k eFaktúre PDF nepriložil — náhľad je vykreslený z údajov eFaktúry.
              </div>
            )}
          </div>
          <a
            href={nahlad.url}
            download={`${nahlad.nazov}.pdf`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
          >
            <Download className="h-3.5 w-3.5" /> Stiahnuť PDF
          </a>
          <button
            onClick={onClose}
            aria-label="Zavrieť"
            className="rounded-md p-1 hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3">
          <NahladPdf url={nahlad.url} />
        </div>
      </div>
    </div>
  );
}

function ReceivedPage() {
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
          ? "Táto faktúra už medzi prijatými bola (prišla inou cestou) — eFaktúra je pripojená k nej, druhá sa nezakladá."
          : r.uzExistovala
            ? "Táto eFaktúra už zaevidovaná je — otváram ju."
            : "Zaevidované ako prijatá faktúra. Skontrolujte sumy a dátumy.",
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
      const kus = r.novych === 1 ? "faktúra" : "faktúry";
      toast.success(
        r.novych
          ? `Stiahnuté: ${r.novych} ${kus}.${r.preskocenych ? ` Už uložené: ${r.preskocenych}.` : ""}`
          : "Nič nové — všetko doručené už máte.",
      );
      // Problémy sa nezamlčia: doklad, ktorý sa nepodarilo stiahnuť, by inak
      // ticho chýbal a nikto by nevedel, že vôbec bol.
      if (r.problemy?.length)
        toast.error(`Nepodarilo sa: ${r.problemy.join(" · ")}`, { duration: 12000 });
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
        title="Prijaté eFaktúry"
        description="eFaktúry doručené od vašich dodávateľov cez sieť Peppol."
        action={
          <button
            onClick={stiahniNove}
            disabled={stahujem || !companyId}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${stahujem ? "animate-spin" : ""}`} />{" "}
            {stahujem ? "Sťahujem…" : "Stiahnuť nové"}
          </button>
        }
      />
      <PageBody>
        {!q.isLoading && riadky.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Inbox className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Zatiaľ tu nič nie je</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Doručené eFaktúry sa sem stiahnu tlačidlom hore. Firma musí byť spárovaná s ePoštákom
              — spraví sa to na prehľade eFaktúry.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Doručené</th>
                  <th className="p-3">Dodávateľ</th>
                  <th className="p-3">Doklad</th>
                  <th className="p-3">Vystavená</th>
                  <th className="p-3">Splatnosť</th>
                  <th className="p-3 text-right">Suma</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3 text-right">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.isLoading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      Načítavam…
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
                          {nacitavamNahlad === r.id ? "Načítavam…" : "Náhľad"}
                        </button>
                        {r.matched_supplier_invoice_id ? (
                          <a
                            href={`/prijate-faktury/${r.matched_supplier_invoice_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Otvoriť doklad
                          </a>
                        ) : (
                          <button
                            onClick={() => zaevidujDoklad(r.id)}
                            disabled={evidujem === r.id}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <FileInput className="h-3.5 w-3.5" />{" "}
                            {evidujem === r.id ? "Evidujem…" : "Zaevidovať"}
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
      {nahlad && <NahladOkno nahlad={nahlad} onClose={zavriNahlad} />}
    </>
  );
}
