import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  getMyPaymentProvider,
  savePaymentProvider,
  testPaymentProvider,
  disconnectPaymentProvider,
  setOnlinePaymentsEnabled,
  rotateWebhookSecret,
  getPaymentDiagnostics,
} from "@/lib/faktero/payments.functions";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  KeyRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/nastavenia/online-platby")({
  head: () => ({ meta: [{ title: "Online platby — Faktero" }] }),
  component: OnlinePaymentsPage,
});

function OnlinePaymentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [diag, setDiag] = useState<{
    paymentSecretsKey: boolean;
    hasWebhookSecret: boolean;
    notifyUrl: string | null;
  } | null>(null);
  const [newNotifyUrl, setNewNotifyUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    goid: "",
    client_id: "",
    client_secret: "",
    sandbox_mode: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const fnGet = useServerFn(getMyPaymentProvider);
  const fnSave = useServerFn(savePaymentProvider);
  const fnTest = useServerFn(testPaymentProvider);
  const fnDisc = useServerFn(disconnectPaymentProvider);
  const fnToggle = useServerFn(setOnlinePaymentsEnabled);
  const fnRotate = useServerFn(rotateWebhookSecret);
  const fnDiag = useServerFn(getPaymentDiagnostics);

  useEffect(() => {
    const id = getActiveCompanyId();
    setCompanyId(id);
    if (id) refresh(id);
  }, []);

  async function refresh(id: string) {
    const r = await fnGet({ data: { companyId: id } });
    setState(r);
    if (r.provider) {
      setForm({
        goid: r.provider.goid ?? "",
        client_id: r.provider.client_id ?? "",
        client_secret: "",
        sandbox_mode: !!r.provider.sandbox_mode,
      });
    }
    try {
      const d = await fnDiag({ data: { companyId: id } });
      setDiag(d);
    } catch {
      /* non-fatal */
    }
  }

  if (!companyId) return <PageBody>Načítavam…</PageBody>;

  const connected = !!state?.provider?.enabled;
  const sandbox = !!state?.provider?.sandbox_mode;
  const statusLabel = !state?.provider ? "Nepripojené" : sandbox ? "Sandbox" : "Produkcia";
  const statusColor = !state?.provider
    ? "bg-muted text-muted-foreground"
    : sandbox
      ? "bg-amber-100 text-amber-800"
      : "bg-emerald-100 text-emerald-800";

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setBusy("save");
    try {
      await fnSave({
        data: {
          companyId,
          goid: form.goid.trim(),
          client_id: form.client_id.trim(),
          client_secret: form.client_secret.trim() || undefined,
          sandbox_mode: form.sandbox_mode,
          enabled: true,
        },
      });
      toast.success("GoPay účet bol úspešne pripojený.");
      setForm((f) => ({ ...f, client_secret: "" }));
      await refresh(companyId);
    } catch (e: any) {
      toast.error(e.message ?? "Chyba pri ukladaní.");
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    if (!companyId) return;
    setBusy("test");
    try {
      await fnTest({ data: { companyId } });
      toast.success("Pripojenie funguje.");
      await refresh(companyId);
    } catch (e: any) {
      toast.error(e.message ?? "Test zlyhal.");
      await refresh(companyId);
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect() {
    if (!companyId) return;
    if (!confirm("Naozaj chcete odpojiť GoPay účet?")) return;
    setBusy("disc");
    try {
      await fnDisc({ data: { companyId } });
      toast.success("Odpojené.");
      setForm({ goid: "", client_id: "", client_secret: "", sandbox_mode: true });
      await refresh(companyId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function onToggle(v: boolean) {
    if (!companyId) return;
    try {
      await fnToggle({ data: { companyId, enabled: v } });
      await refresh(companyId);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onRotate() {
    if (!companyId) return;
    if (
      !confirm(
        "Naozaj pregenerovať webhook secret? Po zmene musíte aktualizovať notification URL v GoPay administrácii, inak prestanú prichádzať notifikácie o platbách.",
      )
    )
      return;
    setBusy("rotate");
    try {
      const r = await fnRotate({ data: { companyId } });
      setNewNotifyUrl(r.notifyUrl);
      try {
        await navigator.clipboard.writeText(r.notifyUrl);
      } catch {
        // clipboard bez HTTPS/gesta zlyhá — URL je aj tak zobrazená na stránke
      }
      toast.success("Webhook secret pregenerovaný a notification URL skopírovaná.");
      await refresh(companyId);
    } catch (e: any) {
      toast.error(e.message ?? "Chyba pri rotácii.");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Skopírované.");
    } catch {
      toast.error("Kopírovanie zlyhalo.");
    }
  }

  return (
    <>
      <PageHeader
        title="Online platby"
        description="Pripojte si vlastný GoPay účet a prijímajte platby priamo od svojich zákazníkov."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">GoPay</h2>
                  <p className="text-sm text-muted-foreground">Stav pripojenia tejto firmy.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>

              {state?.provider?.last_test_at && (
                <div className="mt-4 flex items-start gap-2 text-sm">
                  {state.provider.last_test_ok ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                      <span>Posledný test prešiel.</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                      <span>Posledný test zlyhal: {state.provider.last_test_error}</span>
                    </>
                  )}
                </div>
              )}

              <form onSubmit={onSave} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">GoID</span>
                  <input
                    value={form.goid}
                    onChange={(e) => setForm({ ...form, goid: e.target.value })}
                    required
                    pattern="\d+"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Client ID</span>
                  <input
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    required
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">
                    Client Secret{" "}
                    {connected && (
                      <span className="text-xs text-muted-foreground">
                        (nechajte prázdne pre zachovanie)
                      </span>
                    )}
                  </span>
                  <input
                    type="password"
                    value={form.client_secret}
                    onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                    placeholder={connected ? "••••••••" : ""}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-3 sm:col-span-2">
                  <Switch
                    checked={form.sandbox_mode}
                    onCheckedChange={(v) => setForm({ ...form, sandbox_mode: v })}
                  />
                  <span className="text-sm">Sandbox režim (testovacie platby)</span>
                </label>

                <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busy === "save"}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "save" ? "Ukladám…" : "Uložiť"}
                  </button>
                  <button
                    type="button"
                    onClick={onTest}
                    disabled={!connected || busy === "test"}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    {busy === "test" ? "Testujem…" : "Otestovať pripojenie"}
                  </button>
                  {connected && (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      disabled={busy === "disc"}
                      className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Odpojiť
                    </button>
                  )}
                </div>
              </form>
            </div>

            {connected && (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Povoliť online platby na faktúrach</h3>
                    <p className="text-sm text-muted-foreground">
                      Po zapnutí sa na faktúrach zobrazí tlačidlo „Zaplatiť online".
                    </p>
                  </div>
                  <Switch checked={!!state?.onlinePaymentsEnabled} onCheckedChange={onToggle} />
                </div>
              </div>
            )}

            {connected && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <KeyRound className="h-4 w-4" /> Webhook secret
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tajný kľúč v notification URL, ktorou GoPay potvrdzuje platby. Pri podozrení
                      na únik ho pregenerujte.
                    </p>
                  </div>
                  <button
                    onClick={onRotate}
                    disabled={busy === "rotate"}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />{" "}
                    {busy === "rotate" ? "Generujem…" : "Pregenerovať webhook secret"}
                  </button>
                </div>

                {newNotifyUrl && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm space-y-2">
                    <p className="font-medium text-amber-900">
                      Po zmene secretu aktualizujte notification URL v GoPay administrácii.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-white/70 px-2 py-1 text-xs">
                        {newNotifyUrl}
                      </code>
                      <button
                        onClick={() => copyText(newNotifyUrl)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100"
                      >
                        <Copy className="h-3.5 w-3.5" /> Kopírovať
                      </button>
                    </div>
                  </div>
                )}

                {!newNotifyUrl && diag?.notifyUrl && (
                  <div className="rounded-md border border-border bg-secondary/40 p-4 text-sm space-y-2">
                    <p className="text-muted-foreground">Aktuálna notification URL pre GoPay:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                        {diag.notifyUrl}
                      </code>
                      <button
                        onClick={() => copyText(diag.notifyUrl!)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        <Copy className="h-3.5 w-3.5" /> Kopírovať
                      </button>
                    </div>
                  </div>
                )}

                {diag && !diag.paymentSecretsKey && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>
                      <strong>PAYMENT_SECRETS_KEY nie je nastavený.</strong> Šifrovanie GoPay kľúčov
                      používa záložný kľúč. Pre produkciu nastavte vyhradený PAYMENT_SECRETS_KEY na
                      serveri.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-700 mt-0.5" />
                <div className="text-sm text-emerald-900 space-y-2">
                  <p>
                    <strong>Peniaze nikdy nejdú cez Faktero.</strong>
                  </p>
                  <p>
                    Zákazník platí priamo na váš GoPay účet. Faktero si neúčtuje províziu z platieb
                    vašich zákazníkov.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm space-y-2">
              <h4 className="font-semibold">Potrebujete pomoc?</h4>
              <p className="text-muted-foreground">
                Pozrite si návod ako získať GoPay účet a pripojiť ho k Faktere.
              </p>
              <Link
                to="/docs/online-platby/gopay"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Otvoriť dokumentáciu <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
