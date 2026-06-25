import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { getAdminUsage } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/usage")({
  head: () => ({ meta: [{ title: "Admin · Využitie — Faktero" }] }),
  component: AdminUsagePage,
});

type Row = Awaited<ReturnType<typeof getAdminUsage>>["rows"][number];

function AdminUsagePage() {
  const fetchUsage = useServerFn(getAdminUsage);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchUsage();
        if (!cancelled) setRows(res.rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchUsage]);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <AdminPageHeader
        title="Využitie platformy"
        description="Mesačné využitie podľa firiem (od začiatku aktuálneho mesiaca)."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={slice}
          loading={loading}
          emptyText="Tento mesiac zatiaľ žiadne dáta."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Firma</th>
                    <th className="px-3 py-2 text-right">Faktúry</th>
                    <th className="px-3 py-2 text-right">PDF</th>
                    <th className="px-3 py-2 text-right">API</th>
                    <th className="px-3 py-2 text-right">E-maily</th>
                    <th className="px-3 py-2 text-right">Webhooky</th>
                    <th className="px-3 py-2 text-right">Úložisko</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && slice.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Načítavam…</td></tr>
                  ) : slice.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Tento mesiac zatiaľ žiadne dáta.</td></tr>
                  ) : slice.map((r) => (
                    <tr key={r.company_id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.invoices}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pdfs}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.api_calls}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.emails}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.webhooks}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {r.storage_mb == null ? "—" : `${r.storage_mb} MB`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r) => (
            <MobileListCard
              title={r.name}
              meta={`Faktúry ${r.invoices} · PDF ${r.pdfs} · API ${r.api_calls} · E-maily ${r.emails} · Webhooky ${r.webhooks}`}
              amount={r.storage_mb == null ? "—" : `${r.storage_mb} MB`}
            />
          )}
        />

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Strana {page} z {pages} · {total} firiem</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50">← Späť</button>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50">Ďalej →</button>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Počet PDF generovaní odhadujeme z vystavených faktúr. Veľkosť úložiska
          zatiaľ nie je merana per firma.
        </p>
      </AdminPageBody>
    </>
  );
}