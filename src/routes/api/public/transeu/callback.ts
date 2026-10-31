/**
 * Návrat z prihlásenia do Trans.eu (OAuth 2.0 authorization code).
 * `state` je podpísaný a nesie firmu, používateľa a nonce; ten istý nonce musí
 * prísť v httpOnly cookie z prehliadača, ktorý prihlásenie začal (ochrana pred
 * CSRF). Kód platí len minútu, preto sa hneď vymení.
 *
 * Kódy chýb v `?chyba=` prekladá na vety stránka Nastavenia → Trans.eu.
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
        const {
          overStavTranseu,
          dokonciPrihlasenie,
          cookieSedi,
          cookieZPoziadavky,
          smiePripojit,
          zapisChybuPrihlasenia,
          COOKIE_TRANSEU,
          COOKIE_TRANSEU_NAVRAT,
          domenaCookie,
          navratovyHost,
        } = await import("@/lib/faktero/transeu.server");
        // Späť na adresu, z ktorej človek začal (faktero.sk alebo www) — tam je prihlásený.
        const host = navratovyHost(
          cookieZPoziadavky(request.headers.get("cookie"), COOKIE_TRANSEU_NAVRAT),
          url.host,
        );
        const back = `${url.protocol}//${host}/nastavenia/transeu`;
        // Cookies sú jednorazové — zmažú sa pri každom návrate.
        const zmaz = [COOKIE_TRANSEU, COOKIE_TRANSEU_NAVRAT].map(
          (meno) => `${meno}=; Path=/api/public/transeu; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        );
        const domena = domenaCookie(url.host);
        if (domena) zmaz.push(...zmaz.map((c) => `${c}; Domain=${domena}`));
        const presmeruj = (kod: string | null) =>
          odpoved(`${back}?${kod ? `chyba=${encodeURIComponent(kod)}` : "pripojene=1"}`, zmaz);

        if (error) {
          // Len známe kódy OAuth — do adresy nepustíme ľubovoľný text.
          const kod = /^[a-z_]{1,40}$/.test(error) ? error : "oauth_error";
          return presmeruj(kod);
        }
        if (!code || !state) return presmeruj("missing_code");
        try {
          const st = overStavTranseu(state);
          if (!st) return presmeruj("invalid_state");
          if (!cookieSedi(cookieZPoziadavky(request.headers.get("cookie")), st.nonce))
            return presmeruj("csrf");
          if (!(await smiePripojit(st.companyId, st.userId))) return presmeruj("invalid_state");
          try {
            await dokonciPrihlasenie(st.companyId, code);
          } catch (e: any) {
            // Firma je overená — dôvod ukáže stránka pri účte.
            await zapisChybuPrihlasenia(st.companyId, String(e?.message ?? e)).catch(() => {});
            console.error("[transeu callback]", e?.message ?? e);
            return presmeruj("callback_failed");
          }
          return presmeruj(null);
        } catch (e: any) {
          console.error("[transeu callback]", e?.message ?? e);
          return presmeruj("callback_failed");
        }
      },
    },
  },
});

function odpoved(to: string, cookies: string[]): Response {
  const h = new Headers({ Location: to, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}
