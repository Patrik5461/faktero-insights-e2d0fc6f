import { createFileRoute } from "@tanstack/react-router";

/** Hromadný prenos adresára (do 1000 kontaktov naraz), páruje podľa external_id, IČO alebo mena. */
export const Route = createFileRoute("/api/v1/customers/import")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      POST: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { importKontaktov } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => importKontaktov(ctx));
      },
    },
  },
});
