import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dalsieCisloDokladu } from "./cislovanie";
import {
  jeOtvorena,
  stavPodlaPrijatia,
  suctyObjednavky,
  zostavaPrijat,
  type StavObjednavky,
} from "./objednavky-dodavatel";

const CompanyScoped = z.object({ company_id: z.string().uuid() });

/**
 * Členstvo si vynúti RLS, lebo všetko tu ide cez klienta viazaného na
 * prihláseného používateľa. Objednávky zámerne nesiahajú po `supabaseAdmin` —
 * nie je na to dôvod a bola by to práve tá cesta, ktorou sa dá obísť RLS.
 */

async function nacitajObjednavku(supabase: any, companyId: string, id: string) {
  const { data: order } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!order) throw new Error("Objednávka nenájdená.");
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", id)
    .order("position", { ascending: true });
  return { order, items: items ?? [] };
}

/** Číslovanie OBJ{rok}{poradie} — rovnaký tvar ako pri cenových ponukách. */
async function dalsieCislo(supabase: any, companyId: string): Promise<string> {
  const prefix = `OBJ${new Date().getFullYear()}`;
  // Berieme všetky čísla daného roka, nie len prvé zoradené — reťazcové
  // poradie by pri rôzne dlhých číslach vybralo nesprávne maximum.
  const { data: rows } = await supabase
    .from("purchase_orders")
    .select("order_number")
    .eq("company_id", companyId)
    .like("order_number", `${prefix}%`)
    .limit(5000);
  return dalsieCisloDokladu(
    prefix,
    (rows ?? []).map((r: any) => r.order_number),
  );
}

export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      status: z
        .enum(["draft", "sent", "partially_received", "received", "cancelled"])
        .optional(),
      only_open: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("purchase_orders")
      .select("*")
      .eq("company_id", data.company_id)
      .order("order_date", { ascending: false })
      .order("order_number", { ascending: false })
      .limit(300);
    if (data.status) q = q.eq("status", data.status);
    if (data.only_open) q = q.in("status", ["sent", "partially_received"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    const polozkyPodlaObjednavky = new Map<string, any[]>();
    if (ids.length) {
      const { data: items } = await context.supabase
        .from("purchase_order_items")
        .select("purchase_order_id, quantity, received_quantity, unit_price, vat_rate")
        .in("purchase_order_id", ids);
      (items ?? []).forEach((it) => {
        const zoznam = polozkyPodlaObjednavky.get(it.purchase_order_id) ?? [];
        zoznam.push(it);
        polozkyPodlaObjednavky.set(it.purchase_order_id, zoznam);
      });
    }

    return (rows ?? []).map((o) => {
      const polozky = polozkyPodlaObjednavky.get(o.id) ?? [];
      return {
        ...o,
        items_count: polozky.length,
        ...suctyObjednavky(polozky),
        zostava_prijat: polozky.reduce((s, p) => s + zostavaPrijat(p), 0),
      };
    });
  });

/**
 * Zásoby pre výber do objednávky. Bez väzby na skladovú kartu sa objednávka
 * nedá naskladniť, takže výber musí byť po ruke priamo vo formulári.
 */
export const listStockItemsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("stock_items")
      .select("id, sku, unit, purchase_price, vat_rate, product_id, products(name)")
      .eq("company_id", data.company_id)
      .is("archived_at", null)
      .limit(1000);
    return (rows ?? [])
      .map((r: any) => ({
        id: r.id,
        sku: r.sku,
        unit: r.unit ?? "ks",
        purchase_price: Number(r.purchase_price ?? 0),
        vat_rate: Number(r.vat_rate ?? 23),
        name: r.products?.name ?? r.sku ?? "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "sk"));
  });

export const getPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { order, items } = await nacitajObjednavku(
      context.supabase,
      data.company_id,
      data.id,
    );
    const { data: warehouse } = order.warehouse_id
      ? await context.supabase
          .from("warehouses")
          .select("id, name")
          .eq("id", order.warehouse_id)
          .maybeSingle()
      : { data: null };
    return {
      order,
      items: items.map((it: any) => ({ ...it, zostava: zostavaPrijat(it) })),
      warehouse,
      ...suctyObjednavky(items),
    };
  });

const PolozkaVstup = z.object({
  stock_item_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().max(16).optional().nullable(),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative().default(0),
  vat_rate: z.coerce.number().min(0).max(100).default(23),
});

export const createPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      supplier_id: z.string().uuid().nullable().optional(),
      supplier_name: z.string().trim().max(255).nullable().optional(),
      warehouse_id: z.string().uuid().nullable().optional(),
      expected_date: z.string().date().nullable().optional(),
      note: z.string().trim().max(2000).nullable().optional(),
      items: z.array(PolozkaVstup).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Cieľový sklad musí patriť tej istej firme — bez kontroly by sa dal príjem
    // nasmerovať do skladu inej firmy.
    if (data.warehouse_id) {
      const { data: wh } = await supabase
        .from("warehouses")
        .select("id")
        .eq("id", data.warehouse_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!wh) throw new Error("Zvolený sklad nepatrí tejto firme.");
    }

    // Meno dodávateľa sa odpíše na doklad, nech objednávka prežije jeho zmenu.
    let supplierName = data.supplier_name ?? null;
    if (!supplierName && data.supplier_id) {
      const { data: s } = await supabase
        .from("customers")
        .select("name")
        .eq("id", data.supplier_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      supplierName = s?.name ?? null;
    }

    const { data: order, error } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: data.company_id,
        order_number: await dalsieCislo(supabase, data.company_id),
        supplier_id: data.supplier_id ?? null,
        supplier_name: supplierName,
        warehouse_id: data.warehouse_id ?? null,
        expected_date: data.expected_date ?? null,
        note: data.note ?? null,
        status: "draft",
        created_by: userId,
      })
      .select("*")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Objednávku sa nepodarilo vytvoriť.");

    const { error: iErr } = await supabase.from("purchase_order_items").insert(
      data.items.map((it, i) => ({
        purchase_order_id: order.id,
        stock_item_id: it.stock_item_id ?? null,
        name: it.name,
        unit: it.unit ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        position: i,
      })),
    );
    if (iErr) throw new Error(iErr.message);
    return { id: order.id, order_number: order.order_number };
  });

export const sendPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { order } = await nacitajObjednavku(context.supabase, data.company_id, data.id);
    if (order.status !== "draft") throw new Error("Odoslať sa dá len rozpracovaná objednávka.");
    const { error } = await context.supabase
      .from("purchase_orders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { order } = await nacitajObjednavku(context.supabase, data.company_id, data.id);
    if (order.status === "received") throw new Error("Vybavenú objednávku už nemožno zrušiť.");
    const { error } = await context.supabase
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { order } = await nacitajObjednavku(context.supabase, data.company_id, data.id);
    if (order.status !== "draft") {
      throw new Error("Zmazať možno len rozpracovanú objednávku. Odoslanú zrušte.");
    }
    const { error } = await context.supabase
      .from("purchase_orders")
      .delete()
      .eq("id", order.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Príjem tovaru z objednávky. Vytvorí skladový pohyb typu `prijem` s cenou
 * z objednávky — tým sa objednaná cena premietne do váženej nákupnej ceny
 * zásoby, o ktorú sa opiera ocenenie celého skladu.
 */
export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid(),
      warehouse_id: z.string().uuid(),
      lines: z
        .array(
          z.object({
            item_id: z.string().uuid(),
            quantity: z.coerce.number().positive(),
          }),
        )
        .min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { order, items } = await nacitajObjednavku(supabase, data.company_id, data.id);
    if (!jeOtvorena(order.status as StavObjednavky)) {
      throw new Error("Prijímať sa dá len z odoslanej objednávky.");
    }

    const { data: wh } = await supabase
      .from("warehouses")
      .select("id")
      .eq("id", data.warehouse_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!wh) throw new Error("Zvolený sklad nepatrí tejto firme.");

    const podlaId = new Map(items.map((it: any) => [it.id, it] as const));
    let prijatychRiadkov = 0;

    for (const line of data.lines) {
      const it: any = podlaId.get(line.item_id);
      if (!it) throw new Error("Položka nepatrí k tejto objednávke.");
      if (!it.stock_item_id) {
        throw new Error(`Položka „${it.name}" nemá skladovú kartu, nedá sa naskladniť.`);
      }
      const zostatok = zostavaPrijat(it);
      if (zostatok <= 0) continue;
      // Viac, než bolo objednané, sa neprijme — inak by sa dalo cez objednávku
      // naskladniť ľubovoľné množstvo.
      const mnozstvo = Math.min(line.quantity, zostatok);

      const { error: mErr } = await supabase.from("stock_movements").insert({
        company_id: data.company_id,
        warehouse_id: data.warehouse_id,
        stock_item_id: it.stock_item_id,
        type: "prijem",
        quantity: mnozstvo,
        unit_price: Number(it.unit_price ?? 0),
        total_value: Number(it.unit_price ?? 0) * mnozstvo,
        reference_type: "purchase_order",
        reference_id: order.id,
        reference_item_id: it.id,
        note: `Objednávka ${order.order_number}`,
        created_by: userId,
      });
      if (mErr) throw new Error(`Príjem zlyhal: ${mErr.message}`);

      const { error: uErr } = await supabase
        .from("purchase_order_items")
        .update({ received_quantity: Number(it.received_quantity ?? 0) + mnozstvo })
        .eq("id", it.id);
      if (uErr) throw new Error(uErr.message);
      it.received_quantity = Number(it.received_quantity ?? 0) + mnozstvo;
      prijatychRiadkov++;
    }

    // Stav sa počíta z prijatých množstiev, nikdy sa nenastavuje ručne.
    const novyStav = stavPodlaPrijatia(items, order.status as StavObjednavky);
    await supabase
      .from("purchase_orders")
      .update({
        status: novyStav,
        received_at: novyStav === "received" ? new Date().toISOString() : order.received_at,
      })
      .eq("id", order.id);

    return { ok: true, lines: prijatychRiadkov, status: novyStav };
  });
