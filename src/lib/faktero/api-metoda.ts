/*
  Nepodporovaná metóda na existujúcej ceste verejného API (napr. DELETE
  /api/v1/invoices/{id}). TanStack Start pre ňu skúša vykresliť stránku a
  vráti 406 {"error":"Only HTML requests are supported here"} — iný tvar
  chyby, než aký API sľubuje, a iný kód. Prepíše sa na 405 method_not_allowed
  v jednotnom formáte. Volá sa zo `server.ts` pre každú odpoveď.
*/
export async function metodaApiNaJson(request: Request, response: Response): Promise<Response> {
  if (response.status !== 406) return response;
  const cesta = new URL(request.url).pathname;
  if (!cesta.startsWith("/api/v1/") && cesta !== "/api/v1") return response;
  const telo = await response
    .clone()
    .text()
    .catch(() => "");
  if (!telo.includes("Only HTML requests")) return response;
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
