import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Building2, Copy, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { firmyPreKlucUctuFn, vytvorKlucUctuFn } from "@/lib/faktero/api-kluce.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { toast } from "sonner";
import { potvrd } from "@/lib/potvrdenie";

export const Route = createFileRoute("/_authenticated/api-kluce")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "API kľúče — Faktero") }] }),
  component: ApiKeysPage,
});

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomKey(mode: "test" | "live") {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `fk_${mode}_${body}`;
}

function ApiKeysPage() {
  const { t } = useT();
  const [keys, setKeys] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<{ id: string; plaintext: string } | null>(null);
  const [kluceUctu, setKluceUctu] = useState(false);

  async function reload() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    setKeys(data ?? []);
  }
  useEffect(() => {
    reload();
  }, []);

  async function create(mode: "test" | "live") {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const plaintext = randomKey(mode);
    const key_hash = await sha256Hex(plaintext);
    const prefix = plaintext.slice(0, 14);
    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        company_id: cid,
        mode,
        name: `${mode.toUpperCase()} kľúč`,
        prefix,
        key_hash,
      })
      .select()
      .single();
    if (error || !data) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(t(friendlyError(error)));
    }
    setRevealed({ id: data.id, plaintext });
    reload();
  }

  async function revoke(id: string) {
    if (!(await potvrd(t("Zneplatniť kľúč?")))) return;
    // Kľúč sa nemaže, len zneplatní — denník volaní si tak drží, ktorým kľúčom čo prišlo.
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <>
      <PageHeader
        title={t("API kľúče")}
        description={t("Použite Bearer kľúč v hlavičke Authorization.")}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setKluceUctu(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Building2 className="h-4 w-4" /> {t("Kľúč pre viac firiem")}
            </button>
            <button
              onClick={() => create("test")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> {t("Test kľúč")}
            </button>
            <button
              onClick={() => create("live")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Live kľúč")}
            </button>
          </div>
        }
      />
      <PageBody>
        {revealed && (
          <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-sm font-medium">
              {t("Skopírujte si kľúč. Po zatvorení ho už nezobrazíme.")}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-background p-2 font-mono text-sm">
                {revealed.plaintext}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(revealed.plaintext);
                  toast.success(t("Skopírované"));
                }}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                {t("Hotovo")}
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Názov")}</th>
                <th className="p-3">{t("Režim")}</th>
                <th className="p-3">{t("Prefix")}</th>
                <th className="p-3">{t("Vytvorený")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {t("Žiadne kľúče.")}
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id}>
                  <td
                    className={`p-3 font-medium ${k.revoked_at ? "text-muted-foreground line-through" : ""}`}
                  >
                    {k.name}
                    {k.ucet_user_id && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {Array.isArray(k.firmy) && k.firmy.length
                          ? t("{n} firiem", { n: k.firmy.length })
                          : t("všetky firmy")}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${k.mode === "live" ? "bg-primary/15 text-primary" : "bg-accent/30"}`}
                    >
                      {k.mode}
                    </span>
                  </td>
                  <td className="p-3 font-mono">{k.prefix}…</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString("sk-SK")}
                  </td>
                  <td className="p-3 text-right">
                    {k.revoked_at ? (
                      <span className="text-xs text-muted-foreground">
                        {t("Zneplatnený {datum}", { datum: new Date(k.revoked_at).toLocaleDateString("sk-SK") })}
                      </span>
                    ) : (
                      <button
                        onClick={() => revoke(k.id)}
                        aria-label={t("Zneplatniť kľúč")}
                        title={t("Zneplatniť kľúč")}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="font-medium">{t("Kľúč pre viac firiem")}</div>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Jeden kľúč pre všetky firmy, ktoré spravujete (ste vlastník alebo admin) — napríklad pre účtovnú kanceláriu. Firmu vyberiete v každej požiadavke hlavičkou",
            )}{" "}
            <code className="font-mono text-foreground">X-Company</code>{" "}
            {t("(id alebo IČO); zoznam firiem vráti")}{" "}
            <code className="font-mono text-foreground">GET /api/v1/companies</code>.
          </p>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="font-medium">{t("Napojenie AI asistenta (MCP)")}</div>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Claude, ChatGPT či iný AI asistent sa na Faktero napojí cez MCP. Claude.ai a ChatGPT sa prihlásia cez Faktero bez kľúča, ostatní API kľúčom. Adresa servera je",
            )}{" "}
            <code className="font-mono text-foreground">https://www.faktero.sk/api/mcp</code>.{" "}
            <a href="/docs/api#mcp" className="text-primary hover:underline">
              {t("Návod na napojenie")}
            </a>
          </p>
        </div>
      </PageBody>
      {kluceUctu && (
        <KlucUctuOkno
          onClose={() => setKluceUctu(false)}
          onHotovo={(r) => {
            setKluceUctu(false);
            setRevealed(r);
            reload();
          }}
        />
      )}
    </>
  );
}

/** Okno: kľúč pre všetky moje firmy alebo len pre vybrané. */
function KlucUctuOkno({
  onClose,
  onHotovo,
}: {
  onClose: () => void;
  onHotovo: (r: { id: string; plaintext: string }) => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const nacitaj = useServerFn(firmyPreKlucUctuFn);
  const vytvor = useServerFn(vytvorKlucUctuFn);
  const [firmy, setFirmy] = useState<{ id: string; name: string; ico: string | null }[] | null>(null);
  const [vsetky, setVsetky] = useState(true);
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"live" | "test">("live");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    nacitaj()
      .then((r) => setFirmy(r.firmy))
      .catch(() => setFirmy([]));
  }, [nacitaj]);

  async function vytvorit() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!vsetky && !vybrane.size) return toast.error(t("Vyberte aspoň jednu firmu."));
    setBusy(true);
    try {
      const r = await vytvor({
        data: { company_id: cid, mode, firmy: vsetky ? null : [...vybrane] },
      });
      onHotovo(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kluc-uctu-nadpis"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kluc-uctu-nadpis" className="text-lg font-semibold">
          {t("Kľúč pre viac firiem")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Kľúč platí pre firmy, kde ste vlastník alebo admin. Firmu vyberiete v každej požiadavke hlavičkou X-Company.")}
        </p>
        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="sr-only">{t("Pre ktoré firmy")}</legend>
          <label className="flex items-start gap-2">
            <input type="radio" checked={vsetky} onChange={() => setVsetky(true)} className="mt-1" />
            <span>
              <strong>{t("Všetky moje firmy")}</strong>
              <span className="block text-xs text-muted-foreground">
                {t("Aj tie, ktoré pribudnú neskôr.")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={!vsetky} onChange={() => setVsetky(false)} className="mt-1" />
            <span>
              <strong>{t("Len vybrané firmy")}</strong>
            </span>
          </label>
        </fieldset>
        {!vsetky && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {firmy === null ? (
              <div className="p-2 text-muted-foreground">{t("Načítavam…")}</div>
            ) : firmy.length === 0 ? (
              <div className="p-2 text-muted-foreground">{t("Nespravujete žiadnu firmu.")}</div>
            ) : (
              firmy.map((f) => (
                <label key={f.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={vybrane.has(f.id)}
                    onChange={() => {
                      const n = new Set(vybrane);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      setVybrane(n);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.ico && <span className="font-mono text-xs text-muted-foreground">{f.ico}</span>}
                </label>
              ))
            )}
          </div>
        )}
        <label className="mt-4 block text-sm">
          <span className="text-xs text-muted-foreground">{t("Režim")}</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "live" | "test")}
            className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="live">{t("Live — ostré doklady")}</option>
            <option value="test">{t("Test — len čítanie")}</option>
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
            {t("Zrušiť")}
          </button>
          <button
            onClick={() => void vytvorit()}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("Vytvoriť kľúč")}
          </button>
        </div>
      </div>
    </div>
  );
}
