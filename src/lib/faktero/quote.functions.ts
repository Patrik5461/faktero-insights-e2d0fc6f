import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { dnesBratislava, posunDni } from "@/lib/faktero/datum-vystavenia";
const Input = z.object({ quoteId: z.string().uuid() });

/**
 * Ďalšie číslo cenovej ponuky pre formulár.
 *
 * Formulár si číslo predtým rátal sám ako „počet ponúk v roku + 1". To dáva
 * duplicitu hneď v dvoch bežných situáciách: keď ponuka vznikne cez API
 * (tá číslovala maximom) a keď sa ponuke nastaví dátum vystavenia z minulého
 * roka — vtedy sa do počtu nezaráta a ďalšia ponuka dostane rovnaké číslo.
 * `quotes` má UNIQUE (company_id, quote_number), takže z toho je chyba pri
 * ukladaní. Číslo sa preto počíta z maxima, rovnako ako všade inde.
 */
export const nextQuoteNumberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        /** Z ktorého radu má ponuka dostať číslo; prázdne = predvolený. */
        number_series_id: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Číslo dáva rad cenových ponúk; predvolene má tvar Q{rok}{poradie} ako
    // doteraz. Ide to cez klienta prihláseného používateľa, takže cudziu
    // firmu odfiltruje RLS — `supabaseAdmin` tu netreba.
    const { cisloZRadu } = await import("./cislo-z-radu.server");
    const { cislo, seriesId } = await cisloZRadu(context.supabase, data.company_id, "quote", {
      seriesId: data.number_series_id,
    });
    return { quote_number: cislo, number_series_id: seriesId };
  });

/**
 * Convert a quote into a regular invoice. Copies header, customer snapshot,
 * items and totals. Marks the quote as `converted` and links it.
 */
export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .single();
    if (error || !quote) throw new Error("Cenová ponuka nenájdená");
    if (quote.status === "converted" && quote.converted_invoice_id) {
      return { invoice_id: quote.converted_invoice_id, already: true };
    }

    const { data: items, error: itErr } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote.id)
      .order("position");
    if (itErr) throw new Error(itErr.message);

    const { dnesBratislava } = await import("./datum-vystavenia");
    const today = dnesBratislava();
    const { nextInvoiceNumberDetailed } = await import("./invoice-numbering.server");
    const { data: firma } = await supabase
      .from("companies")
      .select("country")
      .eq("id", quote.company_id)
      .maybeSingle();
    const { predvolenyJazykFirmy } = await import("./faktura-jazyk");
    const { hlavickaZPonuky, polozkyZPonuky } = await import("./ponuka-na-fakturu");
    const { doplnovacKurzov } = await import("./kurz-dokladu.server");
    const doplnKurz = doplnovacKurzov(quote.company_id);
    // Číslo sa pri kolízii so súbežne vystavenou faktúrou vypýta znova.
    const { sOpakovanimPriKoliziiCisla } = await import("./kolizia-cisla");
    const { data: inv, error: insErr } = await sOpakovanimPriKoliziiCisla<any>(async () => {
      const cislo = await nextInvoiceNumberDetailed(quote.company_id, today);
      const hlavicka = hlavickaZPonuky(quote, cislo, today, predvolenyJazykFirmy(firma?.country));
      // Cudzia mena: daň aj v domácej mene firmy (kurz ECB/ČNB).
      Object.assign(hlavicka, await doplnKurz("invoices", hlavicka));
      return supabase
        .from("invoices")
        .insert(hlavicka as any)
        .select()
        .single();
    });
    if (insErr || !inv) throw new Error(insErr?.message ?? "Vytvorenie faktúry zlyhalo");

    if (items && items.length) {
      const rows = polozkyZPonuky(inv.id, items);
      const { error: copyErr } = await supabase.from("invoice_items").insert(rows as any);
      if (copyErr) throw new Error(copyErr.message);
    }

    await supabase
      .from("quotes")
      .update({
        status: "converted",
        converted_invoice_id: inv.id,
        converted_at: new Date().toISOString(),
      })
      .eq("id", quote.id);

    // Trigger invoice.created webhook
    try {
      const { triggerEvent, invoicePayload } = await import("./webhook-trigger.server");
      await triggerEvent({
        company_id: quote.company_id,
        event: "invoice.created",
        data: invoicePayload(inv),
      });
    } catch {
      /* non-fatal */
    }

    return { invoice_id: inv.id, already: false };
  });

/** Duplicate a quote (new draft, new number, copies items). */
export const duplicateQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .single();
    if (error || !q) throw new Error("Cenová ponuka nenájdená");
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", q.id)
      .order("position");

    const { nextQuoteNumber } = await import("./quote-numbering.server");
    const quote_number = await nextQuoteNumber(q.company_id);
    const today = dnesBratislava();
    const validUntil = posunDni(dnesBratislava(), 30);

    const { data: copy, error: insErr } = await supabase
      .from("quotes")
      .insert({
        company_id: q.company_id,
        customer_id: q.customer_id,
        status: "draft",
        quote_number,
        issue_date: today,
        valid_until: validUntil,
        currency: q.currency,
        notes: q.notes,
        customer_name: q.customer_name,
        customer_ico: q.customer_ico,
        customer_dic: q.customer_dic,
        customer_ic_dph: q.customer_ic_dph,
        customer_street: q.customer_street,
        customer_city: q.customer_city,
        customer_zip: q.customer_zip,
        customer_country: q.customer_country,
        customer_email: q.customer_email,
        subtotal: q.subtotal,
        vat_total: q.vat_total,
        total: q.total,
        discount_type: q.discount_type ?? null,
        discount_value: q.discount_value ?? 0,
        discount_total: q.discount_total ?? 0,
      })
      .select()
      .single();
    if (insErr || !copy) throw new Error(insErr?.message ?? "Duplikácia zlyhala");

    if (items && items.length) {
      const rows = items.map((it: any) => ({
        quote_id: copy.id,
        position: it.position,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent ?? 0,
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        total: it.total,
      }));
      await supabase.from("quote_items").insert(rows);
    }
    return { quote_id: copy.id };
  });
