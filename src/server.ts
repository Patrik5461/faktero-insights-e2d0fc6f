import "./lib/error-capture";
import "./lib/sucet-presne";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { metodaApiNaJson } from "./lib/faktero/api-metoda";
import { hlavickyCsp } from "./lib/systemove-chyby/csp";
import { jeOdpojenieKlienta } from "./lib/odpojenie-klienta";
import {
  pouzivatelZHlaviciek,
  zaznamenajChybu,
  zdrojPodlaCesty,
} from "./lib/systemove-chyby/zapis.server";

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
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request?: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const zachytena = consumeLastCapturedError();
  /*
    Klient odišiel skôr, než prišla odpoveď (zavrel kartu, prešiel inam,
    nginx po 30 s vzdal čakanie). Nie je to chyba aplikácie a nikto odpoveď
    neuvidí — no každé také odpojenie písalo do chybového logu 30 riadkov
    (za 29.–30. 10. 2026 ~700 krát) a skutočné chyby sa v nich strácali.
  */
  if (jeOdpojenieKlienta(zachytena, request)) {
    return new Response(null, { status: 499 });
  }
  console.error(zachytena ?? new Error(`h3 swallowed SSR error: ${body}`));
  if (request) zapisPad(request, zachytena ?? new Error(`h3 swallowed SSR error: ${body}`), 500);
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
  // CSP zatiaľ len hlási porušenia (Admin → Chyby), nič neblokuje — viď lib/systemove-chyby/csp.ts.
  const nastav = (h: Headers) => {
    h.set("cache-control", hodnota);
    if (jeHtml) for (const [k, v] of hlavickyCsp()) h.set(k, v);
  };
  try {
    nastav(response.headers);
    return response;
  } catch {
    // Odpoveď z fetchu má hlavičky uzamknuté — vtedy sa poskladá nová.
    const hlavicky = new Headers(response.headers);
    nastav(hlavicky);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: hlavicky,
    });
  }
}

/** Pád pri spracovaní požiadavky → Admin → Chyby (fire-and-forget, nikdy nehodí). */
function zapisPad(request: Request, chyba: unknown, status: number) {
  try {
    const cesta = new URL(request.url).pathname;
    zaznamenajChybu({
      zdroj: zdrojPodlaCesty(cesta),
      chyba,
      kde: cesta.startsWith("/api/") ? cesta : null,
      trasa: cesta,
      metoda: request.method,
      httpStatus: status,
      userId: pouzivatelZHlaviciek(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
  } catch {
    /* zápis chyby nesmie nič zhodiť */
  }
}

/*
  Endpoint pod `/api/` vrátil 5xx sám (hook z cronu chybu zachytil a odpovedal
  500, API odpovedalo chybou). Text chyby je v tele — prečíta sa z kópie až
  po odoslaní, takže odpoveď nečaká.
*/
function zapisChybovuOdpoved(request: Request, response: Response) {
  try {
    if (response.status < 500) return;
    const cesta = new URL(request.url).pathname;
    if (!cesta.startsWith("/api/")) return;
    const typ = response.headers.get("content-type") ?? "";
    const kopia = typ.includes("json") || typ.startsWith("text/") ? response.clone() : null;
    const zapis = (sprava: string) =>
      zaznamenajChybu({
        zdroj: zdrojPodlaCesty(cesta),
        sprava,
        kde: cesta,
        trasa: cesta,
        metoda: request.method,
        httpStatus: response.status,
        userAgent: request.headers.get("user-agent"),
      });
    if (!kopia) return void zapis(`${cesta} vrátil ${response.status}`);
    void kopia
      .text()
      .then((t) => {
        // Pád, ktorý h3 prebalil na 500 — ten zapíše normalizeCatastrophicSsrResponse.
        if (t.includes('"unhandled":true')) return;
        let sprava = t.slice(0, 2000);
        try {
          const j = JSON.parse(t);
          sprava = String(j?.error?.message ?? j?.error ?? j?.message ?? sprava);
        } catch {
          /* nie je JSON */
        }
        zapis(`${cesta} vrátil ${response.status}: ${sprava || "(prázdne telo)"}`);
      })
      .catch(() => zapis(`${cesta} vrátil ${response.status}`));
  } catch {
    /* zápis chyby nesmie nič zhodiť */
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      zapisChybovuOdpoved(request, response);
      return sPlatnostou(
        request,
        await metodaApiNaJson(request, await normalizeCatastrophicSsrResponse(response, request)),
      );
    } catch (error) {
      console.error(error);
      if (!jeOdpojenieKlienta(error, request)) zapisPad(request, error, 500);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
