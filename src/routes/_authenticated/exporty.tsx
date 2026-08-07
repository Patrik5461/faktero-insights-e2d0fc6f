import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn, getExportContentFn } from "@/lib/faktero/export.functions";
import { toast } from "sonner";
import { Download, FileCode2, Loader2, FileSpreadsheet, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exporty")({
  head: () => ({ meta: [{ title: "Účtovné exporty — Faktero" }] }),
  /** História je sekcia tejto istej stránky; `?tab=history` na ňu zroluje. */
  validateSearch: (s: Record<string, unknown>): { tab?: "history" } => ({
    tab: s.tab === "history" ? "history" : undefined,
  }),
  component: ExportsPage,
});

function downloadFile(name: string, content: string, mime = "application/xml") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const exportFn = useServerFn(exportInvoicesFn);
  const getContent = useServerFn(getExportContentFn);

  const { tab } = Route.useSearch();
  useEffect(() => {
    if (tab !== "history") return;
    document.getElementById("historia-exportov")?.scrollIntoView({ behavior: "smooth" });
  }, [tab]);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const [{ data: js }, { data: inv }] = await Promise.all([
      supabase
        .from("export_jobs")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, issue_date, total, currency, status")
        .eq("company_id", cid)
        .gte("issue_date", dateFrom)
        .lte("issue_date", dateTo)
        .neq("status", "draft")
        .neq("status", "cancelled")
        .order("issue_date", { ascending: false }),
    ]);
    setJobs(js ?? []);
    setInvoices(inv ?? []);
  }
  useEffect(() => {
    load();
  }, [dateFrom, dateTo]);

  const selectedIds = Object.entries(picked)
    .filter(([, v]) => v)
    .map(([k]) => k);

  async function runExport() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!selectedIds.length) return toast.error("Vyberte aspoň jednu faktúru");
    setBusy(true);
    try {
      const r = await exportFn({
        data: { companyId: cid, invoiceIds: selectedIds, format: "pohoda_xml" },
      });
      downloadFile(r.fileName, r.content);
      toast.success(`Exportovaných ${r.invoiceCount} faktúr`);
      setPicked({});
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setBusy(false);
    }
  }

  async function downloadJob(j: any) {
    try {
      const r = await getContent({ data: { jobId: j.id } });
      downloadFile(r.fileName ?? "export.xml", r.content ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Stiahnutie zlyhalo");
    }
  }

  return (
    <>
      <PageHeader
        title="Účtovné exporty"
        description="Exportujte faktúry do účtovných systémov ako Pohoda."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: selector */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Od</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Do</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setPicked(Object.fromEntries(invoices.map((i) => [i.id, true])))}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Vybrať všetko
                  </button>
                  <button
                    onClick={() => setPicked({})}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Zrušiť výber
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-10 p-3"></th>
                      <th className="p-3">Číslo</th>
                      <th className="p-3">Odberateľ</th>
                      <th className="p-3">Vystavená</th>
                      <th className="p-3 text-right">Suma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                          Žiadne faktúry v zvolenom období.
                        </td>
                      </tr>
                    )}
                    {invoices.map((i) => (
                      <tr key={i.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={!!picked[i.id]}
                            onChange={(e) => setPicked({ ...picked, [i.id]: e.target.checked })}
                          />
                        </td>
                        <td className="p-3 font-medium">{i.invoice_number}</td>
                        <td className="p-3">{i.customer_name ?? "—"}</td>
                        <td className="p-3">{i.issue_date}</td>
                        <td className="p-3 text-right tabular-nums">
                          {Number(i.total).toFixed(2)} {i.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Vybraných:{" "}
                  <span className="font-semibold text-foreground">{selectedIds.length}</span>
                </div>
                <button
                  onClick={runExport}
                  disabled={busy || !selectedIds.length}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCode2 className="h-4 w-4" />
                  )}
                  Exportovať do Pohody XML
                </button>
              </div>
            </div>

            {/* History */}
            <div id="historia-exportov" className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                História exportov
              </h3>
              {jobs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Zatiaľ žiadne exporty.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                          {j.file_name ?? `${j.target_system} — ${j.format}`}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {j.invoice_count} faktúr ·{" "}
                          {new Date(j.created_at).toLocaleString("sk-SK")}
                          {j.date_from && j.date_to ? ` · ${j.date_from} → ${j.date_to}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadJob(j)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                      >
                        <Download className="h-3.5 w-3.5" /> Stiahnuť
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: formats sidebar */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Podporované formáty</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                  <span className="font-medium">Pohoda XML</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Aktívne
                  </span>
                </li>
                {["Omega", "Money S3", "Alfa Plus"].map((n) => (
                  <li
                    key={n}
                    className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground"
                  >
                    <span>{n}</span>
                    <span className="text-[10px]">Pripravujeme</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Vyberte obdobie a faktúry, ktoré chcete preniesť do účtovníctva. Súbor sa stiahne a
                uloží sa do histórie.
              </p>
            </div>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
