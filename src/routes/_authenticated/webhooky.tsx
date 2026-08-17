import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { Plus, Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/webhooky")({
  head: () => ({ meta: [{ title: "Webhooky — Faktero" }] }),
  component: WebhooksPage,
});

const EVENTS = [
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "invoice.cancelled",
  "customer.created",
] as const;

function genSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return (
    "whsec_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function WebhooksPage() {
  const [hooks, setHooks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  useZatvorNaEscape(editing ? () => setEditing(null) : null);

  async function reload() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const [{ data: h }, { data: l }] = await Promise.all([
      supabase
        .from("webhooks")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false }),
      supabase
        .from("webhook_delivery_logs")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setHooks(h ?? []);
    setLogs(l ?? []);
  }
  useEffect(() => {
    reload();
  }, []);

  async function save(w: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!w.url?.startsWith("https://")) return toast.error("URL musí začínať https://");
    const payload = {
      company_id: cid,
      url: w.url,
      secret: w.secret || genSecret(),
      events: w.events?.length ? w.events : ["*"],
      active: w.active ?? true,
    };
    const op = w.id
      ? supabase.from("webhooks").update(payload).eq("id", w.id)
      : supabase.from("webhooks").insert(payload);
    const { error } = await op;
    if (error) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(friendlyError(error));
    }
    toast.success("Uložené");
    setEditing(null);
    reload();
  }
  async function remove(id: string) {
    if (!confirm("Zmazať webhook?")) return;
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <>
      <PageHeader
        title="Webhooky"
        description="HTTPS endpointy, ktoré zavoláme pri udalostiach."
        action={
          <button
            onClick={() =>
              setEditing({ url: "", events: [...EVENTS], active: true, secret: genSecret() })
            }
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nový webhook
          </button>
        }
      />
      <PageBody>
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">URL</th>
                  <th className="p-3">Eventy</th>
                  <th className="p-3">Aktívny</th>
                  <th className="p-3 text-right">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hooks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Žiadne webhooky.
                    </td>
                  </tr>
                )}
                {hooks.map((w) => (
                  <tr key={w.id}>
                    <td className="p-3 font-mono text-xs">{w.url}</td>
                    <td className="p-3 text-xs">{(w.events ?? []).join(", ")}</td>
                    <td className="p-3">{w.active ? "áno" : "nie"}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setEditing(w)}
                        className="mr-2 rounded border border-border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Upraviť
                      </button>
                      <button
                        onClick={() => remove(w.id)}
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Posledné doručenia</h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Čas</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Stav</th>
                    <th className="p-3">HTTP</th>
                    <th className="p-3">Pokusy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Žiadne doručenia.
                      </td>
                    </tr>
                  )}
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="p-3 text-xs">
                        {new Date(l.created_at).toLocaleString("sk-SK")}
                      </td>
                      <td className="p-3 font-mono text-xs">{l.event_type}</td>
                      <td className="p-3">{l.status}</td>
                      <td className="p-3">{l.response_status ?? "—"}</td>
                      <td className="p-3">{l.attempt_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {editing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setEditing(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Webhook"
              className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold">
                {editing.id ? "Upraviť webhook" : "Nový webhook"}
              </h3>
              <label className="block text-sm">
                <span className="font-medium">URL</span>
                <input
                  value={editing.url}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="text-sm">
                <span className="font-medium">Eventy</span>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {EVENTS.map((ev) => {
                    const checked = editing.events?.includes(ev) || editing.events?.includes("*");
                    return (
                      <label key={ev} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={(e) => {
                            const set = new Set<string>(
                              (editing.events ?? []).filter((x: string) => x !== "*"),
                            );
                            if (e.target.checked) set.add(ev);
                            else set.delete(ev);
                            setEditing({ ...editing, events: Array.from(set) });
                          }}
                        />
                        <span className="font-mono">{ev}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />{" "}
                Aktívny
              </label>
              <div>
                <span className="text-sm font-medium">Podpisový tajný kľúč</span>
                <div className="mt-1 flex gap-2">
                  <input
                    readOnly
                    value={editing.secret ?? ""}
                    className="flex-1 rounded-md border border-input bg-muted px-3 py-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(editing.secret ?? "");
                      toast.success("Skopírované");
                    }}
                    className="rounded-md border border-border px-2 hover:bg-secondary"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hlavička <code>X-Faktero-Signature</code> = HMAC-SHA256(secret, body).
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  Zrušiť
                </button>
                <button
                  onClick={() => save(editing)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Uložiť
                </button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
