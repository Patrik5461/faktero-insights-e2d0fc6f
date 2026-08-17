import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { useServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";

const listPaymentProvidersAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admin } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");
    const { data } = await supabaseAdmin
      .from("company_payment_providers")
      .select(
        "id, company_id, provider, enabled, sandbox_mode, connected_at, last_test_at, last_test_ok, updated_at, companies:company_id(name)",
      )
      .order("updated_at", { ascending: false });
    return {
      rows: (data ?? []).map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        companyName: r.companies?.name ?? "(neznáma)",
        provider: r.provider,
        enabled: r.enabled,
        sandbox: r.sandbox_mode,
        connectedAt: r.connected_at,
        lastTestAt: r.last_test_at,
        lastTestOk: r.last_test_ok,
      })),
    };
  });

export const Route = createFileRoute("/admin/payment-providers")({
  head: () => ({ meta: [{ title: "Platobné konektory — Admin" }] }),
  component: AdminPaymentProviders,
});

function AdminPaymentProviders() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(listPaymentProvidersAdmin);
  useEffect(() => {
    fn()
      .then((r) => setRows(r.rows))
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <>
      <AdminPageHeader
        title="Platobné konektory"
        description="Prehľad firiem pripojených k vlastným GoPay účtom. Tajné údaje sa nikdy nezobrazujú."
      />
      <AdminPageBody>
        <div className="space-y-4">
          {err && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>
          )}
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Firma</th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Stav</th>
                  <th className="px-3 py-2 text-left">Režim</th>
                  <th className="px-3 py-2 text-left">Pripojené</th>
                  <th className="px-3 py-2 text-left">Posledný test</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.companyName}</td>
                    <td className="px-3 py-2">{r.provider}</td>
                    <td className="px-3 py-2">
                      {r.enabled ? (
                        <span className="text-emerald-700">Aktívny</span>
                      ) : (
                        <span className="text-muted-foreground">Vypnutý</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.sandbox ? "Sandbox" : "Produkcia"}</td>
                    <td className="px-3 py-2">
                      {r.connectedAt ? new Date(r.connectedAt).toLocaleString("sk-SK") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.lastTestAt ? (
                        <>
                          {new Date(r.lastTestAt).toLocaleString("sk-SK")}{" "}
                          {r.lastTestOk ? "✓" : "✗"}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !err && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Žiadne pripojené firmy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminPageBody>
    </>
  );
}
