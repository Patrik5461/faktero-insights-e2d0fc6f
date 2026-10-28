import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/accounting-codes")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zoznamPredkontacii } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => zoznamPredkontacii(ctx));
      },
    },
  },
});
