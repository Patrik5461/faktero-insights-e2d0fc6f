/**
 * Cron endpoint — každé ráno o 8:00 pošle upomienky pre faktúry po splatnosti.
 *
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        if (!token || token !== process.env.FAKTERO_CRON_TOKEN) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const { runOverdueReminders } = await import("@/lib/faktero/reminders.server");
          const r = await runOverdueReminders();
          const sent = r.results.filter((x) => x.ok).length;
          const failed = r.results.filter((x) => !x.ok && !x.skipped).length;
          return new Response(
            JSON.stringify({
              ok: true,
              checked: r.checked,
              sent,
              failed,
              results: r.results,
            }),
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
