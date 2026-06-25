import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/movements/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("stock_movements").select("*").eq("company_id", ctx.company_id).eq("id", params.id).maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Pohyb neexistuje.", 404);
          return ok({ data });
        });
      },
    },
  },
});