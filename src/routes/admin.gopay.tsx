import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell, AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getPlatformGopayStatus, testPlatformGopayConnection } from "@/lib/faktero/admin-gopay.functions";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Copy, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/gopay")({
  head: () => ({ meta: [{ title: "GoPay (predplatné) — Admin" }] }),
  component: AdminGopayPage,
});

function Row({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="flex items-center gap-2 text-sm">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-right font-mono text-xs text-muted-foreground">{value ?? (ok ? "nastavené" : "chýba")}</div>
    </div>
  );
}

function AdminGopayPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; at?: string } | null>(null);
  const fnGet = useServerFn(getPlatformGopayStatus);
  const fnTest = useServerFn(testPlatformGopayConnection);

  async function refresh() {
    setBusy("load");
    try {
      const r = await fnGet();
      setData(r);
      setErr(null);
    } catch (e: any) {
      setErr(e.message ?? "Chyba pri načítaní.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onTest() {
    setBusy("test");
    setTestResult(null);
    try {
      const r = await fnTest();
      setTestResult({ ok: true, msg: `Token získaný (vyprší o ${r.expiresInSec ?? "?"}s)`, at: r.testedAt });
      toast.success("GoPay pripojenie funguje.");
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message ?? "Test zlyhal." });
      toast.error("Test zlyhal.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(v: string) {
    try { await navigator.clipboard.writeText(v); toast.success("Skopírované."); }
    catch { toast.error("Kopírovanie zlyhalo."); }
  }

  const cfg = data?.config;
  const stats = data?.payments30d;
  const allConfigured = cfg && cfg.hasClientId && cfg.hasClientSecret && cfg.hasGoid && cfg.hasWebhookSecret && cfg.hasAppUrl;

  return (
    <AdminShell>
      <AdminPageHeader
        title="GoPay — platformové predplatné"
        description="Konfigurácia GoPay účtu, cez ktorý Faktero účtuje predplatné svojim zákazníkom."
        action={
          <button
            onClick={refresh}
            disabled={busy === "load"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy === "load" ? "animate-spin" : ""}`} /> Obnoviť
          </button>
        }
      />
      <AdminPageBody>
        {err && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}

        {!data ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Konfigurácia</h2>
                    <p className="text-sm text-muted-foreground">Načítané zo serverových env premenných.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    cfg.env === "production" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {cfg.env === "production" ? "Produkcia" : "Sandbox"}
                  </span>
                </div>

                <div className="mt-4 divide-y divide-border">
                  <Row ok={cfg.hasGoid} label="GOPAY_GOID" value={cfg.goid} />
                  <Row ok={cfg.hasClientId} label="GOPAY_CLIENT_ID" value={cfg.clientIdMasked} />
                  <Row ok={cfg.hasClientSecret} label="GOPAY_CLIENT_SECRET" />
                  <Row ok={cfg.hasWebhookSecret} label="GOPAY_WEBHOOK_SECRET" />
                  <Row ok={cfg.hasAppUrl} label="APP_PUBLIC_URL" value={cfg.hasAppUrl ? "OK" : null} />
                </div>

                {!allConfigured && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>
                      Niektoré env premenné chýbajú. Nastavte ich v serverových secrets a reštartujte aplikáciu.
                      Predplatné cez GoPay nebude fungovať, kým nebudú všetky položky zelené.
                    </span>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={onTest}
                    disabled={busy === "test" || !cfg.hasClientId || !cfg.hasClientSecret || !cfg.hasGoid}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "test" ? "Testujem…" : "Otestovať pripojenie"}
                  </button>
                  <a
                    href={cfg.env === "production" ? "https://help.gopay.com/cs/" : "https://help.gopay.com/cs/s-cim-vam-muzeme-pomoci/integrace-platebni-brany/testovaci-prostredi-sandbox"}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    GoPay dokumentácia <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                {testResult && (
                  <div className={`mt-4 rounded-md border p-3 text-sm ${
                    testResult.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}>
                    <div className="flex items-center gap-2">
                      {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      <span>{testResult.msg}</span>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">Webhook URL</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Túto URL nastavte v GoPay administrácii ako notifikačnú URL pre platformové platby.
                </p>
                {cfg.webhookUrl ? (
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{cfg.webhookUrl}</code>
                    <button
                      onClick={() => copy(cfg.webhookUrl!)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      <Copy className="h-3.5 w-3.5" /> Kopírovať
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-amber-700">Najprv nastavte APP_PUBLIC_URL.</div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">Posledné platby predplatného</h2>
                <p className="mt-1 text-sm text-muted-foreground">Posledných 10 záznamov z billing_payments.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">Dátum</th>
                        <th className="px-2 py-2">Stav</th>
                        <th className="px-2 py-2 text-right">Suma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.length === 0 ? (
                        <tr><td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">Žiadne platby.</td></tr>
                      ) : data.recent.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-2">{p.createdAt ? new Date(p.createdAt).toLocaleString("sk-SK") : "—"}</td>
                          <td className="px-2 py-2">{p.status ?? "—"}</td>
                          <td className="px-2 py-2 text-right font-mono">
                            {(Number(p.amountCents ?? 0) / 100).toFixed(2)} {p.currency ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold">Štatistika (30 dní)</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Spolu platieb</dt><dd className="font-mono">{stats.total}</dd></div>
                  <div className="flex justify-between"><dt className="text-emerald-700">Zaplatené</dt><dd className="font-mono">{stats.paid}</dd></div>
                  <div className="flex justify-between"><dt className="text-amber-700">Čakajúce</dt><dd className="font-mono">{stats.pending}</dd></div>
                  <div className="flex justify-between"><dt className="text-destructive">Zlyhané</dt><dd className="font-mono">{stats.failed}</dd></div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <dt className="font-medium">Príjem</dt>
                    <dd className="font-mono">{(stats.totalPaidCents / 100).toFixed(2)} €</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-sm text-emerald-900">
                <p className="font-semibold">Pozn.</p>
                <p className="mt-2">Toto sú platby Faktera za predplatné. Platby koncových zákazníkov firiem idú cez ich vlastné GoPay účty (sekcia <em>Platobné konektory</em>).</p>
              </div>
            </aside>
          </div>
        )}
      </AdminPageBody>
    </AdminShell>
  );
}
