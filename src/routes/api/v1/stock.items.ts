import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/items")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
          const { data, error } = await ctx.supabase
            .from("stock_items")
            .select("*")
            .eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
    },
  },
});
