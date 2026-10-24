import { createFileRoute } from "@tanstack/react-router";

/**
 * Neznáma cesta pod /api/v1/. Bez tejto trasy ju zachytil HTML render a vrátil
 * 500 „Only HTML requests are supported here“ — integrátor si myslel, že padol
 * server, hoci mal len preklep v adrese.
 */
const nenajdene = ({ request }: { request: Request }) =>
  new Response(
    JSON.stringify({
      error: {
        code: "not_found",
        message: `Koncový bod ${new URL(request.url).pathname} neexistuje. Zoznam je v dokumentácii API.`,
      },
    }),
    {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    },
  );

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: nenajdene,
      POST: nenajdene,
      PUT: nenajdene,
      PATCH: nenajdene,
      DELETE: nenajdene,
      OPTIONS: nenajdene,
    },
  },
});
