import { createFileRoute } from "@tanstack/react-router";

/** Bankové účty firmy — `id` je to isté `bank_account_id`, aké nesú pohyby. */
export const Route = createFileRoute("/api/v1/bank-accounts")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { bankoveUcty } = await import("@/lib/faktero/api-doklady.server");
        return handleApi(request, (ctx) => bankoveUcty(ctx));
      },
      POST: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zalozBankovyUcet } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => zalozBankovyUcet(ctx));
      },
    },
  },
});
