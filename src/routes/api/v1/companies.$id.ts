import { createFileRoute } from "@tanstack/react-router";

/** Detail a úprava firmy (kľúč účtu: firmy, ktoré spravuje; kľúč firmy: len svoja). */
export const Route = createFileRoute("/api/v1/companies/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { detailFirmy } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => detailFirmy(ctx, params.id));
      },
      PUT: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { upravFirmu } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => upravFirmu(ctx, params.id));
      },
    },
  },
});
