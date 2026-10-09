import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/unprocessed-documents")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zoznamNespracovanych } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => zoznamNespracovanych(ctx));
      },
      POST: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { nahrajNespracovany } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => nahrajNespracovany(ctx));
      },
    },
  },
});
