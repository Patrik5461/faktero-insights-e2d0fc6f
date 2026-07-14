import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listCategoriesWithCounts,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,
} from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags, Warehouse as WarehouseIcon, X } from "lucide-react";

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export function StockSettingsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<"kategorie" | "sklady">("kategorie");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-0 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-base font-semibold">Nastavenia skladu</div>
          <button onClick={() => onOpenChange(false)} className="rounded p-1.5 hover:bg-muted" aria-label="Zavrieť"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 border-b border-border px-5 pt-3">
          <TabBtn active={tab === "kategorie"} onClick={() => setTab("kategorie")} icon={<Tags className="h-3.5 w-3.5" />}>Kategórie</TabBtn>
          <TabBtn active={tab === "sklady"} onClick={() => setTab("sklady")} icon={<WarehouseIcon className="h-3.5 w-3.5" />}>Sklady</TabBtn>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {tab === "kategorie" ? <CategoriesTab onChanged={onChanged} /> : <WarehousesTab onChanged={onChanged} />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {icon}{children}
    </button>
  );
}

function CategoriesTab({ onChanged }: { onChanged?: () => void }) {
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
    if (!cid) { setLoading(false); return; }
    setLoading(true);
    try { setRows(await listFn({ data: { company_id: cid } })); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function reset() { setEditing(null); setName(""); setColor(""); setNote(""); }

  async function save() {
    const cid = getActiveCompanyId();
    if (!cid || !name.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await updateFn({ data: { company_id: cid, category_id: editing.id, name: name.trim(), color: color || null, note: note || null } });
        toast.success("Kategória upravená");
      } else {
        await createFn({ data: { company_id: cid, name: name.trim(), color: color || null, note: note || null } });
        toast.success("Kategória vytvorená");
      }
      reset(); await load(); onChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(false); }
  }

  async function remove(id: string, count: number) {
    if (count > 0 && !confirm(`Kategória má ${count} produktov. Naozaj zmazať? Produkty zostanú bez kategórie.`)) return;
    if (count === 0 && !confirm("Zmazať kategóriu?")) return;
    const cid = getActiveCompanyId(); if (!cid) return;
    try {
      await deleteFn({ data: { company_id: cid, category_id: id } });
      toast.success("Kategória zmazaná"); await load(); onChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-2">Kategória</th><th className="p-2 text-right">Produkty</th><th className="p-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Načítavam…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Žiadne kategórie.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-border" style={{ background: r.color ?? "transparent" }} />
                    <span className="font-medium">{r.name}</span>
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">{r.product_count}</td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => { setEditing(r); setName(r.name); setColor(r.color ?? ""); setNote(r.note ?? ""); }} className="rounded border border-border p-1 hover:bg-muted" title="Upraviť"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(r.id, r.product_count)} className="rounded border border-border p-1 text-destructive hover:bg-destructive/10" title="Zmazať"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-semibold">{editing ? "Upraviť" : "Nová kategória"}</div>
        <label className="block text-xs font-medium text-muted-foreground">Názov</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="napr. Elektro" />
        <label className="mt-3 block text-xs font-medium text-muted-foreground">Farba</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button onClick={() => setColor("")} className={`h-6 w-6 rounded-full border ${color === "" ? "ring-2 ring-primary" : "border-border"}`} title="Bez farby" />
          {PALETTE.map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border border-border ${color === c ? "ring-2 ring-primary" : ""}`} style={{ background: c }} />
          ))}
        </div>
        <label className="mt-3 block text-xs font-medium text-muted-foreground">Poznámka</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <div className="mt-3 flex gap-2">
          <button disabled={busy || !name.trim()} onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            <Plus className="h-3.5 w-3.5" />{editing ? "Uložiť" : "Vytvoriť"}
          </button>
          {editing && <button onClick={reset} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Zrušiť</button>}
        </div>
      </div>
    </div>
  );
}

type WH = { id?: string; name: string; address?: string | null; active: boolean };
const EMPTY_WH: WH = { name: "", address: "", active: true };

function WarehousesTab({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<WH | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const cid = getActiveCompanyId(); if (!cid) return;
    setLoading(true);
    const { data } = await supabase.from("warehouses").select("*").eq("company_id", cid).order("created_at");
    setRows(data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save(w: WH) {
    const cid = getActiveCompanyId(); if (!cid) return;
    const payload = { ...w, company_id: cid };
    const op = w.id ? supabase.from("warehouses").update(payload).eq("id", w.id) : supabase.from("warehouses").insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Uložené"); setEditing(null); load(); onChanged?.();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setEditing(EMPTY_WH)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Nový sklad
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-2">Názov</th><th className="p-2">Adresa</th><th className="p-2">Stav</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Načítavam…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Žiadne sklady.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id}>
                <td className="p-2 font-medium">{w.name}</td>
                <td className="p-2 text-muted-foreground">{w.address ?? "—"}</td>
                <td className="p-2">{w.active ? <span className="text-emerald-600">Aktívny</span> : <span className="text-muted-foreground">Neaktívny</span>}</td>
                <td className="p-2 text-right">
                  <button onClick={() => setEditing(w)} className="rounded p-1 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{editing.id ? "Upraviť sklad" : "Nový sklad"}</h2>
            <form onSubmit={(e) => { e.preventDefault(); save(editing); }} className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-sm font-medium">Názov *</span>
                <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Adresa</span>
                <input value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                Aktívny
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">Zrušiť</button>
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Uložiť</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
