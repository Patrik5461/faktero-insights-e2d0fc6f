import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/purchase-invoices/$id/payments")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { uhradyPrijatej } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => uhradyPrijatej(ctx, params.id));
      },
      POST: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { pridajUhradu } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => pridajUhradu(ctx, params.id));
      },
    },
  },
});
