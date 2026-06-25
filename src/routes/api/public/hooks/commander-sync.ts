import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily Commander GPS auto-sync hook.
 *
 * Schedule (Europe/Bratislava 03:00 daily) — example pg_cron job:
 *
 *   select cron.schedule(
 *     'commander-daily-sync',
 *     '0 2 * * *',  -- 02:00 UTC = 03:00 Europe/Bratislava (CET) / 04:00 CEST
 *     $$
 *     select net.http_post(
 *       url := 'https://faktero-invoice-hub.lovable.app/api/public/hooks/commander-sync',
 *       headers := jsonb_build_object(
 *         'content-type', 'application/json',
 *         'x-faktero-cron-secret', '<COMMANDER_SYNC_SECRET>'
 *       ),
 *       body := '{}'::jsonb
 *     );
 *     $$
 *   );
 */
export const Route = createFileRoute("/api/public/hooks/commander-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-faktero-cron-secret");
        const expected = process.env.COMMANDER_SYNC_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "content-type": "application/json" },
          });
        }
        try {
          const { runCommanderDailySync } = await import("@/lib/faktero/commander-cron.server");
          const r = await runCommanderDailySync();
          return new Response(JSON.stringify(r), {
            status: 200, headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          console.error("[commander-sync] fatal", e);
          return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});