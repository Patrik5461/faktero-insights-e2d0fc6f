import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({
  notes: z.string().max(5000).nullable().optional(),
  due_date: z.string().optional(),
  variable_symbol: z.string().max(40).nullable().optional(),
  payment_method: z.string().max(40).optional(),
}).strict();

export const Route = createFileRoute("/api/v1/invoices/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("invoices").select("*, items:invoice_items(*)").eq("id", params.id).eq("company_id", ctx.company_id).maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Faktúra nenájdená.", 404);
          return ok(data);
        });
      },
      PUT: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Patch.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta.", 400, parsed.error.flatten());
          const { data, error } = await ctx.supabase.from("invoices").update(parsed.data).eq("id", params.id).eq("company_id", ctx.company_id).select().maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Faktúra nenájdená.", 404);
          return ok(data);
        });
      },
    },
  },
});