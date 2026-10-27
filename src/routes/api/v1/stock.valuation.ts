import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/stock/valuation")({
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
          /*
            Všetky zásoby a stavy po stránkach (PostgREST vráti najviac 1 000
            riadkov). Ocenenie váženou nákupnou cenou ako v Pohode a v appke;
            posledná nákupná cena len pre zásobu bez priemeru.
          */
          const { vsetkyRiadky } = await import("@/lib/faktero/strankovanie");
          const [items, levels] = await Promise.all([
            vsetkyRiadky<any>((od, po) =>
              ctx.supabase
                .from("stock_items")
                .select("id, sku, purchase_price, avg_purchase_price, sale_price")
                .eq("company_id", ctx.company_id)
                .order("id")
                .range(od, po),
            ),
            vsetkyRiadky<any>((od, po) =>
              ctx.supabase
                .from("stock_levels")
                .select("stock_item_id, warehouse_id, quantity")
                .eq("company_id", ctx.company_id)
                .order("stock_item_id")
                .order("warehouse_id")
                .range(od, po),
            ),
          ]);
          const itemMap = new Map(items.map((i: any) => [i.id, i]));
          let total_purchase = 0,
            total_sale = 0;
          for (const l of levels) {
            const it: any = itemMap.get(l.stock_item_id);
            if (!it) continue;
            const cena =
              Number(it.avg_purchase_price) > 0
                ? Number(it.avg_purchase_price)
                : Number(it.purchase_price ?? 0);
            total_purchase += Number(l.quantity) * cena;
            total_sale += Number(l.quantity) * Number(it.sale_price ?? 0);
          }
          total_purchase = Math.round(total_purchase * 100) / 100;
          total_sale = Math.round(total_sale * 100) / 100;
          return ok({ data: { total_purchase, total_sale, items: items.length } });
        });
      },
    },
  },
});
