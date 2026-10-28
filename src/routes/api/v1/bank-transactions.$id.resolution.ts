import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/bank-transactions/$id/resolution")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      POST: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { vybavPohyb } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => vybavPohyb(ctx, params.id));
      },
    },
  },
});
