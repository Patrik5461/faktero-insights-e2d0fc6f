import { createFileRoute } from "@tanstack/react-router";

/** Jeden produkt z cenníka. */
export const Route = createFileRoute("/api/v1/products/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { detailProduktu } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => detailProduktu(ctx, params.id));
      },
      PUT: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { upravProdukt } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => upravProdukt(ctx, params.id));
      },
    },
  },
});
