import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Eye, PauseCircle, PlayCircle } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { ResponsiveDialog } from "@/components/faktero/ResponsiveDialog";
import {
  listAdminCompanies,
  suspendCompany,
  reactivateCompany,
} from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/companies/")({
  head: () => ({ meta: [{ title: "Admin · Firmy — Faktero" }] }),
  component: AdminCompaniesPage,
});

type Row = Awaited<ReturnType<typeof listAdminCompanies>>["rows"][number];

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("sk-SK");
  } catch {
    return "—";
  }
}

function StatusBadge({ row }: { row: Row }) {
  if (row.suspended_at) {
    return (
      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        Pozastavená
      </span>
    );
  }
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      Aktívna
    </span>
  );
}

function AdminCompaniesPage() {
  const fetchList = useServerFn(listAdminCompanies);
  const doSuspend = useServerFn(suspendCompany);
  const doReactivate = useServerFn(reactivateCompany);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [suspended, setSuspended] = useState<"all" | "active" | "suspended">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [suspendTarget, setSuspendTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setPage(1), [q, suspended]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchList({ data: { q, page, pageSize, suspended } });
        if (!cancelled) {
          setRows(res.rows);
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
  }, [fetchList, q, page, pageSize, suspended, nonce]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function confirmSuspend() {
    if (!suspendTarget) return;
    setBusy(true);
    try {
      await doSuspend({ data: { id: suspendTarget.id, reason: reason.trim() || "—" } });
      toast.success("Firma pozastavená");
      setSuspendTarget(null);
      setReason("");
      setNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate(row: Row) {
    try {
      await doReactivate({ data: { id: row.id } });
      toast.success("Firma obnovená");
      setNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  const filterChips = useMemo(
    () => [
      { value: "all" as const, label: "Všetky" },
      { value: "active" as const, label: "Aktívne" },
      { value: "suspended" as const, label: "Pozastavené" },
    ],
    [],
  );

  return (
    <>
      <AdminPageHeader
        title="Firmy"
        description="Všetky účty registrované v Faktero."
      />
      <AdminPageBody>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať podľa názvu, IČO, DIČ…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-1">
            {filterChips.map((c) => (
              <button
                key={c.value}
                onClick={() => setSuspended(c.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  suspended === c.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={rows}
          loading={loading}
          emptyText="Žiadne firmy."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Názov</th>
                    <th className="px-3 py-2">IČO</th>
                    <th className="px-3 py-2">Vlastník</th>
                    <th className="px-3 py-2 text-right">Užív.</th>
                    <th className="px-3 py-2 text-right">Faktúry</th>
                    <th className="px-3 py-2">Plán</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2">Vytvorená</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={9}>
                        Načítavam…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={9}>
                        Žiadne firmy.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          <Link
                            to="/admin/companies/$id"
                            params={{ id: r.id }}
                            className="hover:text-primary"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.ico ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.owner_email ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.users_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.invoices_count}</td>
                        <td className="px-3 py-2 uppercase">{r.plan}</td>
                        <td className="px-3 py-2"><StatusBadge row={r} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to="/admin/companies/$id"
                              params={{ id: r.id }}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Detail"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            {r.suspended_at ? (
                              <button
                                onClick={() => handleReactivate(r)}
                                className="rounded-md p-1.5 text-primary hover:bg-primary/10"
                                title="Obnoviť"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setSuspendTarget(r)}
                                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                                title="Pozastaviť"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r) => (
            <MobileListCard
              title={r.name}
              subtitle={`IČO ${r.ico ?? "—"} · ${r.owner_email ?? "bez vlastníka"}`}
              status={<StatusBadge row={r} />}
              meta={`${r.users_count} užív. · ${r.invoices_count} faktúr · ${r.plan}`}
              amount={fmtDate(r.created_at)}
              actions={
                <>
                  <Link
                    to="/admin/companies/$id"
                    params={{ id: r.id }}
                    className="rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
                  >
                    Detail
                  </Link>
                  {r.suspended_at ? (
                    <button
                      onClick={() => handleReactivate(r)}
                      className="rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
                    >
                      Obnoviť
                    </button>
                  ) : (
                    <button
                      onClick={() => setSuspendTarget(r)}
                      className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Pozastaviť
                    </button>
                  )}
                </>
              }
            />
          )}
        />

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Strana {page} z {pages} · {total} firiem
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

        <ResponsiveDialog
          open={!!suspendTarget}
          onOpenChange={(v) => {
            if (!v) {
              setSuspendTarget(null);
              setReason("");
            }
          }}
          title={`Pozastaviť ${suspendTarget?.name ?? ""}`}
          description="Firma stratí prístup k aplikácii. Akcia bude zaznamenaná v audit logu."
          footer={
            <>
              <button
                onClick={() => setSuspendTarget(null)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Zrušiť
              </button>
              <button
                disabled={busy}
                onClick={confirmSuspend}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                {busy ? "Pozastavujem…" : "Pozastaviť"}
              </button>
            </>
          }
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Dôvod</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Krátky dôvod pozastavenia (zaznamená sa)…"
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </ResponsiveDialog>
      </AdminPageBody>
    </>
  );
}