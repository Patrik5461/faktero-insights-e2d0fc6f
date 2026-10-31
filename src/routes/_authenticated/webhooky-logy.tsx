import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { retryWebhookDelivery } from "@/lib/faktero/webhook-delivery.functions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, RefreshCw, Eye, FileJson, Webhook } from "lucide-react";
import { usePagedLogs } from "@/hooks/usePagedLogs";
import { EmptyState, ListFooter, LogsToolbar } from "@/components/faktero/ListControls";
import { useT } from "@/lib/i18n/useT";
import { StavDoruceniaWebhooku, mozeSaPoslatZnova } from "@/components/faktero/StavDoruceniaWebhooku";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/webhooky-logy")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Záznamy doručení webhookov — Faktero") }],
  }),
  component: WebhookLogsPage,
});

type Filter = "all" | "success" | "failed" | "retrying" | "pending";
type LogRow = {
  id: string;
  webhook_id: string;
  event_type: string;
  status: "success" | "failed" | "pending" | string;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  attempt_count: number | null;
  error_message: string | null;
  payload: any;
  created_at: string;
};

function WebhookLogsPage() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hooks, setHooks] = useState<Record<string, { url: string }>>({});
  const [counts, setCounts] = useState({ success: 0, failed: 0, pending: 0 });
  const [viewing, setViewing] = useState<{ kind: "payload" | "response"; log: LogRow } | null>(
    null,
  );
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retry = useServerFn(retryWebhookDelivery);

  const { rows, total, loading, page, setPage, pageSize, setPageSize, search, setSearch, reload } =
    usePagedLogs({
      resource: "webhook_delivery_logs",
      searchColumns: ["event_type"],
      filters: { status: filter === "all" ? null : filter },
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      pageSizeKey: "webhook_delivery_logs",
    });
  const logs = rows as LogRow[];

  // Load webhook URLs once + status counts.
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      const [{ data: h }, ...countQueries] = await Promise.all([
        supabase.from("webhooks").select("id, url").eq("company_id", cid),
        ...([["success"], ["failed"], ["pending", "retrying"]] as const).map((s) =>
          supabase
            .from("webhook_delivery_logs")
            .select("id", { count: "exact", head: true })
            .eq("company_id", cid)
            .in("status", [...s]),
        ),
      ]);
      setHooks(Object.fromEntries((h ?? []).map((w: any) => [w.id, { url: w.url }])));
      setCounts({
        success: countQueries[0].count ?? 0,
        failed: countQueries[1].count ?? 0,
        pending: countQueries[2].count ?? 0,
      });
    })();
  }, [total]);

  async function onRetry(id: string) {
    setRetryingId(id);
    try {
      const r = await retry({ data: { id } });
      toast.success(
        r.ok
          ? t("Doručené ({http}) za {ms} ms", { http: r.response_status ?? "—", ms: r.duration_ms })
          : t("Zlyhalo ({http})", { http: r.response_status ?? "—" }),
      );
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba pri opakovaní"));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Záznamy doručení webhookov")}
        description={t("História doručovania webhookov, opakovanie a detaily odpovedí.")}
        action={
          <Link
            to="/webhooky"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60"
          >
            {t("Spravovať webhooky")}
          </Link>
        }
      />
      <PageBody>
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SummaryCard
            label={t("Úspešné doručenia")}
            value={counts.success}
            tone="success"
            icon={CheckCircle2}
          />
          <SummaryCard
            label={t("Vzdané doručenia")}
            value={counts.failed}
            tone="failed"
            icon={XCircle}
          />
          <SummaryCard label={t("Čakajú na ďalší pokus")} value={counts.pending} tone="pending" icon={Clock} />
        </div>

        <div className="mb-4">
          <LogsToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("Hľadať podľa udalosti…")}
            selects={[
              {
                label: t("Stav"),
                value: filter,
                onChange: (v) => setFilter(v as Filter),
                options: [
                  { value: "all", label: t("Všetky") },
                  { value: "success", label: t("Úspešné") },
                  { value: "retrying", label: t("Opakuje sa") },
                  { value: "failed", label: t("Vzdané") },
                  { value: "pending", label: t("Čakajúce") },
                ],
              },
            ]}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onReset={() => {
              setSearch("");
              setFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            right={
              <button
                onClick={reload}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t("nacitat::Obnoviť")}
              </button>
            }
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {/* Prázdny stav mimo tabuľky — v širokej tabuľke sa na mobile text
              centroval za okraj obrazovky a bol useknutý. */}
          {!loading && logs.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title={t("Žiadne záznamy")}
              description={t("Skúste zmeniť filtre alebo počkajte na ďalšie doručenia.")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">{t("Stav")}</th>
                    <th className="px-3 py-2.5">{t("Udalosť")}</th>
                    <th className="px-3 py-2.5">{t("Cieľová URL")}</th>
                    <th className="px-3 py-2.5 text-right">HTTP</th>
                    <th className="px-3 py-2.5 text-right">{t("Trvanie")}</th>
                    <th className="px-3 py-2.5">{t("Vytvorené")}</th>
                    <th className="px-3 py-2.5 text-right">{t("Akcie")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        {t("Načítavam…")}
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Webhook}
                          title={t("Žiadne záznamy")}
                          description={t("Skúste zmeniť filtre alebo počkajte na ďalšie doručenia.")}
                        />
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <StavDoruceniaWebhooku status={l.status} />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">{l.event_type}</td>
                        <td
                          className="px-3 py-2.5 max-w-[280px] truncate text-xs text-muted-foreground"
                          title={hooks[l.webhook_id]?.url}
                        >
                          {hooks[l.webhook_id]?.url ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {l.response_status ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {l.duration_ms != null ? `${l.duration_ms} ms` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {new Date(l.created_at).toLocaleString("sk-SK")}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn
                              title={t("Zobraziť payload")}
                              onClick={() => setViewing({ kind: "payload", log: l })}
                            >
                              <FileJson className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title={t("Zobraziť odpoveď")}
                              onClick={() => setViewing({ kind: "response", log: l })}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title={
                                mozeSaPoslatZnova(l.status)
                                  ? t("Poslať znova")
                                  : t("Udalosť už bola doručená.")
                              }
                              onClick={() => onRetry(l.id)}
                              disabled={retryingId === l.id || !mozeSaPoslatZnova(l.status)}
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${retryingId === l.id ? "animate-spin" : ""}`}
                              />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <ListFooter
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </PageBody>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {viewing?.kind === "payload" ? t("Payload") : t("Odpoveď")}
              {viewing && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {viewing.log.event_type}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewing?.kind === "payload" ? (
            <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
              {JSON.stringify(viewing.log.payload, null, 2)}
            </pre>
          ) : viewing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat k="HTTP" v={viewing.log.response_status ?? "—"} />
                <Stat
                  k={t("Trvanie")}
                  v={viewing.log.duration_ms != null ? `${viewing.log.duration_ms} ms` : "—"}
                />
                <Stat k={t("Pokusov")} v={viewing.log.attempt_count ?? "—"} />
              </div>
              {viewing.log.error_message && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  {viewing.log.error_message}
                </div>
              )}
              <pre className="max-h-[50vh] overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
                {viewing.log.response_body || t("(prázdne telo odpovede)")}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "success" | "failed" | "pending";
  icon: any;
}) {
  const tones = {
    success: "from-emerald-500/15 to-emerald-500/0 text-emerald-700 border-emerald-500/20",
    failed: "from-destructive/15 to-destructive/0 text-destructive border-destructive/20",
    pending: "from-amber-500/15 to-amber-500/0 text-amber-700 border-amber-500/20",
  } as const;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${tones[tone]} p-4`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-muted-foreground">{k}</div>
      <div className="mt-0.5 font-medium tabular-nums">{String(v)}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}
