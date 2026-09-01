/**
 * Cron: doplní automaticky rozpoznaným jazdám adresy a meno vodiča.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Beží krátko (pár desiatok jázd s pamäťou na miesta), takže odpovedá rovno
 * výsledkom — na rozdiel od mesačných výpisov tu nie je čo prerušiť.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/jazdy-doplnenie")({
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
          let limit = 200;
          try {
            const body = await request.json();
            if (Number.isFinite(body?.limit)) limit = Math.min(1000, Math.max(1, body.limit));
          } catch {
            // prázdne telo je v poriadku
          }
          const { doplnJazdy } = await import("@/lib/faktero/jazdy-doplnenie.server");
          const r = await doplnJazdy(limit);
          return new Response(JSON.stringify({ ok: true, ...r }), {
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
