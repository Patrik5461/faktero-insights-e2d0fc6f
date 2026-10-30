import { createServerFn } from "@tanstack/react-start";
import { vsZCislaDokladu } from "@/lib/faktero/variabilny-symbol";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { incrementMonthInText } from "./invoice-clone.ts";

const Schema = z.object({ invoiceId: z.string().uuid() });

export const cloneInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load source invoice (RLS scoped to user)
    const { data: src, error: srcErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoiceId)
      .single();
    if (srcErr || !src) throw new Error("Faktúra sa nenašla.");

    const { data: srcItems, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", src.id)
      .order("position");
    if (itemsErr) throw new Error(itemsErr.message);

    // Compute new dates
    // Dnešok podľa Bratislavy — toISOString() dával medzi polnocou a druhou
    // ráno včerajší dátum.
    const { dnesBratislava } = await import("./datum-vystavenia");
    const isoToday = dnesBratislava();
    const origIssue = new Date(src.issue_date);
    const origDue = new Date(src.due_date);
    const dayMs = 86400000;
    const durationDays = Math.max(0, Math.round((origDue.getTime() - origIssue.getTime()) / dayMs));
    const newDue = new Date(new Date(`${isoToday}T00:00:00Z`).getTime() + durationDays * dayMs)
      .toISOString()
      .slice(0, 10);

    // New invoice number (server-only helper, service role)
    const { nextInvoiceNumberDetailed } = await import("./invoice-numbering.server");
    const {
      invoice_number: newNumber,
      sequence_number,
      series_id,
    } = await nextInvoiceNumberDetailed(src.company_id, isoToday, src.type);

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
      /*
        Text nad položkami je povinný a kópia bez neho sa nedala uložiť ani
        vystaviť. Mesiac sa v ňom posunie rovnako ako v položkách
        (napr. „9/2026" → „10/2026").
      */
      intro_note: incrementMonthInText(src.intro_note) || null,
      language: src.language,
      payment_account_id: src.payment_account_id ?? null,
      job_id: src.job_id ?? null,
      discount_type: src.discount_type ?? null,
      discount_value: src.discount_value ?? 0,
      discount_total: src.discount_total ?? 0,
      payment_method: src.payment_method,
      // Variabilný symbol patrí k novému číslu — prázdny by platbu nespároval.
      variable_symbol: vsZCislaDokladu(newNumber) || null,
      constant_symbol: src.constant_symbol,
      specific_symbol: src.specific_symbol,
      order_number: null,
      /*
        Kópia je nové dodanie — dátum dodania dnes, ako pri novej faktúre.
        Prázdny sa pri vystavení konceptu nedoplnil a faktúra vyšla s
        „Dátum dodania —“ (bez DUZP, § 74 ods. 1 písm. f).
      */
      delivery_date: isoToday,
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
      number_series_id: series_id,
      issue_date: isoToday,
      due_date: newDue,
      status: "draft" as const,
    };

    // Pri kolízii so súbežne vystavenou faktúrou sa vypýta ďalšie číslo.
    const { sOpakovanimPriKoliziiCisla } = await import("./kolizia-cisla");
    const { data: created, error: insErr } = await sOpakovanimPriKoliziiCisla<{ id: string }>(
      async (pokus) => {
        if (pokus > 0) {
          const dalsie = await nextInvoiceNumberDetailed(src.company_id, isoToday, src.type);
          insertRow.invoice_number = dalsie.invoice_number;
          insertRow.sequence_number = dalsie.sequence_number;
          insertRow.number_series_id = dalsie.series_id;
          insertRow.variable_symbol = vsZCislaDokladu(dalsie.invoice_number) || null;
        }
        return supabase.from("invoices").insert(insertRow).select("id").single();
      },
    );
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
        discount_percent: it.discount_percent ?? 0,
        vat_rate: it.vat_rate,
        vat_amount: it.vat_amount,
        subtotal: it.subtotal,
        total: it.total,
        product_id: it.product_id,
        colny_kod: it.colny_kod ?? null,
        krajina_povodu: it.krajina_povodu ?? null,
        hmotnost_kg: it.hmotnost_kg ?? null,
        prenesenie: Boolean(it.prenesenie),
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
