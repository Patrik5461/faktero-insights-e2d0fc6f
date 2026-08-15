/**
 * Cron: pozrie sa, či sa konektor do Pohody neodmlčal.
 *
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 * Voliteľne `{"dni": 3}` skráti hranicu ticha — hodí sa pri skúšaní.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/pohoda-strazca")({
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
          let dni: number | undefined;
          try {
            const telo = await request.json();
            if (Number.isFinite(telo?.dni) && telo.dni > 0) dni = Number(telo.dni);
          } catch {
            // Cron posiela prázdne telo — to je v poriadku.
          }

          const { runStrazcaKonektora } = await import("@/lib/faktero/pohoda-strazca.server");
          const r = await runStrazcaKonektora({ dni });
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
