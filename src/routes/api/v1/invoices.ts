import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Item = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  quantity: z.number().positive().max(1000000),
  unit: z.string().max(20).optional().default("ks"),
  unit_price: z.number().nonnegative().max(10000000),
  vat_rate: z.number().min(0).max(100).optional().default(23),
});
const InvoiceInput = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer: z.object({
    name: z.string().min(1).max(255),
    ico: z.string().max(32).optional().nullable(),
    dic: z.string().max(32).optional().nullable(),
    ic_dph: z.string().max(32).optional().nullable(),
    street: z.string().max(255).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    zip: z.string().max(20).optional().nullable(),
    country: z.string().max(2).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
  }).optional(),
  external_id: z.string().max(120).optional().nullable(),
  issue_date: z.string().optional(),
  delivery_date: z.string().optional().nullable(),
  due_date: z.string().optional(),
  variable_symbol: z.string().max(40).optional().nullable(),
  currency: z.string().length(3).optional().default("EUR"),
  payment_method: z.string().max(40).optional().default("bank_transfer"),
  notes: z.string().max(5000).optional().nullable(),
  items: z.array(Item).min(1).max(200),
});

export const Route = createFileRoute("/api/v1/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
          const status = url.searchParams.get("status");
          let q = ctx.supabase.from("invoices").select("*").eq("company_id", ctx.company_id).order("created_at", { ascending: false }).limit(limit);
          if (status) q = q.eq("status", status as any);
          const { data, error } = await q;
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        const { nextInvoiceNumberDetailed, computeInvoiceTotals } = await import("@/lib/faktero/invoice-numbering.server");
        const { triggerEvent, invoicePayload } = await import("@/lib/faktero/webhook-trigger.server");
        return handleApi(request, async (ctx) => {
          const parsed = InvoiceInput.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta faktúry.", 400, parsed.error.flatten());
          const d = parsed.data;

          // Dedupe by external_id
          if (d.external_id) {
            const { data: dupe } = await ctx.supabase.from("invoices").select("*").eq("company_id", ctx.company_id).eq("external_id", d.external_id).maybeSingle();
            if (dupe) return ok(dupe, 200);
          }

          // Resolve customer snapshot
          let cust: any = null;
          if (d.customer_id) {
            const { data } = await ctx.supabase.from("customers").select("*").eq("id", d.customer_id).eq("company_id", ctx.company_id).maybeSingle();
            if (!data) return err("not_found", "Odberateľ nenájdený.", 404);
            cust = data;
          } else if (d.customer) {
            cust = d.customer;
          } else {
            return err("validation_error", "Vyžaduje sa customer_id alebo customer.", 400);
          }

          const totals = computeInvoiceTotals(d.items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price, vat_rate: i.vat_rate })));
          const today = new Date().toISOString().slice(0, 10);
          const issue_date = d.issue_date ?? today;
          const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(ctx.company_id, issue_date);
          const due_date = d.due_date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
          const variable_symbol = d.variable_symbol ?? invoice_number.replace(/\D/g, "");

          const { data: created, error: insErr } = await ctx.supabase.from("invoices").insert({
            company_id: ctx.company_id,
            customer_id: d.customer_id ?? null,
            invoice_number, sequence_number, variable_symbol,
            issue_date, delivery_date: d.delivery_date ?? null, due_date,
            currency: d.currency ?? "EUR", payment_method: d.payment_method ?? "bank_transfer",
            customer_name: cust.name, customer_ico: cust.ico ?? null, customer_dic: cust.dic ?? null,
            customer_ic_dph: cust.ic_dph ?? null, customer_street: cust.street ?? null,
            customer_city: cust.city ?? null, customer_zip: cust.zip ?? null,
            customer_country: cust.country ?? "SK", customer_email: cust.email ?? null,
            subtotal: totals.subtotal, vat_total: totals.vat_total, total: totals.total,
            notes: d.notes ?? null, external_id: d.external_id ?? null,
            status: "issued",
          }).select().single();
          if (insErr || !created) return err("db_error", insErr?.message ?? "Vloženie zlyhalo.", 500);

          const itemRows = d.items.map((it, i) => ({
            invoice_id: created.id, position: i, name: it.name, description: it.description ?? null,
            quantity: it.quantity, unit: it.unit ?? "ks", unit_price: it.unit_price, vat_rate: it.vat_rate,
            subtotal: totals.enriched[i].subtotal, vat_amount: totals.enriched[i].vat_amount, total: totals.enriched[i].total,
          }));
          const { error: itErr } = await ctx.supabase.from("invoice_items").insert(itemRows);
          if (itErr) return err("db_error", itErr.message, 500);

          await triggerEvent({ company_id: ctx.company_id, event: "invoice.created", data: invoicePayload(created) });
          return ok(created, 201);
        });
      },
    },
  },
});