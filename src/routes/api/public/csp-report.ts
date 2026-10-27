/**
 * Hlásenia porušení Content-Security-Policy (zatiaľ len režim Report-Only
 * v nginx). Zapisujú sa do logu servera, aby sa pred zapnutím ostrej CSP
 * dalo vidieť, ktoré zdroje appka naozaj potrebuje. Nič neukladá.
 */
import { createFileRoute } from "@tanstack/react-router";

let zaMinutu = 0;
let minuta = 0;

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
        if (++zaMinutu <= 30) {
          const text = (await request.text().catch(() => "")).slice(0, 2000);
          try {
            const j = JSON.parse(text);
            const r = j["csp-report"] ?? j?.[0]?.body ?? j;
            console.warn(
              "[csp]",
              r["violated-directive"] ?? r.effectiveDirective ?? "?",
              r["blocked-uri"] ?? r.blockedURL ?? "?",
              r["document-uri"] ?? r.documentURL ?? "",
            );
          } catch {
            console.warn("[csp] neplatné hlásenie", text.slice(0, 200));
          }
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
