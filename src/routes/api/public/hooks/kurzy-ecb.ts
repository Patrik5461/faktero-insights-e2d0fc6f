/**
 * Cron: denné kurzy ECB do pamäte (`exchange_rates`), k nim ČNB (`kurzy_cnb`)
 * a mesačné kurzy BMF (`kurzy_bmf`) s prepočtom dokladov, ktoré na ne čakali.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Bez neho sa pamäť dopĺňala len pri doklade v cudzej mene, a keď ECB práve
 * neodpovedala, doklad dostal posledný známy (starý) kurz.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/kurzy-ecb")({
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
          const { stiahniDenneKurzy, stiahniDenneKurzyCnb } =
            await import("@/lib/faktero/kurzy.server");
          const pocet = await stiahniDenneKurzy();
          // Kurzy ČNB pre české firmy — výpadok ČNB nesmie zhodiť eurové kurzy.
          const cnb = await stiahniDenneKurzyCnb().catch((e) => {
            console.warn("[kurzy-cnb]", String(e?.message ?? e));
            return 0;
          });
          // Mesačné kurzy BMF pre nemecké firmy (§ 16 Abs. 6 UStG) — tiež nesmú zhodiť ECB.
          const { stiahniKurzyBmfDoPamate } = await import("@/lib/faktero/kurzy.server");
          const bmf = await stiahniKurzyBmfDoPamate().catch((e) => {
            console.warn("[kurzy-bmf]", String(e?.message ?? e));
            return { kurzov: 0, prepocitane: 0 };
          });
          return new Response(
            JSON.stringify({
              ok: true,
              kurzov: pocet,
              kurzovCnb: cnb,
              kurzovBmf: bmf.kurzov,
              prepocitaneNaBmf: bmf.prepocitane,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
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
