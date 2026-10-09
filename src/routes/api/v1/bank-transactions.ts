import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/bank-transactions")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { bankovePohyby } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => bankovePohyby(ctx));
      },
    },
  },
});
