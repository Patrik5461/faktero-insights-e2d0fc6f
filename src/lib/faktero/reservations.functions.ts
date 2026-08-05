import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateManual = z.object({
  company_id: z.string().uuid(),
  stock_item_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  quantity: z.number().positive(),
  expires_at: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const createManualReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateManual.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as any)
      .from("stock_reservations")
      .insert({
        company_id: data.company_id,
        stock_item_id: data.stock_item_id,
        warehouse_id: data.warehouse_id,
        quantity: data.quantity,
        source_document_type: "manual",
        source_document_id: null,
        status: "active",
        expires_at: data.expires_at ?? null,
        note: data.note ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const CancelInput = z.object({ company_id: z.string().uuid(), id: z.string().uuid() });
export const cancelReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("stock_reservations")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListForItem = z.object({ company_id: z.string().uuid(), stock_item_id: z.string().uuid() });
export const listReservationsForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListForItem.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("stock_reservations")
      .select(
        "id, quantity, warehouse_id, status, source_document_type, source_document_id, expires_at, note, created_at",
      )
      .eq("company_id", data.company_id)
      .eq("stock_item_id", data.stock_item_id)
      .in("status", ["active", "fulfilled", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const QuoteReserve = z.object({ company_id: z.string().uuid(), quote_id: z.string().uuid() });
export const createReservationsFromQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => QuoteReserve.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    // Load quote items (name / product_id) and match to stock_items by product_id or by name/SKU.
    const [{ data: items }, { data: q }] = await Promise.all([
      sb.from("quote_items").select("id, name, product_id, quantity").eq("quote_id", data.quote_id),
      sb.from("quotes").select("id, valid_until").eq("id", data.quote_id).maybeSingle(),
    ]);
    if (!items?.length) return { created: 0, skipped: 0 };

    const productIds = Array.from(
      new Set((items as any[]).map((i) => i.product_id).filter(Boolean)),
    );
    const names = Array.from(
      new Set((items as any[]).map((i) => (i.name || "").trim()).filter(Boolean)),
    );

    const [byProduct, bySku] = await Promise.all([
      productIds.length
        ? sb
            .from("stock_items")
            .select("id, product_id, sku")
            .eq("company_id", data.company_id)
            .eq("track_stock", true)
            .in("product_id", productIds)
            .is("archived_at", null)
        : Promise.resolve({ data: [] as any[] }),
      names.length
        ? sb
            .from("stock_items")
            .select("id, sku, product_id")
            .eq("company_id", data.company_id)
            .eq("track_stock", true)
            .in("sku", names)
            .is("archived_at", null)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const byProdMap = new Map<string, string>();
    (byProduct.data ?? []).forEach((r: any) => byProdMap.set(r.product_id, r.id));
    const bySkuMap = new Map<string, string>();
    (bySku.data ?? []).forEach((r: any) => bySkuMap.set(r.sku, r.id));

    // Default warehouse
    const { data: wh } = await sb
      .from("warehouses")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!wh?.id) return { created: 0, skipped: items.length, reason: "no_warehouse" };

    let created = 0,
      skipped = 0;
    for (const it of items as any[]) {
      const siId =
        (it.product_id && byProdMap.get(it.product_id)) || bySkuMap.get((it.name || "").trim());
      if (!siId || !Number(it.quantity)) {
        skipped++;
        continue;
      }
      const { error } = await sb.from("stock_reservations").insert({
        company_id: data.company_id,
        stock_item_id: siId,
        warehouse_id: wh.id,
        quantity: Number(it.quantity),
        source_document_type: "quote",
        source_document_id: data.quote_id,
        status: "active",
        expires_at: q?.valid_until ? new Date(q.valid_until).toISOString() : null,
        note: `Ponuka ${it.name ?? ""}`.trim(),
        created_by: context.userId,
      });
      if (error) {
        // Unique index will reject duplicates — skip silently
        skipped++;
      } else {
        created++;
      }
    }
    return { created, skipped };
  });

const AvailabilityInput = z.object({
  company_id: z.string().uuid(),
  stock_item_id: z.string().uuid(),
  warehouse_id: z.string().uuid().nullable().optional(),
});
export const getItemAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AvailabilityInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: lvls }, { data: res }] = await Promise.all([
      sb
        .from("stock_levels")
        .select("warehouse_id, quantity")
        .eq("company_id", data.company_id)
        .eq("stock_item_id", data.stock_item_id),
      sb
        .from("stock_reservations")
        .select("warehouse_id, quantity, source_document_type, source_document_id")
        .eq("company_id", data.company_id)
        .eq("stock_item_id", data.stock_item_id)
        .eq("status", "active"),
    ]);
    const onHand = (lvls ?? []).reduce((s: number, l: any) => s + Number(l.quantity), 0);
    const reserved = (res ?? []).reduce((s: number, l: any) => s + Number(l.quantity), 0);
    const activeDocs = (res ?? []).map((r: any) => ({
      type: r.source_document_type,
      id: r.source_document_id,
      qty: Number(r.quantity),
    }));
    return { on_hand: onHand, reserved, available: onHand - reserved, active_docs: activeDocs };
  });
