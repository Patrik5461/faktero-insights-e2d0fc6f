import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/purchase-invoices/$id/payments/$paymentId")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("DELETE"),
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      DELETE: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zmazUhradu } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => zmazUhradu(ctx, params.id, params.paymentId));
      },
    },
  },
});
