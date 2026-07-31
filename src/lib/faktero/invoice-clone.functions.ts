import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { incrementMonthInText } from "./invoice-clone.ts";

const Schema = z.object({ invoiceId: z.string().uuid() });

export const cloneInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load source invoice (RLS scoped to user)
    const { data: src, error: srcErr } = await supabase
      .from("invoices").select("*").eq("id", data.invoiceId).single();
    if (srcErr || !src) throw new Error("Faktúra sa nenašla.");

    const { data: srcItems, error: itemsErr } = await supabase
      .from("invoice_items").select("*").eq("invoice_id", src.id).order("position");
    if (itemsErr) throw new Error(itemsErr.message);

    // Compute new dates
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const origIssue = new Date(src.issue_date);
    const origDue = new Date(src.due_date);
    const dayMs = 86400000;
    const durationDays = Math.max(0, Math.round((origDue.getTime() - origIssue.getTime()) / dayMs));
    const newDue = new Date(today.getTime() + durationDays * dayMs).toISOString().slice(0, 10);

    // New invoice number (server-only helper, service role)
    const { nextInvoiceNumberDetailed } = await import("./invoice-numbering.server");
    const { invoice_number: newNumber, sequence_number } = await nextInvoiceNumberDetailed(src.company_id, isoToday);

    // Build insert payload — copy everything except id/status/dates/number/lifecycle fields.
    const insertRow: Record<string, any> = {
      company_id: src.company_id,
      created_by: userId,
      customer_id: src.customer_id,
      customer_name: src.customer_name,
      customer_email: src.customer_email,
      customer_ico: src.customer_ico,
      customer_dic: src.customer_dic,
      customer_ic_dph: src.customer_ic_dph,
      customer_street: src.customer_street,
      customer_city: src.customer_city,
      customer_zip: src.customer_zip,
      customer_country: src.customer_country,
      currency: src.currency,
      notes: src.notes,
      payment_method: src.payment_method,
      variable_symbol: null, // reset — bound to old number
      constant_symbol: src.constant_symbol,
      specific_symbol: src.specific_symbol,
      order_number: null,
      delivery_date: null,
      delivery_method: src.delivery_method,
      reverse_charge: src.reverse_charge,
      reverse_charge_type: src.reverse_charge_type,
      rounding_mode: src.rounding_mode,
      type: src.type,
      subtotal: src.subtotal,
      vat_total: src.vat_total,
      total: src.total,
      invoice_number: newNumber,
      sequence_number,
      issue_date: isoToday,
      due_date: newDue,
      status: "draft" as const,
    };

    const { data: created, error: insErr } = await supabase
      .from("invoices").insert(insertRow).select("id").single();
    if (insErr || !created) throw new Error(insErr?.message ?? "Nepodarilo sa vytvoriť kópiu.");

    // Clone items with month-incremented name/description
    if (srcItems && srcItems.length) {
      const itemsPayload = srcItems.map((it: any) => ({
        invoice_id: created.id,
        position: it.position,
        name: incrementMonthInText(it.name),
        description: incrementMonthInText(it.description),
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        vat_amount: it.vat_amount,
        subtotal: it.subtotal,
        total: it.total,
        product_id: it.product_id,
        // Do NOT copy stock_item_id — a fresh draft should not lock stock.
      }));
      const { error: iiErr } = await supabase.from("invoice_items").insert(itemsPayload);
      if (iiErr) {
        // Roll back the header to avoid orphans
        await supabase.from("invoices").delete().eq("id", created.id);
        throw new Error(iiErr.message);
      }
    }

    return { id: created.id, invoice_number: newNumber };
  });
