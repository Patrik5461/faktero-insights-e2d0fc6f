import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vystavenie faktúry z mobilnej aplikácie.
 *
 * Formulár na webe robí to isté v prehliadači — číslo si vypýta cez RPC a
 * faktúru aj položky vkladá klient. V telefóne to takto nechcem: spojenie sa
 * preruší kedykoľvek a medzi vložením hlavičky a položiek by ostala faktúra
 * bez riadkov. Preto celý zápis beží na jednu obrátku na serveri a keď
 * položky zlyhajú, hlavička sa zmaže.
 *
 * Zápis ide cez klienta prihláseného používateľa, takže cudziu firmu odfiltruje
 * RLS a limity plánu ustráži ten istý DB trigger ako na webe.
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

/* ------------------------- Vystavenie faktúry ------------------------- */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const Polozka = z.object({
  name: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(20).default("ks"),
  unit_price: z.number().nonnegative().max(10_000_000),
  vat_rate: z.number().min(0).max(100).default(23),
  product_id: z.string().uuid().nullable().optional(),
});

const NovaFaktura = Firma.extend({
  customer_id: z.string().uuid(),
  issue_date: z.string().regex(DATUM),
  due_date: z.string().regex(DATUM),
  payment_method: z.enum(["bank_transfer", "cash", "card"]).default("bank_transfer"),
  currency: z.string().length(3).default("EUR"),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(Polozka).min(1).max(50),
});

export const vystavFakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NovaFaktura.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Radšej zastaviť hneď než po vygenerovaní čísla — chybová hláška o
    // predplatnom je zrozumiteľnejšia než hláška z databázového triggera.
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);

    const { data: odberatel } = await supabase
      .from("customers")
      .select("id, name, email, ico, dic, ic_dph, street, city, zip, country")
      .eq("id", data.customer_id)
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!odberatel) throw new Error("Odberateľ sa nenašiel.");

    const { computeInvoiceTotals, nextInvoiceNumberDetailed } =
      await import("./invoice-numbering.server");
    const sucty = computeInvoiceTotals(
      data.items.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        vat_rate: i.vat_rate,
      })),
    );
    const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(
      data.company_id,
      data.issue_date,
    );

    const { data: faktura, error: chyba } = await supabase
      .from("invoices")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        customer_id: odberatel.id,
        type: "regular" as const,
        status: "issued" as const,
        invoice_number,
        sequence_number,
        // Variabilný symbol nesmie byť prázdny reťazec — z čísla faktúry
        // ostanú len číslice, presne ako to robí web aj API.
        variable_symbol: invoice_number.replace(/\D/g, "") || null,
        issue_date: data.issue_date,
        delivery_date: data.issue_date,
        due_date: data.due_date,
        currency: data.currency,
        payment_method: data.payment_method,
        customer_name: odberatel.name,
        customer_email: odberatel.email,
        customer_ico: odberatel.ico,
        customer_dic: odberatel.dic,
        customer_ic_dph: odberatel.ic_dph,
        customer_street: odberatel.street,
        customer_city: odberatel.city,
        customer_zip: odberatel.zip,
        customer_country: odberatel.country ?? "SK",
        subtotal: sucty.subtotal,
        vat_total: sucty.vat_total,
        total: sucty.total,
        notes: data.notes || null,
      })
      .select("id, invoice_number, total, currency, status, customer_id, external_id")
      .single();
    if (chyba || !faktura) {
      const { friendlyError } = await import("./plan-error");
      throw new Error(friendlyError(chyba, "Faktúru sa nepodarilo vystaviť."));
    }

    const riadky = data.items.map((it, i) => ({
      invoice_id: faktura.id,
      position: i,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit || "ks",
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      subtotal: sucty.enriched[i].subtotal,
      vat_amount: sucty.enriched[i].vat_amount,
      total: sucty.enriched[i].total,
      product_id: it.product_id ?? null,
    }));
    const { error: chybaRiadkov } = await supabase.from("invoice_items").insert(riadky);
    if (chybaRiadkov) {
      // Faktúra bez položiek je horšia než žiadna — v prehľade vyzerá platne
      // a v PDF je prázdna tabuľka.
      await supabase.from("invoices").delete().eq("id", faktura.id);
      throw new Error(chybaRiadkov.message);
    }

    try {
      const { triggerEvent, invoicePayload } = await import("./webhook-trigger.server");
      await triggerEvent({
        company_id: data.company_id,
        event: "invoice.created",
        data: invoicePayload(faktura),
      });
    } catch {
      // Webhook je doplnok — faktúra je vystavená a to je to podstatné.
    }

    return {
      id: faktura.id,
      invoice_number: faktura.invoice_number,
      total: Number(faktura.total),
      currency: faktura.currency,
      customer_email: odberatel.email,
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
