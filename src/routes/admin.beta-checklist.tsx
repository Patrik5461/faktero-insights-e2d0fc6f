import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getBetaChecklistStatus, adminSyncPayment } from "@/lib/faktero/admin.functions";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Circle } from "lucide-react";

export const Route = createFileRoute("/admin/beta-checklist")({
  head: () => ({ meta: [{ title: "Admin · Beta checklist — Faktero" }] }),
  component: BetaChecklistPage,
});

type Status = Awaited<ReturnType<typeof getBetaChecklistStatus>>;

const MANUAL_KEY = "faktero.beta.checklist.v1";

const MANUAL_ITEMS: { id: string; label: string }[] = [
  { id: "pdf_tested", label: "PDF generovanie otestované" },
  { id: "gopay_sandbox", label: "GoPay sandbox platba otestovaná" },
  { id: "trial_expiration", label: "Vypršanie trialu otestované" },
  { id: "starter_limits", label: "Starter limity otestované" },
  { id: "business_plan", label: "Business plán otestovaný" },
  { id: "api_key_creation", label: "Vytvorenie API kľúča otestované" },
  { id: "webhook_sending", label: "Odoslanie webhooku otestované" },
];

function Item({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : Circle;
  const cls = ok === true ? "text-emerald-500" : ok === false ? "text-destructive" : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
      <div className="min-w-0">
        <div>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </li>
  );
}

function BetaChecklistPage() {
  const fetchStatus = useServerFn(getBetaChecklistStatus);
  const syncPayment = useServerFn(adminSyncPayment);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    try { setManual(JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "{}")); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const s = await fetchStatus();
        if (!cancelled) setStatus(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchStatus]);

  function toggleManual(id: string) {
    setManual((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(MANUAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function verifyLastPayment() {
    const id = status?.billing?.latest_payment?.provider_payment_id;
    if (!id) { toast.error("Žiadna platba na overenie."); return; }
    setVerifying(true);
    try {
      const res = await syncPayment({ data: { providerPaymentId: String(id) } });
      toast.success(`Stav GoPay: ${res.state ?? "—"}`);
      const s = await fetchStatus();
      setStatus(s);
    } catch (e: any) {
      toast.error(e?.message ?? "Synchronizácia zlyhala");
    } finally {
      setVerifying(false);
    }
  }

  const autoItems = status
    ? [
        { ok: status.gopay_webhook_secret, label: "GoPay webhook secret nastavený", hint: "GOPAY_WEBHOOK_SECRET" },
        { ok: status.app_public_url, label: "APP_PUBLIC_URL nastavený" },
        { ok: status.finstat_public_key && status.finstat_private_key, label: "FinStat kľúče nastavené", hint: "FINSTAT_PUBLIC_KEY + FINSTAT_PRIVATE_KEY" },
        { ok: status.resend_api_key, label: "Resend nastavený", hint: "RESEND_API_KEY" },
        { ok: status.gopay_client_id && status.gopay_client_secret && status.gopay_goid, label: "GoPay credentials nastavené", hint: `GOPAY_ENV: ${status.gopay_env ?? "—"}` },
      ]
    : [];

  const autoTotal = autoItems.length;
  const autoDone = autoItems.filter((i) => i.ok).length;
  const manualDone = MANUAL_ITEMS.filter((i) => manual[i.id]).length;
  const total = autoTotal + MANUAL_ITEMS.length;
  const done = autoDone + manualDone;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <AdminPageHeader
        title="Private beta checklist"
        description={`Pripravenosť: ${done} / ${total} (${pct} %)`}
      />
      <AdminPageBody>
        {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Konfigurácia (automatické)</h2>
            {loading && <div className="text-sm text-muted-foreground">Načítavam…</div>}
            {!loading && (
              <ul className="divide-y divide-border">
                {autoItems.map((i, idx) => <Item key={idx} ok={i.ok} label={i.label} hint={i.hint} />)}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Manuálne testy</h2>
            <ul className="divide-y divide-border">
              {MANUAL_ITEMS.map((i) => (
                <li key={i.id} className="py-1.5">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={!!manual[i.id]}
                      onChange={() => toggleManual(i.id)}
                    />
                    <span className={manual[i.id] ? "text-foreground" : "text-foreground"}>{i.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Stav manuálnych testov je uložený lokálne v prehliadači.
            </p>
          </section>
        </div>

        {status && (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">GoPay billing test</h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">GOPAY_ENV</dt><dd className="font-mono">{status.gopay_env ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">APP_PUBLIC_URL</dt><dd>{status.app_public_url ? "✓" : "✗"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Webhook secret</dt><dd>{status.gopay_webhook_secret ? "✓" : "✗"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">billing_payments</dt><dd>{status.billing?.payments_count ?? 0}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledný stav</dt><dd className="font-mono">{status.billing?.latest_payment?.status ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledná udalosť</dt><dd className="font-mono truncate max-w-[12rem]">{status.billing?.latest_event?.event_type ?? "—"}</dd></div>
              </dl>
              <button
                onClick={verifyLastPayment}
                disabled={verifying || !status.billing?.latest_payment?.provider_payment_id}
                className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {verifying ? "Overujem…" : "Overiť poslednú platbu"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">Diagnostika — nevytvára reálnu platbu.</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">API smoke test</h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">api_logs</dt><dd>{status.api?.logs_count ?? 0}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledný call</dt><dd className="font-mono truncate max-w-[12rem]">{status.api?.latest ? `${status.api.latest.method} ${status.api.latest.status}` : "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledná cesta</dt><dd className="font-mono truncate max-w-[12rem]">{status.api?.latest?.path ?? "—"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Pred betou otestujte vytvorenie faktúry cez API a prijatie webhooku.</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Webhook doručenia</h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">webhook_delivery_logs</dt><dd>{status.webhooks?.deliveries_count ?? 0}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledná udalosť</dt><dd className="font-mono truncate max-w-[12rem]">{status.webhooks?.latest?.event_type ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Stav</dt><dd className="font-mono">{status.webhooks?.latest?.status ?? "—"}{status.webhooks?.latest?.response_status ? ` (${status.webhooks.latest.response_status})` : ""}</dd></div>
              </dl>
            </section>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
