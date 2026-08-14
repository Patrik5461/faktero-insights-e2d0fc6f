/**
 * Cron: 5. v mesiaci pošle účtovníčke podklady za minulý mesiac.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Balíky s prílohami sa zostavujú dlho, preto musí mať volanie v cron úlohe
 * `timeout_milliseconds` — bez neho pg_net spojenie po piatich sekundách
 * pretrhne a úloha sa tvári, že prebehla.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/odovzdanie-mesacne")({
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
          // Mesiac sa dá vynútiť pri ručnom spustení, inak sa berie minulý.
          let mesiac: string | undefined;
          try {
            const telo = await request.json();
            if (typeof telo?.mesiac === "string" && /^\d{4}-\d{2}$/.test(telo.mesiac)) {
              mesiac = telo.mesiac;
            }
          } catch {
            // Cron posiela prázdne telo — to je v poriadku.
          }

          const { runMesacneOdovzdanie } = await import("@/lib/faktero/odovzdanie-cron.server");
          const r = await runMesacneOdovzdanie({ mesiac });
          return new Response(JSON.stringify({ ok: true, ...r }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "internal" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
