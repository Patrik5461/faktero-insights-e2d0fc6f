import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  DeletedToggle,
} from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";

export const Route = createFileRoute("/_authenticated/zalohove/")({
  head: () => ({ meta: [{ title: "Zálohové faktúry — Faktero" }] }),
  component: ProformaListPage,
});

function ProformaListPage() {
  const navigate = useNavigate();
  const list = usePagedList({
    resource: "invoices",
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
    equals: { type: "proforma" },
    pageSizeKey: "invoices-proforma",
    orderBy: { column: "issue_date", ascending: false },
    sortKey: "zalohove",
  });

  const [settledMap, setSettledMap] = useState<
    Record<string, { id: string; invoice_number: string }>
  >({});
  const [rowDelete, setRowDelete] = useState<any | null>(null);

  // Look up which proformas have been settled (referenced by another invoice's advance_invoice_id)
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !list.rows.length) {
      setSettledMap({});
      return;
    }
    const ids = list.rows.map((r) => r.id);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, advance_invoice_id")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .in("advance_invoice_id", ids);
      if (cancelled) return;
      const m: Record<string, { id: string; invoice_number: string }> = {};
      for (const row of data ?? []) {
        if (row.advance_invoice_id && !m[row.advance_invoice_id]) {
          m[row.advance_invoice_id] = { id: row.id, invoice_number: row.invoice_number };
        }
      }
      setSettledMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [list.rows]);

  function statusFor(row: any) {
    if (settledMap[row.id]) return "settled" as const;
    return row.status as string;
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Zálohová faktúra vymazaná");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setRowDelete(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Zálohové faktúry"
        description="Proforma / zálohové faktúry. Po prijatí platby ich zúčtujete vo finálnej faktúre."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/faktury/nova"
              search={{ type: "proforma" } as any}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nová zálohová faktúra
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať číslo, odberateľa, IČO…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
          />
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <ResponsiveTable
          className="mt-3"
          items={list.rows}
          loading={list.loading}
          emptyText={
            list.showDeleted
              ? "Žiadne vymazané zálohové faktúry."
              : 'Žiadne zálohové faktúry. Vytvorte prvú tlačidlom „Nová zálohová faktúra".'
          }
          mobileCard={(i: any) => {
            const s = statusFor(i);
            return (
              <MobileListCard
                onClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
                title={i.invoice_number}
                subtitle={i.customer_name ?? "—"}
                status={<ProformaStatus value={s} settled={settledMap[i.id]} />}
                meta={`${i.issue_date} · splat. ${i.due_date}`}
                amount={`${Number(i.total).toFixed(2)} ${i.currency}`}
                actions={
                  list.showDeleted ? (
                    <button
                      onClick={async () => {
                        try {
                          await list.restore([i.id]);
                          toast.success("Obnovené");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Chyba");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Obnoviť
                    </button>
                  ) : (
                    <button
                      onClick={() => setRowDelete(i)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Vymazať
                    </button>
                  )
                }
              />
            );
          }}
          desktop={
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Číslo</th>
                    <th className="p-3">Odberateľ</th>
                    <th className="p-3">Vystavená</th>
                    <th className="p-3">Splatnosť</th>
                    <th className="p-3 text-right">Suma</th>
                    <th className="p-3">Stav</th>
                    <th className="p-3">Zúčtovaná v</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  )}
                  {!list.loading && list.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {list.showDeleted
                          ? "Žiadne vymazané zálohové faktúry."
                          : "Žiadne zálohové faktúry."}
                      </td>
                    </tr>
                  )}
                  {list.rows.map((i) => {
                    const s = statusFor(i);
                    const link = settledMap[i.id];
                    return (
                      /*
                        Detail otvárali jednotlivé bunky a celým znovunačítaním
                        stránky. Stav ani odkaz na zúčtovanú faktúru na ťuknutie
                        nereagovali. Klikateľný je po novom celý riadok cez
                        router; bunka s odkazom a akciami si kliknutie ponechá.
                      */
                      <tr
                        key={i.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
                      >
                        <td className="p-3 font-medium">{i.invoice_number}</td>
                        <td className="p-3">{i.customer_name ?? "—"}</td>
                        <td className="p-3">{i.issue_date}</td>
                        <td className="p-3">{i.due_date}</td>
                        <td className="p-3 text-right">
                          {Number(i.total).toFixed(2)} {i.currency}
                        </td>
                        <td className="p-3">
                          <ProformaStatus value={s} settled={link} />
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {link ? (
                            <Link
                              to="/faktury/$id"
                              params={{ id: link.id }}
                              className="text-primary hover:underline"
                            >
                              {link.invoice_number}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {list.showDeleted ? (
                            <button
                              title="Obnoviť"
                              onClick={async () => {
                                try {
                                  await list.restore([i.id]);
                                  toast.success("Obnovené");
                                } catch (e: any) {
                                  toast.error(e?.message ?? "Chyba");
                                }
                              }}
                              className="rounded p-1.5 text-primary hover:bg-primary/10"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              title="Vymazať"
                              onClick={() => setRowDelete(i)}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        />
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
        />
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto zálohovú faktúru?"
        message={
          rowDelete
            ? `Zálohová faktúra ${rowDelete.invoice_number} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.`
            : ""
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
    </>
  );
}

function ProformaStatus({
  value,
  settled,
}: {
  value: string;
  settled?: { id: string; invoice_number: string };
}) {
  if (settled || value === "settled") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
        Zúčtovaná
      </span>
    );
  }
  return <StatusBadge status={value} />;
}
