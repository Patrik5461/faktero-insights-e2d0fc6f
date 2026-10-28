import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/receipts/$id")({
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
        return handleApi(request, (ctx) => detailDokladu(ctx, "blocek", params.id));
      },
      PUT: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { upravBlocek } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => upravBlocek(ctx, params.id));
      },
    },
  },
});
