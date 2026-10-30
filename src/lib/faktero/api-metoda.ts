/*
  Nepodporovaná metóda na existujúcej ceste verejného API (napr. DELETE
  /api/v1/invoices/{id}). TanStack Start pre ňu skúša vykresliť stránku a
  vráti 406 {"error":"Only HTML requests are supported here"} — iný tvar
  chyby, než aký API sľubuje, a iný kód. Prepíše sa na 405 method_not_allowed
  v jednotnom formáte. Volá sa zo `server.ts` pre každú odpoveď.

  406 príde len pri `Accept: application/json`. Bežní klienti (curl, fetch v Node,
  requests) posielajú `Accept` so všetkým (hviezdička) a TanStack im stránku naozaj vykreslí — HTML
  so stavom 200, takže integrátor si myslel, že DELETE prešiel. Žiadny koncový
  bod /api/v1 HTML nevracia (neznáme cesty chytá `api/v1/$.ts` ako JSON 404),
  preto aj HTML odpoveď pod /api/v1 znamená nepodporovanú metódu.
*/
export async function metodaApiNaJson(request: Request, response: Response): Promise<Response> {
  const cesta = new URL(request.url).pathname;
  if (!cesta.startsWith("/api/v1/") && cesta !== "/api/v1") return response;
  const html = (response.headers.get("content-type") ?? "").includes("text/html");
  if (response.status === 406) {
    const telo = await response
      .clone()
      .text()
      .catch(() => "");
    if (!telo.includes("Only HTML requests")) return response;
  } else if (!html || response.status >= 300) {
    return response;
  }
  await response.body?.cancel().catch(() => {});
  // Predbežná požiadavka CORS na koncový bod bez vlastného OPTIONS — prehliadač
  // potrebuje 2xx s hlavičkami, inak skutočnú požiadavku vôbec nepošle.
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, x-company",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
    });
  return new Response(
    JSON.stringify({
      error: {
        code: "method_not_allowed",
        message: `Metódu ${request.method} tento koncový bod neprijíma. Zoznam je v dokumentácii API.`,
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    },
  );
}
