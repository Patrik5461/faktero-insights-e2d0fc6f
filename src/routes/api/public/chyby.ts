/**
 * Chyby z prehliadača a z mobilnej appky → Admin → Chyby.
 *
 * Volá ho `lib/systemove-chyby/klient.ts` (window.onerror, unhandledrejection,
 * chybové hranice React). Bez prihlásenia, s malým telom a limitmi — podrobnosti
 * v `lib/systemove-chyby/prijem.ts`. Appka beží na vlastnom pôvode
 * (`capacitor://localhost`), preto CORS pre jej pôvody.
 */
import { createFileRoute } from "@tanstack/react-router";
import { noveLimityPrijmu, type LimityPrijmu } from "@/lib/systemove-chyby/prijem";

let _limity: LimityPrijmu | null = null;
const limity = () => (_limity ??= noveLimityPrijmu());

async function sCorsAppky(odpoved: Response, origin: string | null) {
  const { sCors } = await import("@/lib/mobile/cors-appky.server");
  return sCors(odpoved, origin);
}

export const Route = createFileRoute("/api/public/chyby")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        sCorsAppky(new Response(null, { status: 204 }), request.headers.get("origin")),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const hotovo = () => sCorsAppky(new Response(null, { status: 204 }), origin);
        try {
          const { citajTelo, posudChybuZKlienta } = await import("@/lib/systemove-chyby/prijem");
          const text = await citajTelo(request);
          if (!text) return hotovo();
          let vstup: unknown;
          try {
            vstup = JSON.parse(text);
          } catch {
            return hotovo();
          }
          const { ipKlienta, jeVerejnaIp } = await import("@/lib/faktero/registracia.server");
          const ip = ipKlienta(request.headers);
          const posudok = posudChybuZKlienta(vstup, {
            ip: ip && jeVerejnaIp(ip) ? ip : null,
            limity: limity(),
          });
          if (!posudok.ok) return hotovo();
          const { zaznamenajChybu } = await import("@/lib/systemove-chyby/zapis.server");
          const t = posudok.telo;
          zaznamenajChybu({
            zdroj: t.zdroj,
            uroven: posudok.uroven,
            sprava: t.sprava,
            stack: t.stack ?? null,
            trasa: t.trasa ?? null,
            userAgent: request.headers.get("user-agent"),
            // Pečiatka balíčka appky; web ju nemá — doplní sa commit servera.
            vydanie: t.vydanie ?? null,
          });
        } catch {
          /* príjem chyby nesmie nič zhodiť */
        }
        return hotovo();
      },
    },
  },
});
