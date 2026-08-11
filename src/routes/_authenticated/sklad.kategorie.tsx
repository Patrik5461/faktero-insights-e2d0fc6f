import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/faktero/plan-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listCategoriesWithCounts,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,
} from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/kategorie")({
  head: () => ({ meta: [{ title: "Kategórie skladu — Faktero" }] }),
  component: CategoriesPage,
});

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

function CategoriesPage() {
  const listFn = useServerFn(listCategoriesWithCounts);
  const createFn = useServerFn(createStockCategory);
  const updateFn = useServerFn(updateStockCategory);
  const deleteFn = useServerFn(deleteStockCategory);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await listFn({ data: { company_id: cid } }));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditing(null);
    setName("");
    setColor("");
    setNote("");
  }

  async function onSave() {
    const cid = getActiveCompanyId();
    if (!cid || !name.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await updateFn({
          data: {
            company_id: cid,
            category_id: editing.id,
            name: name.trim(),
            color: color || null,
            note: note || null,
          },
        });
        toast.success("Kategória upravená");
      } else {
        await createFn({
          data: { company_id: cid, name: name.trim(), color: color || null, note: note || null },
        });
        toast.success("Kategória vytvorená");
      }
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, count: number) {
    if (
      count > 0 &&
      !confirm(`Kategória má ${count} produktov. Naozaj zmazať? Produkty zostanú bez kategórie.`)
    )
      return;
    if (count === 0 && !confirm("Zmazať kategóriu?")) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await deleteFn({ data: { company_id: cid, category_id: id } });
      toast.success("Kategória zmazaná");
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  }

  function startEdit(r: any) {
    setEditing(r);
    setName(r.name);
    setColor(r.color ?? "");
    setNote(r.note ?? "");
  }

  return (
    <>
      <PageHeader
        title="Kategórie skladu"
        description="Rozdeľte produkty do kategórií pre lepší prehľad a filtrovanie."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Kategória</th>
                  <th className="p-3">Poznámka</th>
                  <th className="p-3 text-right">Produkty</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      Načítavam…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      <Tags className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      Žiadne kategórie. Vytvorte prvú vpravo.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-border"
                          style={{ background: r.color ?? "transparent" }}
                        />
                        <span className="font-medium">{r.name}</span>
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{r.product_count}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted"
                          title="Upraviť"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(r.id, r.product_count)}
                          className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                          title="Zmazať"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">
              {editing ? "Upraviť kategóriu" : "Nová kategória"}
            </div>
            <label className="block text-xs font-medium text-muted-foreground">Názov</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="napr. Elektro"
            />
            <label className="mt-3 block text-xs font-medium text-muted-foreground">Farba</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button
                onClick={() => setColor("")}
                className={`h-7 w-7 rounded-full border ${color === "" ? "ring-2 ring-primary" : "border-border"}`}
                title="Bez farby"
              />
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border border-border ${color === c ? "ring-2 ring-primary" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">Poznámka</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy || !name.trim()}
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {editing ? "Uložiť" : "Vytvoriť"}
              </button>
              {editing && (
                <button
                  onClick={resetForm}
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  Zrušiť
                </button>
              )}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
