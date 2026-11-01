/**
 * Tovar objednaný u dodávateľa a ešte neprijatý — po skladových kartách.
 *
 * Patrí do disponibilného množstva (`podMinimom`, návrh objednávky). Funguje
 * s klientom v prehliadači aj na serveri; obe idú cez RLS.
 */
import { objednaneNaCeste, type StavObjednavky } from "./objednavky-dodavatel";
import { riadkyPreIds, vsetkyRiadky } from "./strankovanie";

export async function nacitajNaCeste(
  supabase: any,
  companyId: string,
): Promise<Map<string, number>> {
  const objednavky = await vsetkyRiadky<{ id: string; status: StavObjednavky }>((od, po) =>
    supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_received"])
      .order("id")
      .range(od, po),
  );
  if (!objednavky.length) return new Map();
  const stav = new Map(objednavky.map((o) => [o.id, o.status] as const));
  const polozky = await riadkyPreIds<any>(
    objednavky.map((o) => o.id),
    (kus, od, po) =>
      supabase
        .from("purchase_order_items")
        .select("id, stock_item_id, quantity, received_quantity, purchase_order_id")
        .in("purchase_order_id", kus)
        .order("id")
        .range(od, po),
  );
  return objednaneNaCeste(
    polozky.map((it) => ({
      stock_item_id: it.stock_item_id,
      quantity: Number(it.quantity ?? 0),
      received_quantity: Number(it.received_quantity ?? 0),
      stav: stav.get(it.purchase_order_id) ?? "sent",
    })),
  );
}
