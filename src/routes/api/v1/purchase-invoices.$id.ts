import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/purchase-invoices/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { detailDokladu } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => detailDokladu(ctx, "prijata", params.id));
      },
      PUT: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { upravPrijatu } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => upravPrijatu(ctx, params.id));
      },
    },
  },
});
