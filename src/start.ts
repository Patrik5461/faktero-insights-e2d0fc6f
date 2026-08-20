import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/*
  Ako dlho smie prehliadač držať odpoveď.

  Doteraz sme neposielali nič a prehliadač si potom **hádal sám**: HTML bez
  `Cache-Control` a bez validátora si pokojne nechá aj hodiny. Lenže v HTML sú
  názvy kúskov stránky s odtlačkom obsahu a tie po nasadení už neexistujú —
  z uloženého HTML sa teda načíta stránka, ktorá si nemá odkiaľ dotiahnuť
  zvyšok. Navonok to vyzerá tak, že sa stránka otvorí, ale tlačidlo sa len
  točí a nič nenapíše; obnovenie nepomôže, lebo príde tá istá uložená kópia.

  HTML preto ide s `no-cache` — prehliadač si ho môže odložiť, ale zakaždým sa
  musí spýtať, či ešte platí. Kúsky stránky naopak môžu ležať v pamäti rok:
  ich názov sa mení s obsahom, takže sa nikdy nezmenia „pod rukami".
*/
const cacheMiddleware = createMiddleware().server(async ({ next, request }) => {
  const odpoved = await next();
  try {
    const hlavicky = (odpoved as unknown as Response)?.headers;
    if (!hlavicky || typeof hlavicky.set !== "function") return odpoved;

    const cesta = new URL(request.url).pathname;
    if (cesta.startsWith("/assets/") || cesta.startsWith("/_build/")) {
      hlavicky.set("cache-control", "public, max-age=31536000, immutable");
    } else if ((hlavicky.get("content-type") ?? "").includes("text/html")) {
      hlavicky.set("cache-control", "no-cache");
    }
  } catch {
    // Odpoveď s uzamknutými hlavičkami sa nechá tak — hlavička je vylepšenie,
    // nie podmienka toho, aby stránka fungovala.
  }
  return odpoved;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [cacheMiddleware, errorMiddleware],
}));
