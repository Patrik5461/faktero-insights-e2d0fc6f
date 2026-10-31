/**
 * Cron: doručenie webhookov z fronty `webhook_outbox` (invoice.paid,
 * bank_transaction.created). Volaný každú minútu cez pg_cron s hlavičkou
 * `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Ten istý beh posiela aj opakovania neúspešných doručení všetkých udalostí
 * (rozvrh v `webhook-opakovanie.ts`) — samostatný cron by len pribudol.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/webhook-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const zaciatok = Date.now();
          const { spracujWebhookOutbox } = await import("@/lib/faktero/webhook-outbox.server");
          const r = await spracujWebhookOutbox();
          const { spracujOpakovaniaWebhookov } =
            await import("@/lib/faktero/webhook-trigger.server");
          const opakovania = await spracujOpakovaniaWebhookov({ dokedy: zaciatok + 50_000 });
          return new Response(JSON.stringify({ ok: true, ...r, opakovania }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
