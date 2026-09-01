import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/nastavenia")({
  head: () => ({ meta: [{ title: "Sklady — Faktero" }] }),
  component: WarehousesPage,
});

type WH = { id?: string; name: string; address?: string | null; active: boolean };
const EMPTY: WH = { name: "", address: "", active: true };

function WarehousesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<WH | null>(null);
  useZatvorNaEscape(editing ? () => setEditing(null) : null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase
      .from("warehouses")
      .select("*")
      .eq("company_id", cid)
      .order("created_at");
    setRows(data ?? []);
    setLoading(false);
    if ((data ?? []).length === 0) {
      // Auto-create default warehouse
      await supabase
        .from("warehouses")
        .insert({ company_id: cid, name: "Hlavný sklad", active: true });
      const { data: d2 } = await supabase
        .from("warehouses")
        .select("*")
        .eq("company_id", cid)
        .order("created_at");
      setRows(d2 ?? []);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(w: WH) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload = { ...w, company_id: cid };
    const op = w.id
      ? supabase.from("warehouses").update(payload).eq("id", w.id)
      : supabase.from("warehouses").insert(payload);
    const { error } = await op;
    if (error) {
      // Jediné, čo tu človek reálne trafí, je rovnaký názov skladu.
      return toast.error(
        error.code === "23505"
          ? "Sklad s týmto názvom už existuje."
          : (error.message ?? "Sklad sa nepodarilo uložiť."),
      );
    }
    toast.success("Uložené");
    setEditing(null);
    load();
  }

  /**
   * Sklad založený omylom sa nedal odstrániť vôbec. Mazať sa dá, kým v ňom nie
   * je pohyb, inventúra, presun ani zásoba — na to má databáza RESTRICT, tu ide
   * len o zrozumiteľný dôvod. Posledný sklad ostáva: bez neho si ho stránka pri
   * najbližšom otvorení aj tak vyrobí znova.
   */
  async function zmaz(w: any) {
    if (rows.length <= 1) {
      return toast.error("Aspoň jeden sklad musí ostať.");
    }
    const [{ count: pohyby }, { count: inventury }, { count: presuny }, { data: zasoby }] =
      await Promise.all([
        supabase
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", w.id),
        supabase
          .from("inventory_counts")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", w.id),
        supabase
          .from("stock_transfers")
          .select("id", { count: "exact", head: true })
          .or(`warehouse_from_id.eq.${w.id},warehouse_to_id.eq.${w.id}`),
        supabase.from("stock_levels").select("quantity").eq("warehouse_id", w.id).gt("quantity", 0),
      ]);
    const drzi = [
      pohyby && `pohyby (${pohyby})`,
      inventury && `inventúry (${inventury})`,
      presuny && `presuny (${presuny})`,
      zasoby?.length && `zásoba na ${zasoby.length} kartách`,
    ].filter(Boolean);
    if (drzi.length) {
      return toast.error(
        `Sklad sa nedá zmazať, sú v ňom ${drzi.join(", ")}. Namiesto toho ho nastavte ako neaktívny.`,
      );
    }
    if (!confirm(`Naozaj zmazať sklad ${w.name}?`)) return;
    const { error } = await supabase.from("warehouses").delete().eq("id", w.id);
    if (error) return toast.error(error.message);
    toast.success("Sklad zmazaný");
    load();
  }

  return (
    <>
      <PageHeader
        title="Sklady"
        description="Spravujte sklady vašej firmy."
        action={
          <button
            onClick={() => setEditing(EMPTY)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nový sklad
          </button>
        }
      />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Názov</th>
                <th className="p-3">Adresa</th>
                <th className="p-3">Stav</th>
                <th></th>
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
                    Žiadne sklady.
                  </td>
                </tr>
              )}
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3 text-muted-foreground">{w.address ?? "—"}</td>
                  <td className="p-3">
                    {w.active ? (
                      <span className="text-emerald-600">Aktívny</span>
                    ) : (
                      <span className="text-muted-foreground">Neaktívny</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(w)} className="rounded p-1.5 hover:bg-muted">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => zmaz(w)}
                      title="Zmazať sklad"
                      aria-label="Zmazať sklad"
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            aria-label="Sklad"
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{editing.id ? "Upraviť sklad" : "Nový sklad"}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(editing);
              }}
              className="mt-4 grid gap-3"
            >
              <label className="block">
                <span className="text-sm font-medium">Názov *</span>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Adresa</span>
                <input
                  value={editing.address ?? ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Aktívny
              </label>
              <div className="flex justify-end gap-2 pt-2">
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
    </>
  );
}
