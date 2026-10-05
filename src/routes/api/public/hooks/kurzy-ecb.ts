/**
 * Cron: denné kurzy ECB do pamäte (`exchange_rates`).
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Bez neho sa pamäť dopĺňala len pri doklade v cudzej mene, a keď ECB práve
 * neodpovedala, doklad dostal posledný známy (starý) kurz.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/kurzy-ecb")({
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
          const { stiahniDenneKurzy } = await import("@/lib/faktero/kurzy.server");
          const pocet = await stiahniDenneKurzy();
          return new Response(JSON.stringify({ ok: true, kurzov: pocet }), {
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
