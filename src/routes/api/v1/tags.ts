import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/tags")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi } = await import("@/lib/faktero/api-auth.server");
        const { zoznamStitkov } = await import("@/lib/faktero/api-evidencia.server");
        return handleApi(request, (ctx) => zoznamStitkov(ctx));
      },
    },
  },
});
