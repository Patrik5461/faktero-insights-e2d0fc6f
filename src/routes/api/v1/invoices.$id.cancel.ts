import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/invoices/$id/cancel")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
      POST: async ({ request, params }) => {
        const { handleApi, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { isCompanyActive } = await import("@/lib/faktero/active-check.server");
          if (!(await isCompanyActive(ctx.company_id))) {
            return err(
              "plan_inactive",
              "Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán.",
              402,
            );
          }
          /*
            Servisný kľúč spúšťač zámku odovzdania púšťa — storno odovzdanej
            faktúry (aj z uzavretého obdobia) stráži `stornujFakturuApi` a vráti
            409 `locked` ako aplikácia.
          */
          const { stornujFakturuApi } = await import("@/lib/faktero/api-evidencia.server");
          const r = await stornujFakturuApi(ctx, params.id);
          if (r.status === 200) {
            // invoice.cancelled zapísal spúšťač do fronty; doručí sa hneď, nie až cronom.
            const { spracujWebhookOutbox } = await import("@/lib/faktero/webhook-outbox.server");
            await spracujWebhookOutbox({ entityId: params.id }).catch(() => {});
          }
          return r;
        });
      },
    },
  },
});
