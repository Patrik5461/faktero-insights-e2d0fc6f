/**
 * Odhlásenie z denného súhrnu jedným klikom priamo v poštovom programe
 * (hlavička `List-Unsubscribe-Post`, RFC 8058). Pošta pošle POST na adresu
 * z hlavičky `List-Unsubscribe` — token je v `?t=` a je podpísaný, holé id
 * používateľa by dovolilo odhlásiť kohokoľvek.
 *
 * Len POST: odkazy v e-mailoch otvárajú aj antivírusové skenery, GET by tak
 * ľudí odhlasoval bez ich vedomia. Odkaz v tele e-mailu preto vedie na
 * stránku `/denny-suhrn/odhlasenie`, kde sa odhlásenie potvrdí tlačidlom.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/denny-suhrn/odhlasit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        try {
          const { odhlasZoSuhrnu } = await import("@/lib/faktero/denny-suhrn.server");
          const ok = await odhlasZoSuhrnu(t);
          return new Response(ok ? "Odhlásené." : "Neplatný odkaz.", {
            status: ok ? 200 : 400,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        } catch {
          return new Response("Odhlásenie sa nepodarilo.", { status: 500 });
        }
      },
    },
  },
});
