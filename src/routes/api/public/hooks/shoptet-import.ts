/**
 * Cron: automatický import objednávok zo Shoptetu (každú hodinu).
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 * Odpovie hneď a pracuje na pozadí — nginx by dlhšiu požiadavku po 30 s prerušil.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/shoptet-import")({
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
        const { spustiAutoImportShoptetu } = await import("@/lib/faktero/shoptet-import.server");
        void spustiAutoImportShoptetu()
          .then((r) => console.log("[shoptet-import]", JSON.stringify(r)))
          .catch((e) => console.error("[shoptet-import]", e?.message ?? e));
        return new Response(JSON.stringify({ ok: true, spustene: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
