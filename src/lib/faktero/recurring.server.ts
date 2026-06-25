import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nextInvoiceNumber } from "./invoice-numbering.server";
import { triggerEvent, invoicePayload } from "./webhook-trigger.server";

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

/** Calculate the next run date from a base date for a given frequency. */
export function advanceNextRun(base: string | Date, freq: Frequency): string {
  const d = typeof base === "string" ? new Date(base + "T00:00:00Z") : new Date(base);
  switch (freq) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

/** Generate a single invoice from a recurring template by id. */
export async function runRecurring(id: string, runType: "manual" | "automatic" = "automatic") {
  const { data: rec, error } = await supabaseAdmin
    .from("recurring_invoices").select("*").eq("id", id).single();
  if (error || !rec) throw new Error("Recurring not found");
  if (!rec.active) return { skipped: true, reason: "inactive" };

  const items = Array.isArray(rec.items) ? rec.items : [];
  if (!items.length) return { skipped: true, reason: "no_items" };

  const logRun = async (status: string, invoice_id: string | null, error_message: string | null) => {
    try {
      await supabaseAdmin.from("recurring_invoice_logs" as any).insert({
        recurring_invoice_id: rec.id,
        company_id: rec.company_id,
        invoice_id, run_type: runType, status, error_message,
      });
    } catch (e) { console.error("[recurring] log error", e); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const dueDays = Number(rec.due_days ?? 14);
  const due = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
  const invoice_number = await nextInvoiceNumber(rec.company_id);
  const variable_symbol = invoice_number.replace(/\D/g, "");

  const { data: inv, error: insErr } = await supabaseAdmin.from("invoices").insert({
    company_id: rec.company_id,
    customer_id: rec.customer_id ?? null,
    invoice_number, variable_symbol,
    issue_date: today, due_date: due,
    currency: rec.currency ?? "EUR",
    payment_method: rec.payment_method ?? "bank_transfer",
    customer_name: rec.customer_name, customer_ico: rec.customer_ico,
    customer_dic: rec.customer_dic, customer_ic_dph: rec.customer_ic_dph,
    customer_street: rec.customer_street, customer_city: rec.customer_city,
    customer_zip: rec.customer_zip, customer_country: rec.customer_country ?? "SK",
    customer_email: rec.customer_email,
    subtotal: rec.subtotal, vat_total: rec.vat_total, total: rec.total,
    notes: rec.notes ?? null,
    status: "issued",
  }).select().single();
  if (insErr || !inv) {
    await logRun("failed", null, insErr?.message ?? "Invoice insert failed");
    throw new Error(insErr?.message ?? "Invoice insert failed");
  }

  const rows = items.map((it: any, i: number) => {
    const line = +(Number(it.quantity) * Number(it.unit_price)).toFixed(2);
    const vat = +((line * Number(it.vat_rate ?? 20)) / 100).toFixed(2);
    return {
      invoice_id: inv.id, position: i,
      name: it.name, description: it.description ?? null,
      quantity: it.quantity, unit: it.unit ?? "ks",
      unit_price: it.unit_price, vat_rate: it.vat_rate ?? 20,
      subtotal: line, vat_amount: vat, total: +(line + vat).toFixed(2),
    };
  });
  const { error: itErr } = await supabaseAdmin.from("invoice_items").insert(rows);
  if (itErr) {
    await logRun("failed", inv.id, itErr.message);
    throw new Error(itErr.message);
  }

  // Generate PDF (best effort, non-fatal)
  try {
    const [{ data: company }, { data: invItems }] = await Promise.all([
      supabaseAdmin.from("companies").select("*").eq("id", rec.company_id).single(),
      supabaseAdmin.from("invoice_items").select("*").eq("invoice_id", inv.id).order("position"),
    ]);
    if (company) {
      let logoBytes: Uint8Array | null = null;
      let logoMime: string | null = null;
      if (company.logo_url) {
        try {
          const { data: blob } = await supabaseAdmin.storage.from("company-logos").download(company.logo_url);
          if (blob) { logoBytes = new Uint8Array(await blob.arrayBuffer()); logoMime = blob.type; }
        } catch {}
      }
      const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
      const bytes = await generateInvoicePdfBytes({ company, invoice: inv, items: invItems ?? [], logoBytes, logoMime });
      const path = `${inv.company_id}/${inv.id}.pdf`;
      await supabaseAdmin.storage.from("invoice-pdfs").upload(path, bytes, {
        contentType: "application/pdf", upsert: true,
      });
      await supabaseAdmin.from("invoices").update({ pdf_url: path }).eq("id", inv.id);
    }
  } catch (e) {
    console.error("[recurring] pdf error", e);
  }

  // Webhook
  try {
    await triggerEvent({
      company_id: rec.company_id,
      event: "invoice.created",
      data: invoicePayload(inv),
    });
  } catch (e) {
    console.error("[recurring] webhook error", e);
  }

  // Advance schedule
  const newNext = advanceNextRun(rec.next_run, rec.frequency as Frequency);
  await supabaseAdmin.from("recurring_invoices").update({
    last_run_at: new Date().toISOString(),
    last_invoice_id: inv.id,
    next_run: newNext,
  }).eq("id", rec.id);

  await logRun("success", inv.id, null);
  return { skipped: false, invoice_id: inv.id, next_run: newNext };
}

/** Run all due recurring templates across all companies. */
export async function runAllDueRecurring() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await supabaseAdmin
    .from("recurring_invoices")
    .select("id")
    .eq("active", true)
    .lte("next_run", today);
  const results: { id: string; ok: boolean; error?: string; invoice_id?: string }[] = [];
  for (const r of due ?? []) {
    try {
      const res = await runRecurring(r.id);
      results.push({ id: r.id, ok: true, invoice_id: res.invoice_id });
    } catch (e: any) {
      console.error("[recurring]", r.id, e);
      results.push({ id: r.id, ok: false, error: e?.message ?? "unknown" });
    }
  }
  return { processed: results.length, results };
}