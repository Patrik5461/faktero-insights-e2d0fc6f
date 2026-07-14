import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { startInventory, completeInventory, lookupStockItemByCode } from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/inventura")({
  head: () => ({ meta: [{ title: "Inventúra — Faktero" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const start = useServerFn(startInventory);
  const complete = useServerFn(completeInventory);
  const lookup = useServerFn(lookupStockItemByCode);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [countId, setCountId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [skuMap, setSkuMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase.from("warehouses").select("id, name").eq("company_id", cid).eq("active", true).then(({ data }) => {
      setWarehouses(data ?? []); if (data?.[0]) setWarehouse(data[0].id);
    });
  }, []);

  async function loadItems(id: string) {
    const { data } = await supabase.from("inventory_count_items").select("*").eq("inventory_count_id", id);
    setItems(data ?? []);
    const ids = (data ?? []).map((d: any) => d.stock_item_id);
    if (ids.length) {
      const { data: si } = await supabase.from("stock_items").select("id, sku").in("id", ids);
      const m: Record<string, string> = {};
      (si ?? []).forEach((x: any) => { m[x.id] = x.sku ?? x.id.slice(0, 8); });
      setSkuMap(m);
    }
  }

  async function onStart() {
    const cid = getActiveCompanyId();
    if (!cid || !warehouse) return;
    setBusy(true);
    try {
      const r = await start({ data: { company_id: cid, warehouse_id: warehouse } });
      setCountId(r.id);
      await loadItems(r.id);
      if (r.resumed) toast.message("Pokračujete v otvorenej inventúre.");
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(false); }
  }

  async function setCounted(itemId: string, value: string) {
    const v = value === "" ? null : Number(value);
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, counted_quantity: v } : it));
    await supabase.from("inventory_count_items").update({ counted_quantity: v }).eq("id", itemId);
  }

  async function onComplete() {
    if (!countId) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
    try {
      const r = await complete({ data: { company_id: cid, inventory_count_id: countId } });
      toast.success(`Inventúra ukončená. ${r.adjustments} úprav.`);
      setCountId(null); setItems([]);
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(false); }
  }

  async function onScan(code: string) {
    if (!code.trim() || !countId) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const found = await lookup({ data: { company_id: cid, code: code.trim() } });
      if (!found) { toast.error(`Nenájdené: ${code}`); return; }
      const row = items.find((it) => it.stock_item_id === (found as any).id);
      if (!row) { toast.error("Položka nie je v inventúre"); return; }
      const next = Number(row.counted_quantity ?? 0) + 1;
      await setCounted(row.id, String(next));
      toast.success(`+1 → ${(found as any).sku ?? "položka"} (${next})`);
      setScan("");
      scanRef.current?.focus();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }

  return (
    <>
      <PageHeader title="Inventúra" description="Spočítajte fyzický stav skladu a vytvorte úpravy." />
      <PageBody>
        {!countId ? (
          <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6">
            <label className="block">
              <span className="text-sm font-medium">Sklad</span>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <button disabled={busy || !warehouse} onClick={onStart} className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? "Spúšťam…" : "Začať inventúru"}
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-3">Položka</th><th className="p-3 text-right">Očakávané</th><th className="p-3 text-right">Spočítané</th><th className="p-3 text-right">Rozdiel</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => {
                    const diff = it.counted_quantity != null ? Number(it.counted_quantity) - Number(it.expected_quantity) : null;
                    return (
                      <tr key={it.id}>
                        <td className="p-3 font-medium">{skuMap[it.stock_item_id] ?? "—"}</td>
                        <td className="p-3 text-right">{Number(it.expected_quantity).toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <input type="number" step="0.001" defaultValue={it.counted_quantity ?? ""}
                            onBlur={(e) => setCounted(it.id, e.target.value)}
                            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm" />
                        </td>
                        <td className={`p-3 text-right ${diff != null && diff !== 0 ? (diff > 0 ? "text-emerald-600" : "text-destructive") : "text-muted-foreground"}`}>
                          {diff == null ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={busy} onClick={onComplete} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {busy ? "Ukončujem…" : "Ukončiť a vytvoriť úpravy"}
              </button>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}