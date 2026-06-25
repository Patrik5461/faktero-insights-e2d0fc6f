import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CompanyScoped = z.object({ company_id: z.string().uuid() });

const MovementType = z.enum(["prijem", "vydaj", "oprava", "inventura", "faktura", "dobropis"]);

function serializeDbError(error: any) {
  if (!error) return null;
  return { message: error.message, code: error.code, details: error.details, hint: error.hint };
}

async function getStockLevel(supabase: any, warehouseId: string | null, stockItemId: string | null) {
  if (!warehouseId || !stockItemId) return null;
  const { data, error } = await supabase
    .from("stock_levels")
    .select("id, warehouse_id, stock_item_id, quantity, reserved_quantity, updated_at")
    .eq("warehouse_id", warehouseId)
    .eq("stock_item_id", stockItemId)
    .maybeSingle();
  return { data, error: serializeDbError(error) };
}

async function ensureDefaultWarehouse(supabase: any, companyId: string, debug: any) {
  const { data: existing, error: selectError } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  debug.default_warehouse_select_result = { data: existing, error: serializeDbError(selectError) };
  if (selectError) return { warehouse: null, error: selectError };
  if (existing) return { warehouse: existing, error: null };
  const { data: created, error } = await supabase
    .from("warehouses")
    .insert({ company_id: companyId, name: "Hlavný sklad", active: true })
    .select("id, name")
    .single();
  debug.default_warehouse_insert_result = { data: created, error: serializeDbError(error) };
  return { warehouse: created, error };
}

export const getStockDebugSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [warehouses, stockItems, movements] = await Promise.all([
      supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
      supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
      supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("company_id", data.company_id),
    ]);
    const snapshot = {
      company_id: data.company_id,
      user_id: userId,
      warehouses_count: warehouses.count ?? 0,
      stock_items_count: stockItems.count ?? 0,
      stock_movements_count: movements.count ?? 0,
      errors: [warehouses.error, stockItems.error, movements.error].filter(Boolean).map(serializeDbError),
    };
    console.info("[sklad-debug:snapshot]", snapshot);
    return snapshot;
  });

const CreateStockProductInput = z.object({
  company_id: z.string().uuid(),
  name: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().default("ks"),
  sale_price: z.coerce.number().nonnegative().default(0),
  purchase_price: z.coerce.number().nonnegative().default(0),
  vat_rate: z.coerce.number().min(0).max(100).default(20),
  track_stock: z.boolean().default(true),
  min_stock: z.coerce.number().nonnegative().default(0),
  initial_quantity: z.coerce.number().nonnegative().default(0),
  warehouse_id: z.string().uuid().optional().nullable(),
});

export const createStockProductDebug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateStockProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const debug: any = { action: "add_goods", company_id: data.company_id, user_id: userId, warehouse_id_used: data.warehouse_id ?? null };
    console.info("[sklad-debug:add-goods:start]", debug);

    let warehouseId = data.warehouse_id ?? null;
    if (!warehouseId) {
      const ensured = await ensureDefaultWarehouse(supabase, data.company_id, debug);
      if (ensured.error || !ensured.warehouse) {
        debug.exact_error = serializeDbError(ensured.error) ?? { message: "Nepodarilo sa vytvoriť sklad." };
        console.error("[sklad-debug:add-goods:warehouse-error]", debug);
        return { ok: false, error: debug.exact_error.message, debug };
      }
      warehouseId = ensured.warehouse.id;
      debug.warehouse_id_used = warehouseId;
    }

    const { data: product, error: pErr } = await supabase.from("products").insert({
      company_id: data.company_id,
      name: data.name.trim(),
      code: data.sku || null,
      unit: data.unit || "ks",
      unit_price: data.sale_price,
      vat_rate: data.vat_rate,
      active: true,
    }).select("id, name, code").single();
    debug.product_insert_result = { data: product, error: serializeDbError(pErr) };
    if (pErr || !product) {
      debug.exact_error = serializeDbError(pErr) ?? { message: "Nepodarilo sa vytvoriť produkt." };
      console.error("[sklad-debug:add-goods:product-error]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }

    const { data: stockItem, error: sErr } = await supabase.from("stock_items").insert({
      company_id: data.company_id,
      product_id: product.id,
      sku: data.sku || null,
      barcode: data.barcode || null,
      purchase_price: data.purchase_price,
      sale_price: data.sale_price,
      vat_rate: data.vat_rate,
      unit: data.unit || "ks",
      track_stock: data.track_stock,
      min_stock: data.min_stock,
    }).select("id, product_id, sku").single();
    debug.stock_item_insert_result = { data: stockItem, error: serializeDbError(sErr) };
    if (sErr || !stockItem) {
      debug.exact_error = serializeDbError(sErr) ?? { message: "Nepodarilo sa vytvoriť skladovú kartu." };
      console.error("[sklad-debug:add-goods:stock-item-error]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }

    const resolvedWarehouseId = warehouseId;
    if (!resolvedWarehouseId) {
      debug.exact_error = { message: "Chýba sklad pre skladový pohyb." };
      console.error("[sklad-debug:add-goods:missing-warehouse]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }

    if (data.initial_quantity > 0) {
      const payload = {
        company_id: data.company_id,
        warehouse_id: resolvedWarehouseId,
        stock_item_id: stockItem.id,
        type: "prijem" as const,
        quantity: data.initial_quantity,
        unit_price: data.purchase_price,
        total_value: data.initial_quantity * data.purchase_price,
        note: "Počiatočný stav",
        created_by: userId,
      };
      debug.stock_movement_insert_payload = payload;
      const { data: movement, error: mErr } = await supabase.from("stock_movements").insert(payload).select("id, type, quantity, warehouse_id, stock_item_id").single();
      debug.stock_movement_insert_result = { data: movement, error: serializeDbError(mErr) };
      debug.stock_level_after_trigger = await getStockLevel(supabase, resolvedWarehouseId, stockItem.id);
      if (mErr || !movement) {
        debug.exact_error = serializeDbError(mErr) ?? { message: "Počiatočný stav sa nepodarilo zaúčtovať." };
        console.error("[sklad-debug:add-goods:movement-error]", debug);
        return { ok: false, error: debug.exact_error.message, debug };
      }
    } else {
      debug.stock_movement_insert_result = { skipped: "initial_quantity=0" };
      debug.stock_level_after_trigger = await getStockLevel(supabase, resolvedWarehouseId, stockItem.id);
    }

    console.info("[sklad-debug:add-goods:success]", debug);
    return { ok: true, product, stockItem, movement: debug.stock_movement_insert_result?.data ?? null, debug };
  });

const CreateStockMovementInput = z.object({
  company_id: z.string().uuid(),
  warehouse_id: z.string().uuid().optional().nullable(),
  stock_item_id: z.string().uuid(),
  type: MovementType,
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative().default(0),
  note: z.string().max(500).optional().nullable(),
});

export const createStockMovementDebug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateStockMovementInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const debug: any = {
      action: data.type,
      company_id: data.company_id,
      user_id: userId,
      warehouse_id: data.warehouse_id ?? null,
      stock_item_id: data.stock_item_id,
      quantity: data.quantity,
    };
    console.info("[sklad-debug:movement:start]", debug);
    let warehouseId = data.warehouse_id ?? null;
    if (!warehouseId) {
      const ensured = await ensureDefaultWarehouse(supabase, data.company_id, debug);
      if (ensured.error || !ensured.warehouse) {
        debug.exact_error = serializeDbError(ensured.error) ?? { message: "Nepodarilo sa vytvoriť sklad." };
        console.error("[sklad-debug:movement:warehouse-error]", debug);
        return { ok: false, error: debug.exact_error.message, debug };
      }
      warehouseId = ensured.warehouse.id;
    }
    const resolvedWarehouseId = warehouseId;
    if (!resolvedWarehouseId) {
      debug.exact_error = { message: "Chýba sklad pre skladový pohyb." };
      console.error("[sklad-debug:movement:missing-warehouse]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }
    debug.warehouse_id = resolvedWarehouseId;
    const payload = {
      company_id: data.company_id,
      warehouse_id: resolvedWarehouseId,
      stock_item_id: data.stock_item_id,
      type: data.type,
      quantity: data.quantity,
      unit_price: data.unit_price,
      total_value: Math.abs(data.quantity) * data.unit_price,
      note: data.note || null,
      created_by: userId,
    };
    debug.insert_payload = payload;
    const { data: movement, error } = await supabase.from("stock_movements").insert(payload).select("id, type, quantity, warehouse_id, stock_item_id").single();
    debug.insert_result = { data: movement, error: serializeDbError(error) };
    debug.trigger_error = serializeDbError(error);
    debug.stock_level_after_trigger = await getStockLevel(supabase, resolvedWarehouseId, data.stock_item_id);
    if (error || !movement) {
      debug.exact_error = serializeDbError(error) ?? { message: "Pohyb sa nepodarilo uložiť." };
      console.error("[sklad-debug:movement:error]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }
    console.info("[sklad-debug:movement:success]", debug);
    return { ok: true, movement, debug };
  });

// Stats for the sklad dashboard
export const getStockDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: movements }] = await Promise.all([
      supabase.from("stock_items").select("id, sku, min_stock, track_stock, sale_price, purchase_price").eq("company_id", data.company_id),
      supabase.from("stock_levels").select("stock_item_id, quantity").eq("company_id", data.company_id),
      supabase.from("stock_movements").select("id, type, quantity, total_value, stock_item_id, created_at, note").eq("company_id", data.company_id).order("created_at", { ascending: false }).limit(10),
    ]);
    const levelMap = new Map<string, number>();
    (levels ?? []).forEach((l) => levelMap.set(l.stock_item_id, (levelMap.get(l.stock_item_id) ?? 0) + Number(l.quantity)));
    const totalValue = (items ?? []).reduce((sum, it) => sum + (levelMap.get(it.id) ?? 0) * Number(it.purchase_price ?? 0), 0);
    const belowMin = (items ?? []).filter((it) => it.track_stock && (levelMap.get(it.id) ?? 0) < Number(it.min_stock ?? 0));
    return {
      total_items: (items ?? []).length,
      total_value: totalValue,
      below_min_count: belowMin.length,
      below_min_items: belowMin.slice(0, 10).map((it) => ({ id: it.id, sku: it.sku, min: Number(it.min_stock), current: levelMap.get(it.id) ?? 0 })),
      recent_movements: movements ?? [],
    };
  });

// Complete an inventory count: insert one inventura movement per counted_quantity differing from expected
const CompleteInput = z.object({
  company_id: z.string().uuid(),
  inventory_count_id: z.string().uuid(),
});
export const completeInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: count, error: cErr } = await supabase.from("inventory_counts").select("*").eq("id", data.inventory_count_id).eq("company_id", data.company_id).maybeSingle();
    if (cErr || !count) throw new Error("Inventúra nenájdená.");
    if (count.status !== "open") throw new Error("Inventúra už nie je otvorená.");
    const { data: items } = await supabase.from("inventory_count_items").select("*").eq("inventory_count_id", data.inventory_count_id);
    let adjustments = 0;
    for (const it of items ?? []) {
      if (it.counted_quantity == null) continue;
      const diff = Number(it.counted_quantity) - Number(it.expected_quantity);
      if (Math.abs(diff) < 1e-9) continue;
      await supabase.from("stock_movements").insert({
        company_id: data.company_id, warehouse_id: count.warehouse_id,
        stock_item_id: it.stock_item_id, type: "inventura",
        quantity: diff, unit_price: 0, total_value: 0,
        reference_type: "inventory_count", reference_id: count.id,
        note: `Inventúra ${count.id.slice(0, 8)}`, created_by: userId,
      });
      await supabase.from("inventory_count_items").update({ difference: diff }).eq("id", it.id);
      adjustments++;
    }
    await supabase.from("inventory_counts").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", count.id);
    await supabase.from("stock_audit_logs").insert({
      company_id: data.company_id, user_id: userId,
      action: "inventory_complete", entity_type: "inventory_count", entity_id: count.id,
      metadata: { adjustments },
    });
    return { ok: true, adjustments };
  });

// Start an inventory: create the count + snapshot expected quantities
const StartInput = z.object({
  company_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
});
export const startInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existingOpen } = await supabase.from("inventory_counts").select("id").eq("company_id", data.company_id).eq("warehouse_id", data.warehouse_id).eq("status", "open").maybeSingle();
    if (existingOpen) return { id: existingOpen.id, resumed: true };
    const { data: count, error } = await supabase.from("inventory_counts").insert({
      company_id: data.company_id, warehouse_id: data.warehouse_id, status: "open", created_by: userId,
    }).select().single();
    if (error || !count) throw new Error(error?.message ?? "Nepodarilo sa vytvoriť inventúru.");
    const { data: items } = await supabase.from("stock_items").select("id").eq("company_id", data.company_id).eq("track_stock", true);
    const { data: levels } = await supabase.from("stock_levels").select("stock_item_id, quantity").eq("warehouse_id", data.warehouse_id);
    const levelMap = new Map<string, number>();
    (levels ?? []).forEach((l) => levelMap.set(l.stock_item_id, Number(l.quantity)));
    const rows = (items ?? []).map((it) => ({
      inventory_count_id: count.id, stock_item_id: it.id,
      expected_quantity: levelMap.get(it.id) ?? 0,
    }));
    if (rows.length) await supabase.from("inventory_count_items").insert(rows);
    return { id: count.id, resumed: false };
  });

// Link or create a stock_item for an existing product
const LinkInput = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
});
export const ensureStockItemForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase.from("stock_items").select("id").eq("company_id", data.company_id).eq("product_id", data.product_id).maybeSingle();
    if (existing) return { id: existing.id, created: false };
    const { data: product } = await supabase.from("products").select("*").eq("id", data.product_id).maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: created, error } = await supabase.from("stock_items").insert({
      company_id: data.company_id, product_id: product.id,
      sku: product.code ?? null, sale_price: product.unit_price ?? 0,
      vat_rate: product.vat_rate ?? 20, unit: product.unit ?? "ks",
      track_stock: true,
    }).select().single();
    if (error || !created) throw new Error(error?.message ?? "Nepodarilo sa vytvoriť skladovú položku.");
    return { id: created.id, created: true };
  });

// Toggle stock tracking on a product (creates stock_item if needed, otherwise flips track_stock).
const TrackInput = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
  track_stock: z.boolean(),
});
export const setProductStockTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrackInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase.from("stock_items")
      .select("id, track_stock").eq("company_id", data.company_id).eq("product_id", data.product_id).maybeSingle();
    if (existing) {
      if (existing.track_stock !== data.track_stock) {
        await supabase.from("stock_items").update({ track_stock: data.track_stock }).eq("id", existing.id);
      }
      return { id: existing.id, created: false };
    }
    if (!data.track_stock) return { id: null, created: false };
    const { data: product } = await supabase.from("products").select("*").eq("id", data.product_id).maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: created, error } = await supabase.from("stock_items").insert({
      company_id: data.company_id, product_id: product.id,
      sku: product.code ?? null, sale_price: product.unit_price ?? 0,
      vat_rate: product.vat_rate ?? 20, unit: product.unit ?? "ks",
      track_stock: true,
    }).select().single();
    if (error || !created) throw new Error(error?.message ?? "Nepodarilo sa vytvoriť skladovú položku.");
    return { id: created.id, created: true };
  });

// --- v1.5 additions -------------------------------------------------------

const ProductDetailInput = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
});
export const getProductStockDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProductDetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: product } = await supabase.from("products").select("*").eq("id", data.product_id).eq("company_id", data.company_id).maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: stockItem } = await supabase.from("stock_items").select("*").eq("company_id", data.company_id).eq("product_id", data.product_id).maybeSingle();
    let levels: any[] = [];
    let movements: any[] = [];
    let invoiceRefs: any[] = [];
    let totalQuantity = 0;
    let reservedQuantity = 0;
    if (stockItem) {
      const { data: lvl } = await supabase.from("stock_levels")
        .select("warehouse_id, quantity, reserved_quantity, warehouses(name)")
        .eq("stock_item_id", stockItem.id);
      levels = lvl ?? [];
      totalQuantity = levels.reduce((s, l) => s + Number(l.quantity ?? 0), 0);
      reservedQuantity = levels.reduce((s, l) => s + Number(l.reserved_quantity ?? 0), 0);
      const { data: mv } = await supabase.from("stock_movements")
        .select("*").eq("stock_item_id", stockItem.id).order("created_at", { ascending: false }).limit(20);
      movements = mv ?? [];
      const invIds = Array.from(new Set(movements.filter((m) => m.reference_type === "invoice" && m.reference_id).map((m) => m.reference_id)));
      if (invIds.length) {
        const { data: invs } = await supabase.from("invoices").select("id, invoice_number, status, issue_date, total").in("id", invIds);
        invoiceRefs = invs ?? [];
      }
    }
    return { product, stockItem, levels, movements, invoiceRefs, totalQuantity, reservedQuantity };
  });

const MovementDetailInput = z.object({
  company_id: z.string().uuid(),
  movement_id: z.string().uuid(),
});
export const getMovementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MovementDetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: m } = await supabase.from("stock_movements").select("*").eq("id", data.movement_id).eq("company_id", data.company_id).maybeSingle();
    if (!m) throw new Error("Pohyb nenájdený.");
    const [{ data: si }, { data: wh }] = await Promise.all([
      supabase.from("stock_items").select("id, sku, product_id").eq("id", m.stock_item_id).maybeSingle(),
      supabase.from("warehouses").select("id, name").eq("id", m.warehouse_id).maybeSingle(),
    ]);
    let product: any = null;
    if (si?.product_id) {
      const { data: p } = await supabase.from("products").select("id, name").eq("id", si.product_id).maybeSingle();
      product = p;
    }
    let invoice: any = null;
    if (m.reference_type === "invoice" && m.reference_id) {
      const { data: inv } = await supabase.from("invoices").select("id, invoice_number, status").eq("id", m.reference_id).maybeSingle();
      invoice = inv;
    }
    let createdByEmail: string | null = null;
    if (m.created_by) {
      const { data: prof } = await supabase.from("profiles").select("email, full_name").eq("id", m.created_by).maybeSingle();
      createdByEmail = prof?.full_name ?? prof?.email ?? null;
    }
    return { movement: m, stockItem: si, warehouse: wh, product, invoice, createdByEmail };
  });

export const getStockValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: warehouses }, { data: products }] = await Promise.all([
      supabase.from("stock_items").select("id, sku, product_id, purchase_price, sale_price, unit").eq("company_id", data.company_id),
      supabase.from("stock_levels").select("warehouse_id, stock_item_id, quantity").eq("company_id", data.company_id),
      supabase.from("warehouses").select("id, name").eq("company_id", data.company_id),
      supabase.from("products").select("id, name").eq("company_id", data.company_id).is("deleted_at", null),
    ]);
    const itemMap = new Map<string, any>(); (items ?? []).forEach((i) => itemMap.set(i.id, i));
    const productMap = new Map<string, any>(); (products ?? []).forEach((p) => productMap.set(p.id, p));
    const whMap = new Map<string, any>(); (warehouses ?? []).forEach((w) => whMap.set(w.id, w));

    let totalPurchase = 0, totalSale = 0;
    const byWarehouse = new Map<string, { id: string; name: string; purchase: number; sale: number; qty: number }>();
    const byProduct = new Map<string, { stock_item_id: string; sku: string | null; name: string; qty: number; purchase: number; sale: number }>();

    for (const l of levels ?? []) {
      const it = itemMap.get(l.stock_item_id); if (!it) continue;
      const qty = Number(l.quantity ?? 0);
      const pVal = qty * Number(it.purchase_price ?? 0);
      const sVal = qty * Number(it.sale_price ?? 0);
      totalPurchase += pVal; totalSale += sVal;
      const wh = whMap.get(l.warehouse_id);
      const wKey = l.warehouse_id;
      const wEntry = byWarehouse.get(wKey) ?? { id: wKey, name: wh?.name ?? "—", purchase: 0, sale: 0, qty: 0 };
      wEntry.purchase += pVal; wEntry.sale += sVal; wEntry.qty += qty;
      byWarehouse.set(wKey, wEntry);
        const pEntry = byProduct.get(it.id) ?? { stock_item_id: it.id, sku: it.sku, name: (it.product_id ? productMap.get(it.product_id)?.name : null) ?? it.sku ?? "—", qty: 0, purchase: 0, sale: 0 };
      pEntry.qty += qty; pEntry.purchase += pVal; pEntry.sale += sVal;
      byProduct.set(it.id, pEntry);
    }
    return {
      total_purchase: totalPurchase, total_sale: totalSale,
      by_warehouse: Array.from(byWarehouse.values()).sort((a, b) => b.purchase - a.purchase),
      by_product: Array.from(byProduct.values()).sort((a, b) => b.purchase - a.purchase),
    };
  });

export const getLowStockReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: warehouses }, { data: products }] = await Promise.all([
      supabase.from("stock_items").select("id, sku, product_id, min_stock, track_stock, unit").eq("company_id", data.company_id).eq("track_stock", true),
      supabase.from("stock_levels").select("warehouse_id, stock_item_id, quantity").eq("company_id", data.company_id),
      supabase.from("warehouses").select("id, name").eq("company_id", data.company_id),
      supabase.from("products").select("id, name").eq("company_id", data.company_id).is("deleted_at", null),
    ]);
    const whMap = new Map((warehouses ?? []).map((w) => [w.id, w] as const));
    const productMap = new Map((products ?? []).map((p) => [p.id, p] as const));
    const totalByItem = new Map<string, number>();
    (levels ?? []).forEach((l) => totalByItem.set(l.stock_item_id, (totalByItem.get(l.stock_item_id) ?? 0) + Number(l.quantity)));
    const rows: any[] = [];
    for (const it of items ?? []) {
      const totalQty = totalByItem.get(it.id) ?? 0;
      if (totalQty <= Number(it.min_stock ?? 0)) {
        rows.push({
          stock_item_id: it.id, product_id: it.product_id, sku: it.sku, unit: it.unit,
          name: (it.product_id ? productMap.get(it.product_id)?.name : null) ?? it.sku ?? "—",
          current: totalQty, min: Number(it.min_stock ?? 0),
          shortage: Math.max(0, Number(it.min_stock ?? 0) - totalQty),
          per_warehouse: (levels ?? [])
            .filter((l) => l.stock_item_id === it.id)
            .map((l) => ({ warehouse_id: l.warehouse_id, warehouse_name: whMap.get(l.warehouse_id)?.name ?? "—", quantity: Number(l.quantity) })),
        });
      }
    }
    return { rows: rows.sort((a, b) => b.shortage - a.shortage) };
  });

const ImportRow = z.object({
  sku: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(255),
  barcode: z.string().trim().max(64).optional().nullable(),
  unit: z.string().trim().max(16).optional().default("ks"),
  purchase_price: z.coerce.number().nonnegative().optional().default(0),
  sale_price: z.coerce.number().nonnegative().optional().default(0),
  vat_rate: z.coerce.number().min(0).max(100).optional().default(20),
  min_stock: z.coerce.number().nonnegative().optional().default(0),
  initial_stock: z.coerce.number().optional().default(0),
  warehouse_name: z.string().trim().max(255).optional().nullable(),
});
const ImportInput = z.object({
  company_id: z.string().uuid(),
  rows: z.array(ImportRow).min(1).max(2000),
});
export const importStockCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cid = data.company_id;
    const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("company_id", cid);
    const whByName = new Map<string, string>((warehouses ?? []).map((w) => [w.name.toLowerCase(), w.id]));
    let defaultWh = (warehouses ?? []).find((w) => w.name) ?? null;
    if (!defaultWh) {
      const { data: created } = await supabase.from("warehouses").insert({ company_id: cid, name: "Hlavný sklad", active: true }).select().single();
      if (created) { defaultWh = created; whByName.set(created.name.toLowerCase(), created.id); }
    }
    let createdProducts = 0, updatedProducts = 0, createdItems = 0, updatedItems = 0, initialMovements = 0, errors = 0;
    const errorList: { row: number; reason: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        // Find existing product by SKU on stock_items, or by code/name on products.
        let product: any = null;
        if (r.sku) {
          const { data: si } = await supabase.from("stock_items").select("product_id").eq("company_id", cid).eq("sku", r.sku).maybeSingle();
          if (si?.product_id) {
            const { data: p } = await supabase.from("products").select("*").eq("id", si.product_id).maybeSingle();
            product = p;
          }
        }
        if (!product && r.sku) {
          const { data: p } = await supabase.from("products").select("*").eq("company_id", cid).eq("code", r.sku).is("deleted_at", null).maybeSingle();
          product = p;
        }
        if (!product) {
          const { data: p } = await supabase.from("products").select("*").eq("company_id", cid).ilike("name", r.name).is("deleted_at", null).maybeSingle();
          product = p;
        }
        if (product) {
          await supabase.from("products").update({
            name: r.name, code: r.sku ?? product.code, unit: r.unit ?? product.unit,
            unit_price: r.sale_price ?? product.unit_price, vat_rate: r.vat_rate ?? product.vat_rate,
          }).eq("id", product.id);
          updatedProducts++;
        } else {
          const { data: np } = await supabase.from("products").insert({
            company_id: cid, name: r.name, code: r.sku ?? null, unit: r.unit ?? "ks",
            unit_price: r.sale_price ?? 0, vat_rate: r.vat_rate ?? 20, active: true,
          }).select().single();
          product = np; createdProducts++;
        }
        // stock_item
        let { data: stockItem } = await supabase.from("stock_items").select("*").eq("company_id", cid).eq("product_id", product.id).maybeSingle();
        if (stockItem) {
          await supabase.from("stock_items").update({
            sku: r.sku ?? stockItem.sku, barcode: r.barcode ?? stockItem.barcode,
            purchase_price: r.purchase_price ?? stockItem.purchase_price,
            sale_price: r.sale_price ?? stockItem.sale_price,
            vat_rate: r.vat_rate ?? stockItem.vat_rate, unit: r.unit ?? stockItem.unit,
            min_stock: r.min_stock ?? stockItem.min_stock,
          }).eq("id", stockItem.id);
          updatedItems++;
        } else {
          const { data: ni } = await supabase.from("stock_items").insert({
            company_id: cid, product_id: product.id,
            sku: r.sku ?? null, barcode: r.barcode ?? null,
            purchase_price: r.purchase_price ?? 0, sale_price: r.sale_price ?? 0,
            vat_rate: r.vat_rate ?? 20, unit: r.unit ?? "ks",
            min_stock: r.min_stock ?? 0, track_stock: true,
          }).select().single();
          stockItem = ni; createdItems++;
        }
        if (r.initial_stock && Number(r.initial_stock) !== 0 && stockItem) {
          let whId: string | null = null;
          if (r.warehouse_name && whByName.has(r.warehouse_name.toLowerCase())) whId = whByName.get(r.warehouse_name.toLowerCase())!;
          else if (defaultWh) whId = defaultWh.id;
          if (whId) {
            await supabase.from("stock_movements").insert({
              company_id: cid, warehouse_id: whId, stock_item_id: stockItem.id,
              type: Number(r.initial_stock) > 0 ? "prijem" : "oprava",
              quantity: r.initial_stock, unit_price: r.purchase_price ?? 0,
              total_value: Math.abs(Number(r.initial_stock)) * Number(r.purchase_price ?? 0),
              note: "CSV import - počiatočný stav", created_by: userId,
            });
            initialMovements++;
          }
        }
      } catch (e: any) {
        errors++; errorList.push({ row: i + 1, reason: e?.message ?? "unknown" });
      }
    }
    await supabase.from("stock_audit_logs").insert({
      company_id: cid, user_id: userId, action: "csv_import", entity_type: "stock_items",
      metadata: { rows: data.rows.length, createdProducts, updatedProducts, createdItems, updatedItems, initialMovements, errors },
    });
    return { createdProducts, updatedProducts, createdItems, updatedItems, initialMovements, errors, errorList };
  });

const AuditInput = z.object({
  company_id: z.string().uuid(),
  action: z.string().min(1).max(64),
  entity_type: z.string().min(1).max(64),
  entity_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional().default({}),
});
export const logStockAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AuditInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("stock_audit_logs").insert({
      company_id: data.company_id, user_id: context.userId,
      action: data.action, entity_type: data.entity_type,
      entity_id: data.entity_id ?? null, metadata: data.metadata ?? {},
    });
    return { ok: true };
  });

const RoleInput = z.object({ company_id: z.string().uuid() });
export const getMyStockRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("company_users").select("role")
      .eq("company_id", data.company_id).eq("user_id", context.userId).maybeSingle();
    return { role: row?.role ?? null };
  });