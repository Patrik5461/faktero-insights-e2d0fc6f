import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/nastavenia")({
  head: () => ({ meta: [{ title: "Sklady — Faktero" }] }),
  component: WarehousesPage,
});

type WH = { id?: string; name: string; address?: string | null; active: boolean };
const EMPTY: WH = { name: "", address: "", active: true };

function WarehousesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<WH | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase.from("warehouses").select("*").eq("company_id", cid).order("created_at");
    setRows(data ?? []);
    setLoading(false);
    if ((data ?? []).length === 0) {
      // Auto-create default warehouse
      await supabase.from("warehouses").insert({ company_id: cid, name: "Hlavný sklad", active: true });
      const { data: d2 } = await supabase.from("warehouses").select("*").eq("company_id", cid).order("created_at");
      setRows(d2 ?? []);
    }
  }
  useEffect(() => { load(); }, []);

  async function save(w: WH) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload = { ...w, company_id: cid };
    const op = w.id ? supabase.from("warehouses").update(payload).eq("id", w.id) : supabase.from("warehouses").insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success("Uložené"); setEditing(null); load();
  }

  return (
    <>
      <PageHeader title="Sklady" description="Spravujte sklady vašej firmy." action={
        <button onClick={() => setEditing(EMPTY)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nový sklad
        </button>
      } />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Názov</th><th className="p-3">Adresa</th><th className="p-3">Stav</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Načítavam…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Žiadne sklady.</td></tr>}
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3 text-muted-foreground">{w.address ?? "—"}</td>
                  <td className="p-3">{w.active ? <span className="text-emerald-600">Aktívny</span> : <span className="text-muted-foreground">Neaktívny</span>}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(w)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEditing(null)}>
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
    </>
  );
}