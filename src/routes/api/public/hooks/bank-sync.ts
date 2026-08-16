/**
 * Cron: denná synchronizácia bankových účtov a transakcií z Tatra banky.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Voliteľné telo: {"days_back": 30} — dokedy dozadu ťahať transakcie (default 14).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/bank-sync")({
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
          const { MAX_DAYS_BACK } = await import("@/lib/faktero/bank-sync.server");
          let daysBack = 14;
          try {
            const body = await request.json();
            const n = Number(body?.days_back);
            // Strop je najdlhšie okno, aké banka dá — dlhší dopyt aj tak
            // orežeme na dátum, ktorý ponúkne sama.
            if (Number.isFinite(n) && n > 0 && n <= MAX_DAYS_BACK) daysBack = n;
          } catch {
            // prázdne telo je v poriadku — ostáva default
          }
          const { runDailyBankSync } = await import("@/lib/faktero/bank-sync.server");
          const r = await runDailyBankSync(daysBack);
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
