/**
 * Hlásenia porušení Content-Security-Policy (zatiaľ režim Report-Only,
 * hlavičku pridáva `src/server.ts`). Idú do Admin → Chyby ako varovanie
 * z prehliadača — pred zapnutím ostrej CSP tam bude vidno, ktoré zdroje
 * appka naozaj potrebuje. Formát report-uri aj Reporting API (report-to).
 */
import { createFileRoute } from "@tanstack/react-router";

let zaMinutu = 0;
let minuta = 0;
/** To isté porušenie (direktíva + zdroj) sa zapíše najviac raz za hodinu z tohto procesu. */
const naposledy = new Map<string, number>();
const HODINA = 3_600_000;

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Strop 30 hlásení za minútu — jedna stránka ich vie poslať desiatky.
        const teraz = Math.floor(Date.now() / 60_000);
        if (teraz !== minuta) {
          minuta = teraz;
          zaMinutu = 0;
        }
        if (++zaMinutu > 30) return new Response(null, { status: 204 });
        try {
          const text = (await request.text().catch(() => "")).slice(0, 8000);
          const { rozoberCspHlasenia, spravaCsp } = await import("@/lib/systemove-chyby/csp");
          const hlasenia = rozoberCspHlasenia(text);
          if (!hlasenia.length) return new Response(null, { status: 204 });
          const { zaznamenajChybu } = await import("@/lib/systemove-chyby/zapis.server");
          const t = Date.now();
          if (naposledy.size > 500) naposledy.clear();
          for (const h of hlasenia) {
            const sprava = spravaCsp(h);
            if (t - (naposledy.get(sprava) ?? 0) < HODINA) continue;
            naposledy.set(sprava, t);
            zaznamenajChybu({
              zdroj: "prehliadac",
              uroven: "varovanie",
              sprava,
              stack: h.subor ? `zdroj: ${h.subor}` : null,
              kde: "csp",
              trasa: h.stranka,
              userAgent: request.headers.get("user-agent"),
            });
          }
        } catch {
          /* hlásenie nesmie nič zhodiť */
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
