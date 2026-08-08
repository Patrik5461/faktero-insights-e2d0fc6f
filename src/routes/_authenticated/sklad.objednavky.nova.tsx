import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listSuppliers, listWarehousesForCompany, getLowStockReport } from "@/lib/faktero/stock.functions";
import {
  createPurchaseOrder,
  listStockItemsForOrder,
} from "@/lib/faktero/purchase-orders.functions";
import { suctyObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { vatRateOptions } from "@/lib/faktero/vat-rates";
import { ArrowLeft, Plus, Sparkles, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/nova")({
  head: () => ({ meta: [{ title: "Nová objednávka — Faktero" }] }),
  component: NewPurchaseOrder,
});

type Riadok = {
  stock_item_id: string | null;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

const PRAZDNY: Riadok = {
  stock_item_id: null,
  name: "",
  unit: "ks",
  quantity: 1,
  unit_price: 0,
  vat_rate: 23,
};

function suma(n: number) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n || 0);
}

function NewPurchaseOrder() {
  const nav = useNavigate();
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchWarehouses = useServerFn(listWarehousesForCompany);
  const fetchLow = useServerFn(getLowStockReport);
  const doCreate = useServerFn(createPurchaseOrder);
  const fetchZasoby = useServerFn(listStockItemsForOrder);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naplnam, setNaplnam] = useState(false);
  const [zasoby, setZasoby] = useState<any[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Riadok[]>([{ ...PRAZDNY }]);

  const cid = useMemo(() => getActiveCompanyId(), []);

  useEffect(() => {
    if (!cid) return;
    fetchSuppliers({ data: { company_id: cid } }).then((s: any) => setSuppliers(s ?? []));
    fetchWarehouses({ data: { company_id: cid } }).then((w: any) => {
      setWarehouses(w ?? []);
      if (w?.length === 1) setWarehouseId(w[0].id);
    });
    fetchZasoby({ data: { company_id: cid } }).then((z: any) => setZasoby(z ?? []));
  }, [cid, fetchSuppliers, fetchWarehouses, fetchZasoby]);

  /**
   * Popis v zozname je zároveň kľúč. Bez väzby na skladovú kartu sa objednávka
   * nedá naskladniť, takže keď sa napísaný text trafí do zoznamu, doplní sa
   * väzba aj merná jednotka a nákupná cena.
   */
  const zasobaPodlaPopisu = useMemo(() => {
    const m = new Map<string, any>();
    zasoby.forEach((z) => m.set(z.sku ? `${z.sku} — ${z.name}` : z.name, z));
    return m;
  }, [zasoby]);

  const sucty = useMemo(
    () => suctyObjednavky(items.map((it) => ({ ...it, received_quantity: 0 }))),
    [items],
  );

  /** Prenesie návrh z prehľadu „Pod minimom" — presne tie množstvá, ktoré chýbajú. */
  async function naplnPodlaMinima() {
    if (!cid) return;
    setNaplnam(true);
    setError(null);
    try {
      const d: any = await fetchLow({ data: { company_id: cid } });
      const rows = (d?.rows ?? []).filter((r: any) => r.order_qty > 0);
      if (rows.length === 0) {
        setError("Žiadna položka nie je pod minimom — nie je čo objednať.");
        return;
      }
      // Cenu berieme z karty, nech netreba prepisovať každý riadok ručne.
      const podlaId = new Map(zasoby.map((z) => [z.id, z] as const));
      setItems(
        rows.map((r: any) => {
          const z = podlaId.get(r.stock_item_id);
          return {
            stock_item_id: r.stock_item_id,
            name: r.name,
            unit: r.unit ?? z?.unit ?? "ks",
            quantity: r.order_qty,
            unit_price: z?.purchase_price ?? 0,
            vat_rate: z?.vat_rate ?? 23,
          };
        }),
      );
    } catch (e: any) {
      setError(e?.message ?? "Návrh sa nepodarilo načítať");
    } finally {
      setNaplnam(false);
    }
  }

  function uprav(i: number, patch: Partial<Riadok>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    const platne = items.filter((it) => it.name.trim() && it.quantity > 0);
    if (platne.length === 0) {
      setError("Objednávka musí mať aspoň jednu položku s názvom a množstvom.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res: any = await doCreate({
        data: {
          company_id: cid,
          supplier_id: supplierId || null,
          warehouse_id: warehouseId || null,
          expected_date: expectedDate || null,
          note: note || null,
          items: platne,
        },
      });
      nav({ to: "/sklad/objednavky/$id", params: { id: res.id } });
    } catch (err: any) {
      setError(err?.message ?? "Uloženie zlyhalo");
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nová objednávka u dodávateľa"
        description="Objednávka sa uloží ako rozpracovaná. Do návrhu doobjednania sa započíta až po odoslaní."
        action={
          <Link
            to="/sklad/objednavky"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={uloz} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Dodávateľ</span>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="input w-full"
              >
                <option value="">— nevybraný —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Prijať do skladu</span>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="input w-full"
              >
                <option value="">— nevybraný —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Očakávané dodanie</span>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="input w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Poznámka</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input w-full"
                placeholder="napr. dodať na stavbu"
              />
            </label>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Položky</div>
              <button
                type="button"
                onClick={naplnPodlaMinima}
                disabled={naplnam}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {naplnam ? "Načítavam…" : "Doplniť podľa minima"}
              </button>
            </div>

            <datalist id="faktero-zasoby">
              {zasoby.map((z) => (
                <option key={z.id} value={z.sku ? `${z.sku} — ${z.name}` : z.name} />
              ))}
            </datalist>

            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_90px_100px_90px_36px]">
                  <input
                    value={it.name}
                    list="faktero-zasoby"
                    onChange={(e) => {
                      const hodnota = e.target.value;
                      const z = zasobaPodlaPopisu.get(hodnota);
                      uprav(
                        i,
                        z
                          ? {
                              name: hodnota,
                              stock_item_id: z.id,
                              unit: z.unit,
                              unit_price: z.purchase_price,
                              vat_rate: z.vat_rate,
                            }
                          : { name: hodnota, stock_item_id: null },
                      );
                    }}
                    className="input"
                    placeholder="Začnite písať názov zásoby…"
                  />
                  <input
                    value={it.unit}
                    onChange={(e) => uprav(i, { unit: e.target.value })}
                    className="input"
                    placeholder="ks"
                  />
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={it.quantity}
                    onChange={(e) => uprav(i, { quantity: Number(e.target.value) })}
                    className="input text-right"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.unit_price}
                    onChange={(e) => uprav(i, { unit_price: Number(e.target.value) })}
                    className="input text-right"
                  />
                  <select
                    value={it.vat_rate}
                    onChange={(e) => uprav(i, { vat_rate: Number(e.target.value) })}
                    className="input"
                  >
                    {vatRateOptions(it.vat_rate).map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                    className="grid place-items-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                    aria-label="Odstrániť položku"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setItems((arr) => [...arr, { ...PRAZDNY }])}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              <Plus className="h-3 w-3" /> Pridať riadok
            </button>

            <div className="mt-4 flex justify-end gap-6 border-t border-border pt-3 text-sm">
              <div className="text-muted-foreground">
                Základ <span className="ml-2 tabular-nums">{suma(sucty.subtotal)}</span>
              </div>
              <div className="text-muted-foreground">
                DPH <span className="ml-2 tabular-nums">{suma(sucty.vat_total)}</span>
              </div>
              <div className="font-semibold">
                Spolu <span className="ml-2 tabular-nums">{suma(sucty.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Ukladám…" : "Uložiť objednávku"}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
