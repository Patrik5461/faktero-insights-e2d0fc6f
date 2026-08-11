import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Čítanie pre mobilnú aplikáciu — podklady do formulára a zoznam faktúr.
 *
 * Samotné vystavenie je v [faktura-vystavenie.functions.ts], lebo ho používa
 * aj rýchla faktúra na webe.
 */

const Firma = z.object({ company_id: z.string().uuid() });

/* ------------------------- Podklady pre formulár ------------------------- */

/**
 * Všetko, čo formulár potrebuje, na jednu obrátku — na mobilnej sieti je každý
 * ďalší dotaz vidieť.
 */
export const podkladyFakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [firma, odberatelia, produkty] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, ic_dph, default_currency, iban")
        .eq("id", data.company_id)
        .maybeSingle(),
      supabase
        .from("customers")
        .select(
          "id, name, email, ico, dic, ic_dph, street, city, zip, country, discount_percent, price_group_id",
        )
        .eq("company_id", data.company_id)
        .is("deleted_at", null)
        .order("name")
        .limit(1000),
      supabase
        .from("products")
        .select("id, name, unit, unit_price, vat_rate")
        .eq("company_id", data.company_id)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name")
        .limit(500),
    ]);

    if (!firma.data) throw new Error("Firma sa nenašla.");

    return {
      firma: {
        id: firma.data.id,
        name: firma.data.name,
        // Neplatiteľ DPH nesmie daň fakturovať — formulár podľa toho schová
        // sadzby a počíta s nulou.
        platcaDph: Boolean(firma.data.ic_dph),
        mena: firma.data.default_currency || "EUR",
        maIban: Boolean(firma.data.iban),
      },
      odberatelia: odberatelia.data ?? [],
      produkty: produkty.data ?? [],
    };
  });

/* ------------------------- Zoznam vystavených faktúr ------------------------- */

export const vystaveneFakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, customer_name, customer_email, total, currency, issue_date, due_date, status, type, paid_at, sent_at",
      )
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .order("invoice_number", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
