import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import { Plus, FileCode2, Loader2, Trash2, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { Pagination, PageSizeSelect, ConfirmDialog, BulkBar, DeletedToggle } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";

export const Route = createFileRoute("/_authenticated/faktury/")({
  head: () => ({ meta: [{ title: "Faktúry — Faktero" }] }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const list = usePagedList({
    resource: "invoices",
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
  });
  const [busy, setBusy] = useState(false);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const exportFn = useServerFn(exportInvoicesFn);

  const sensitiveSelected = list.rows
    .filter((r) => list.selected[r.id] && (r.status === "paid" || r.status === "sent")).length;

  async function bulkExport() {
    const cid = getActiveCompanyId();
    if (!cid || !list.selectedIds.length) return;
    setBusy(true);
    try {
      const r = await exportFn({ data: { companyId: cid, invoiceIds: list.selectedIds, format: "pohoda_xml" } });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success(`Exportovaných ${r.invoiceCount} faktúr`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally { setBusy(false); }
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try { await list.softDelete([rowDelete.id]); toast.success("Faktúra vymazaná"); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setRowDelete(null); }
  }
  async function confirmBulkDelete() {
    try { await list.softDelete(list.selectedIds); toast.success(`Vymazaných ${list.selectedIds.length} faktúr`); list.clearSelection(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBulkDelete(false); }
  }
  async function bulkRestoreNow() {
    try { await list.restore(list.selectedIds); toast.success("Obnovené"); list.clearSelection(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }

  const rowWarning = rowDelete && (rowDelete.status === "paid" || rowDelete.status === "sent");
  return (
    <>
      <PageHeader title="Faktúry" description="Všetky vystavené faktúry, koncepty aj stornované." action={
        <div className="flex flex-wrap gap-2">
          {list.selectedIds.length > 0 && !list.showDeleted && (
            <button onClick={bulkExport} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
              Export {list.selectedIds.length} do Pohody XML
            </button>
          )}
          <Link to="/exporty" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
            <FileCode2 className="h-4 w-4" /> Účtovné exporty
          </Link>
          <Link to="/faktury/nova" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Nová faktúra
          </Link>
        </div>
      } />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search} onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať číslo, odberateľa, IČO…"
            className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-4">
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <BulkBar
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={bulkRestoreNow}
          onClear={list.clearSelection}
        />
        <ResponsiveTable
          className="mt-3"
          items={list.rows}
          loading={list.loading}
          emptyText={list.showDeleted ? "Žiadne vymazané faktúry." : "Žiadne faktúry."}
          mobileCard={(i: any) => (
            <MobileListCard
              onClick={() => (window.location.href = `/faktury/${i.id}`)}
              title={i.invoice_number}
              subtitle={i.customer_name ?? "—"}
              status={<StatusBadge status={i.status} />}
              meta={`${i.issue_date} · splat. ${i.due_date}`}
              amount={`${Number(i.total).toFixed(2)} ${i.currency}`}
              actions={
                list.showDeleted ? (
                  <button
                    onClick={async () => { try { await list.restore([i.id]); toast.success("Obnovené"); } catch (e: any) { toast.error(e?.message ?? "Chyba"); } }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                  ><RotateCcw className="h-3.5 w-3.5" /> Obnoviť</button>
                ) : (
                  <button
                    onClick={() => setRowDelete(i)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  ><Trash2 className="h-3.5 w-3.5" /> Vymazať</button>
                )
              }
            />
          )}
          desktop={
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <input type="checkbox" checked={list.allOnPageSelected}
                    onChange={(e) => list.toggleAllOnPage(e.target.checked)} />
                </th>
                <th className="p-3">Číslo</th><th className="p-3">Odberateľ</th><th className="p-3">Vystavená</th><th className="p-3">Splatnosť</th><th className="p-3 text-right">Suma</th><th className="p-3">Stav</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.loading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Načítavam…</td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{list.showDeleted ? "Žiadne vymazané faktúry." : "Žiadne faktúry."}</td></tr>}
              {list.rows.map((i) => (
                <tr key={i.id} className="hover:bg-muted/30">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!list.selected[i.id]} onChange={(e) => list.toggleSelect(i.id, e.target.checked)} />
                  </td>
                  <td className="p-3 font-medium cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}>{i.invoice_number}</td>
                  <td className="p-3 cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}>{i.customer_name ?? "—"}</td>
                  <td className="p-3 cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}>{i.issue_date}</td>
                  <td className="p-3 cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}>{i.due_date}</td>
                  <td className="p-3 text-right cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}>{Number(i.total).toFixed(2)} {i.currency}</td>
                  <td className="p-3 cursor-pointer" onClick={() => (window.location.href = `/faktury/${i.id}`)}><StatusBadge status={i.status} /></td>
                  <td className="p-3 text-right">
                    {list.showDeleted ? (
                      <button title="Obnoviť" onClick={async () => { try { await list.restore([i.id]); toast.success("Obnovené"); } catch (e: any) { toast.error(e?.message ?? "Chyba"); } }}
                        className="rounded p-1.5 text-primary hover:bg-primary/10"><RotateCcw className="h-4 w-4" /></button>
                    ) : (
                      <button title="Vymazať" onClick={() => setRowDelete(i)}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          }
        />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} />
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto faktúru?"
        message={rowDelete ? `Faktúra ${rowDelete.invoice_number} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.` : ""}
        warning={rowWarning ? "Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu." : undefined}
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} faktúr?`}
        message="Vybraté faktúry budú skryté z rozhrania. Môžete ich neskôr obnoviť."
        warning={sensitiveSelected > 0 ? `${sensitiveSelected} z vybratých je odoslaných alebo zaplatených. Mazanie môže narušiť účtovnú stopu.` : undefined}
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulkDelete}
      />
    </>
  );
}