import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/api-kluce")({
  head: () => ({ meta: [{ title: "API kľúče — Faktero" }] }),
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
  const [keys, setKeys] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<{ id: string; plaintext: string } | null>(null);

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
      return toast.error(friendlyError(error));
    }
    setRevealed({ id: data.id, plaintext });
    reload();
  }

  async function revoke(id: string) {
    if (!confirm("Zneplatniť kľúč?")) return;
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <>
      <PageHeader
        title="API kľúče"
        description="Použite Bearer kľúč v hlavičke Authorization."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => create("test")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> Test kľúč
            </button>
            <button
              onClick={() => create("live")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Live kľúč
            </button>
          </div>
        }
      />
      <PageBody>
        {revealed && (
          <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-sm font-medium">
              Skopírujte si kľúč. Po zatvorení ho už nezobrazíme.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-background p-2 font-mono text-sm">
                {revealed.plaintext}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(revealed.plaintext);
                  toast.success("Skopírované");
                }}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Hotovo
              </button>
            </div>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Názov</th>
                <th className="p-3">Režim</th>
                <th className="p-3">Prefix</th>
                <th className="p-3">Vytvorený</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Žiadne kľúče.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="p-3 font-medium">{k.name}</td>
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
                    <button
                      onClick={() => revoke(k.id)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
