import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ quoteId: z.string().uuid() });

/**
 * Convert a quote into a regular invoice. Copies header, customer snapshot,
 * items and totals. Marks the quote as `converted` and links it.
 */
export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
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

    const today = new Date().toISOString().slice(0, 10);
    const { nextInvoiceNumberDetailed } = await import("./invoice-numbering.server");
    const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(
      quote.company_id,
      today,
    );
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const variable_symbol = invoice_number.replace(/\D/g, "");

    const { data: inv, error: insErr } = await supabase
      .from("invoices")
      .insert({
        company_id: quote.company_id,
        customer_id: quote.customer_id ?? null,
        invoice_number,
        sequence_number,
        variable_symbol,
        issue_date: today,
        due_date: due,
        currency: quote.currency,
        payment_method: "bank_transfer",
        customer_name: quote.customer_name,
        customer_ico: quote.customer_ico,
        customer_dic: quote.customer_dic,
        customer_ic_dph: quote.customer_ic_dph,
        customer_street: quote.customer_street,
        customer_city: quote.customer_city,
        customer_zip: quote.customer_zip,
        customer_country: quote.customer_country ?? "SK",
        customer_email: quote.customer_email,
        subtotal: quote.subtotal,
        vat_total: quote.vat_total,
        total: quote.total,
        notes: quote.notes ?? null,
        status: "issued",
      })
      .select()
      .single();
    if (insErr || !inv) throw new Error(insErr?.message ?? "Vytvorenie faktúry zlyhalo");

    if (items && items.length) {
      const rows = items.map((it: any) => ({
        invoice_id: inv.id,
        position: it.position,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        total: it.total,
      }));
      const { error: copyErr } = await supabase.from("invoice_items").insert(rows);
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
  .inputValidator((d: unknown) => Input.parse(d))
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
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

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
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        total: it.total,
      }));
      await supabase.from("quote_items").insert(rows);
    }
    return { quote_id: copy.id };
  });
