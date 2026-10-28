import { createFileRoute } from "@tanstack/react-router";

/** Členovia firmy a čakajúce pozvánky. */
export const Route = createFileRoute("/api/v1/companies/$id/members")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request, params }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { clenoviaFirmy } = await import("@/lib/faktero/api-zapis.server");
        return handleApi(request, (ctx) => clenoviaFirmy(ctx, params.id));
      },
    },
  },
});
