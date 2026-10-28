import { createFileRoute } from "@tanstack/react-router";

/** Pohyby na účet založený cez API (prenos z iného programu) — duplicity sa preskočia. */
export const Route = createFileRoute("/api/v1/bank-accounts/$id/transactions")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      POST: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { prenesPohyby } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => prenesPohyby(ctx, params.id));
      },
    },
  },
});
