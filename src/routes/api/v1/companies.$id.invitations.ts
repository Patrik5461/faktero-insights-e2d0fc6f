import { createFileRoute } from "@tanstack/react-router";

/** Pozvánka do firmy (len kľúč pre viac firiem, ktorého majiteľ je vlastník/admin). */
export const Route = createFileRoute("/api/v1/companies/$id/invitations")({
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
        const { pozviDoFirmy } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => pozviDoFirmy(ctx, params.id));
      },
    },
  },
});
