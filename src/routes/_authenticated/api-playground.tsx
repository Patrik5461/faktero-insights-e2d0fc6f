import { StavOdznak } from "@/components/faktero/web/Stav";
import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Copy, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/api-playground")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "API Playground — Faktero") }] }),
  component: Playground,
});

type Recipe = {
  id: string;
  label: string;
  method: "GET" | "POST";
  path: string;
  body?: (vars: Record<string, string>) => string;
  vars?: { key: string; label: string; placeholder?: string }[];
};

const RECIPES: Recipe[] = [
  {
    id: "create_customer",
    label: "Vytvoriť odberateľa",
    method: "POST",
    path: "/api/v1/customers",
    body: (v) =>
      JSON.stringify(
        {
          name: v.name || "Test s.r.o.",
          email: v.email || "test@example.com",
          ico: "12345678",
          street: "Hlavná 1",
          city: "Bratislava",
          zip: "81101",
          country: "SK",
        },
        null,
        2,
      ),
    vars: [
      { key: "name", label: "Názov" },
      { key: "email", label: "E-mail" },
    ],
  },
  {
    id: "create_invoice",
    label: "Vytvoriť faktúru",
    method: "POST",
    path: "/api/v1/invoices",
    body: (v) =>
      JSON.stringify(
        {
          external_id: v.external_id || `TEST-${Date.now()}`,
          customer: {
            name: v.customer_name || "Test s.r.o.",
            email: v.customer_email || "test@example.com",
            country: "SK",
          },
          items: [
            { name: "Webové služby", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23 },
          ],
        },
        null,
        2,
      ),
    vars: [
      { key: "external_id", label: "external_id" },
      { key: "customer_name", label: "Odberateľ – názov" },
      { key: "customer_email", label: "Odberateľ – e-mail" },
    ],
  },
  {
    id: "get_pdf",
    label: "Získať PDF faktúry",
    method: "GET",
    path: "/api/v1/invoices/{invoice_id}/pdf",
    vars: [{ key: "invoice_id", label: "invoice_id", placeholder: "UUID faktúry" }],
  },
  {
    id: "mark_paid",
    label: "Označiť ako uhradenú",
    method: "POST",
    path: "/api/v1/invoices/{invoice_id}/mark-paid",
    body: () => "{}",
    vars: [{ key: "invoice_id", label: "invoice_id" }],
  },
  {
    id: "send_invoice",
    label: "Odoslať faktúru e-mailom",
    method: "POST",
    path: "/api/v1/invoices/{invoice_id}/send",
    body: (v) =>
      JSON.stringify(
        {
          recipient_email: v.recipient_email || "test@example.com",
          subject: "Faktúra",
          message: "V prílohe faktúra.",
        },
        null,
        2,
      ),
    vars: [
      { key: "invoice_id", label: "invoice_id" },
      { key: "recipient_email", label: "Príjemca" },
    ],
  },
];

function Playground() {
  const { t } = useT();
  const [keys, setKeys] = useState<any[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [tokenInput, setTokenInput] = useState("");
  const [recipeId, setRecipeId] = useState<string>(RECIPES[0].id);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const recipe = useMemo(() => RECIPES.find((r) => r.id === recipeId)!, [recipeId]);

  async function reloadLogs() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { data } = await supabase
      .from("api_logs")
      .select("*")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(15);
    setLogs(data ?? []);
  }
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("api_keys")
      .select("*")
      .eq("company_id", cid)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setKeys(data ?? []);
        if (data?.[0]) setSelectedKeyId(data[0].id);
      });
    reloadLogs();
  }, []);

  const path = recipe.path.replaceAll("{invoice_id}", vars["invoice_id"] || "{invoice_id}");
  const body = recipe.body ? recipe.body(vars) : null;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const curl = `curl -X ${recipe.method} '${baseUrl}${path}' \\\n  -H 'Authorization: Bearer ${tokenInput || t("VÁŠ_API_KĽÚČ")}'${body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, "'\\''")}'` : ""}`;

  async function run() {
    if (!tokenInput)
      return toast.error(
        t("Vložte plaintext API kľúč (zobrazí sa pri vytvorení v sekcii API kľúče)."),
      );
    setBusy(true);
    setResponse(null);
    try {
      const res = await fetch(path, {
        method: recipe.method,
        headers: {
          authorization: `Bearer ${tokenInput}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ?? undefined,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // odpoveď nemusí byť JSON — vtedy sa zobrazí surový text
      }
      setResponse({ status: res.status, body: pretty });
      reloadLogs();
    } catch (e: any) {
      setResponse({ status: 0, body: e?.message ?? "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="API Playground"
        description={t("Vyskúšajte verejné API priamo z prehliadača.")}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <label className="block text-sm">
                <span className="font-semibold">{t("API kľúč")}</span>
                <select
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {keys.length === 0 && (
                    <option value="">{t("Žiadne kľúče — vytvorte v sekcii API kľúče")}</option>
                  )}
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.mode.toUpperCase()} · {k.prefix}… · {k.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">{t("Plaintext token (Bearer)")}</span>
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="fk_test_…"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("Tokeny vidíte len pri vytvorení kľúča. Zadajte ten, ktorý ste si uložili.")}
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">{t("Požiadavka")}</span>
                <select
                  value={recipeId}
                  onChange={(e) => {
                    setRecipeId(e.target.value);
                    setVars({});
                    setResponse(null);
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {RECIPES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(r.label)}
                    </option>
                  ))}
                </select>
              </label>

              {recipe.vars?.map((v) => (
                <label key={v.key} className="block text-sm">
                  <span className="font-semibold">{t(v.label)}</span>
                  <input
                    value={vars[v.key] ?? ""}
                    placeholder={v.placeholder ? t(v.placeholder) : undefined}
                    onChange={(e) => setVars({ ...vars, [v.key]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div className="min-w-0 font-mono text-xs">
                  <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-semibold">
                    {recipe.method}
                  </span>{" "}
                  <span className="break-all">{path}</span>
                </div>
                <button
                  onClick={run}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  <Play className="h-4 w-4" /> {busy ? t("Posielam…") : t("Spustiť")}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">cURL</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(curl);
                    toast.success(t("Skopírované"));
                  }}
                  className="rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-accent"
                >
                  <Copy className="mr-1 inline h-3 w-3" /> {t("Kopírovať")}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">{curl}</pre>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-2 text-base font-semibold">{t("Odpoveď")}</h3>
              {response ? (
                <>
                  <div className="mb-2 text-xs">
                    HTTP{" "}
                    <StavOdznak ton={response.status >= 200 && response.status < 300 ? "uspech" : "chyba"} maly>
                      {response.status}
                    </StavOdznak>
                  </div>
                  <pre className="max-h-[400px] overflow-auto rounded-md border border-border bg-muted p-3 text-xs">
                    {response.body}
                  </pre>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">{t("Ešte ste nespustili požiadavku.")}</div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-2 text-base font-semibold">{t("Posledné api_logs")}</h3>
              <div className="space-y-1 text-xs">
                {logs.length === 0 && <div className="text-muted-foreground">{t("Žiadne záznamy.")}</div>}
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0"
                  >
                    <span className="min-w-0 truncate font-mono">
                      {l.method} {l.path}
                    </span>
                    <span className={`shrink-0 whitespace-nowrap tabular-nums ${l.status >= 400 ? "font-semibold text-destructive" : "text-foreground"}`}>
                      HTTP {l.status} · {l.duration_ms ?? "—"}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
