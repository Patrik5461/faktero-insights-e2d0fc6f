import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import {
  listAdminSubscriptions,
  adminSetCompanyPlan,
  adminExtendTrial,
  adminCancelSubscription,
  adminReactivateSubscription,
  adminMarkActive,
  adminSuspendBilling,
  listGopayEvents,
  adminSyncPayment,
  getBillingDiagnostics,
} from "@/lib/faktero/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Admin · Predplatné — Faktero" }] }),
  component: AdminSubscriptionsPage,
});

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("sk-SK");
  } catch {
    return "—";
  }
}
function fmtPrice(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2)} €`;
}

function AdminSubscriptionsPage() {
  const fetchList = useServerFn(listAdminSubscriptions);
  const setPlanFn = useServerFn(adminSetCompanyPlan);
  const extendFn = useServerFn(adminExtendTrial);
  const cancelFn = useServerFn(adminCancelSubscription);
  const reactivateFn = useServerFn(adminReactivateSubscription);
  const markActiveFn = useServerFn(adminMarkActive);
  const suspendFn = useServerFn(adminSuspendBilling);
  const eventsFn = useServerFn(listGopayEvents);
  const syncPaymentFn = useServerFn(adminSyncPayment);
  const diagFn = useServerFn(getBillingDiagnostics);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<{
    events: any[];
    eventsTotal: number;
    page: number;
    pageSize: number;
    failedPayments: any[];
  } | null>(null);
  const [diagPage, setDiagPage] = useState(1);
  const diagPageSize = 25;
  const [diagLoading, setDiagLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchList({ data: { page, pageSize, q: "", suspended: "all" } });
        if (!cancelled) {
          setRows(res.rows);
          setTotal(res.total);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDiagLoading(true);
      try {
        const r = await eventsFn({ data: { limit: diagPageSize, page: diagPage } });
        if (!cancelled) setDiag(r as any);
        const c = await diagFn();
        if (!cancelled) setConfig(c);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDiagLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsFn, diagFn, diagPage]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function reload() {
    const res = await fetchList({ data: { page, pageSize, q: "", suspended: "all" } });
    setRows(res.rows);
    setTotal(res.total);
  }
  async function onSetPlan(companyId: string) {
    const slug = window.prompt("Plán (starter/premium/enterprise):", "premium");
    if (!slug) return;
    try {
      await setPlanFn({ data: { companyId, planSlug: slug as any } });
      toast.success("Plán nastavený");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onExtend(companyId: string) {
    const days = Number(window.prompt("Predĺžiť trial o (dní):", "14"));
    if (!days || days < 1) return;
    try {
      await extendFn({ data: { companyId, days } });
      toast.success("Trial predĺžený");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onCancel(companyId: string) {
    if (!confirm("Zrušiť predplatné?")) return;
    try {
      await cancelFn({ data: { companyId } });
      toast.success("Zrušené");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onReactivate(companyId: string) {
    try {
      await reactivateFn({ data: { companyId } });
      toast.success("Reaktivované");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onMarkActive(companyId: string) {
    const days = Number(window.prompt("Označiť aktívne na (dní):", "30"));
    if (!days || days < 1) return;
    try {
      await markActiveFn({ data: { companyId, days } });
      toast.success("Označené ako aktívne");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onSuspend(companyId: string, suspend: boolean) {
    if (suspend && !confirm("Pozastaviť fakturáciu (režim len na čítanie)?")) return;
    try {
      await suspendFn({ data: { companyId, suspend } });
      toast.success(suspend ? "Pozastavené" : "Obnovené");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function onSyncPayment(paymentId: string) {
    try {
      const r: any = await syncPaymentFn({ data: { providerPaymentId: paymentId } });
      toast.success(`Stav: ${r?.state ?? "—"}`);
      const refreshed = await eventsFn({ data: { limit: diagPageSize, page: diagPage } });
      setDiag(refreshed as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Predplatné"
        description="Stav predplatných firiem. Platby cez GoPay zatiaľ nie sú aktívne."
        action={
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            GoPay · pripravené, neaktívne
          </span>
        }
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={rows}
          loading={loading}
          emptyText="Žiadne predplatné."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Firma</th>
                    <th className="px-3 py-2">Plán</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2">Trial do</th>
                    <th className="px-3 py-2">Ďalšia fakturácia</th>
                    <th className="px-3 py-2 text-right">Cena/mes.</th>
                    <th className="px-3 py-2">Platby</th>
                    <th className="px-3 py-2">Akcie</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Žiadne predplatné.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.companies?.name ?? "—"}</td>
                        <td className="px-3 py-2 uppercase">{r.plan ?? "free"}</td>
                        <td className="px-3 py-2">{r.status ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {fmtDate(r.trial_ends_at)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {fmtDate(r.next_billing_at)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtPrice(r.monthly_price_cents)}
                        </td>
                        <td className="px-3 py-2">
                          {r.last_payment ? (
                            <span className="text-xs">
                              {r.last_payment.status} · {fmtPrice(r.last_payment.amount_cents)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1 text-xs">
                            <button
                              onClick={() => onSetPlan(r.company_id)}
                              className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                            >
                              Plán
                            </button>
                            <button
                              onClick={() => onExtend(r.company_id)}
                              className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                            >
                              +Trial
                            </button>
                            <button
                              onClick={() => onMarkActive(r.company_id)}
                              className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                            >
                              Aktívne
                            </button>
                            <button
                              onClick={() => onSuspend(r.company_id, true)}
                              className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                            >
                              Pozastaviť
                            </button>
                            <button
                              onClick={() => onSuspend(r.company_id, false)}
                              className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                            >
                              Obnoviť
                            </button>
                            {r.status === "cancelled" ? (
                              <button
                                onClick={() => onReactivate(r.company_id)}
                                className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                              >
                                Reaktivovať
                              </button>
                            ) : (
                              <button
                                onClick={() => onCancel(r.company_id)}
                                className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                              >
                                Zrušiť
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r: any) => (
            <MobileListCard
              title={r.companies?.name ?? "—"}
              subtitle={`${(r.plan ?? "free").toUpperCase()} · ${r.status ?? "—"}`}
              meta={`Trial: ${fmtDate(r.trial_ends_at)} · Ďalšia: ${fmtDate(r.next_billing_at)}`}
              amount={fmtPrice(r.monthly_price_cents)}
            />
          )}
        />

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Strana {page} z {pages} · {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                ← Späť
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Ďalej →
              </button>
            </div>
          </div>
        )}

        {/* GoPay diagnostics */}
        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">GoPay diagnostika</h2>
          {diagLoading && <div className="text-sm text-muted-foreground">Načítavam…</div>}

          {config && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-medium">Konfigurácia</h3>
              <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">APP_PUBLIC_URL</dt>
                  <dd className="font-mono">{config.app_public_url ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">GOPAY_ENV</dt>
                  <dd className="font-mono">{config.gopay_env ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Webhook secret</dt>
                  <dd className="font-mono">
                    {config.webhook_secret_set ? config.webhook_secret_preview : "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Notify URL pre GoPay</dt>
                  <dd className="font-mono break-all">{config.webhook_notify_url ?? "—"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Po zmene <span className="font-mono">GOPAY_WEBHOOK_SECRET</span> aktualizujte
                notification URL v GoPay konzole.
              </p>
              {config.warnings?.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-destructive">
                  {config.warnings.map((w: string, i: number) => (
                    <li key={i}>⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium">Posledné GoPay udalosti</h3>
            {diag?.events?.length ? (
              <>
                <ul className="space-y-1 text-xs">
                  {diag.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        {fmtDate(e.created_at)}
                      </span>
                      <span className="font-mono">{e.event_type}</span>
                      <span className="text-muted-foreground">
                        {e.payload?.id ? `· id ${e.payload.id}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {e.payload?.state ? `· ${e.payload.state}` : ""}
                      </span>
                      {e.payload?.error && (
                        <span className="text-destructive">· {String(e.payload.error)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {diag.eventsTotal > diagPageSize && (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Strana {diag.page} z {Math.max(1, Math.ceil(diag.eventsTotal / diagPageSize))}{" "}
                      · {diag.eventsTotal}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={diagPage <= 1}
                        onClick={() => setDiagPage((p) => Math.max(1, p - 1))}
                        className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                      >
                        ← Späť
                      </button>
                      <button
                        disabled={diagPage >= Math.ceil(diag.eventsTotal / diagPageSize)}
                        onClick={() => setDiagPage((p) => p + 1)}
                        className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                      >
                        Ďalej →
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Žiadne udalosti.</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium">Neúspešné platby</h3>
            {diag?.failedPayments?.length ? (
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">Dátum</th>
                    <th className="py-1">Plán</th>
                    <th className="py-1">Suma</th>
                    <th className="py-1">Stav</th>
                    <th className="py-1">GoPay ID</th>
                    <th className="py-1 text-right">Akcia</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.failedPayments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-1">{fmtDate(p.created_at)}</td>
                      <td className="py-1">{p.plan_slug ?? "—"}</td>
                      <td className="py-1">{fmtPrice(p.amount_cents)}</td>
                      <td className="py-1">{p.status}</td>
                      <td className="py-1 font-mono">{p.provider_payment_id}</td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => onSyncPayment(p.provider_payment_id)}
                          className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                        >
                          Sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">Žiadne neúspešné platby.</p>
            )}
          </div>
        </section>
      </AdminPageBody>
    </>
  );
}
