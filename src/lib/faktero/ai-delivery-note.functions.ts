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
  /** Naskladniť aj dodací list, ktorý už raz naskladnený bol. */
  ajDuplicitu: z.boolean().optional(),
});

export const importDeliveryNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cid = data.company_id;

    // Warehouse resolution
    let whId = data.warehouse_id ?? null;
    if (!whId) {
      const { data: whs } = await supabase
        .from("warehouses")
        .select("id")
        .eq("company_id", cid)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1);
      whId = whs?.[0]?.id ?? null;
      if (!whId) {
        const { data: created } = await supabase
          .from("warehouses")
          .insert({ company_id: cid, name: "Hlavný sklad", active: true })
          .select("id")
          .single();
        whId = created?.id ?? null;
      }
    }
    if (!whId) throw new Error("Nepodarilo sa určiť sklad.");

    /*
      Ten istý dodací list naskladnený druhýkrát zdvojí zásobu aj jej hodnotu
      a nikto si to nevšimne až do inventúry. Typicky: dvojklik, návrat
      prehliadača späť alebo ten istý papier od dvoch ľudí.
    */
    if (!data.ajDuplicitu && data.delivery_number?.trim()) {
      const { normCislo, normNazov, PREDPONA_DUPLICITY } = await import("./prijate-duplicity");
      const { data: skorsie } = await supabase
        .from("stock_audit_logs")
        .select("created_at, metadata")
        .eq("company_id", cid)
        .eq("action", "ai_delivery_import")
        .order("created_at", { ascending: false })
        .limit(1000);
      const cislo = normCislo(data.delivery_number);
      const kto = normNazov(data.supplier);
      const zhoda = (skorsie ?? []).find((r: any) => {
        const m = r.metadata ?? {};
        if (normCislo(m.delivery_number) !== cislo) return false;
        const k = normNazov(m.supplier);
        return !kto || !k || k === kto;
      });
      if (zhoda) {
        const kedy = new Date((zhoda as any).created_at).toLocaleDateString("sk-SK");
        throw new Error(
          `${PREDPONA_DUPLICITY}Dodací list ${data.delivery_number}${data.supplier ? ` od ${data.supplier}` : ""} už bol naskladnený ${kedy}.\nNaskladniť ho aj tak druhýkrát?`,
        );
      }
    }

    /*
     * Sadzba DPH pre nový produkt podľa firmy — neplatiteľ nulu, platiteľ
     * základnú sadzbu svojej krajiny. Predtým tu bolo 23 % napevno, čo českej
     * firme ani neplatiteľovi nesedí.
     */
    const { data: firma } = await supabase
      .from("companies")
      .select("vat_payer, country")
      .eq("id", cid)
      .maybeSingle();
    const { krajinaDane, zakladnaSadzba } = await import("./vat-rates");
    const predvolenaSadzba =
      firma?.vat_payer === false ? 0 : zakladnaSadzba(krajinaDane(firma?.country));

    /* Hodnota do `ilike` bez zástupných znakov — „Skrutka 10%" nesmie chytiť všetko. */
    const presne = (t: string) => t.replace(/[\\%_]/g, (z) => `\\${z}`);
    const bezPredajnejCeny: string[] = [];

    let createdProducts = 0,
      updatedProducts = 0,
      createdItems = 0,
      movements = 0,
      errors = 0;
    const errorList: { row: number; reason: string }[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      try {
        let product: any = null;
        if (it.existing_product_id) {
          const { data: p } = await supabase
            .from("products")
            .select("*")
            .eq("id", it.existing_product_id)
            .eq("company_id", cid)
            .maybeSingle();
          product = p;
        }
        /* `limit(1)`: pri dvoch zhodách by `maybeSingle` vrátil chybu a vznikol
           by tretí, duplicitný produkt. */
        if (!product && it.code) {
          const { data: p } = await supabase
            .from("products")
            .select("*")
            .eq("company_id", cid)
            .eq("code", it.code)
            .is("deleted_at", null)
            .order("created_at")
            .limit(1);
          product = p?.[0] ?? null;
        }
        if (!product) {
          const { data: p } = await supabase
            .from("products")
            .select("*")
            .eq("company_id", cid)
            .ilike("name", presne(it.name))
            .is("deleted_at", null)
            .order("created_at")
            .limit(1);
          product = p?.[0] ?? null;
        }
        if (product) {
          updatedProducts++;
        } else {
          /*
           * Cena z dodacieho listu je nákupná. Predtým sa zapísala aj ako
           * predajná, takže faktúra by produkt predvyplnila za nákup — predaj
           * bez marže, ktorý si nikto nevšimne. Predajná cena ostane prázdna
           * a výsledok importu povie, ktoré produkty ju treba doplniť.
           */
          const { data: np, error: chybaProduktu } = await supabase
            .from("products")
            .insert({
              company_id: cid,
              name: it.name,
              code: it.code ?? null,
              unit: it.unit ?? "ks",
              unit_price: 0,
              vat_rate: predvolenaSadzba,
              active: true,
            })
            .select()
            .single();
          if (chybaProduktu || !np)
            throw new Error(chybaProduktu?.message ?? "Produkt sa nepodarilo založiť.");
          product = np;
          createdProducts++;
          bezPredajnejCeny.push(it.name);
        }

        /* Aktívna karta má prednosť; archivovanú tovar, ktorý práve prišiel,
           vráti do skladu — inak by príjem skončil v karte, ktorú nikto nevidí. */
        const { data: karty } = await supabase
          .from("stock_items")
          .select("*")
          .eq("company_id", cid)
          .eq("product_id", product.id)
          .order("archived_at", { ascending: false, nullsFirst: true })
          .limit(1);
        let stockItem: any = karty?.[0] ?? null;
        if (!stockItem) {
          const { data: ni, error: chybaKarty } = await supabase
            .from("stock_items")
            .insert({
              company_id: cid,
              product_id: product.id,
              sku: it.code ?? null,
              purchase_price: it.unit_price ?? 0,
              /* Predajná cena patrí produktu — rovnako ako pri ručnom založení karty. */
              sale_price: product.unit_price ?? 0,
              vat_rate: product.vat_rate ?? predvolenaSadzba,
              unit: it.unit ?? "ks",
              min_stock: 0,
              track_stock: true,
            })
            .select()
            .single();
          if (chybaKarty || !ni)
            throw new Error(chybaKarty?.message ?? "Skladovú kartu sa nepodarilo založiť.");
          stockItem = ni;
          createdItems++;
        } else {
          const zmena: Record<string, unknown> = {};
          if (it.unit_price != null) zmena.purchase_price = it.unit_price;
          if (stockItem.archived_at) zmena.archived_at = null;
          if (Object.keys(zmena).length) {
            const { error: chybaZmeny } = await supabase
              .from("stock_items")
              .update(zmena as never)
              .eq("id", stockItem.id);
            if (chybaZmeny) throw new Error(chybaZmeny.message);
          }
        }

        const unitPrice = it.unit_price ?? 0;
        const unitCost =
          typeof it.unit_price === "number" && it.unit_price > 0 ? it.unit_price : null;
        const totalValue = it.unit_price != null ? it.quantity * unitPrice : null;
        const { error: chybaPohybu } = await supabase.from("stock_movements").insert({
          company_id: cid,
          warehouse_id: whId,
          stock_item_id: stockItem.id,
          type: "prijem",
          quantity: it.quantity,
          unit_price: unitPrice,
          unit_cost: unitCost ?? undefined,
          total_value: totalValue ?? undefined,
          note: `AI dodací list${data.supplier ? " – " + data.supplier : ""}${data.delivery_number ? " (" + data.delivery_number + ")" : ""}`,
          created_by: userId,
        });
        /* Bez kontroly by sa nezapísaný pohyb započítal ako naskladnený. */
        if (chybaPohybu) throw new Error(chybaPohybu.message);
        movements++;
      } catch (e: any) {
        errors++;
        errorList.push({ row: i + 1, reason: e?.message ?? "unknown" });
      }
    }

    await supabase.from("stock_audit_logs").insert({
      company_id: cid,
      user_id: userId,
      action: "ai_delivery_import",
      entity_type: "stock_movements",
      metadata: {
        storage_path: data.storage_path ?? null,
        source_filename: data.source_filename ?? null,
        supplier: data.supplier ?? null,
        delivery_number: data.delivery_number ?? null,
        counts: { createdProducts, updatedProducts, createdItems, movements, errors },
        items: data.items.map((it) => ({
          name: it.name,
          code: it.code ?? null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price ?? null,
        })),
      },
    });

    return {
      createdProducts,
      updatedProducts,
      createdItems,
      movements,
      errors,
      errorList,
      bezPredajnejCeny,
    };
  });

/**
 * História AI importov dodacích listov.
 */
export const listDeliveryNoteImportsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
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
  .validator((d: unknown) => z.object({ storage_path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("imports")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
