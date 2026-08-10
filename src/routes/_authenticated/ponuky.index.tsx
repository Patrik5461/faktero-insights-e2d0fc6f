import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/ponuky/")({
  head: () => ({ meta: [{ title: "Cenové ponuky — Faktero" }] }),
  component: QuotesPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  sent: "Odoslaná",
  accepted: "Akceptovaná",
  rejected: "Zamietnutá",
  expired: "Expirovaná",
  converted: "Konvertovaná",
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  accepted: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-primary/15 text-primary",
};

function QuotesPage() {
  const list = usePagedList({
    resource: "quotes",
    searchColumns: ["quote_number", "customer_name"],
    // Od najnovšej — `created_at` je pri importe čas importu, nie dátum dokladu.
    orderBy: { column: "issue_date", ascending: false },
    sortKey: "ponuky",
  });
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [bulkHardDelete, setBulkHardDelete] = useState(false);
  async function confirmBulkHardDelete() {
    const pocet = list.selectedIds.length;
    try {
      await list.hardDelete(list.selectedIds);
      toast.success(`Natrvalo vymazaných: ${pocet}`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBulkHardDelete(false);
    }
  }

  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Ponuka vymazaná");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulk() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(`Vymazaných ${list.selectedIds.length}`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBulkDelete(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Cenové ponuky"
        description="Vytvárajte a posielajte cenové ponuky odberateľom."
        action={
          <Link
            to="/ponuky/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová ponuka
          </Link>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať číslo, odberateľa…"
            className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-4">
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <BulkBar
          onHardDelete={() => setBulkHardDelete(true)}
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={async () => {
            try {
              await list.restore(list.selectedIds);
              toast.success("Obnovené");
              list.clearSelection();
            } catch (e: any) {
              toast.error(e?.message ?? "Chyba");
            }
          }}
          onClear={list.clearSelection}
        />
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={list.allOnPageSelected}
                    onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                  />
                </th>
                <th className="p-3">Číslo</th>
                <th className="p-3">Odberateľ</th>
                <th className="p-3">Vystavená</th>
                <th className="p-3">Platnosť do</th>
                <th className="p-3 text-right">Suma</th>
                <th className="p-3">Stav</th>
                <th></th>
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
                    {list.showDeleted ? "Žiadne vymazané ponuky." : "Žiadne cenové ponuky."}
                  </td>
                </tr>
              )}
              {list.rows.map((q) => (
                <tr key={q.id} className="hover:bg-muted/30">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!list.selected[q.id]}
                      onChange={(e) => list.toggleSelect(q.id, e.target.checked)}
                    />
                  </td>
                  <td
                    className="p-3 font-medium cursor-pointer"
                    onClick={() => (window.location.href = `/ponuky/${q.id}`)}
                  >
                    {q.quote_number}
                  </td>
                  <td
                    className="p-3 cursor-pointer"
                    onClick={() => (window.location.href = `/ponuky/${q.id}`)}
                  >
                    {q.customer_name ?? "—"}
                  </td>
                  <td
                    className="p-3 cursor-pointer"
                    onClick={() => (window.location.href = `/ponuky/${q.id}`)}
                  >
                    {q.issue_date}
                  </td>
                  <td
                    className="p-3 cursor-pointer"
                    onClick={() => (window.location.href = `/ponuky/${q.id}`)}
                  >
                    {q.valid_until}
                  </td>
                  <td
                    className="p-3 text-right cursor-pointer"
                    onClick={() => (window.location.href = `/ponuky/${q.id}`)}
                  >
                    {Number(q.total).toFixed(2)} {q.currency}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[q.status] ?? "bg-muted"}`}
                    >
                      {STATUS_LABEL[q.status] ?? q.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {list.showDeleted ? (
                      <button
                        onClick={async () => {
                          try {
                            await list.restore([q.id]);
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
                        onClick={() => setRowDelete(q)}
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
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
          />
        </div>
      </PageBody>
      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto ponuku?"
        message={rowDelete ? `Ponuka ${rowDelete.quote_number} bude skrytá z rozhrania.` : ""}
        warning={
          rowDelete && (rowDelete.status === "sent" || rowDelete.status === "accepted")
            ? "Ponuka už bola odoslaná alebo akceptovaná."
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} ponúk?`}
        message="Vybraté ponuky budú skryté z rozhrania."
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={`Natrvalo vymazať ${list.selectedIds.length} ponúk?`}
        message="Ponuky sa odstránia aj s položkami. Toto sa už nedá vrátiť."
        confirmLabel="Vymazať natrvalo"
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}
