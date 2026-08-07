/**
 * Jednorazová obnova evidencie výpisov zo súborov v Storage.
 *
 * Určené na situáciu po odpojení banky: `bank_statements` sa kaskádovo zmažú
 * spolu s účtami, ale PDF a XML v Storage ostanú. Prepočítať ich nanovo nemusí
 * stačiť — vlastné výpisy sa rátajú z transakcií a tie banka po opätovnom
 * pripojení nemusí vydať tak hlboko do minulosti.
 *
 * Spúšťa sa ručne, až keď sú účty načítané:
 *   curl -X POST localhost:3000/api/public/hooks/bank-statements-restore \
 *        -H "x-faktero-cron-token: $FAKTERO_CRON_TOKEN"
 *
 * Je bezpečné pustiť ho opakovane — existujúce riadky preskočí.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/bank-statements-restore")({
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
          const { restoreStatementsFromStorage } =
            await import("@/lib/faktero/bank-statements-restore.server");
          const r = await restoreStatementsFromStorage();
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
