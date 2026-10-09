import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/purchase-invoices/$id/exported")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      POST: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { oznacOdovzdany } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => oznacOdovzdany(ctx, "prijata", params.id));
      },
    },
  },
});
