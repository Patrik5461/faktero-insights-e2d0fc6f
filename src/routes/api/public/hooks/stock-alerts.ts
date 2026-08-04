/**
 * Cron: denný email report o skladových položkách pod minimom.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/stock-alerts")({
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
          const { runLowStockAlerts } = await import("@/lib/faktero/stock-alerts.server");
          const r = await runLowStockAlerts();
          const sent = r.results.filter((x: any) => x.ok).length;
          return new Response(
            JSON.stringify({ ok: true, checked: r.checked, sent, results: r.results }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
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
