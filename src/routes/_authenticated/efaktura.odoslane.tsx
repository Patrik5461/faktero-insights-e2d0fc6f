import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, RefreshCw, Eye, Send } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listEfakturaDocumentsFn,
  getEfakturaXmlUrlFn,
  generateEfakturaXmlFn,
  posliEfakturuFn,
  listEfakturaDeliveriesFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  deriveEfakturaUiStatus,
  EfakturaStatusBadge,
  kratkyCas,
  stavDorucenia,
  typDokladuEfaktury,
} from "@/components/faktero/EfakturaStatusBadge";
import { potvrd } from "@/lib/potvrdenie";

export const Route = createFileRoute("/_authenticated/efaktura/odoslane")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Odoslané eFaktúry — Faktero") }] }),
  component: SentPage,
});

function SentPage() {
  const { t } = useT();
  const chyb = (n: number) =>
    t(n === 1 ? "{n} chyba" : n > 1 && n < 5 ? "{n} chyby" : "{n} chýb", { n });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [openErrors, setOpenErrors] = useState<string | null>(null);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);

  const listFn = useServerFn(listEfakturaDocumentsFn);
  const getUrl = useServerFn(getEfakturaXmlUrlFn);
  const regen = useServerFn(generateEfakturaXmlFn);
  const posli = useServerFn(posliEfakturuFn);
  const listDorucenia = useServerFn(listEfakturaDeliveriesFn);
  const [odosielam, setOdosielam] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["efaktura-documents", companyId],
    queryFn: () => listFn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  /*
    Doručenia zvlášť od dokladov: vygenerované XML ešte neznamená odoslané a
    odoslané neznamená doručené. Kým sa zobrazoval len stav XML, nebolo z tejto
    stránky vidieť, či faktúra k odberateľovi vôbec dorazila.
  */
  const qd = useQuery({
    queryKey: ["efaktura-deliveries", companyId],
    queryFn: () => listDorucenia({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });
  const dorucenia = new Map<string, any>();
  for (const d of (qd.data ?? []) as any[]) {
    // Posledné doručenie na doklad — staršie pokusy sú história.
    if (!dorucenia.has(d.document_id)) dorucenia.set(d.document_id, d);
  }

  async function odosli(invoiceId: string, cislo: string) {
    if (!companyId) return;
    if (
      !(await potvrd(
        t(
          "Odoslať faktúru {cislo} cez eFaktúru?\n\nOdíde odberateľovi cez sieť Peppol a odoslanie sa nedá vziať späť.",
          { cislo },
        ),
      ))
    )
      return;
    setOdosielam(invoiceId);
    try {
      const r: any = await posli({ data: { company_id: companyId, invoice_id: invoiceId } });
      toast.success(t("Odoslané — stav: {stav}.", { stav: t(stavDorucenia(r.status)).toLowerCase() }));
      q.refetch();
      qd.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOdosielam(null);
    }
  }

  async function handleDownload(invoiceId: string) {
    try {
      const r = await getUrl({ data: { companyId: companyId!, invoiceId } });
      window.open(r.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRevalidate(invoiceId: string) {
    try {
      const r = await regen({ data: { companyId: companyId!, invoiceId } });
      toast[r.valid ? "success" : "error"](
        r.valid
          ? t("XML znovu validované — bez chýb.")
          : t("Validácia zlyhala ({chyby}).", { chyby: chyb(r.validationErrors.length) }),
      );
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function dorucenieBunka(row: any) {
    const d = dorucenia.get(row.id);
    if (!d) return <span className="text-xs text-muted-foreground">{t("Neodoslaná")}</span>;
    return (
      <span
        className={`text-xs ${d.status === "failed" || d.status === "rejected" ? "text-destructive" : "text-primary"}`}
        title={d.error_message ?? undefined}
      >
        {t(stavDorucenia(d.status))}
        {d.sent_at && (
          <span className="block whitespace-nowrap text-muted-foreground">
            {kratkyCas(d.sent_at)}
          </span>
        )}
      </span>
    );
  }

  function validaciaBunka(row: any) {
    const errs = Array.isArray(row.validation_errors) ? row.validation_errors : [];
    return (
      <>
        {errs.length === 0 ? (
          <span className="text-xs text-primary">OK</span>
        ) : (
          <button
            onClick={() => setOpenErrors(openErrors === row.id ? null : row.id)}
            className="text-xs text-destructive underline"
          >
            {chyb(errs.length)}
          </button>
        )}
        {openErrors === row.id && (
          <ul className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
            {errs.map((e: any, i: number) => (
              <li key={i}>
                <span className="font-mono">{e.code}</span> — {e.message}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  function akcieBunka(row: any, className = "") {
    const btn =
      "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50";
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {row.invoice_id && (
          <a href={`/faktury/${row.invoice_id}`} className={btn}>
            <Eye className="h-3.5 w-3.5" /> {t("Detail")}
          </a>
        )}
        <button onClick={() => row.invoice_id && handleRevalidate(row.invoice_id)} className={btn}>
          <RefreshCw className="h-3.5 w-3.5" /> {t("Validovať")}
        </button>
        {/* Odoslanie je nevratné, tak je až za validáciou a pýta sa. */}
        <button
          disabled={odosielam === row.invoice_id}
          onClick={() =>
            row.invoice_id && odosli(row.invoice_id, row.document_number ?? row.invoice_id)
          }
          className={btn}
        >
          <Send className="h-3.5 w-3.5" /> {odosielam === row.invoice_id ? t("Odosielam…") : t("Odoslať")}
        </button>
        <button
          onClick={() => row.invoice_id && handleDownload(row.invoice_id)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
        >
          <Download className="h-3.5 w-3.5" /> XML
        </button>
      </div>
    );
  }

  const cislo = (row: any) => row.document_number ?? row.invoices?.invoice_number ?? "—";

  return (
    <>
      <PageHeader
        title={t("Odoslané eFaktúry")}
        description={t("XML dokumenty vygenerované z vašich faktúr.")}
      />
      <PageBody>
        {/* Mobil: karty namiesto širokej tabuľky. */}
        <div className="space-y-3 md:hidden">
          {q.isLoading && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Načítavam…")}
            </div>
          )}
          {q.data && q.data.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Zatiaľ žiadne vygenerované eFaktúry.")}
            </div>
          )}
          {q.data?.map((row: any) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{cislo(row)}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {row.invoices?.customer_name ?? "—"}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(typDokladuEfaktury(row.invoices?.type))}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <EfakturaStatusBadge status={deriveEfakturaUiStatus(row)} />
                <div>{validaciaBunka(row)}</div>
                {dorucenieBunka(row)}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {t("Vytvorené {cas}", { cas: kratkyCas(row.created_at) })}
              </div>
              {akcieBunka(row, "mt-3")}
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Faktúra")}</th>
                <th className="p-3">{t("Odberateľ")}</th>
                <th className="p-3">{t("Typ")}</th>
                <th className="p-3">{t("Stav XML")}</th>
                <th className="p-3">{t("Validácia")}</th>
                <th className="p-3">{t("Doručenie")}</th>
                <th className="p-3">{t("Vytvorené")}</th>
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
              {q.data && q.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {t("Zatiaľ žiadne vygenerované eFaktúry.")}
                  </td>
                </tr>
              )}
              {q.data?.map((row: any) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap p-3 font-medium">{cislo(row)}</td>
                  <td className="p-3">{row.invoices?.customer_name ?? "—"}</td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    {t(typDokladuEfaktury(row.invoices?.type))}
                  </td>
                  <td className="p-3">
                    <EfakturaStatusBadge status={deriveEfakturaUiStatus(row)} />
                  </td>
                  <td className="p-3">{validaciaBunka(row)}</td>
                  <td className="p-3">{dorucenieBunka(row)}</td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    {kratkyCas(row.created_at)}
                  </td>
                  <td className="p-3">
                    {/* Tlačidlá sa zalomia do dvoch riadkov, aby stĺpec neutiekol za okraj. */}
                    {akcieBunka(row, "ml-auto max-w-[190px] justify-end")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
