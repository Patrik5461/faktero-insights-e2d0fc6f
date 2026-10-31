import { createFileRoute } from "@tanstack/react-router";

/**
 * Nočná synchronizácia palivových kariet (Shell…): transakcie, tankovania,
 * prijaté faktúry. Jeden beh trvá najviac ~22 s a spracuje pripojenia, ktoré
 * sa najdlhšie nesynchronizovali; volať sa dá aj každú hodinu — pripojenie
 * synchronizované za posledných 20 hodín sa preskočí.
 *
 * Cron (pripravené, NEZAPNUTÉ — zapína hlavná relácia). pg_net musí mať
 * timeout dlhší ako beh (pamäť faktero-pgnet-cron-timeout):
 *
 *   select cron.schedule(
 *     'faktero-palivove-karty-sync',
 *     '15 1-5 * * *',  -- 1:15–5:15 UTC, päť dávok za noc (token vziať z existujúceho jobu)
 *     $$
 *     select net.http_post(
 *       url := 'https://www.faktero.sk/api/public/hooks/palivove-karty-sync',
 *       headers := jsonb_build_object(
 *         'content-type', 'application/json',
 *         'x-faktero-cron-token', '<FAKTERO_CRON_TOKEN>'
 *       ),
 *       body := '{}'::jsonb,
 *       timeout_milliseconds := 300000
 *     );
 *     $$
 *   );
 */
export const Route = createFileRoute("/api/public/hooks/palivove-karty-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        const token =
          request.headers.get("x-faktero-cron-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const { nocnaSynchronizacia } = await import("@/lib/faktero/palivove-karty/sync.server");
          const r = await nocnaSynchronizacia({ casDo: Date.now() + 22_000 });
          return new Response(JSON.stringify(r), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          console.error("[palivove-karty-sync]", e?.message ?? e);
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
