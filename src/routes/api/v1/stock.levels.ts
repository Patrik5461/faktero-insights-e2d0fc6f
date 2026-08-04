import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/levels")({
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
          const warehouse_id = url.searchParams.get("warehouse_id");
          let q = ctx.supabase.from("stock_levels").select("*").eq("company_id", ctx.company_id);
          if (warehouse_id) q = q.eq("warehouse_id", warehouse_id);
          const { data, error } = await q.limit(1000);
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
    },
  },
});
