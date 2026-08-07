/**
 * Cron: mesačné bankové výpisy (PDF + XML) pre všetky pripojené účty.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Beh má dva kroky: najprv sa výpisy vypýtajú od Tatra banky a čo pre ne
 * banka nevydá (účty vedené v inej banke), to si zostavíme sami z transakcií.
 *
 * Voliteľné telo: {"period_start":"2026-07-01","period_end":"2026-07-31"}
 * — bez neho sa berie predchádzajúci celý kalendárny mesiac.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/bank-statements")({
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
          let period: { start: string; end: string } | undefined;
          try {
            const body = await request.json();
            const s = body?.period_start;
            const e = body?.period_end;
            if (typeof s === "string" && typeof e === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
              period = { start: s, end: e };
            }
          } catch {
            // prázdne telo je v poriadku — berie sa predchádzajúci mesiac
          }
          const { runMonthlyStatements } = await import("@/lib/faktero/bank-statements.server");
          const r = await runMonthlyStatements(period);
          // Čo banka nevydala (účty vedené inde), dogenerujeme z vlastných dát.
          const { generateOwnStatements } =
            await import("@/lib/faktero/bank-statements-own.server");
          const own = await generateOwnStatements(r.period);
          return new Response(JSON.stringify({ ok: true, ...r, own }), {
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
