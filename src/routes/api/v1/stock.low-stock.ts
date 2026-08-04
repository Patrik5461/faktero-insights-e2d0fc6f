import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/low-stock")({
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
          const [{ data: items }, { data: levels }] = await Promise.all([
            ctx.supabase
              .from("stock_items")
              .select("id, sku, min_stock, unit")
              .eq("company_id", ctx.company_id)
              .eq("track_stock", true),
            ctx.supabase
              .from("stock_levels")
              .select("stock_item_id, quantity")
              .eq("company_id", ctx.company_id),
          ]);
          const totals = new Map<string, number>();
          (levels ?? []).forEach((l: any) =>
            totals.set(l.stock_item_id, (totals.get(l.stock_item_id) ?? 0) + Number(l.quantity)),
          );
          const rows = (items ?? [])
            .filter((i: any) => (totals.get(i.id) ?? 0) <= Number(i.min_stock ?? 0))
            .map((i: any) => ({
              id: i.id,
              sku: i.sku,
              unit: i.unit,
              current: totals.get(i.id) ?? 0,
              min: Number(i.min_stock ?? 0),
            }));
          return ok({ data: rows });
        });
      },
    },
  },
});
