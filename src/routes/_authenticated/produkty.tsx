import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { setProductStockTracking } from "@/lib/faktero/stock.functions";

import { zakladnaSadzba } from "@/lib/faktero/vat-rates";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
export const Route = createFileRoute("/_authenticated/produkty")({
  head: () => ({ meta: [{ title: "Produkty a služby — Faktero" }] }),
  /** `?new=1` z menu („Nový produkt“) rovno otvorí formulár. */
  validateSearch: (s: Record<string, unknown>): { new?: "1" } => ({
    new: s.new === "1" || s.new === 1 ? "1" : undefined,
  }),
  component: ProductsPage,
});

type Product = {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  unit: string;
  unit_price: number;
  vat_rate: number;
  active: boolean;
  track_stock?: boolean; // virtual — mirrors stock_items.track_stock
};
const EMPTY: Product = {
  name: "",
  unit: "ks",
  unit_price: 0,
  vat_rate: 23,
  active: true,
  track_stock: false,
};

function ProductsPage() {
  const list = usePagedList({ resource: "products", searchColumns: ["name", "code"] });
  /* Sadzby DPH podľa krajiny registrácie firmy. */
  const krajina = useKrajinaDane();
  const [editing, setEditing] = useState<Product | null>(null);
  useZatvorNaEscape(editing ? () => setEditing(null) : null);
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
  const trackFn = useServerFn(setProductStockTracking);

  // Príchod z menu cez `?new=1`. Parameter hneď odstránime, aby sa formulár
  // po zavretí neotvoril znova pri obnovení stránky alebo návrate späť.
  const { new: openNew } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!openNew) return;
    setEditing({ ...EMPTY, vat_rate: zakladnaSadzba(krajina) });
    navigate({ to: "/produkty", search: {} as any, replace: true });
  }, [openNew, navigate]);

  // When opening editor for an existing product, load its current stock-tracking flag.
  useEffect(() => {
    if (!editing?.id) return;
    (async () => {
      const { data } = await supabase
        .from("stock_items")
        .select("track_stock")
        .eq("product_id", editing.id!)
        .maybeSingle();
      setEditing((e) =>
        e && e.id === editing.id ? { ...e, track_stock: !!data?.track_stock } : e,
      );
    })();
  }, [editing?.id]);

  async function save(p: Product) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { track_stock, ...rest } = p;
    const payload = {
      ...rest,
      company_id: cid,
      unit_price: Number(p.unit_price),
      vat_rate: Number(p.vat_rate),
    };
    const op = p.id
      ? supabase.from("products").update(payload).eq("id", p.id)
      : supabase.from("products").insert(payload);
    const { data: saved, error } = await op.select().single();
    if (error) return toast.error(error.message);
    try {
      await trackFn({
        data: { company_id: cid, product_id: saved!.id, track_stock: !!track_stock },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri synchronizácii skladu.");
    }
    toast.success("Uložené");
    setEditing(null);
    list.reload();
  }

  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Položka vymazaná");
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
        title="Produkty a služby"
        description="Cenník, ktorý môžete vkladať do faktúr."
        action={
          <button
            onClick={() => setEditing({ ...EMPTY, vat_rate: zakladnaSadzba(krajina) })}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová položka
          </button>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať názov, kód…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
          />
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
                <th className="p-3">Názov</th>
                <th className="p-3">Kód</th>
                <th className="p-3">MJ</th>
                <th className="p-3 text-right">Cena</th>
                <th className="p-3 text-right">DPH</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.loading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {!list.loading && list.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {list.showDeleted ? "Žiadne vymazané položky." : "Žiadne položky."}
                  </td>
                </tr>
              )}
              {list.rows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!list.selected[p.id]}
                      onChange={(e) => list.toggleSelect(p.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.code ?? "—"}</td>
                  <td className="p-3">{p.unit}</td>
                  <td className="p-3 text-right">{Number(p.unit_price).toFixed(2)} €</td>
                  <td className="p-3 text-right">{p.vat_rate} %</td>
                  <td className="p-3 text-right">
                    {!list.showDeleted && (
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded p-1.5 hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {list.showDeleted ? (
                      <button
                        aria-label="Obnoviť"
                        title="Obnoviť"
                        onClick={async () => {
                          try {
                            await list.restore([p.id]);
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
                        onClick={() => setRowDelete(p)}
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

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Produkt"
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editing.id ? "Upraviť položku" : "Nová položka"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(editing);
              }}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <In
                full
                label="Názov *"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
                required
              />
              <In
                label="Kód"
                value={editing.code ?? ""}
                onChange={(v) => setEditing({ ...editing, code: v })}
              />
              <In
                label="MJ"
                value={editing.unit}
                onChange={(v) => setEditing({ ...editing, unit: v })}
              />
              <In
                label="Jedn. cena"
                type="number"
                value={String(editing.unit_price)}
                onChange={(v) => setEditing({ ...editing, unit_price: Number(v) })}
              />
              <In
                label="DPH %"
                type="number"
                value={String(editing.vat_rate)}
                onChange={(v) => setEditing({ ...editing, vat_rate: Number(v) })}
              />
              <label className="sm:col-span-2 block">
                <span className="text-sm font-medium">Popis</span>
                <textarea
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Aktívna
              </label>
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editing.track_stock}
                  onChange={(e) => setEditing({ ...editing, track_stock: e.target.checked })}
                />
                Sledovať sklad
                <span className="text-xs text-muted-foreground">
                  — automaticky vytvorí skladovú kartu a prepojí ju s faktúrami.
                </span>
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Uložiť
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto položku?"
        message={rowDelete ? `${rowDelete.name} bude skrytá z rozhrania.` : ""}
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} položiek?`}
        message="Vybraté položky budú skryté z rozhrania."
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={`Natrvalo vymazať ${list.selectedIds.length} položiek?`}
        message="Položky cenníka sa odstránia natrvalo. Na už vystavených faktúrach ostanú."
        confirmLabel="Vymazať natrvalo"
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
