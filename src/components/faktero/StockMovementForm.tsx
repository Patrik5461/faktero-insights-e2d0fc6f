import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createStockMovementDebug } from "@/lib/faktero/stock.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";

type MovementType = "prijem" | "vydaj" | "oprava";
const SHOW_STOCK_DEBUG =
  import.meta.env.DEV ||
  (typeof window !== "undefined" && window.location.hostname.includes("lovable"));

export function MovementForm({
  type,
  title,
  onDone,
}: {
  type: MovementType;
  title: string;
  onDone?: () => void;
}) {
  const createMovement = useServerFn(createStockMovementDebug);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [warehouse, setWarehouse] = useState("");
  const [stockItem, setStockItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("0");
  const [sideCosts, setSideCosts] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const [availability, setAvailability] = useState<{
    on_hand: number;
    reserved: number;
    available: number;
  } | null>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      setLoading(true);
      let { data: wh } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("company_id", cid)
        .eq("active", true)
        .order("name");
      if (!wh || wh.length === 0) {
        const { data: created, error } = await supabase
          .from("warehouses")
          .insert({ company_id: cid, name: "Hlavný sklad", active: true })
          .select()
          .single();
        if (created) {
          wh = [created];
          toast.success("Vytvorený sklad 'Hlavný sklad'.");
        } else if (error) toast.error(error.message);
      }
      const [{ data: si }, { data: prods }] = await Promise.all([
        supabase
          .from("stock_items")
          .select("id, sku, product_id, sale_price, purchase_price")
          .eq("company_id", cid)
          .order("sku"),
        supabase.from("products").select("id, name").eq("company_id", cid).is("deleted_at", null),
      ]);
      const pm: Record<string, string> = {};
      (prods ?? []).forEach((p: any) => {
        pm[p.id] = p.name;
      });
      setProductMap(pm);
      setWarehouses(wh ?? []);
      setItems(si ?? []);
      if ((wh ?? []).length) setWarehouse(wh![0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    setAvailability(null);
    const cid = getActiveCompanyId();
    if (!cid || !stockItem || type !== "vydaj") return;
    (async () => {
      const [{ data: lvls }, { data: resv }] = await Promise.all([
        supabase
          .from("stock_levels")
          .select("quantity, warehouse_id")
          .eq("company_id", cid)
          .eq("stock_item_id", stockItem),
        (supabase as any)
          .from("stock_reservations")
          .select("quantity")
          .eq("company_id", cid)
          .eq("stock_item_id", stockItem)
          .eq("status", "active"),
      ]);
      const onHand = (lvls ?? []).reduce((s: number, l: any) => s + Number(l.quantity), 0);
      const reserved = (resv ?? []).reduce((s: number, l: any) => s + Number(l.quantity), 0);
      setAvailability({ on_hand: onHand, reserved, available: onHand - reserved });
    })();
  }, [stockItem, type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid || !stockItem) return toast.error("Vyplňte firmu a položku.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Množstvo musí byť kladné.");
    if (type === "vydaj" && availability && qty > availability.available) {
      const ok = confirm(
        `Vydávate ${qty} ks, ale k dispozícii je len ${availability.available.toFixed(2)} (na sklade ${availability.on_hand.toFixed(2)}, rezervované ${availability.reserved.toFixed(2)}). Pokračovať a porušiť rezervácie?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const unitPrice = Number(price) || 0;
    try {
      const result = await createMovement({
        data: {
          company_id: cid,
          warehouse_id: warehouse || null,
          stock_item_id: stockItem,
          type,
          quantity: qty,
          unit_price: unitPrice,
          side_costs_total: type === "prijem" ? Number(sideCosts) || 0 : 0,
          note: note || null,
        },
      });
      console.info("[sklad-debug:movement:client-result]", result);
      setDebug((result as any).debug ?? result);
      if (!(result as any).ok) {
        const m = (result as any).error ?? "Pohyb sa nepodarilo uložiť.";
        if (m.includes("FAKTERO_STOCK:negative_stock"))
          return toast.error(
            "Pohyb by spôsobil záporný stav skladu." + (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        if (m.includes("FAKTERO_STOCK:zero_quantity"))
          return toast.error("Množstvo nemôže byť 0." + (SHOW_STOCK_DEBUG ? ` (${m})` : ""));
        if (m.includes("FAKTERO_STOCK:cross_company"))
          return toast.error(
            "Sklad a položka musia patriť tej istej firme." + (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        if (m.includes("FAKTERO_STOCK:warehouse_inactive"))
          return toast.error(
            "Sklad je neaktívny — pohyb nie je možný." + (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        if (m.includes("FAKTERO_STOCK:movement_immutable"))
          return toast.error(
            "Skladové pohyby nie je možné upravovať ani mazať. Vytvorte opravný pohyb." +
              (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        if (m.includes("FAKTERO_STOCK:invoice_item_locked"))
          return toast.error(
            "Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry." +
              (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        if (m.includes("FAKTERO_PLAN_BLOCK"))
          return toast.error(
            "Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán." +
              (SHOW_STOCK_DEBUG ? ` (${m})` : ""),
          );
        return toast.error(SHOW_STOCK_DEBUG ? `Sklad chyba: ${m}` : m);
      }
      toast.success("Pohyb uložený.");
      onDone?.();
    } catch (error: any) {
      console.error("[sklad-debug:movement:client-exception]", error);
      setDebug({ exact_error: error?.message ?? String(error), exception: error });
      toast.error(error?.message ?? "Pohyb sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  function itemLabel(i: any) {
    const name = i.product_id ? productMap[i.product_id] : null;
    if (name && i.sku) return `${name} (${i.sku})`;
    return name ?? i.sku ?? i.id.slice(0, 8);
  }

  return (
    <>
      <PageHeader title={title} description="Manuálny skladový pohyb." />
      <PageBody>
        {!loading && items.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Najprv pridajte tovar do skladu.</p>
            <Link
              to="/sklad/produkty"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Pridať tovar
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mx-auto grid max-w-xl gap-3 rounded-xl border border-border bg-card p-6"
          >
            <label className="block">
              <span className="text-sm font-medium">Sklad *</span>
              <select
                required
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Tovar / skladová karta *</span>
              <select
                required
                value={stockItem}
                onChange={(e) => {
                  setStockItem(e.target.value);
                  const it = items.find((x) => x.id === e.target.value);
                  if (it) setPrice(String(type === "prijem" ? it.purchase_price : it.sale_price));
                }}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— vyberte —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {itemLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            {type === "vydaj" && stockItem && availability && (
              <div
                className={`rounded-md border px-3 py-2 text-xs tabular-nums ${Number(quantity) > availability.available ? "border-amber-300 bg-amber-50 text-amber-900" : "border-stone-200 bg-stone-50 text-muted-foreground"}`}
              >
                Na sklade <b>{availability.on_hand.toFixed(2)}</b> · Rezervované{" "}
                <b>{availability.reserved.toFixed(2)}</b> · K dispozícii{" "}
                <b>{availability.available.toFixed(2)}</b>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Množstvo *</span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Jedn. cena</span>
                <input
                  type="number"
                  step="0.0001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            {type === "prijem" && (
              <>
                <label className="block">
                  <span className="text-sm font-medium">Vedľajšie náklady (doprava, clo…)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={sideCosts}
                    onChange={(e) => setSideCosts(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Alokujú sa do obstarávacej ceny.
                  </span>
                </label>
                <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Obstarávacia cena / MJ
                  </span>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {(() => {
                      const q = Number(quantity) || 0;
                      const p = Number(price) || 0;
                      const s = Number(sideCosts) || 0;
                      return (p + (q > 0 ? s / q : 0)).toFixed(4);
                    })()}{" "}
                    €
                  </div>
                </div>
              </>
            )}
            <label className="block">
              <span className="text-sm font-medium">Poznámka</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <button
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Ukladám…" : "Uložiť pohyb"}
              </button>
            </div>
            {SHOW_STOCK_DEBUG && debug && (
              <pre className="max-h-56 overflow-auto rounded-md border border-amber-300/50 bg-amber-50 p-3 text-[11px] text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                {JSON.stringify(debug, null, 2)}
              </pre>
            )}
          </form>
        )}
      </PageBody>
    </>
  );
}
