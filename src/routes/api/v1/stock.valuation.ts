import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/valuation")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const [{ data: items }, { data: levels }] = await Promise.all([
            ctx.supabase.from("stock_items").select("id, sku, purchase_price, sale_price").eq("company_id", ctx.company_id),
            ctx.supabase.from("stock_levels").select("stock_item_id, warehouse_id, quantity").eq("company_id", ctx.company_id),
          ]);
          const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
          let total_purchase = 0, total_sale = 0;
          for (const l of levels ?? []) {
            const it: any = itemMap.get(l.stock_item_id); if (!it) continue;
            total_purchase += Number(l.quantity) * Number(it.purchase_price ?? 0);
            total_sale += Number(l.quantity) * Number(it.sale_price ?? 0);
          }
          return ok({ data: { total_purchase, total_sale, items: items?.length ?? 0 } });
        });
      },
    },
  },
});