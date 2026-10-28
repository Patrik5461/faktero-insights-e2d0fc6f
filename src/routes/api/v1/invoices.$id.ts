import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/invoices/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase
            .from("invoices")
            .select("*, items:invoice_items(*)")
            .eq("id", params.id)
            .eq("company_id", ctx.company_id)
            .maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Faktúra nenájdená.", 404);
          return ok(data);
        });
      },
      PUT: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { upravFakturu } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => upravFakturu(ctx, params.id));
      },
    },
  },
});
