import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, RefreshCw, Eye } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listEfakturaDocumentsFn,
  getEfakturaXmlUrlFn,
  generateEfakturaXmlFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  deriveEfakturaUiStatus,
  EfakturaStatusBadge,
} from "@/components/faktero/EfakturaStatusBadge";

export const Route = createFileRoute("/_authenticated/efaktura/odoslane")({
  head: () => ({ meta: [{ title: "Odoslané eFaktúry — Faktero" }] }),
  component: SentPage,
});

function SentPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [openErrors, setOpenErrors] = useState<string | null>(null);
  useEffect(() => setCompanyId(getActiveCompanyId()), []);

  const listFn = useServerFn(listEfakturaDocumentsFn);
  const getUrl = useServerFn(getEfakturaXmlUrlFn);
  const regen = useServerFn(generateEfakturaXmlFn);

  const q = useQuery({
    queryKey: ["efaktura-documents", companyId],
    queryFn: () => listFn({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

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
          ? "XML znovu validované — bez chýb."
          : `Validácia zlyhala (${r.validationErrors.length} chýb).`,
      );
      q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Odoslané eFaktúry"
        description="XML dokumenty vygenerované z vašich faktúr."
      />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Faktúra</th>
                <th className="p-3">Odberateľ</th>
                <th className="p-3">Typ</th>
                <th className="p-3">Stav XML</th>
                <th className="p-3">Validácia</th>
                <th className="p-3">Vytvorené</th>
                <th className="p-3 text-right">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {q.data && q.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Zatiaľ žiadne vygenerované eFaktúry.
                  </td>
                </tr>
              )}
              {q.data?.map((row: any) => {
                const errs = Array.isArray(row.validation_errors) ? row.validation_errors : [];
                const ui = deriveEfakturaUiStatus(row);
                return (
                  <tr key={row.id}>
                    <td className="p-3 font-medium">
                      {row.document_number ?? row.invoices?.invoice_number ?? "—"}
                    </td>
                    <td className="p-3">{row.invoices?.customer_name ?? "—"}</td>
                    <td className="p-3 text-xs uppercase text-muted-foreground">
                      {row.invoices?.type ?? "regular"}
                    </td>
                    <td className="p-3">
                      <EfakturaStatusBadge status={ui} />
                    </td>
                    <td className="p-3">
                      {errs.length === 0 ? (
                        <span className="text-xs text-primary">OK</span>
                      ) : (
                        <button
                          onClick={() => setOpenErrors(openErrors === row.id ? null : row.id)}
                          className="text-xs text-destructive underline"
                        >
                          {errs.length} chýb
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
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("sk-SK")}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {row.invoice_id && (
                          <a
                            href={`/faktury/${row.invoice_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            <Eye className="h-3.5 w-3.5" /> Detail
                          </a>
                        )}
                        <button
                          onClick={() => row.invoice_id && handleRevalidate(row.invoice_id)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Validovať
                        </button>
                        <button
                          onClick={() => row.invoice_id && handleDownload(row.invoice_id)}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
                        >
                          <Download className="h-3.5 w-3.5" /> XML
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
