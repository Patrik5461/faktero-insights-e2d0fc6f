import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";

function mask(u?: string | null) {
  if (!u) return "—";
  if (u.length <= 3) return "•••";
  return u.slice(0, 2) + "•••" + u.slice(-1);
}

const listIntegrationsAdmin = createServerFn({ method: "POST" })
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
    const { data: conns } = await supabaseAdmin
      .from("commander_connections")
      .select(
        "company_id, enabled, auto_sync_daily, username, last_sync_at, sync_status, error_message, companies:company_id(name)",
      )
      .order("last_sync_at", { ascending: false, nullsFirst: false });
    const { data: links } = await supabaseAdmin
      .from("commander_vehicle_links")
      .select("company_id");
    const counts = new Map<string, number>();
    (links ?? []).forEach((l: any) =>
      counts.set(l.company_id, (counts.get(l.company_id) ?? 0) + 1),
    );
    // Last daily sync per company (most recent)
    const { data: dailyLogs } = await supabaseAdmin
      .from("commander_sync_logs")
      .select("company_id, status, message, raw_response, created_at")
      .eq("sync_type", "daily")
      .order("created_at", { ascending: false })
      .limit(500);
    const lastDaily = new Map<string, any>();
    (dailyLogs ?? []).forEach((l: any) => {
      if (!lastDaily.has(l.company_id)) lastDaily.set(l.company_id, l);
    });
    return {
      rows: (conns ?? []).map((r: any) => ({
        companyId: r.company_id,
        companyName: r.companies?.name ?? "(neznáma)",
        enabled: !!r.enabled,
        autoSync: !!r.auto_sync_daily,
        username: mask(r.username),
        lastSyncAt: r.last_sync_at,
        status: r.sync_status,
        error: r.error_message,
        linkedVehicles: counts.get(r.company_id) ?? 0,
        lastDailyAt: lastDaily.get(r.company_id)?.created_at ?? null,
        lastDailyImported: lastDaily.get(r.company_id)?.raw_response?.imported_count ?? null,
        lastDailyStatus: lastDaily.get(r.company_id)?.status ?? null,
      })),
      tesla: await loadTeslaRows(supabaseAdmin),
    };
  });

async function loadTeslaRows(supabaseAdmin: any) {
  const { data: tConns } = await supabaseAdmin
    .from("tesla_connections")
    .select(
      "company_id, enabled, tesla_account_email, last_sync_at, sync_status, error_message, companies:company_id(name)",
    )
    .order("last_sync_at", { ascending: false, nullsFirst: false });
  const { data: tLinks } = await supabaseAdmin.from("tesla_vehicle_links").select("company_id");
  const tCounts = new Map<string, number>();
  (tLinks ?? []).forEach((l: any) =>
    tCounts.set(l.company_id, (tCounts.get(l.company_id) ?? 0) + 1),
  );
  return (tConns ?? []).map((r: any) => ({
    companyId: r.company_id,
    companyName: r.companies?.name ?? "(neznáma)",
    enabled: !!r.enabled,
    email: r.tesla_account_email ? r.tesla_account_email.replace(/(.{2}).+@/, "$1•••@") : "—",
    lastSyncAt: r.last_sync_at,
    status: r.sync_status,
    error: r.error_message,
    linkedVehicles: tCounts.get(r.company_id) ?? 0,
  }));
}

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: "Integrácie — Admin" }] }),
  component: AdminIntegrations,
});

function AdminIntegrations() {
  const [rows, setRows] = useState<any[]>([]);
  const [teslaRows, setTeslaRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(listIntegrationsAdmin);
  useEffect(() => {
    fn()
      .then((r: any) => {
        setRows(r.rows);
        setTeslaRows(r.tesla ?? []);
      })
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <>
      <AdminPageHeader
        title="Integrácie"
        description="Prehľad pripojených externých služieb po firmách."
      />
      <AdminPageBody>
        <div className="space-y-4">
          {err && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>
          )}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 font-medium">Commander GPS</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Firma</th>
                    <th className="px-4 py-2">Aktívne</th>
                    <th className="px-4 py-2">Auto sync</th>
                    <th className="px-4 py-2">Používateľ</th>
                    <th className="px-4 py-2">Posledná sync.</th>
                    <th className="px-4 py-2">Posl. denná sync.</th>
                    <th className="px-4 py-2">Import. (posl. deň)</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Vozidlá</th>
                    <th className="px-4 py-2">Posledná chyba</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                        Žiadne pripojenia.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.companyId} className="border-t border-border">
                        <td className="px-4 py-2">{r.companyName}</td>
                        <td className="px-4 py-2">{r.enabled ? "Áno" : "Nie"}</td>
                        <td className="px-4 py-2">{r.autoSync ? "Áno" : "Nie"}</td>
                        <td className="px-4 py-2 font-mono">{r.username}</td>
                        <td className="px-4 py-2">
                          {r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString("sk-SK") : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {r.lastDailyAt ? new Date(r.lastDailyAt).toLocaleString("sk-SK") : "—"}
                        </td>
                        <td className="px-4 py-2">{r.lastDailyImported ?? "—"}</td>
                        <td className="px-4 py-2">{r.status ?? "—"}</td>
                        <td className="px-4 py-2">{r.linkedVehicles}</td>
                        <td className="px-4 py-2 text-destructive">{r.error ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 font-medium">Tesla Fleet API</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Firma</th>
                    <th className="px-4 py-2">Aktívne</th>
                    <th className="px-4 py-2">Tesla účet</th>
                    <th className="px-4 py-2">Posledná sync.</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Vozidlá</th>
                    <th className="px-4 py-2">Posledná chyba</th>
                  </tr>
                </thead>
                <tbody>
                  {teslaRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        Žiadne Tesla pripojenia.
                      </td>
                    </tr>
                  ) : (
                    teslaRows.map((r) => (
                      <tr key={r.companyId} className="border-t border-border">
                        <td className="px-4 py-2">{r.companyName}</td>
                        <td className="px-4 py-2">{r.enabled ? "Áno" : "Nie"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.email}</td>
                        <td className="px-4 py-2">
                          {r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString("sk-SK") : "—"}
                        </td>
                        <td className="px-4 py-2">{r.status ?? "—"}</td>
                        <td className="px-4 py-2">{r.linkedVehicles}</td>
                        <td className="px-4 py-2 text-destructive">{r.error ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </AdminPageBody>
    </>
  );
}
