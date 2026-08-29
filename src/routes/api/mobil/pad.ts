import { createFileRoute } from "@tanstack/react-router";

/**
 * Výpis pádu z mobilnej aplikácie.
 *
 * Ostatné hlásenia chodia cez `spatna-vazba`, ktorá vyžaduje prihlásenie. Pád
 * ale prihlásenie mať nemusí: keď sa appka zloží ešte pred načítaním stránky,
 * žiadny JavaScript ani relácia neexistujú a výpis by ostal v telefóne. Preto
 * je tento endpoint verejný a zapisuje ho natívna časť appky sama.
 *
 * Verejné je len písanie a len do vlastnej tabuľky. Čítať ju nemôže nikto —
 * výpis môže obsahovať názvy tried aj kusy pamäte.
 */
import { sCors } from "@/lib/mobile/cors-appky.server";

/** Dlhší výpis nikto nečíta a stĺpec nemá byť odkladiskom. */
const STROP = 8000;

async function vybav(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method !== "POST") {
    return sCors(Response.json({ error: "Iba POST" }, { status: 405 }), origin);
  }

  let telo: { balicek?: unknown; system?: unknown; vypis?: unknown };
  try {
    telo = await request.json();
  } catch {
    return sCors(Response.json({ error: "Telo nie je JSON" }, { status: 400 }), origin);
  }

  const balicek = typeof telo.balicek === "string" ? telo.balicek.slice(0, 100) : "";
  const vypis = typeof telo.vypis === "string" ? telo.vypis.slice(0, STROP) : "";
  // Balíček musí byť náš. Verejný endpoint bez tejto podmienky je pozvánka
  // na to, aby si doň hocikto písal, čo chce.
  if (!/^sk\.tobify\.[a-z]+$/.test(balicek) || vypis.length < 10) {
    return sCors(Response.json({ error: "Neplatné hlásenie" }, { status: 400 }), origin);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  /*
    Typy tabuliek sa generujú zo schémy dávkovo, takže nová tabuľka v nich
    ešte nie je. Zápis je jeden a jednoduchý, tak nech kvôli nemu nečaká
    celý endpoint na preklad typov.
  */
  const admin = supabaseAdmin as unknown as {
    from(tabulka: string): {
      insert(hodnoty: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await admin.from("app_crashes").insert({
    balicek,
    system: typeof telo.system === "string" ? telo.system.slice(0, 200) : null,
    vypis,
  });
  if (error) {
    return sCors(Response.json({ error: error.message.slice(0, 200) }, { status: 500 }), origin);
  }
  return sCors(new Response(null, { status: 204 }), origin);
}

export const Route = createFileRoute("/api/mobil/pad")({
  server: {
    handlers: {
      POST: ({ request }) => vybav(request),
      OPTIONS: ({ request }) =>
        sCors(new Response(null, { status: 204 }), request.headers.get("origin")),
    },
  },
});
