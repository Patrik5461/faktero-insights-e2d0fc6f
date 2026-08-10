import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { runRecurringNow, toggleRecurring } from "@/lib/faktero/recurring.functions";
import { Plus, Play, Power, PowerOff, Repeat, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/opakovane/")({
  head: () => ({ meta: [{ title: "Opakované faktúry — Faktero" }] }),
  component: RecurringList,
});

const FREQ_LABEL: Record<string, string> = {
  weekly: "Týždenne",
  monthly: "Mesačne",
  quarterly: "Štvrťročne",
  yearly: "Ročne",
};

function RecurringList() {
  const list = usePagedList({
    resource: "recurring_invoices",
    searchColumns: ["name", "customer_name"],
  });
  const [busy, setBusy] = useState<string | null>(null);
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
  const navigate = useNavigate();
  const runFn = useServerFn(runRecurringNow);
  const toggleFn = useServerFn(toggleRecurring);

  async function runNow(id: string) {
    setBusy(id);
    try {
      const r: any = await runFn({ data: { id } });
      if (r?.skipped) toast.message(`Preskočené: ${r.reason}`);
      else {
        toast.success("Faktúra vytvorená");
        navigate({ to: "/faktury/$id", params: { id: r.invoice_id } });
      }
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }
  async function toggle(id: string, active: boolean) {
    try {
      await toggleFn({ data: { id, active } });
      toast.success(active ? "Aktivované" : "Pozastavené");
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }
  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Šablóna vymazaná");
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
        title="Opakované faktúry"
        description="Šablóny, ktoré automaticky generujú faktúry podľa intervalu."
        action={
          <Link
            to="/opakovane/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová šablóna
          </Link>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať názov, odberateľa…"
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
        {list.loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : list.rows.length === 0 && !list.search && !list.showDeleted ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Repeat className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Zatiaľ žiadne opakované faktúry</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Vytvorte šablónu a Faktero bude automaticky vystavovať faktúry pravidelne.
            </p>
            <Link
              to="/opakovane/nova"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Vytvoriť šablónu
            </Link>
          </div>
        ) : (
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
                  <th className="p-3">Názov</th>
                  <th className="p-3">Odberateľ</th>
                  <th className="p-3">Frekvencia</th>
                  <th className="p-3">Ďalší beh</th>
                  <th className="p-3 text-right">Suma</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Žiadne výsledky.
                    </td>
                  </tr>
                )}
                {list.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!list.selected[r.id]}
                        onChange={(e) => list.toggleSelect(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="p-3">
                      <Link
                        to="/opakovane/$id"
                        params={{ id: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-3">{r.customer_name ?? "—"}</td>
                    <td className="p-3">{FREQ_LABEL[r.frequency] ?? r.frequency}</td>
                    <td className="p-3">{r.next_run}</td>
                    <td className="p-3 text-right">
                      {Number(r.total).toFixed(2)} {r.currency}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {r.active ? "Aktívna" : "Pozastavená"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        {!list.showDeleted && (
                          <>
                            <button
                              onClick={() => runNow(r.id)}
                              disabled={busy === r.id || !r.active}
                              title="Spustiť teraz"
                              className="rounded p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggle(r.id, !r.active)}
                              title={r.active ? "Pozastaviť" : "Aktivovať"}
                              className="rounded p-1.5 hover:bg-muted"
                            >
                              {r.active ? (
                                <PowerOff className="h-4 w-4" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                        {list.showDeleted ? (
                          <button
                            title="Obnoviť"
                            onClick={async () => {
                              try {
                                await list.restore([r.id]);
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
                            onClick={() => setRowDelete(r)}
                            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
        )}
      </PageBody>
      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto šablónu?"
        message={
          rowDelete ? `${rowDelete.name} bude skrytá z rozhrania a prestane generovať faktúry.` : ""
        }
        warning={
          rowDelete?.active
            ? "Šablóna je aktívna. Mazaním sa zastaví automatické vystavovanie."
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} šablón?`}
        message="Vybraté šablóny budú skryté a prestanú generovať faktúry."
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={`Natrvalo vymazať ${list.selectedIds.length} šablón?`}
        message="Šablóny sa odstránia natrvalo. Faktúry, ktoré z nich vznikli, ostanú."
        confirmLabel="Vymazať natrvalo"
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}
