import "./lib/error-capture";
import "./lib/sucet-presne";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/*
  Ako dlho smie prehliadač držať odpoveď.

  Doteraz sme neposielali nič a prehliadač si potom hádal sám: HTML bez
  `Cache-Control` a bez validátora si pokojne nechá aj hodiny. Lenže v HTML sú
  názvy kúskov stránky s odtlačkom obsahu a tie po nasadení už neexistujú —
  z uloženej kópie sa načíta stránka, ktorá si nemá odkiaľ dotiahnuť zvyšok.
  Navonok to vyzerá tak, že sa stránka otvorí, ale tlačidlo sa len točí a nič
  nenapíše; a obnovenie nepomôže, lebo príde tá istá uložená kópia.

  HTML preto ide s `no-cache` — odložiť sa smie, ale zakaždým sa treba spýtať,
  či ešte platí. Kúsky stránky naopak môžu ležať v pamäti rok: ich názov sa mení
  s obsahom, takže sa nikdy nezmenia pod rukami.

  Je to tu, a nie v middleware `startInstance`: cez tento súbor prejde **každá**
  odpoveď vrátane statických súborov, ktoré si Nitro obsluhuje samo a k
  middleware sa vôbec nedostanú.
*/
function sPlatnostou(request: Request, response: Response): Response {
  const cesta = new URL(request.url).pathname;
  const jeKusok = cesta.startsWith("/assets/") || cesta.startsWith("/_build/");
  const jeHtml = (response.headers.get("content-type") ?? "").includes("text/html");
  if (!jeKusok && !jeHtml) return response;

  const hodnota = jeKusok ? "public, max-age=31536000, immutable" : "no-cache";
  try {
    response.headers.set("cache-control", hodnota);
    return response;
  } catch {
    // Odpoveď z fetchu má hlavičky uzamknuté — vtedy sa poskladá nová.
    const hlavicky = new Headers(response.headers);
    hlavicky.set("cache-control", hodnota);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: hlavicky,
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return sPlatnostou(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
