/**
 * Cron: synchronizácia GPS integrácií (GPS Dozor, Webdispečink, …).
 * Volaný cez pg_cron každých 15 minút s hlavičkou
 * `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Beh vezme pripojenia, ktoré dnes v noci (00–05 UTC) ešte nebežali, ktoré
 * sú nové (prvé stiahnutie 30 dní) alebo minule nedobehli — a spracúva ich,
 * kým nevyprší 25 s (nginx reže po 30 s). Zvyšok vezme ďalší beh.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/gps-sync")({
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
          const { behCronu } = await import("@/lib/faktero/gps/gps-sync.server");
          const r = await behCronu();
          return new Response(JSON.stringify({ ok: true, ...r }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          console.error("[gps-sync] fatal", e?.message);
          return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
