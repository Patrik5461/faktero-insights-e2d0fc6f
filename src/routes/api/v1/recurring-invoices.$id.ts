import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({
  name: z.string().min(1).max(255).optional(),
  frequency: z.enum(["weekly","monthly","quarterly","yearly"]).optional(),
  next_run: z.string().optional(),
  currency: z.string().length(3).optional(),
  due_days: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(5000).optional().nullable(),
  active: z.boolean().optional(),
});

export const Route = createFileRoute("/api/v1/recurring-invoices/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("recurring_invoices").select("*")
            .eq("company_id", ctx.company_id).eq("id", (params as any).id).maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Šablóna nenájdená.", 404);
          return ok(data);
        });
      },
      PUT: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Patch.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta.", 400, parsed.error.flatten());
          const { data, error } = await ctx.supabase.from("recurring_invoices")
            .update(parsed.data as any).eq("company_id", ctx.company_id).eq("id", (params as any).id).select().single();
          if (error || !data) return err("db_error", error?.message ?? "Update zlyhal.", 500);
          return ok(data);
        });
      },
    },
  },
});
