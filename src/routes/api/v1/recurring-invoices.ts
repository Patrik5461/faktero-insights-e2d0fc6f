import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Item = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().max(20).optional().default("ks"),
  unit_price: z.number().nonnegative(),
  vat_rate: z.number().min(0).max(100).optional().default(23),
});
const Input = z.object({
  name: z.string().min(1).max(255),
  customer_id: z.string().uuid(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  next_run: z.string(),
  currency: z.string().length(3).optional().default("EUR"),
  due_days: z.number().int().min(0).max(365).optional().default(14),
  payment_method: z.string().max(40).optional().default("bank_transfer"),
  notes: z.string().max(5000).optional().nullable(),
  active: z.boolean().optional().default(true),
  items: z.array(Item).min(1).max(200),
});

function totals(items: any[]) {
  let s = 0,
    v = 0;
  for (const it of items) {
    const line = Number(it.quantity) * Number(it.unit_price);
    s += line;
    v += line * (Number(it.vat_rate ?? 23) / 100);
  }
  return { subtotal: +s.toFixed(2), vat_total: +v.toFixed(2), total: +(s + v).toFixed(2) };
}

export const Route = createFileRoute("/api/v1/recurring-invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase
            .from("recurring_invoices")
            .select("*")
            .eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false });
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success)
            return err("validation_error", "Neplatné dáta.", 400, parsed.error.flatten());
          const d = parsed.data;
          const { data: cust } = await ctx.supabase
            .from("customers")
            .select("*")
            .eq("id", d.customer_id)
            .eq("company_id", ctx.company_id)
            .maybeSingle();
          if (!cust) return err("not_found", "Odberateľ nenájdený.", 404);
          const t = totals(d.items);
          const { data: created, error: insErr } = await ctx.supabase
            .from("recurring_invoices")
            .insert({
              company_id: ctx.company_id,
              name: d.name,
              customer_id: cust.id,
              customer_name: cust.name,
              customer_ico: cust.ico,
              customer_dic: cust.dic,
              customer_ic_dph: cust.ic_dph,
              customer_street: cust.street,
              customer_city: cust.city,
              customer_zip: cust.zip,
              customer_country: cust.country,
              customer_email: cust.email,
              frequency: d.frequency,
              next_run: d.next_run,
              currency: d.currency,
              due_days: d.due_days,
              payment_method: d.payment_method,
              notes: d.notes,
              active: d.active,
              items: d.items as any,
              ...t,
            })
            .select()
            .single();
          if (insErr || !created) return err("db_error", insErr?.message ?? "Insert zlyhal.", 500);
          return ok(created, 201);
        });
      },
    },
  },
});
