import { createFileRoute } from "@tanstack/react-router";

/** Cenník (produkty a služby) firmy. */
export const Route = createFileRoute("/api/v1/products")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zoznamProduktov } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => zoznamProduktov(ctx));
      },
      POST: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zalozProdukt } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => zalozProdukt(ctx));
      },
    },
  },
});
