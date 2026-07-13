import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DeliveryNoteItem = {
  name: string;
  code: string | null;
  quantity: number;
  unit: string;
  unit_price: number | null;
  total_price: number | null;
};

const ParseInput = z.object({
  file_data_url: z.string().min(16), // data:image/... or data:application/pdf;base64,...
  mime_type: z.string().min(3),
});

/**
 * Extrakcia položiek dodacieho listu cez Lovable AI Gateway (gemini vision).
 */
export const aiParseDeliveryNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }): Promise<{ items: DeliveryNoteItem[]; supplier?: string | null; delivery_number?: string | null; date?: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI služba nie je dostupná (LOVABLE_API_KEY chýba)");

    const system = `Si expert na extrakciu údajov zo slovenských dodacích listov.
Extrahuj VŠETKY riadky produktov (nie súčty, dane, DPH, dopravu).
Vráť LEN čistý JSON, žiadny text okolo. Formát:
{
  "supplier": string|null,
  "delivery_number": string|null,
  "date": "YYYY-MM-DD"|null,
  "items": [
    { "name": string, "code": string|null, "quantity": number, "unit": string, "unit_price": number|null, "total_price": number|null }
  ]
}
Jednotky: ks, kg, m, l, m2, m3, bal, ... (v origináli). Ceny v EUR bez DPH ak sú uvedené. Ak niečo chýba, daj null.`;

    const isPdf = data.mime_type === "application/pdf" || data.file_data_url.startsWith("data:application/pdf");

    const userContent: any[] = [{ type: "text", text: "Extrahuj položky z tohto dodacieho listu." }];
    if (isPdf) {
      userContent.push({ type: "file", file: { filename: "dodaci-list.pdf", file_data: data.file_data_url } });
    } else {
      userContent.push({ type: "image_url", image_url: { url: data.file_data_url } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      if (resp.status === 429) throw new Error("AI limit prekročený, skúste neskôr.");
      if (resp.status === 402) throw new Error("AI kredity vyčerpané. Doplňte kredity v nastaveniach.");
      throw new Error(`AI Gateway ${resp.status}: ${body.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); }
    catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    const items: DeliveryNoteItem[] = rawItems
      .map((r) => ({
        name: String(r.name ?? "").trim(),
        code: r.code ? String(r.code).trim() : null,
        quantity: Number(r.quantity ?? 0) || 0,
        unit: String(r.unit ?? "ks").trim() || "ks",
        unit_price: r.unit_price != null ? Number(r.unit_price) : null,
        total_price: r.total_price != null ? Number(r.total_price) : null,
      }))
      .filter((r) => r.name.length > 0 && r.quantity > 0);
    return {
      items,
      supplier: parsed.supplier ?? null,
      delivery_number: parsed.delivery_number ?? null,
      date: parsed.date ?? null,
    };
  });

const ImportItem = z.object({
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1).default("ks"),
  unit_price: z.number().nullable().optional(),
  existing_product_id: z.string().uuid().nullable().optional(),
});

const ImportInput = z.object({
  company_id: z.string().uuid(),
  warehouse_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().nullable().optional(),
  source_filename: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  delivery_number: z.string().nullable().optional(),
  items: z.array(ImportItem).min(1),
});

export const importDeliveryNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cid = data.company_id;

    // Warehouse resolution
    let whId = data.warehouse_id ?? null;
    if (!whId) {
      const { data: whs } = await supabase.from("warehouses").select("id").eq("company_id", cid).eq("active", true).order("created_at", { ascending: true }).limit(1);
      whId = whs?.[0]?.id ?? null;
      if (!whId) {
        const { data: created } = await supabase.from("warehouses").insert({ company_id: cid, name: "Hlavný sklad", active: true }).select("id").single();
        whId = created?.id ?? null;
      }
    }
    if (!whId) throw new Error("Nepodarilo sa určiť sklad.");

    let createdProducts = 0, updatedProducts = 0, createdItems = 0, movements = 0, errors = 0;
    const errorList: { row: number; reason: string }[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      try {
        let product: any = null;
        if (it.existing_product_id) {
          const { data: p } = await supabase.from("products").select("*").eq("id", it.existing_product_id).eq("company_id", cid).maybeSingle();
          product = p;
        }
        if (!product && it.code) {
          const { data: p } = await supabase.from("products").select("*").eq("company_id", cid).eq("code", it.code).is("deleted_at", null).maybeSingle();
          product = p;
        }
        if (!product) {
          const { data: p } = await supabase.from("products").select("*").eq("company_id", cid).ilike("name", it.name).is("deleted_at", null).maybeSingle();
          product = p;
        }
        if (product) {
          updatedProducts++;
        } else {
          const { data: np } = await supabase.from("products").insert({
            company_id: cid, name: it.name, code: it.code ?? null, unit: it.unit ?? "ks",
            unit_price: it.unit_price ?? 0, vat_rate: 23, active: true,
          }).select().single();
          product = np;
          createdProducts++;
        }

        let { data: stockItem } = await supabase.from("stock_items").select("*").eq("company_id", cid).eq("product_id", product.id).maybeSingle();
        if (!stockItem) {
          const { data: ni } = await supabase.from("stock_items").insert({
            company_id: cid, product_id: product.id,
            sku: it.code ?? null,
            purchase_price: it.unit_price ?? 0,
            sale_price: it.unit_price ?? 0,
            vat_rate: 23, unit: it.unit ?? "ks",
            min_stock: 0, track_stock: true,
          }).select().single();
          stockItem = ni;
          createdItems++;
        } else if (it.unit_price != null) {
          await supabase.from("stock_items").update({ purchase_price: it.unit_price }).eq("id", stockItem.id);
        }
        if (!stockItem) throw new Error("stock_item not created");

        const unitPrice = it.unit_price ?? 0;
        await supabase.from("stock_movements").insert({
          company_id: cid, warehouse_id: whId, stock_item_id: stockItem.id,
          type: "prijem", quantity: it.quantity, unit_price: unitPrice,
          total_value: it.quantity * unitPrice,
          note: `AI dodací list${data.supplier ? " – " + data.supplier : ""}${data.delivery_number ? " (" + data.delivery_number + ")" : ""}`,
          created_by: userId,
        });
        movements++;
      } catch (e: any) {
        errors++;
        errorList.push({ row: i + 1, reason: e?.message ?? "unknown" });
      }
    }

    await supabase.from("stock_audit_logs").insert({
      company_id: cid, user_id: userId,
      action: "ai_delivery_import",
      entity_type: "stock_movements",
      metadata: {
        storage_path: data.storage_path ?? null,
        source_filename: data.source_filename ?? null,
        supplier: data.supplier ?? null,
        delivery_number: data.delivery_number ?? null,
        counts: { createdProducts, updatedProducts, createdItems, movements, errors },
        items: data.items.map((it) => ({ name: it.name, code: it.code ?? null, quantity: it.quantity, unit: it.unit, unit_price: it.unit_price ?? null })),
      },
    });

    return { createdProducts, updatedProducts, createdItems, movements, errors, errorList };
  });

/**
 * História AI importov dodacích listov.
 */
export const listDeliveryNoteImportsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("stock_audit_logs")
      .select("id, created_at, metadata, user_id")
      .eq("company_id", data.company_id)
      .eq("action", "ai_delivery_import")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/**
 * Signed URL pre zobrazenie pôvodného dokumentu.
 */
export const getDeliveryNoteSignedUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ storage_path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage.from("imports").createSignedUrl(data.storage_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
