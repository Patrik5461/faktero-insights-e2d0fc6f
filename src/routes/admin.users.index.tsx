import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { listAdminUsers } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/users/")({
  head: () => ({ meta: [{ title: "Admin · Používatelia — Faktero" }] }),
  component: AdminUsersPage,
});

type Row = Awaited<ReturnType<typeof listAdminUsers>>["rows"][number];

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("sk-SK");
  } catch {
    return "—";
  }
}

/** Jedno slovo o účte — po ňom sa v zozname hľadá najčastejšie. */
function StavUctu({ row }: { row: any }) {
  const [text, trieda] = row.zakazane
    ? ["Zakázaný", "bg-destructive/10 text-destructive"]
    : row.deletion_scheduled_for
      ? ["Ruší sa", "bg-amber-500/10 text-amber-700 dark:text-amber-400"]
      : !row.email_potvrdeny
        ? ["Nepotvrdený", "bg-muted text-muted-foreground"]
        : ["Aktívny", "bg-primary/10 text-primary"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${trieda}`}>{text}</span>;
}

function AdminUsersPage() {
  const fetchList = useServerFn(listAdminUsers);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchList({ data: { q, page, pageSize, suspended: "all" } });
        if (!cancelled) {
          setRows(res.rows as Row[]);
          setTotal(res.total);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList, q, page, pageSize]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <AdminPageHeader
        title="Používatelia"
        description="Všetci registrovaní používatelia naprieč firmami."
      />
      <AdminPageBody>
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadať podľa e-mailu alebo mena…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={rows}
          loading={loading}
          emptyText="Žiadni používatelia."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">E-mail</th>
                    <th className="px-3 py-2">Meno</th>
                    <th className="px-3 py-2">Firmy</th>
                    <th className="px-3 py-2">Roly</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2">Registrovaný</th>
                    <th className="px-3 py-2">Naposledy dnu</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Žiadni používatelia.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r: any) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.email ?? "—"}</td>
                        <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.companies?.length
                            ? r.companies.map((m: any) => m.name).join(", ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.companies?.length
                            ? Array.from(new Set(r.companies.map((m: any) => m.role))).join(", ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StavUctu row={r} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {fmtDate(r.posledne_prihlasenie)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            to="/admin/users/$id"
                            params={{ id: r.id }}
                            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
                          >
                            Spravovať
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r: any) => (
            <Link to="/admin/users/$id" params={{ id: r.id }} className="block">
              <MobileListCard
                title={r.email ?? "—"}
                subtitle={r.full_name ?? "—"}
                meta={`${r.companies?.length ?? 0} firiem · naposledy dnu ${fmtDate(
                  r.posledne_prihlasenie,
                )}`}
                status={<StavUctu row={r} />}
              />
            </Link>
          )}
        />

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Strana {page} z {pages} · {total} používateľov
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                ← Späť
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Ďalej →
              </button>
            </div>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
