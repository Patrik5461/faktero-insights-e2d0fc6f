import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Item = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  quantity: z.number().positive().max(1000000),
  unit: z.string().max(20).optional().default("ks"),
  unit_price: z.number().nonnegative().max(10000000),
  vat_rate: z.number().min(0).max(100).optional().default(20),
});
const QuoteInput = z.object({
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
  valid_until: z.string().optional(),
  currency: z.string().length(3).optional().default("EUR"),
  notes: z.string().max(5000).optional().nullable(),
  items: z.array(Item).min(1).max(200),
});

export const Route = createFileRoute("/api/v1/quotes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
          const status = url.searchParams.get("status");
          let q = ctx.supabase.from("quotes").select("*").eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false }).limit(limit);
          if (status) q = q.eq("status", status as any);
          const { data, error } = await q;
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        const { nextQuoteNumber, computeQuoteTotals } = await import("@/lib/faktero/quote-numbering.server");
        return handleApi(request, async (ctx) => {
          const parsed = QuoteInput.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta ponuky.", 400, parsed.error.flatten());
          const d = parsed.data;

          if (d.external_id) {
            const { data: dupe } = await ctx.supabase.from("quotes").select("*")
              .eq("company_id", ctx.company_id).eq("external_id", d.external_id).maybeSingle();
            if (dupe) return ok(dupe, 200);
          }

          let cust: any = null;
          if (d.customer_id) {
            const { data } = await ctx.supabase.from("customers").select("*")
              .eq("id", d.customer_id).eq("company_id", ctx.company_id).maybeSingle();
            if (!data) return err("not_found", "Odberateľ nenájdený.", 404);
            cust = data;
          } else if (d.customer) {
            cust = d.customer;
          } else {
            return err("validation_error", "Vyžaduje sa customer_id alebo customer.", 400);
          }

          const totals = computeQuoteTotals(d.items.map(i => ({ quantity: i.quantity, unit_price: i.unit_price, vat_rate: i.vat_rate })));
          const quote_number = await nextQuoteNumber(ctx.company_id);
          const today = new Date().toISOString().slice(0, 10);
          const valid_until = d.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

          const { data: created, error: insErr } = await ctx.supabase.from("quotes").insert({
            company_id: ctx.company_id,
            customer_id: d.customer_id ?? null,
            quote_number, status: "draft",
            issue_date: d.issue_date ?? today, valid_until,
            currency: d.currency ?? "EUR",
            customer_name: cust.name, customer_ico: cust.ico ?? null, customer_dic: cust.dic ?? null,
            customer_ic_dph: cust.ic_dph ?? null, customer_street: cust.street ?? null,
            customer_city: cust.city ?? null, customer_zip: cust.zip ?? null,
            customer_country: cust.country ?? "SK", customer_email: cust.email ?? null,
            subtotal: totals.subtotal, vat_total: totals.vat_total, total: totals.total,
            notes: d.notes ?? null, external_id: d.external_id ?? null,
          }).select().single();
          if (insErr || !created) return err("db_error", insErr?.message ?? "Vloženie zlyhalo.", 500);

          const rows = d.items.map((it, i) => ({
            quote_id: created.id, position: i, name: it.name, description: it.description ?? null,
            quantity: it.quantity, unit: it.unit ?? "ks", unit_price: it.unit_price, vat_rate: it.vat_rate,
            subtotal: totals.enriched[i].subtotal, vat_amount: totals.enriched[i].vat_amount, total: totals.enriched[i].total,
          }));
          const { error: itErr } = await ctx.supabase.from("quote_items").insert(rows);
          if (itErr) return err("db_error", itErr.message, 500);

          return ok(created, 201);
        });
      },
    },
  },
});
