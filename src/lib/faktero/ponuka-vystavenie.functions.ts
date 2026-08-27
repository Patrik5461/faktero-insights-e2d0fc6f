import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vystavenie cenovej ponuky z mobilnej aplikácie.
 *
 * Appka nemôže skladať doklad sama v telefóne: číslo ponuky vydáva server a
 * súčty sa musia rátať tou istou funkciou ako na webe, inak sa obe cesty
 * postupne rozídu. Preto sem chodí len to, čo človek naozaj zadal.
 *
 * Oproti faktúre je to jednoduchšie zámerne — ponuka nie je daňový doklad:
 * nemá splatnosť ani spôsob úhrady, nezúčtováva zálohu a nečísluje sa dopredu
 * na offline použitie. Platnosť ponuky nahrádza splatnosť.
 */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const Polozka = z.object({
  name: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(20).default("ks"),
  unit_price: z.number().nonnegative().max(10_000_000),
  vat_rate: z.number().min(0).max(100).default(23),
  product_id: z.string().uuid().nullable().optional(),
});

const NovaPonuka = z.object({
  company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  issue_date: z.string().regex(DATUM),
  valid_until: z.string().regex(DATUM).nullable().optional(),
  currency: z.string().length(3).default("EUR"),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(Polozka).min(1).max(50),
  /*
    Kľúč proti duplicite — ten istý mechanizmus ako pri faktúre. Keď sa signál
    pretrhne po zápise, ale pred doručením odpovede, appka pošle to isté znova
    a bez tohto by vznikli dve ponuky.
  */
  external_id: z.string().max(120).optional().nullable(),
});

export const vystavPonukuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NovaPonuka.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);

    if (data.external_id) {
      const { data: uz } = await supabase
        .from("quotes")
        .select("id, quote_number, total, currency, customer_id")
        .eq("company_id", data.company_id)
        .eq("external_id", data.external_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (uz) {
        return {
          id: uz.id,
          quote_number: uz.quote_number,
          total: Number(uz.total),
          currency: uz.currency,
          uz_existovala: true as const,
        };
      }
    }

    const { data: odberatel } = await supabase
      .from("customers")
      .select("id, name, email, ico, dic, ic_dph, street, city, zip, country")
      .eq("id", data.customer_id)
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!odberatel) throw new Error("Odberateľ sa nenašiel.");

    const { nextQuoteNumber, computeQuoteTotals } = await import("./quote-numbering.server");
    const sucty = computeQuoteTotals(
      data.items.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        vat_rate: i.vat_rate,
      })),
    );
    const quote_number = await nextQuoteNumber(data.company_id);

    const { data: ponuka, error } = await supabase
      .from("quotes")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        customer_id: odberatel.id,
        status: "draft",
        quote_number,
        issue_date: data.issue_date,
        valid_until: data.valid_until ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
        external_id: data.external_id ?? null,
        // Odpis údajov odberateľa — doklad musí prežiť aj zmazanie jeho karty.
        customer_name: odberatel.name,
        customer_email: odberatel.email,
        customer_ico: odberatel.ico,
        customer_dic: odberatel.dic,
        customer_ic_dph: odberatel.ic_dph,
        customer_street: odberatel.street,
        customer_city: odberatel.city,
        customer_zip: odberatel.zip,
        customer_country: odberatel.country,
        subtotal: sucty.subtotal,
        vat_total: sucty.vat_total,
        total: sucty.total,
      } as any)
      .select("id, quote_number, total, currency")
      .single();
    if (error || !ponuka) {
      const { friendlyError } = await import("./plan-error");
      throw new Error(friendlyError(error));
    }

    const riadky = data.items.map((it, i) => {
      const zaklad = +(it.quantity * it.unit_price).toFixed(2);
      const dan = +((zaklad * it.vat_rate) / 100).toFixed(2);
      return {
        quote_id: ponuka.id,
        position: i,
        product_id: it.product_id ?? null,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit || "ks",
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        subtotal: zaklad,
        vat_amount: dan,
        total: +(zaklad + dan).toFixed(2),
      };
    });
    const { error: chybaPoloziek } = await supabase.from("quote_items").insert(riadky);
    if (chybaPoloziek) {
      /*
        Ponuka bez položiek je na nič a v zozname by mátala. Keď zápis položiek
        zlyhá, zmaže sa aj hlavička — číslo v rade sa tým síce minie, ale to je
        menšie zlo než prázdny doklad.
      */
      await supabase.from("quotes").delete().eq("id", ponuka.id);
      throw new Error(chybaPoloziek.message);
    }

    return {
      id: ponuka.id,
      quote_number: ponuka.quote_number,
      total: Number(ponuka.total),
      currency: ponuka.currency,
      customer_email: odberatel.email ?? null,
      uz_existovala: false as const,
    };
  });

/** Zoznam ponúk pre appku — bez položiek, tie sa načítajú až v detaile. */
export const ponukyZoznamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string; limit?: number }) =>
    z
      .object({ company_id: z.string().uuid(), limit: z.number().min(1).max(200).default(50) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("quotes")
      .select(
        "id, quote_number, status, issue_date, valid_until, currency, total, customer_name, customer_email, converted_invoice_id, sent_at",
      )
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .order("quote_number", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
