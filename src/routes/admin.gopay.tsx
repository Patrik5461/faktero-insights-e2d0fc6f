import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import {
  getPlatformGopayStatus,
  testPlatformGopayConnection,
  savePlatformGopaySettings,
  clearPlatformGopaySettings,
} from "@/lib/faktero/admin-gopay.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Copy, RefreshCw, AlertTriangle, ExternalLink, Save, Eraser } from "lucide-react";

export const Route = createFileRoute("/admin/gopay")({
  head: () => ({ meta: [{ title: "GoPay (predplatné) — Admin" }] }),
  component: AdminGopayPage,
});

function SourceBadge({ src }: { src: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    db: { label: "DB", cls: "bg-emerald-100 text-emerald-800" },
    env: { label: "ENV", cls: "bg-sky-100 text-sky-800" },
    missing: { label: "chýba", cls: "bg-destructive/15 text-destructive" },
    default: { label: "default", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[src] ?? map.default;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`}>{v.label}</span>;
}

function Row({ ok, label, value, source }: { ok: boolean; label: string; value?: string | null; source?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="flex items-center gap-2 text-sm">
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
        <span className="font-medium">{label}</span>
        {source && <SourceBadge src={source} />}
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

  // form state
  const [form, setForm] = useState({
    env: "sandbox" as "sandbox" | "production",
    goid: "",
    clientId: "",
    clientSecret: "",
    webhookSecret: "",
  });

  const fnGet = useServerFn(getPlatformGopayStatus);
  const fnTest = useServerFn(testPlatformGopayConnection);
  const fnSave = useServerFn(savePlatformGopaySettings);
  const fnClear = useServerFn(clearPlatformGopaySettings);

  async function refresh() {
    setBusy("load");
    try {
      const r = await fnGet();
      setData(r);
      setForm((f) => ({
        ...f,
        env: (r.config.env === "production" ? "production" : "sandbox"),
        goid: r.config.goid ?? "",
        clientId: r.config.hasClientId ? (r.config.clientIdMasked ?? "") : "",
        clientSecret: "",
        webhookSecret: "",
      }));
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

  async function onSave() {
    const clientIdToSend = form.clientId.includes("•••") ? "" : form.clientId.trim();
    if (!form.goid.trim()) { toast.error("Zadajte GoID."); return; }
    if (!clientIdToSend && !data?.config?.hasClientId) { toast.error("Zadajte Client ID."); return; }
    if (!data?.config?.hasClientSecret && !form.clientSecret) { toast.error("Zadajte Client Secret."); return; }
    setBusy("save");
    try {
      await fnSave({
        data: {
          env: form.env,
          goid: form.goid.trim(),
          clientId: clientIdToSend,
          clientSecret: form.clientSecret,
          webhookSecret: form.webhookSecret,
        },
      });
      toast.success("Uložené.");
      setTestResult(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Uloženie zlyhalo.");
    } finally {
      setBusy(null);
    }
  }

  async function onClear() {
    if (!confirm("Naozaj zmazať uložené GoPay nastavenia z DB? Použije sa fallback na ENV premenné.")) return;
    setBusy("clear");
    try {
      await fnClear();
      toast.success("Vymazané. Aktívne sú teraz ENV hodnoty (ak existujú).");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Mazanie zlyhalo.");
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
    <>
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
              {/* EDIT FORM */}
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Konfigurácia GoPay</h2>
                    <p className="text-sm text-muted-foreground">
                      Hodnoty sa šifrujú a ukladajú do DB (prepíšu ENV).
                      <SourceBadge src="db" /> = z DB, <SourceBadge src="env" /> = z env premenných.
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    cfg.env === "production" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    Aktívne: {cfg.env === "production" ? "Produkcia" : "Sandbox"}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Prostredie</Label>
                    <select
                      value={form.env}
                      onChange={(e) => setForm({ ...form, env: e.target.value as any })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="sandbox">Sandbox (testovacie)</option>
                      <option value="production">Production (ostré)</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Sandbox volá gw.sandbox.gopay.com, Production gate.gopay.cz.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>GoID</Label>
                    <Input
                      value={form.goid}
                      onChange={(e) => setForm({ ...form, goid: e.target.value })}
                      placeholder="napr. 8765432100"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Client ID</Label>
                    <Input
                      value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      placeholder="OAuth Client ID"
                    />
                    {cfg.hasClientId && (
                      <p className="text-xs text-muted-foreground">Aktuálne: {cfg.clientIdMasked} <SourceBadge src={cfg.sources.clientId} /></p>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Client Secret</Label>
                    <Input
                      type="password"
                      value={form.clientSecret}
                      onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                      placeholder={cfg.hasClientSecret ? "(ponechať pôvodné — vyplňte len pri zmene)" : "Client Secret"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {cfg.hasClientSecret ? <>Uložené {cfg.clientSecretMasked} <SourceBadge src={cfg.sources.clientSecret} /></> : "Nie je nastavené."}
                    </p>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Webhook secret (HMAC)</Label>
                    <Input
                      type="password"
                      value={form.webhookSecret}
                      onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                      placeholder={cfg.hasWebhookSecret ? "(ponechať pôvodné — vyplňte len pri zmene)" : "Webhook secret"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {cfg.hasWebhookSecret ? <>Uložené {cfg.webhookSecretMasked} <SourceBadge src={cfg.sources.webhookSecret} /></> : "Nie je nastavené."}
                    </p>
                  </div>
                </div>

                {!allConfigured && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>Niektoré hodnoty chýbajú. Predplatné cez GoPay nebude fungovať, kým nebudú všetky položky vyplnené.</span>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={onSave}
                    disabled={busy === "save"}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {busy === "save" ? "Ukladám…" : "Uložiť"}
                  </button>
                  <button
                    onClick={onTest}
                    disabled={busy === "test" || !cfg.hasClientId || !cfg.hasClientSecret || !cfg.hasGoid}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    {busy === "test" ? "Testujem…" : "Otestovať pripojenie"}
                  </button>
                  <button
                    onClick={onClear}
                    disabled={busy === "clear"}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Eraser className="h-4 w-4" /> Vymazať z DB
                  </button>
                  <a
                    href="https://help.gopay.com/cs/"
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
                      <span className="break-words">{testResult.msg}</span>
                    </div>
                  </div>
                )}
              </section>

              {/* STATUS */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">Aktuálny stav</h2>
                <div className="mt-4 divide-y divide-border">
                  <Row ok={cfg.hasGoid} label="GoID" value={cfg.goid} source={cfg.sources.goid} />
                  <Row ok={cfg.hasClientId} label="Client ID" value={cfg.clientIdMasked} source={cfg.sources.clientId} />
                  <Row ok={cfg.hasClientSecret} label="Client Secret" value={cfg.clientSecretMasked} source={cfg.sources.clientSecret} />
                  <Row ok={cfg.hasWebhookSecret} label="Webhook secret" value={cfg.webhookSecretMasked} source={cfg.sources.webhookSecret} />
                  <Row ok={cfg.hasAppUrl} label="APP_PUBLIC_URL" value={cfg.hasAppUrl ? "OK" : null} source={cfg.hasAppUrl ? "env" : "missing"} />
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">Webhook URL</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Túto URL nastavte v GoPay administrácii ako notifikačnú URL.
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
                <p className="mt-2">
                  Toto sú platby Faktera za predplatné. Platby koncových zákazníkov firiem idú cez ich vlastné GoPay účty (sekcia <em>Platobné konektory</em>).
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Bezpečnosť</p>
                <p className="mt-2">Client Secret a Webhook secret sa šifrujú (AES-256-GCM) kľúčom <code>PAYMENT_SECRETS_KEY</code> a ukladajú do tabuľky <code>platform_settings</code>. K hodnotám má prístup len service role a platform admini.</p>
              </div>
            </aside>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
