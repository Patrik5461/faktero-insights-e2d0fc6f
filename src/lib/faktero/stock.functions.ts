import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { navrhniObjednavky } from "./stock-doobjednanie";
import { objednaneNaCeste } from "./objednavky-dodavatel";

const CompanyScoped = z.object({ company_id: z.string().uuid() });

/**
 * Overí, že používateľ je členom firmy. Väčšina funkcií v tomto súbore siaha na
 * dáta cez klienta viazaného na RLS, takže si členstvo vynúti databáza sama.
 * Medzifiremný presun je výnimka — zápis na strane cieľovej firmy ide zámerne
 * cez `supabaseAdmin`, čím RLS obchádza, takže členstvo treba overiť tu.
 */
async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Do cieľovej firmy nemáte prístup.");
}

const MovementType = z.enum(["prijem", "vydaj", "oprava", "inventura", "faktura", "dobropis"]);

function serializeDbError(error: any) {
  if (!error) return null;
  return { message: error.message, code: error.code, details: error.details, hint: error.hint };
}

async function getStockLevel(
  supabase: any,
  warehouseId: string | null,
  stockItemId: string | null,
) {
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
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [warehouses, stockItems, movements] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id),
      supabase
        .from("stock_items")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id),
      supabase
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id),
    ]);
    const snapshot = {
      company_id: data.company_id,
      user_id: userId,
      warehouses_count: warehouses.count ?? 0,
      stock_items_count: stockItems.count ?? 0,
      stock_movements_count: movements.count ?? 0,
      errors: [warehouses.error, stockItems.error, movements.error]
        .filter(Boolean)
        .map(serializeDbError),
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
  vat_rate: z.coerce.number().min(0).max(100).default(23),
  track_stock: z.boolean().default(true),
  min_stock: z.coerce.number().nonnegative().default(0),
  optimal_stock: z.coerce.number().nonnegative().default(0),
  initial_quantity: z.coerce.number().nonnegative().default(0),
  warehouse_id: z.string().uuid().optional().nullable(),
});

export const createStockProductDebug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateStockProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const debug: any = {
      action: "add_goods",
      company_id: data.company_id,
      user_id: userId,
      warehouse_id_used: data.warehouse_id ?? null,
    };
    console.info("[sklad-debug:add-goods:start]", debug);

    let warehouseId = data.warehouse_id ?? null;
    if (!warehouseId) {
      const ensured = await ensureDefaultWarehouse(supabase, data.company_id, debug);
      if (ensured.error || !ensured.warehouse) {
        debug.exact_error = serializeDbError(ensured.error) ?? {
          message: "Nepodarilo sa vytvoriť sklad.",
        };
        console.error("[sklad-debug:add-goods:warehouse-error]", debug);
        return { ok: false, error: debug.exact_error.message, debug };
      }
      warehouseId = ensured.warehouse.id;
      debug.warehouse_id_used = warehouseId;
    }

    const { data: product, error: pErr } = await supabase
      .from("products")
      .insert({
        company_id: data.company_id,
        name: data.name.trim(),
        code: data.sku || null,
        unit: data.unit || "ks",
        unit_price: data.sale_price,
        vat_rate: data.vat_rate,
        active: true,
      })
      .select("id, name, code")
      .single();
    debug.product_insert_result = { data: product, error: serializeDbError(pErr) };
    if (pErr || !product) {
      debug.exact_error = serializeDbError(pErr) ?? { message: "Nepodarilo sa vytvoriť produkt." };
      console.error("[sklad-debug:add-goods:product-error]", debug);
      return { ok: false, error: debug.exact_error.message, debug };
    }

    const { data: stockItem, error: sErr } = await supabase
      .from("stock_items")
      .insert({
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
        optimal_stock: data.optimal_stock,
      })
      .select("id, product_id, sku")
      .single();
    debug.stock_item_insert_result = { data: stockItem, error: serializeDbError(sErr) };
    if (sErr || !stockItem) {
      debug.exact_error = serializeDbError(sErr) ?? {
        message: "Nepodarilo sa vytvoriť skladovú kartu.",
      };
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
      const { data: movement, error: mErr } = await supabase
        .from("stock_movements")
        .insert(payload)
        .select("id, type, quantity, warehouse_id, stock_item_id")
        .single();
      debug.stock_movement_insert_result = { data: movement, error: serializeDbError(mErr) };
      debug.stock_level_after_trigger = await getStockLevel(
        supabase,
        resolvedWarehouseId,
        stockItem.id,
      );
      if (mErr || !movement) {
        debug.exact_error = serializeDbError(mErr) ?? {
          message: "Počiatočný stav sa nepodarilo zaúčtovať.",
        };
        console.error("[sklad-debug:add-goods:movement-error]", debug);
        return { ok: false, error: debug.exact_error.message, debug };
      }
    } else {
      debug.stock_movement_insert_result = { skipped: "initial_quantity=0" };
      debug.stock_level_after_trigger = await getStockLevel(
        supabase,
        resolvedWarehouseId,
        stockItem.id,
      );
    }

    console.info("[sklad-debug:add-goods:success]", debug);
    return {
      ok: true,
      product,
      stockItem,
      movement: debug.stock_movement_insert_result?.data ?? null,
      debug,
    };
  });

const CreateStockMovementInput = z.object({
  company_id: z.string().uuid(),
  warehouse_id: z.string().uuid().optional().nullable(),
  stock_item_id: z.string().uuid(),
  type: MovementType,
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative().default(0),
  side_costs_total: z.coerce.number().nonnegative().optional().default(0),
  note: z.string().max(500).optional().nullable(),
  source_document_type: z.string().max(40).optional().nullable(),
  source_document_id: z.string().uuid().optional().nullable(),
  // Že zákazka patrí tej istej firme a je otvorená, stráži trigger
  // `jobs_guard_assignment` v databáze.
  job_id: z.string().uuid().optional().nullable(),
});

export const createStockMovementDebug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateStockMovementInput.parse(d))
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
        debug.exact_error = serializeDbError(ensured.error) ?? {
          message: "Nepodarilo sa vytvoriť sklad.",
        };
        return { ok: false, error: debug.exact_error.message, debug };
      }
      warehouseId = ensured.warehouse.id;
    }
    const resolvedWarehouseId = warehouseId;
    if (!resolvedWarehouseId) {
      debug.exact_error = { message: "Chýba sklad pre skladový pohyb." };
      return { ok: false, error: debug.exact_error.message, debug };
    }
    debug.warehouse_id = resolvedWarehouseId;

    // Allocate side costs into unit_cost for receipts (single-line: full amount)
    const qty = Math.abs(data.quantity);
    const sideCosts = data.type === "prijem" ? Number(data.side_costs_total ?? 0) : 0;
    const unitCost =
      data.type === "prijem" ? Number(data.unit_price) + (qty > 0 ? sideCosts / qty : 0) : null; // for issues, DB trigger snapshots avg

    const payload: any = {
      company_id: data.company_id,
      warehouse_id: resolvedWarehouseId,
      stock_item_id: data.stock_item_id,
      type: data.type,
      quantity: data.quantity,
      unit_price: data.unit_price,
      total_value: qty * data.unit_price,
      note: data.note || null,
      created_by: userId,
      unit_cost: unitCost,
      side_costs_total: data.type === "prijem" ? sideCosts : null,
      source_document_type:
        data.source_document_type ??
        (data.type === "prijem" ? "receipt_note" : data.type === "vydaj" ? "issue_note" : "manual"),
      source_document_id: data.source_document_id ?? null,
      job_id: data.job_id ?? null,
    };
    debug.insert_payload = payload;
    const { data: movement, error } = await supabase
      .from("stock_movements")
      .insert(payload)
      .select("id, type, quantity, warehouse_id, stock_item_id, unit_cost")
      .single();
    debug.insert_result = { data: movement, error: serializeDbError(error) };
    debug.stock_level_after_trigger = await getStockLevel(
      supabase,
      resolvedWarehouseId,
      data.stock_item_id,
    );
    if (error || !movement) {
      debug.exact_error = serializeDbError(error) ?? { message: "Pohyb sa nepodarilo uložiť." };
      return { ok: false, error: debug.exact_error.message, debug };
    }
    return { ok: true, movement, debug };
  });

const RecomputeInput = z.object({
  company_id: z.string().uuid(),
  stock_item_id: z.string().uuid(),
});
export const recomputeStockAvgCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RecomputeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("recompute_stock_avg_cost", {
      _stock_item_id: data.stock_item_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, result };
  });

// Stats for the sklad dashboard
export const getStockDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: movements }] = await Promise.all([
      supabase
        .from("stock_items")
        .select(
          "id, sku, min_stock, optimal_stock, track_stock, sale_price, purchase_price, avg_purchase_price",
        )
        .eq("company_id", data.company_id),
      supabase
        .from("stock_levels")
        .select("stock_item_id, quantity")
        .eq("company_id", data.company_id),
      supabase
        .from("stock_movements")
        .select("id, type, quantity, total_value, stock_item_id, created_at, note")
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const levelMap = new Map<string, number>();
    (levels ?? []).forEach((l) =>
      levelMap.set(l.stock_item_id, (levelMap.get(l.stock_item_id) ?? 0) + Number(l.quantity)),
    );
    // Sklad sa oceňuje priemernou obstarávacou cenou, nie poslednou nákupnou —
    // posledná cena hovorí o jednej dodávke, nie o tom, čo na sklade leží.
    // Pri zásobe, ktorá ešte nemá vypočítaný priemer, sa použije nákupná cena.
    const totalValue = (items ?? []).reduce(
      (sum, it) =>
        sum +
        (levelMap.get(it.id) ?? 0) *
          (Number(it.avg_purchase_price ?? 0) || Number(it.purchase_price ?? 0)),
      0,
    );
    const belowMin = (items ?? []).filter(
      (it) => it.track_stock && (levelMap.get(it.id) ?? 0) < Number(it.min_stock ?? 0),
    );
    return {
      total_items: (items ?? []).length,
      total_value: totalValue,
      below_min_count: belowMin.length,
      below_min_items: belowMin.slice(0, 10).map((it) => ({
        id: it.id,
        sku: it.sku,
        min: Number(it.min_stock),
        current: levelMap.get(it.id) ?? 0,
      })),
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
  .validator((d: unknown) => CompleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: count, error: cErr } = await supabase
      .from("inventory_counts")
      .select("*")
      .eq("id", data.inventory_count_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (cErr || !count) throw new Error("Inventúra nenájdená.");
    if (count.status !== "open") throw new Error("Inventúra už nie je otvorená.");
    const { data: items } = await supabase
      .from("inventory_count_items")
      .select("*")
      .eq("inventory_count_id", data.inventory_count_id);

    // Rozdiel sa oceňuje váženou nákupnou cenou zásoby (tak to robí Pohoda).
    // Bez ocenenia by manko malo nulovú hodnotu a z inventúry by sa nedalo
    // zistiť, o koľko peňazí firma prišla.
    const ids = [...new Set((items ?? []).map((it) => it.stock_item_id))];
    const cenaZasoby = new Map<string, number>();
    if (ids.length) {
      const { data: zasoby } = await supabase
        .from("stock_items")
        .select("id, avg_purchase_price, purchase_price")
        .in("id", ids);
      (zasoby ?? []).forEach((z) =>
        cenaZasoby.set(z.id, Number(z.avg_purchase_price ?? 0) || Number(z.purchase_price ?? 0)),
      );
    }

    let adjustments = 0;
    let hodnotaManka = 0;
    let hodnotaPrebytku = 0;
    for (const it of items ?? []) {
      if (it.counted_quantity == null) continue;
      const diff = Number(it.counted_quantity) - Number(it.expected_quantity);
      if (Math.abs(diff) < 1e-9) continue;
      const cena = cenaZasoby.get(it.stock_item_id) ?? 0;
      const hodnota = diff * cena;
      await supabase.from("stock_movements").insert({
        company_id: data.company_id,
        warehouse_id: count.warehouse_id,
        stock_item_id: it.stock_item_id,
        type: "inventura",
        quantity: diff,
        unit_price: cena,
        unit_cost: cena,
        total_value: hodnota,
        reference_type: "inventory_count",
        reference_id: count.id,
        note: `Inventúra ${count.id.slice(0, 8)} — ${diff > 0 ? "prebytok" : "manko"}`,
        created_by: userId,
      });
      await supabase.from("inventory_count_items").update({ difference: diff }).eq("id", it.id);
      if (diff > 0) hodnotaPrebytku += hodnota;
      else hodnotaManka += Math.abs(hodnota);
      adjustments++;
    }
    await supabase
      .from("inventory_counts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", count.id);
    await supabase.from("stock_audit_logs").insert({
      company_id: data.company_id,
      user_id: userId,
      action: "inventory_complete",
      entity_type: "inventory_count",
      entity_id: count.id,
      metadata: { adjustments, manko: hodnotaManka, prebytok: hodnotaPrebytku },
    });
    // Pohoda oddeľuje prebytky a manká do dvoch dokladov; tu ostáva jeden pohyb
    // na položku, ale hodnoty sa vracajú oddelene, nech je vidieť oboje.
    return {
      ok: true,
      adjustments,
      manko: Math.round(hodnotaManka * 100) / 100,
      prebytok: Math.round(hodnotaPrebytku * 100) / 100,
    };
  });

// Start an inventory: create the count + snapshot expected quantities
const StartInput = z.object({
  company_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
});
export const startInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existingOpen } = await supabase
      .from("inventory_counts")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("warehouse_id", data.warehouse_id)
      .eq("status", "open")
      .maybeSingle();
    if (existingOpen) return { id: existingOpen.id, resumed: true };
    const { data: count, error } = await supabase
      .from("inventory_counts")
      .insert({
        company_id: data.company_id,
        warehouse_id: data.warehouse_id,
        status: "open",
        created_by: userId,
      })
      .select()
      .single();
    if (error || !count) throw new Error(error?.message ?? "Nepodarilo sa vytvoriť inventúru.");
    const { data: items } = await supabase
      .from("stock_items")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("track_stock", true);
    const { data: levels } = await supabase
      .from("stock_levels")
      .select("stock_item_id, quantity")
      .eq("warehouse_id", data.warehouse_id);
    const levelMap = new Map<string, number>();
    (levels ?? []).forEach((l) => levelMap.set(l.stock_item_id, Number(l.quantity)));
    const rows = (items ?? []).map((it) => ({
      inventory_count_id: count.id,
      stock_item_id: it.id,
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
  .validator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("stock_items")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("product_id", data.product_id)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: created, error } = await supabase
      .from("stock_items")
      .insert({
        company_id: data.company_id,
        product_id: product.id,
        sku: product.code ?? null,
        sale_price: product.unit_price ?? 0,
        vat_rate: product.vat_rate ?? 23,
        unit: product.unit ?? "ks",
        track_stock: true,
      })
      .select()
      .single();
    if (error || !created)
      throw new Error(error?.message ?? "Nepodarilo sa vytvoriť skladovú položku.");
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
  .validator((d: unknown) => TrackInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("stock_items")
      .select("id, track_stock")
      .eq("company_id", data.company_id)
      .eq("product_id", data.product_id)
      .maybeSingle();
    if (existing) {
      if (existing.track_stock !== data.track_stock) {
        await supabase
          .from("stock_items")
          .update({ track_stock: data.track_stock })
          .eq("id", existing.id);
      }
      return { id: existing.id, created: false };
    }
    if (!data.track_stock) return { id: null, created: false };
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: created, error } = await supabase
      .from("stock_items")
      .insert({
        company_id: data.company_id,
        product_id: product.id,
        sku: product.code ?? null,
        sale_price: product.unit_price ?? 0,
        vat_rate: product.vat_rate ?? 23,
        unit: product.unit ?? "ks",
        track_stock: true,
      })
      .select()
      .single();
    if (error || !created)
      throw new Error(error?.message ?? "Nepodarilo sa vytvoriť skladovú položku.");
    return { id: created.id, created: true };
  });

// --- v1.5 additions -------------------------------------------------------

const ProductDetailInput = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
});
export const getProductStockDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ProductDetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", data.product_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!product) throw new Error("Produkt nenájdený.");
    const { data: stockItem } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("product_id", data.product_id)
      .maybeSingle();
    let levels: any[] = [];
    let movements: any[] = [];
    let invoiceRefs: any[] = [];
    let totalQuantity = 0;
    let reservedQuantity = 0;
    let category: any = null;
    let supplier: any = null;
    let photoSignedUrl: string | null = null;
    if (stockItem) {
      const { data: lvl } = await supabase
        .from("stock_levels")
        .select("warehouse_id, quantity, reserved_quantity, warehouses(name)")
        .eq("stock_item_id", stockItem.id);
      levels = lvl ?? [];
      totalQuantity = levels.reduce((s, l) => s + Number(l.quantity ?? 0), 0);
      reservedQuantity = levels.reduce((s, l) => s + Number(l.reserved_quantity ?? 0), 0);
      const { data: mv } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("stock_item_id", stockItem.id)
        .order("created_at", { ascending: false })
        .limit(20);
      movements = mv ?? [];
      const invIds = Array.from(
        new Set(
          movements
            .filter((m) => m.reference_type === "invoice" && m.reference_id)
            .map((m) => m.reference_id),
        ),
      );
      if (invIds.length) {
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, issue_date, total")
          .in("id", invIds);
        invoiceRefs = invs ?? [];
      }
      if (stockItem.category_id) {
        const { data: c } = await supabase
          .from("stock_categories")
          .select("id, name, color")
          .eq("id", stockItem.category_id)
          .maybeSingle();
        category = c;
      }
      if (stockItem.supplier_id) {
        const { data: s } = await supabase
          .from("customers")
          .select("id, name, ico")
          .eq("id", stockItem.supplier_id)
          .maybeSingle();
        supplier = s;
      }
      if (stockItem.photo_url && stockItem.photo_url.startsWith(`${data.company_id}/`)) {
        const { data: signed } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(stockItem.photo_url, 60 * 60);
        photoSignedUrl = signed?.signedUrl ?? null;
      }
    }
    return {
      product,
      stockItem,
      category,
      supplier,
      photoSignedUrl,
      levels,
      movements,
      invoiceRefs,
      totalQuantity,
      reservedQuantity,
    };
  });

const MovementDetailInput = z.object({
  company_id: z.string().uuid(),
  movement_id: z.string().uuid(),
});
export const getMovementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => MovementDetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: m } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("id", data.movement_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!m) throw new Error("Pohyb nenájdený.");
    const [{ data: si }, { data: wh }] = await Promise.all([
      supabase
        .from("stock_items")
        .select("id, sku, product_id")
        .eq("id", m.stock_item_id)
        .maybeSingle(),
      supabase.from("warehouses").select("id, name").eq("id", m.warehouse_id).maybeSingle(),
    ]);
    let product: any = null;
    if (si?.product_id) {
      const { data: p } = await supabase
        .from("products")
        .select("id, name")
        .eq("id", si.product_id)
        .maybeSingle();
      product = p;
    }
    let invoice: any = null;
    if (m.reference_type === "invoice" && m.reference_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number, status")
        .eq("id", m.reference_id)
        .maybeSingle();
      invoice = inv;
    }
    let createdByEmail: string | null = null;
    if (m.created_by) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", m.created_by)
        .maybeSingle();
      createdByEmail = prof?.full_name ?? prof?.email ?? null;
    }
    return { movement: m, stockItem: si, warehouse: wh, product, invoice, createdByEmail };
  });

export const getStockValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: warehouses }, { data: products }] =
      await Promise.all([
        supabase
          .from("stock_items")
          .select("id, sku, product_id, purchase_price, avg_purchase_price, sale_price, unit")
          .eq("company_id", data.company_id),
        supabase
          .from("stock_levels")
          .select("warehouse_id, stock_item_id, quantity")
          .eq("company_id", data.company_id),
        supabase.from("warehouses").select("id, name").eq("company_id", data.company_id),
        supabase
          .from("products")
          .select("id, name")
          .eq("company_id", data.company_id)
          .is("deleted_at", null),
      ]);
    const itemMap = new Map<string, any>();
    (items ?? []).forEach((i) => itemMap.set(i.id, i));
    const productMap = new Map<string, any>();
    (products ?? []).forEach((p) => productMap.set(p.id, p));
    const whMap = new Map<string, any>();
    (warehouses ?? []).forEach((w) => whMap.set(w.id, w));

    let totalPurchase = 0,
      totalSale = 0;
    const byWarehouse = new Map<
      string,
      { id: string; name: string; purchase: number; sale: number; qty: number }
    >();
    const byProduct = new Map<
      string,
      {
        stock_item_id: string;
        sku: string | null;
        name: string;
        qty: number;
        purchase: number;
        sale: number;
      }
    >();

    for (const l of levels ?? []) {
      const it = itemMap.get(l.stock_item_id);
      if (!it) continue;
      const qty = Number(l.quantity ?? 0);
      // Ocenenie ide váženou nákupnou cenou z príjemok; statická nákupná cena
      // na karte býva prázdna a hodnota skladu potom vyšla nula.
      const pVal = qty * (Number(it.avg_purchase_price ?? 0) || Number(it.purchase_price ?? 0));
      const sVal = qty * Number(it.sale_price ?? 0);
      totalPurchase += pVal;
      totalSale += sVal;
      const wh = whMap.get(l.warehouse_id);
      const wKey = l.warehouse_id;
      const wEntry = byWarehouse.get(wKey) ?? {
        id: wKey,
        name: wh?.name ?? "—",
        purchase: 0,
        sale: 0,
        qty: 0,
      };
      wEntry.purchase += pVal;
      wEntry.sale += sVal;
      wEntry.qty += qty;
      byWarehouse.set(wKey, wEntry);
      const pEntry = byProduct.get(it.id) ?? {
        stock_item_id: it.id,
        sku: it.sku,
        name: (it.product_id ? productMap.get(it.product_id)?.name : null) ?? it.sku ?? "—",
        qty: 0,
        purchase: 0,
        sale: 0,
      };
      pEntry.qty += qty;
      pEntry.purchase += pVal;
      pEntry.sale += sVal;
      byProduct.set(it.id, pEntry);
    }
    return {
      total_purchase: totalPurchase,
      total_sale: totalSale,
      by_warehouse: Array.from(byWarehouse.values()).sort((a, b) => b.purchase - a.purchase),
      by_product: Array.from(byProduct.values()).sort((a, b) => b.purchase - a.purchase),
    };
  });

export const getLowStockReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: items }, { data: levels }, { data: warehouses }, { data: products }] =
      await Promise.all([
        supabase
          .from("stock_items")
          .select("id, sku, product_id, min_stock, optimal_stock, track_stock, unit")
          .eq("company_id", data.company_id)
          .eq("track_stock", true),
        supabase
          .from("stock_levels")
          .select("warehouse_id, stock_item_id, quantity, reserved_quantity")
          .eq("company_id", data.company_id),
        supabase.from("warehouses").select("id, name").eq("company_id", data.company_id),
        supabase
          .from("products")
          .select("id, name")
          .eq("company_id", data.company_id)
          .is("deleted_at", null),
      ]);
    const whMap = new Map((warehouses ?? []).map((w) => [w.id, w] as const));
    const productMap = new Map((products ?? []).map((p) => [p.id, p] as const));
    const totalByItem = new Map<string, number>();
    (levels ?? []).forEach((l) =>
      totalByItem.set(
        l.stock_item_id,
        (totalByItem.get(l.stock_item_id) ?? 0) + Number(l.quantity),
      ),
    );
    const rezervovaneByItem = new Map<string, number>();
    (levels ?? []).forEach((l) =>
      rezervovaneByItem.set(
        l.stock_item_id,
        (rezervovaneByItem.get(l.stock_item_id) ?? 0) + Number(l.reserved_quantity ?? 0),
      ),
    );

    // Tovar objednaný u dodávateľa a ešte neprijatý. Bez neho by návrh pýtal
    // znovu to, čo je už na ceste.
    const { data: otvoreneObjednavky } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("company_id", data.company_id)
      .in("status", ["sent", "partially_received"]);
    let naCeste = new Map<string, number>();
    if (otvoreneObjednavky?.length) {
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("stock_item_id, quantity, received_quantity, purchase_order_id")
        .in(
          "purchase_order_id",
          otvoreneObjednavky.map((o) => o.id),
        );
      const stavPodlaId = new Map(otvoreneObjednavky.map((o) => [o.id, o.status] as const));
      naCeste = objednaneNaCeste(
        (poItems ?? []).map((it) => ({
          stock_item_id: it.stock_item_id,
          quantity: Number(it.quantity ?? 0),
          received_quantity: Number(it.received_quantity ?? 0),
          stav: (stavPodlaId.get(it.purchase_order_id) ?? "sent") as any,
        })),
      );
    }

    const navrhy = navrhniObjednavky(
      (items ?? []).map((it) => ({
        stock_item_id: it.id,
        sku: it.sku,
        nazov: (it.product_id ? productMap.get(it.product_id)?.name : null) ?? it.sku ?? "—",
        unit: it.unit,
        on_hand: totalByItem.get(it.id) ?? 0,
        reserved: rezervovaneByItem.get(it.id) ?? 0,
        incoming: naCeste.get(it.id) ?? 0,
        min_stock: Number(it.min_stock ?? 0),
        optimal_stock: Number(it.optimal_stock ?? 0),
      })),
    );

    const productById = new Map((items ?? []).map((it) => [it.id, it.product_id] as const));
    const rows = navrhy.map((n) => ({
      stock_item_id: n.stock_item_id,
      product_id: productById.get(n.stock_item_id) ?? null,
      sku: n.sku,
      unit: n.unit,
      name: n.nazov,
      current: n.on_hand,
      reserved: n.reserved,
      incoming: n.incoming,
      available: n.available,
      min: n.min_stock,
      optimal: n.optimal_stock,
      target: n.cielovy_stav,
      /** Koľko objednať, aby zásoba dosiahla cieľový stav. */
      order_qty: n.objednat,
      shortage: Math.max(0, n.min_stock - n.available),
      per_warehouse: (levels ?? [])
        .filter((l) => l.stock_item_id === n.stock_item_id)
        .map((l) => ({
          warehouse_id: l.warehouse_id,
          warehouse_name: whMap.get(l.warehouse_id)?.name ?? "—",
          quantity: Number(l.quantity),
        })),
    }));
    return { rows };
  });

const ImportRow = z.object({
  sku: z.string().trim().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(255),
  barcode: z.string().trim().max(64).optional().nullable(),
  unit: z.string().trim().max(16).optional().default("ks"),
  purchase_price: z.coerce.number().nonnegative().optional().default(0),
  sale_price: z.coerce.number().nonnegative().optional().default(0),
  vat_rate: z.coerce.number().min(0).max(100).optional().default(23),
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
  .validator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cid = data.company_id;
    const { data: warehouses } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("company_id", cid);
    const whByName = new Map<string, string>(
      (warehouses ?? []).map((w) => [w.name.toLowerCase(), w.id]),
    );
    let defaultWh = (warehouses ?? []).find((w) => w.name) ?? null;
    if (!defaultWh) {
      const { data: created } = await supabase
        .from("warehouses")
        .insert({ company_id: cid, name: "Hlavný sklad", active: true })
        .select()
        .single();
      if (created) {
        defaultWh = created;
        whByName.set(created.name.toLowerCase(), created.id);
      }
    }
    let createdProducts = 0,
      updatedProducts = 0,
      createdItems = 0,
      updatedItems = 0,
      initialMovements = 0,
      errors = 0;
    const errorList: { row: number; reason: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        // Find existing product by SKU on stock_items, or by code/name on products.
        let product: any = null;
        if (r.sku) {
          const { data: si } = await supabase
            .from("stock_items")
            .select("product_id")
            .eq("company_id", cid)
            .eq("sku", r.sku)
            .maybeSingle();
          if (si?.product_id) {
            const { data: p } = await supabase
              .from("products")
              .select("*")
              .eq("id", si.product_id)
              .maybeSingle();
            product = p;
          }
        }
        if (!product && r.sku) {
          const { data: p } = await supabase
            .from("products")
            .select("*")
            .eq("company_id", cid)
            .eq("code", r.sku)
            .is("deleted_at", null)
            .maybeSingle();
          product = p;
        }
        if (!product) {
          const { data: p } = await supabase
            .from("products")
            .select("*")
            .eq("company_id", cid)
            .ilike("name", r.name)
            .is("deleted_at", null)
            .maybeSingle();
          product = p;
        }
        if (product) {
          await supabase
            .from("products")
            .update({
              name: r.name,
              code: r.sku ?? product.code,
              unit: r.unit ?? product.unit,
              unit_price: r.sale_price ?? product.unit_price,
              vat_rate: r.vat_rate ?? product.vat_rate,
            })
            .eq("id", product.id);
          updatedProducts++;
        } else {
          const { data: np } = await supabase
            .from("products")
            .insert({
              company_id: cid,
              name: r.name,
              code: r.sku ?? null,
              unit: r.unit ?? "ks",
              unit_price: r.sale_price ?? 0,
              vat_rate: r.vat_rate ?? 23,
              active: true,
            })
            .select()
            .single();
          product = np;
          createdProducts++;
        }
        // stock_item
        let { data: stockItem } = await supabase
          .from("stock_items")
          .select("*")
          .eq("company_id", cid)
          .eq("product_id", product.id)
          .maybeSingle();
        if (stockItem) {
          await supabase
            .from("stock_items")
            .update({
              sku: r.sku ?? stockItem.sku,
              barcode: r.barcode ?? stockItem.barcode,
              purchase_price: r.purchase_price ?? stockItem.purchase_price,
              sale_price: r.sale_price ?? stockItem.sale_price,
              vat_rate: r.vat_rate ?? stockItem.vat_rate,
              unit: r.unit ?? stockItem.unit,
              min_stock: r.min_stock ?? stockItem.min_stock,
            })
            .eq("id", stockItem.id);
          updatedItems++;
        } else {
          const { data: ni } = await supabase
            .from("stock_items")
            .insert({
              company_id: cid,
              product_id: product.id,
              sku: r.sku ?? null,
              barcode: r.barcode ?? null,
              purchase_price: r.purchase_price ?? 0,
              sale_price: r.sale_price ?? 0,
              vat_rate: r.vat_rate ?? 23,
              unit: r.unit ?? "ks",
              min_stock: r.min_stock ?? 0,
              track_stock: true,
            })
            .select()
            .single();
          stockItem = ni;
          createdItems++;
        }
        if (r.initial_stock && Number(r.initial_stock) !== 0 && stockItem) {
          let whId: string | null = null;
          if (r.warehouse_name && whByName.has(r.warehouse_name.toLowerCase()))
            whId = whByName.get(r.warehouse_name.toLowerCase())!;
          else if (defaultWh) whId = defaultWh.id;
          if (whId) {
            await supabase.from("stock_movements").insert({
              company_id: cid,
              warehouse_id: whId,
              stock_item_id: stockItem.id,
              type: Number(r.initial_stock) > 0 ? "prijem" : "oprava",
              quantity: r.initial_stock,
              unit_price: r.purchase_price ?? 0,
              total_value: Math.abs(Number(r.initial_stock)) * Number(r.purchase_price ?? 0),
              note: "CSV import - počiatočný stav",
              created_by: userId,
            });
            initialMovements++;
          }
        }
      } catch (e: any) {
        errors++;
        errorList.push({ row: i + 1, reason: e?.message ?? "unknown" });
      }
    }
    await supabase.from("stock_audit_logs").insert({
      company_id: cid,
      user_id: userId,
      action: "csv_import",
      entity_type: "stock_items",
      metadata: {
        rows: data.rows.length,
        createdProducts,
        updatedProducts,
        createdItems,
        updatedItems,
        initialMovements,
        errors,
      },
    });
    return {
      createdProducts,
      updatedProducts,
      createdItems,
      updatedItems,
      initialMovements,
      errors,
      errorList,
    };
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
  .validator((d: unknown) => AuditInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("stock_audit_logs").insert({
      company_id: data.company_id,
      user_id: context.userId,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id ?? null,
      metadata: data.metadata ?? {},
    });
    return { ok: true };
  });

const RoleInput = z.object({ company_id: z.string().uuid() });
export const getMyStockRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.company_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { role: row?.role ?? null };
  });
// --- v1.6 Phase 2: stock item edit / categories / suppliers ----------------

export const listStockCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("stock_categories")
      .select("id, name, color, note")
      .eq("company_id", data.company_id)
      .order("name", { ascending: true });
    return rows ?? [];
  });

const CreateCategoryInput = z.object({
  company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(20).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export const createStockCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("stock_categories")
      .insert({
        company_id: data.company_id,
        name: data.name,
        color: data.color ?? null,
        note: data.note ?? null,
      })
      .select("id, name, color, note")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const DeleteCategoryInput = z.object({
  company_id: z.string().uuid(),
  category_id: z.string().uuid(),
});
export const deleteStockCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => DeleteCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stock_categories")
      .delete()
      .eq("id", data.category_id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("customers")
      .select("id, name, ico")
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500);
    return rows ?? [];
  });

const UpdateStockProductInput = z.object({
  company_id: z.string().uuid(),
  product_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  name_en: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  code: z.string().trim().max(64).optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  barcode: z.string().trim().max(64).optional().nullable(),
  unit: z.string().trim().min(1).max(16).default("ks"),
  vat_rate: z.coerce.number().min(0).max(100).default(23),
  sale_price: z.coerce.number().nonnegative().default(0),
  purchase_price: z.coerce.number().nonnegative().default(0),
  min_stock: z.coerce.number().nonnegative().default(0),
  optimal_stock: z.coerce.number().nonnegative().default(0),
  track_stock: z.boolean().default(true),
  category_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(120).optional().nullable(),
  photo_url: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
});
export const updateStockProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateStockProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { error: pErr } = await supabase
      .from("products")
      .update({
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        unit: data.unit,
        unit_price: data.sale_price,
        vat_rate: data.vat_rate,
        active: data.active,
      })
      .eq("id", data.product_id)
      .eq("company_id", data.company_id);
    if (pErr) throw new Error(pErr.message);

    const { data: existing } = await supabase
      .from("stock_items")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("product_id", data.product_id)
      .maybeSingle();

    const payload = {
      company_id: data.company_id,
      product_id: data.product_id,
      sku: data.sku || null,
      barcode: data.barcode || null,
      purchase_price: data.purchase_price,
      sale_price: data.sale_price,
      vat_rate: data.vat_rate,
      unit: data.unit,
      min_stock: data.min_stock,
      optimal_stock: data.optimal_stock,
      track_stock: data.track_stock,
      category_id: data.category_id ?? null,
      supplier_id: data.supplier_id ?? null,
      location: data.location || null,
      photo_url: data.photo_url || null,
      name_en: data.name_en || null,
      description: data.description || null,
    };

    if (existing) {
      const { error } = await supabase.from("stock_items").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, stock_item_id: existing.id };
    }
    const { data: created, error } = await supabase
      .from("stock_items")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, stock_item_id: created.id };
  });

const PhotoUrlInput = z.object({
  company_id: z.string().uuid(),
  storage_path: z.string().trim().min(1),
});
export const getProductPhotoSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PhotoUrlInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!data.storage_path.startsWith(`${data.company_id}/`)) {
      throw new Error("Neplatná cesta k fotke.");
    }
    const { data: signed, error } = await context.supabase.storage
      .from("product-photos")
      .createSignedUrl(data.storage_path, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Nepodarilo sa vytvoriť URL fotky.");
    return { url: signed.signedUrl };
  });

// ============= PHASE 3: STOCK TRANSFERS =============

const TransferItemInput = z.object({
  source_stock_item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative().default(0),
});

const CreateTransferInput = z.object({
  company_id: z.string().uuid(),
  warehouse_from_id: z.string().uuid(),
  warehouse_to_id: z.string().uuid().optional().nullable(),
  target_company_id: z.string().uuid().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  items: z.array(TransferItemInput).min(1),
});

export const listUserCompaniesForTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ exclude_company_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("company_users")
      .select("company_id, companies:company_id(id, name)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const list = (rows ?? [])
      .map((r: any) => r.companies)
      .filter((c: any) => c && c.id !== data.exclude_company_id);
    return list as { id: string; name: string }[];
  });

export const listWarehousesForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: whs, error } = await context.supabase
      .from("warehouses")
      .select("id, name, active")
      .eq("company_id", data.company_id)
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return whs ?? [];
  });

export const listTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("stock_transfers")
      .select(
        "id, status, note, created_at, completed_at, warehouse_from_id, warehouse_to_id, company_id, target_company_id",
      )
      .or(`company_id.eq.${data.company_id},target_company_id.eq.${data.company_id}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTransferDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: transfer, error } = await supabase
      .from("stock_transfers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: items, error: itemsErr } = await supabase
      .from("stock_transfer_items")
      .select("id, source_stock_item_id, target_stock_item_id, quantity, unit_price")
      .eq("transfer_id", data.id);
    if (itemsErr) throw new Error(itemsErr.message);
    const sourceIds = (items ?? []).map((i: any) => i.source_stock_item_id);
    const targetIds = (items ?? []).map((i: any) => i.target_stock_item_id).filter(Boolean);
    const allIds = Array.from(new Set([...sourceIds, ...targetIds]));
    const [{ data: stockItems }, { data: warehouses }, { data: companies }] = await Promise.all([
      allIds.length
        ? supabase
            .from("stock_items")
            .select("id, sku, barcode, product_id, company_id")
            .in("id", allIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("warehouses").select("id, name, company_id"),
      supabase.from("companies").select("id, name"),
    ]);
    const productIds = (stockItems ?? []).map((s: any) => s.product_id).filter(Boolean);
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, name").in("id", productIds)
      : { data: [] as any[] };
    return {
      transfer,
      items: items ?? [],
      stockItems: stockItems ?? [],
      warehouses: warehouses ?? [],
      companies: companies ?? [],
      products: products ?? [],
    };
  });

async function matchOrCreateTargetStockItem(
  supabase: any,
  sourceItem: any,
  targetCompanyId: string,
  userId: string,
) {
  // Try SKU
  if (sourceItem.sku) {
    const { data } = await supabase
      .from("stock_items")
      .select("id")
      .eq("company_id", targetCompanyId)
      .eq("sku", sourceItem.sku)
      .maybeSingle();
    if (data) return data.id as string;
  }
  // Try barcode
  if (sourceItem.barcode) {
    const { data } = await supabase
      .from("stock_items")
      .select("id")
      .eq("company_id", targetCompanyId)
      .eq("barcode", sourceItem.barcode)
      .maybeSingle();
    if (data) return data.id as string;
  }
  // Create new stock_item + product in target company
  const sourceProduct = sourceItem.product_id
    ? (
        await supabase
          .from("products")
          .select("name, unit, unit_price, vat_rate")
          .eq("id", sourceItem.product_id)
          .maybeSingle()
      ).data
    : null;
  const productName = sourceProduct?.name ?? (sourceItem.sku || "Presunutá položka");
  const { data: newProduct, error: pErr } = await supabase
    .from("products")
    .insert({
      company_id: targetCompanyId,
      name: productName,
      code: sourceItem.sku ?? null,
      unit: sourceProduct?.unit ?? sourceItem.unit ?? "ks",
      unit_price: sourceProduct?.unit_price ?? sourceItem.sale_price ?? 0,
      vat_rate: sourceProduct?.vat_rate ?? sourceItem.vat_rate ?? 23,
    })
    .select("id")
    .single();
  if (pErr || !newProduct)
    throw new Error(pErr?.message ?? "Nepodarilo sa vytvoriť produkt v cieľovej firme.");
  const { data: newItem, error: siErr } = await supabase
    .from("stock_items")
    .insert({
      company_id: targetCompanyId,
      product_id: newProduct.id,
      sku: sourceItem.sku ?? null,
      barcode: sourceItem.barcode ?? null,
      sale_price: sourceItem.sale_price ?? 0,
      purchase_price: sourceItem.purchase_price ?? 0,
      vat_rate: sourceItem.vat_rate ?? 23,
      unit: sourceItem.unit ?? "ks",
      track_stock: true,
      min_stock: 0,
    })
    .select("id")
    .single();
  if (siErr || !newItem)
    throw new Error(siErr?.message ?? "Nepodarilo sa vytvoriť skladovú položku v cieľovej firme.");
  return newItem.id as string;
}

export const previewTransferMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        source_company_id: z.string().uuid(),
        target_company_id: z.string().uuid(),
        source_stock_item_ids: z.array(z.string().uuid()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sourceItems, error } = await supabase
      .from("stock_items")
      .select("id, sku, barcode, product_id")
      .in("id", data.source_stock_item_ids)
      .eq("company_id", data.source_company_id);
    if (error) throw new Error(error.message);
    const skus = (sourceItems ?? []).map((i: any) => i.sku).filter(Boolean);
    const barcodes = (sourceItems ?? []).map((i: any) => i.barcode).filter(Boolean);
    const [{ data: bySku }, { data: byBarcode }] = await Promise.all([
      skus.length
        ? supabase
            .from("stock_items")
            .select("id, sku")
            .eq("company_id", data.target_company_id)
            .in("sku", skus)
        : Promise.resolve({ data: [] as any[] }),
      barcodes.length
        ? supabase
            .from("stock_items")
            .select("id, barcode")
            .eq("company_id", data.target_company_id)
            .in("barcode", barcodes)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const skuMap: Record<string, string> = {};
    (bySku ?? []).forEach((r: any) => {
      if (r.sku) skuMap[r.sku] = r.id;
    });
    const barcodeMap: Record<string, string> = {};
    (byBarcode ?? []).forEach((r: any) => {
      if (r.barcode) barcodeMap[r.barcode] = r.id;
    });
    return (sourceItems ?? []).map((i: any) => ({
      source_id: i.id,
      matched_target_id: (i.sku && skuMap[i.sku]) || (i.barcode && barcodeMap[i.barcode]) || null,
      matched_by:
        i.sku && skuMap[i.sku] ? "sku" : i.barcode && barcodeMap[i.barcode] ? "barcode" : null,
    }));
  });

export const createTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateTransferInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.warehouse_to_id && !data.target_company_id) {
      throw new Error("Zadajte cieľový sklad alebo cieľovú firmu.");
    }
    if (data.target_company_id && data.target_company_id === data.company_id) {
      throw new Error("Cieľová firma sa nemôže rovnať zdrojovej.");
    }
    // Rozbaľovačka v UI ponúka len firmy používateľa, ale server sa na to
    // spoliehať nesmie — funkcia sa dá zavolať priamo s ľubovoľným UUID.
    if (data.target_company_id) {
      await assertMember(supabase, userId, data.target_company_id);
    }
    // Cieľový sklad musí patriť cieľovej firme. Bez tejto kontroly by sa dal
    // príjem zaúčtovať do skladu úplne tretej firmy.
    if (data.warehouse_to_id) {
      const { data: wh } = await supabase
        .from("warehouses")
        .select("id")
        .eq("id", data.warehouse_to_id)
        .eq("company_id", data.target_company_id ?? data.company_id)
        .maybeSingle();
      if (!wh) throw new Error("Cieľový sklad nepatrí cieľovej firme.");
    }
    const { data: transfer, error } = await supabase
      .from("stock_transfers")
      .insert({
        company_id: data.company_id,
        warehouse_from_id: data.warehouse_from_id,
        warehouse_to_id: data.warehouse_to_id ?? null,
        target_company_id: data.target_company_id ?? null,
        note: data.note ?? null,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !transfer) throw new Error(error?.message ?? "Presun sa nepodarilo vytvoriť.");
    const rows = data.items.map((it) => ({
      transfer_id: transfer.id,
      source_stock_item_id: it.source_stock_item_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
    }));
    const { error: iErr } = await supabase.from("stock_transfer_items").insert(rows);
    if (iErr) throw new Error(iErr.message);
    return { id: transfer.id };
  });

export const completeTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: transfer, error } = await supabase
      .from("stock_transfers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !transfer) throw new Error(error?.message ?? "Presun neexistuje.");
    if (transfer.status !== "draft") throw new Error("Presun je už dokončený alebo zrušený.");

    const { data: items, error: iErr } = await supabase
      .from("stock_transfer_items")
      .select("*")
      .eq("transfer_id", data.id);
    if (iErr) throw new Error(iErr.message);
    if (!items || items.length === 0) throw new Error("Presun neobsahuje žiadne položky.");

    const targetCompanyId = transfer.target_company_id ?? transfer.company_id;
    const targetWarehouseId = transfer.warehouse_to_id;
    if (!targetWarehouseId) throw new Error("Chýba cieľový sklad.");
    // Znovu, nielen pri vytváraní: presun je uložený a dokončiť ho môže niekto
    // iný alebo neskôr, keď už členstvo v cieľovej firme nemusí platiť.
    if (targetCompanyId !== transfer.company_id) {
      await assertMember(supabase, userId, targetCompanyId);
    }

    // Load source items
    const sourceIds = items.map((i: any) => i.source_stock_item_id);
    const { data: sourceStockItems } = await supabase
      .from("stock_items")
      .select("*")
      .in("id", sourceIds);
    const sourceMap: Record<string, any> = {};
    (sourceStockItems ?? []).forEach((s: any) => {
      sourceMap[s.id] = s;
    });

    // Resolve target stock items (match or create for inter-company)
    for (const it of items) {
      let targetId = it.target_stock_item_id;
      if (!targetId) {
        if (targetCompanyId === transfer.company_id) {
          targetId = it.source_stock_item_id;
        } else {
          const src = sourceMap[it.source_stock_item_id];
          if (!src) throw new Error("Zdrojová položka nenájdená.");
          targetId = await matchOrCreateTargetStockItem(supabase, src, targetCompanyId, userId);
        }
        await supabase
          .from("stock_transfer_items")
          .update({ target_stock_item_id: targetId })
          .eq("id", it.id);
      }

      // Outbound movement (source)
      const { error: outErr } = await supabase.from("stock_movements").insert({
        company_id: transfer.company_id,
        warehouse_id: transfer.warehouse_from_id,
        stock_item_id: it.source_stock_item_id,
        type: "vydaj",
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_value: it.quantity * it.unit_price,
        reference_type: "transfer",
        reference_id: transfer.id,
        reference_item_id: it.id,
        note: `Presun ${transfer.id.slice(0, 8)} — výdaj`,
        created_by: userId,
      });
      if (outErr) throw new Error(`Výdaj zlyhal: ${outErr.message}`);

      // Inbound movement (target) — may require admin if target company differs
      let inboundClient = supabase;
      if (targetCompanyId !== transfer.company_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        inboundClient = supabaseAdmin;
      }
      const { error: inErr } = await inboundClient.from("stock_movements").insert({
        company_id: targetCompanyId,
        warehouse_id: targetWarehouseId,
        stock_item_id: targetId,
        type: "prijem",
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_value: it.quantity * it.unit_price,
        reference_type: "transfer",
        reference_id: transfer.id,
        reference_item_id: it.id,
        note: `Presun ${transfer.id.slice(0, 8)} — príjem`,
        created_by: userId,
      });
      if (inErr) throw new Error(`Príjem zlyhal: ${inErr.message}`);
    }

    const { error: uErr } = await supabase
      .from("stock_transfers")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const cancelTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stock_transfers")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- v1.6 Phase 6: category update ----------------------------------------
const UpdateCategoryInput = z.object({
  company_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(20).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export const updateStockCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stock_categories")
      .update({ name: data.name, color: data.color ?? null, note: data.note ?? null })
      .eq("id", data.category_id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCategoriesWithCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: cats }, { data: items }] = await Promise.all([
      context.supabase
        .from("stock_categories")
        .select("id, name, color, note")
        .eq("company_id", data.company_id)
        .order("name"),
      context.supabase
        .from("stock_items")
        .select("category_id")
        .eq("company_id", data.company_id)
        .is("archived_at", null),
    ]);
    const counts = new Map<string, number>();
    (items ?? []).forEach((it: any) => {
      if (!it.category_id) return;
      counts.set(it.category_id, (counts.get(it.category_id) ?? 0) + 1);
    });
    return (cats ?? []).map((c: any) => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
  });

// --- v1.6 Phase 4: barcode/SKU lookup for inventory scan ------------------
const BarcodeLookupInput = z.object({
  company_id: z.string().uuid(),
  code: z.string().trim().min(1).max(64),
});
export const lookupStockItemByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => BarcodeLookupInput.parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim();
    // Try barcode then SKU on stock_items
    const { data: byBarcode } = await context.supabase
      .from("stock_items")
      .select("id, sku, barcode, product_id")
      .eq("company_id", data.company_id)
      .eq("barcode", code)
      .maybeSingle();
    if (byBarcode) return byBarcode;
    const { data: bySku } = await context.supabase
      .from("stock_items")
      .select("id, sku, barcode, product_id")
      .eq("company_id", data.company_id)
      .eq("sku", code)
      .maybeSingle();
    return bySku ?? null;
  });
