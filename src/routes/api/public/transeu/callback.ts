/**
 * Návrat z prihlásenia do Trans.eu (OAuth 2.0 authorization code).
 * `state` je podpísaný a nesie firmu; kód platí len minútu, preto sa hneď vymení.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/transeu/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const back = `${url.protocol}//${url.host}/nastavenia/transeu`;
        if (error) return presmeruj(`${back}?chyba=${encodeURIComponent(error.slice(0, 60))}`);
        if (!code || !state) return presmeruj(`${back}?chyba=missing_code`);
        try {
          const { overStavTranseu, dokonciPrihlasenie } =
            await import("@/lib/faktero/transeu.server");
          const companyId = overStavTranseu(state);
          if (!companyId) return presmeruj(`${back}?chyba=invalid_state`);
          await dokonciPrihlasenie(companyId, code);
          return presmeruj(`${back}?pripojene=1`);
        } catch (e: any) {
          console.error("[transeu callback]", e?.message ?? e);
          return presmeruj(`${back}?chyba=callback_failed`);
        }
      },
    },
  },
});

function presmeruj(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}
