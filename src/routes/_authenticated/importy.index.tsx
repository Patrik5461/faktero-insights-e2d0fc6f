import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getImportFileUrl } from "@/lib/faktero/import-superfaktura.functions";
import { Download, FileText, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { usePagedLogs } from "@/hooks/usePagedLogs";
import { EmptyState, ListFooter, LogsToolbar } from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/importy/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "História importov — Faktero") }],
  }),
  component: ImportHistoryPage,
});

function ImportHistoryPage() {
  const { t } = useT();
  const [logs, setLogs] = useState<Record<string, any[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const getUrl = useServerFn(getImportFileUrl);
  const {
    rows: jobs,
    total,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
  } = usePagedLogs({
    resource: "import_jobs",
    searchColumns: ["file_name", "source", "status"],
    filters: { status: status === "all" ? null : status, source: source === "all" ? null : source },
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    pageSizeKey: "import_jobs",
  });

  async function toggleLogs(jobId: string) {
    if (openId === jobId) {
      setOpenId(null);
      return;
    }
    setOpenId(jobId);
    if (!logs[jobId]) {
      const { data } = await supabase
        .from("import_logs")
        .select("*")
        .eq("import_job_id", jobId)
        .order("row_number")
        .limit(200);
      setLogs((p) => ({ ...p, [jobId]: data ?? [] }));
    }
  }

  async function downloadOriginal(jobId: string) {
    try {
      const r = await getUrl({ data: { jobId } });
      window.open(r.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("História importov")}
        description={t("Prehľad všetkých importov vo vašej firme.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/importy/doklady"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <UploadIcon className="h-4 w-4" /> {t("Prijaté doklady")}
            </Link>
            <Link
              to="/importy/novy"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <UploadIcon className="h-4 w-4" /> {t("Nový import")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-5xl">
          <div className="mb-4">
            <LogsToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("Hľadať podľa názvu súboru…")}
              selects={[
                {
                  label: t("Stav"),
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: "all", label: t("Všetky") },
                    { value: "completed", label: t("Dokončené") },
                    { value: "running", label: t("Bežiace") },
                    { value: "uploaded", label: t("Nahraté") },
                    { value: "failed", label: t("Zlyhané") },
                  ],
                },
                {
                  label: t("Zdroj"),
                  value: source,
                  onChange: setSource,
                  options: [
                    { value: "all", label: t("Všetky") },
                    { value: "superfaktura", label: "SuperFaktúra" },
                    { value: "csv", label: "CSV" },
                    { value: "xml", label: "XML" },
                  ],
                },
              ]}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onReset={() => {
                setSearch("");
                setStatus("all");
                setSource("all");
                setDateFrom("");
                setDateTo("");
              }}
            />
          </div>

          {!loading && jobs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              <EmptyState
                icon={UploadIcon}
                title={t("Žiadne importy")}
                description={t(
                  "Zatiaľ neboli vykonané žiadne importy alebo žiadne nevyhovujú filtrom.",
                )}
                action={
                  <Link
                    to="/importy/novy"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <UploadIcon className="h-4 w-4" /> {t("Spustiť nový import")}
                  </Link>
                }
              />
            </div>
          )}
          {jobs.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">{t("Dátum")}</th>
                    <th className="px-4 py-2 text-left">{t("Zdroj")}</th>
                    <th className="px-4 py-2 text-left">{t("Súbor")}</th>
                    <th className="px-4 py-2 text-left">{t("Stav")}</th>
                    <th className="px-4 py-2 text-right">{t("Faktúry")}</th>
                    <th className="px-4 py-2 text-right">{t("Odberatelia")}</th>
                    <th className="px-4 py-2 text-right">{t("Chyby")}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <React.Fragment key={j.id}>
                      <tr className="border-t border-border">
                        <td className="px-4 py-2 whitespace-nowrap">
                          {new Date(j.created_at).toLocaleString("sk-SK")}
                        </td>
                        <td className="px-4 py-2">{j.source}</td>
                        <td className="px-4 py-2 max-w-[240px] truncate" title={j.file_name}>
                          {j.file_name ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill status={j.status} />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{j.imported_invoices}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {j.imported_customers}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{j.failed_rows}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => downloadOriginal(j.id)}
                            title={t("Stiahnuť pôvodný súbor")}
                            className="rounded-md p-1.5 hover:bg-secondary"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleLogs(j.id)}
                            title={t("Zobraziť logy")}
                            className="rounded-md p-1.5 hover:bg-secondary"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {openId === j.id && (
                        <tr className="border-t border-border bg-secondary/20">
                          <td colSpan={8} className="p-4">
                            <div className="max-h-72 overflow-auto rounded-md border border-border bg-background">
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1 text-left">#</th>
                                    <th className="px-2 py-1 text-left">{t("Typ")}</th>
                                    <th className="px-2 py-1 text-left">{t("Stav")}</th>
                                    <th className="px-2 py-1 text-left">{t("Správa")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(logs[j.id] ?? []).map((l) => (
                                    <tr key={l.id} className="border-t border-border">
                                      <td className="px-2 py-1 tabular-nums">{l.row_number}</td>
                                      <td className="px-2 py-1">{l.entity_type}</td>
                                      <td className="px-2 py-1">
                                        <StatusPill status={l.status} />
                                      </td>
                                      <td className="px-2 py-1">{l.message}</td>
                                    </tr>
                                  ))}
                                  {(logs[j.id] ?? []).length === 0 && (
                                    <tr>
                                      <td
                                        colSpan={4}
                                        className="px-2 py-3 text-center text-muted-foreground"
                                      >
                                        {t("Žiadne logy.")}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <ListFooter
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-primary/10 text-primary",
    running: "bg-amber-500/10 text-amber-700",
    uploaded: "bg-secondary text-foreground/70",
    failed: "bg-destructive/10 text-destructive",
    error: "bg-destructive/10 text-destructive",
    success: "bg-primary/10 text-primary",
    duplicate: "bg-amber-500/10 text-amber-700",
    warning: "bg-amber-500/10 text-amber-700",
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-secondary"}`}
    >
      {status}
    </span>
  );
}
