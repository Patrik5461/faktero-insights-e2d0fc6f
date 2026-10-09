import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Item = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  quantity: z.number().positive().max(1000000),
  unit: z.string().max(20).optional().default("ks"),
  unit_price: z.number().nonnegative().max(10000000),
  // Bez sadzby platí základná sadzba krajiny firmy (neplatiteľ 0 %) — pevných
  // 23 % by českej firme alebo neplatiteľovi vyrobilo chybnú faktúru.
  vat_rate: z.number().min(0).max(100).optional(),
  /*
    Presný základ a DPH riadku tak, ako ich spočítal obchod. E-shop s cenami
    s DPH ráta daň z nezaokrúhleného základu, Faktero zo zaokrúhleného — bez
    týchto polí by faktúra vyšla o cent inak, než zákazník zaplatil. Overujú
    sa proti cene a sadzbe, takže iné sumy než tie, čo z nich vyplývajú,
    neprejdú.
  */
  subtotal: z.number().nonnegative().max(1000000000).optional(),
  vat_amount: z.number().nonnegative().max(1000000000).optional(),
});
const InvoiceInput = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer: z
    .object({
      name: z.string().min(1).max(255),
      ico: z.string().max(32).optional().nullable(),
      dic: z.string().max(32).optional().nullable(),
      ic_dph: z.string().max(32).optional().nullable(),
      street: z.string().max(255).optional().nullable(),
      city: z.string().max(120).optional().nullable(),
      zip: z.string().max(20).optional().nullable(),
      country: z.string().max(2).optional().nullable(),
      email: z.string().email().max(255).optional().nullable(),
    })
    .optional(),
  external_id: z.string().max(120).optional().nullable(),
  issue_date: z.string().optional(),
  delivery_date: z.string().optional().nullable(),
  due_date: z.string().optional(),
  variable_symbol: z.string().max(40).optional().nullable(),
  /** Číslo objednávky odberateľa (napr. z e-shopu) — tlačí sa na faktúru a ide do eFaktúry. */
  order_number: z.string().max(60).optional().nullable(),
  currency: z.string().length(3).optional().default("EUR"),
  payment_method: z.string().max(40).optional().default("bank_transfer"),
  notes: z.string().max(5000).optional().nullable(),
  job_id: z.string().uuid().optional().nullable(),
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
          let q = ctx.supabase
            .from("invoices")
            .select("*")
            .eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (status) q = q.eq("status", status as any);
          const { data, error } = await q;
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        const { triggerEvent, invoicePayload } =
          await import("@/lib/faktero/webhook-trigger.server");
        return handleApi(request, async (ctx) => {
          const parsed = InvoiceInput.safeParse(ctx.requestBody);
          if (!parsed.success)
            return err("validation_error", "Neplatné dáta faktúry.", 400, parsed.error.flatten());
          const d = parsed.data;

          const { vytvorFakturu } = await import("@/lib/faktero/vytvor-fakturu.server");
          const v = await vytvorFakturu(ctx.supabase, ctx.company_id, d);
          if (!v.ok) return err(v.kod, v.sprava, v.status);
          if (!v.nova) return ok(v.faktura, 200);
          const created = v.faktura;
          await triggerEvent({
            company_id: ctx.company_id,
            event: "invoice.created",
            data: invoicePayload(created),
          });
          return ok(created, 201);
        });
      },
    },
  },
});
