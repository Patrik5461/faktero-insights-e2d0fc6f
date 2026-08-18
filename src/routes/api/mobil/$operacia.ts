import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpointy pre zabalenú mobilnú appku.
 *
 * Appka beží na vlastnom pôvode, takže serverové funkcie volať relatívne nevie.
 * Tento endpoint ich zavolá za ňu — a zámerne **tú istú funkciu**, nie kópiu
 * logiky. Prihlásenie sa nikde neduplikuje: middleware serverovej funkcie si
 * hlavičku `authorization` prečíta z tejto istej požiadavky.
 */
import { sCors } from "@/lib/mobile/cors-appky.server";

async function vybav(request: Request, operacia: string): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method !== "POST") {
    return sCors(Response.json({ error: "Iba POST" }, { status: 405 }), origin);
  }

  const { jeOperacia } = await import("@/lib/mobile/operacie");
  if (!jeOperacia(operacia)) {
    return sCors(Response.json({ error: "Neznáma operácia" }, { status: 404 }), origin);
  }

  let telo: any = {};
  try {
    telo = await request.json();
  } catch {
    return sCors(Response.json({ error: "Telo nie je JSON" }, { status: 400 }), origin);
  }

  try {
    const { SERVEROVE_FUNKCIE } = await import("@/lib/mobile/server-most");
    const funkcia = SERVEROVE_FUNKCIE[operacia];
    const vysledok = await funkcia({ data: telo?.data });
    return sCors(Response.json({ vysledok }), origin);
  } catch (e: any) {
    const sprava = String(e?.message ?? e);
    // Neprihláseného netreba tlačiť do 500 — appka podľa 401 vie ponúknuť
    // prihlásenie namiesto hlásenia o chybe servera.
    const stav = /unauthorized|prihlás/i.test(sprava) ? 401 : 400;
    return sCors(Response.json({ error: sprava.slice(0, 300) }, { status: stav }), origin);
  }
}

export const Route = createFileRoute("/api/mobil/$operacia")({
  server: {
    handlers: {
      POST: ({ request, params }) => vybav(request, params.operacia),
      // Predletová požiadavka prehliadača — bez nej sa POST z appky ani nepošle.
      OPTIONS: ({ request }) =>
        sCors(new Response(null, { status: 204 }), request.headers.get("origin")),
      GET: () => Response.json({ error: "Iba POST" }, { status: 405 }),
    },
  },
});
