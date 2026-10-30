/**
 * Cron: denné odhady využitia Supabase z logov (egress, realtime, edge funkcie)
 * do `admin_usage_daily` pre Admin → Využitie zdrojov.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`,
 * v noci viackrát — každý beh doplní jeden chýbajúci deň (limit API logov).
 * Telo `{ "den": "YYYY-MM-DD" }` vynúti prepočet konkrétneho dňa.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/hooks/zdroje-logy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return json({ error: "unauthorized" }, 401);
        }
        try {
          const telo = (await request.json().catch(() => ({}))) as { den?: unknown };
          const den =
            typeof telo?.den === "string" && /^\d{4}-\d{2}-\d{2}$/.test(telo.den)
              ? telo.den
              : undefined;
          const { doplnDenVyuzitia } = await import("@/lib/faktero/zdroje-logy.server");
          const vysledok = await doplnDenVyuzitia(den);
          if (!vysledok.ok) console.warn("[zdroje-logy]", vysledok.den, vysledok.dovod);
          // 200 aj pri 429 — ďalší beh to skúsi znova, cron netreba plašiť.
          return json(vysledok);
        } catch (e: any) {
          console.error("[zdroje-logy]", String(e?.message ?? e));
          return json({ error: e?.message ?? "internal" }, 500);
        }
      },
    },
  },
});
