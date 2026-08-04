import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/items/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data: item, error } = await ctx.supabase
            .from("stock_items")
            .select("*")
            .eq("company_id", ctx.company_id)
            .eq("id", params.id)
            .maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!item) return err("not_found", "Skladová karta neexistuje.", 404);
          const { data: levels } = await ctx.supabase
            .from("stock_levels")
            .select("warehouse_id, quantity, reserved_quantity")
            .eq("stock_item_id", params.id);
          return ok({ data: { ...item, levels: levels ?? [] } });
        });
      },
    },
  },
});
