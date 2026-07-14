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

function parseDeliveryItems(text: string): DeliveryNoteItem[] {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json.results)) return json.results;
    if (json.name) return [json];
    return [];
  } catch {
    return [];
  }
}

const ParseInput = z.string().min(1);

/**
 * Extrakcia položiek dodacieho listu cez Lovable AI Gateway (gemini vision).
 */
export const aiParseDeliveryNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }): Promise<string> => {
    try {
      console.log("[delivery] gemini key exists:", !!process.env.GEMINI_API_KEY);
      const { storage_path, mime_type } = JSON.parse(data);
      console.log("[delivery] start, path:", storage_path);
      const geminiKey = process.env.GEMINI_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!geminiKey && !openaiKey) throw new Error("AI služba nie je dostupná (GEMINI_API_KEY ani OPENAI_API_KEY nie sú nastavené)");

      const prompt = `ÚLOHA: Extrahuj KOMPLETNÝ zoznam všetkých produktov/položiek z tohto dodacieho listu alebo faktúry.

POVINNÉ PRAVIDLÁ:

- Extrahuj KAŽDÝ riadok tabuľky s produktom

- NIKDY nevynechaj žiadnu položku

- Ak je 50 položiek, vráť 50 položiek

- Ignoruj: hlavičky stĺpcov, súhrny, spolu, DPH, informácie o firme, adresa, dátum

FORMÁT ODPOVEDE - VÝHRADNE JSON array, žiadny iný text:

[

  {

    "name": "presný názov produktu",

    "code": "katalógové číslo alebo null",

    "quantity": číslo,

    "unit": "ks/kg/m/l/bal",

    "unit_price": číslo alebo null,

    "total_price": číslo alebo null

  }

]

PRÍKLAD správnej odpovede pre 3 položky:

[{"name":"Produkt A","code":"001","quantity":10,"unit":"ks","unit_price":5.00,"total_price":50.00},{"name":"Produkt B","code":"002","quantity":5,"unit":"kg","unit_price":2.50,"total_price":12.50},{"name":"Produkt C","code":null,"quantity":1,"unit":"bal","unit_price":100.00,"total_price":100.00}]`;

      let content = "{}";

      // Download file from storage via admin client (bypasses RLS – auth already checked by middleware)
      console.log("[delivery] downloading from storage...");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("imports").download(storage_path);
      if (dlErr || !blob) throw new Error(`Súbor sa nepodarilo načítať zo storage: ${dlErr?.message ?? "neznáma chyba"}`);
      console.log("[delivery] download done, size:", blob.size);

      console.log("[delivery] converting to base64...");
      const arrayBuf = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");
      const mimeType = (blob.type || mime_type || "application/octet-stream").toLowerCase();

      if (geminiKey) {
        console.log("[delivery] calling gemini...");
        const { geminiVision } = await import("./gemini.server");
        content = await geminiVision(base64, mimeType, prompt);
        console.log("[delivery] gemini response:", content.slice(0, 100));
      } else {
        // Fallback: OpenAI gpt-4o vision.
        const isPdf = mimeType === "application/pdf";
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const userContent: any[] = [{ type: "text", text: "Extrahuj položky z tohto dodacieho listu." }];
        if (isPdf) {
          userContent.push({ type: "file", file: { filename: "dodaci-list.pdf", file_data: dataUrl } });
        } else {
          userContent.push({ type: "image_url", image_url: { url: dataUrl } });
        }
        const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
            max_tokens: 4000,
          }),
        });
        if (!resp.ok) {
          const body = await resp.text();
          if (resp.status === 429) throw new Error("AI limit prekročený, skúste neskôr.");
          if (resp.status === 401) throw new Error("OpenAI API kľúč je neplatný.");
          throw new Error(`OpenAI ${resp.status}: ${body.slice(0, 200)}`);
        }
        const json = await resp.json();
        content = json.choices?.[0]?.message?.content ?? "{}";
        console.log("[delivery] openai response:", content.slice(0, 100));
      }
      let parsed: any = {};
      try { parsed = JSON.parse(content); } catch {}
      const rawItems: any[] = parseDeliveryItems(content);
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
      return JSON.stringify({
        items,
        supplier: parsed.supplier ?? null,
        delivery_number: parsed.delivery_number ?? null,
        date: parsed.date ?? null,
      });
    } catch (e: any) {
      console.error("[delivery] ERROR:", e?.message ?? String(e), e?.stack ?? "");
      throw e;
    }
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
