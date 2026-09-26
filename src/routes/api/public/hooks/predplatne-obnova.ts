/**
 * Cron endpoint — denne:
 *  1. Upozorní 7 dní pred koncom obdobia (automatická obnova aj ručná platba).
 *  2. Strhne mesačnú platbu z karty uloženej pri prvej úhrade.
 *  3. Označí predplatné, ktorému obdobie uplynulo a platba neprišla.
 *
 * Chránené hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/predplatne-obnova")({
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
          const { posliUpozorneniaNaObnovu, strhniObnovy, oznacNezaplatene } = await import(
            "@/lib/faktero/predplatne-obnova.server"
          );
          const upozornenia = await posliUpozorneniaNaObnovu();
          const obnovy = await strhniObnovy();
          const nezaplatene = await oznacNezaplatene();
          return new Response(JSON.stringify({ ok: true, upozornenia, obnovy, nezaplatene }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
