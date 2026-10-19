import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Registrácia cez server (captcha Turnstile + limit pokusov + admin API
 * Supabase). Bez prihlásenia — človek ešte účet nemá. Logika je
 * v `registracia.server.ts`.
 */

function kontextPoziadavky() {
  try {
    const req = getRequest();
    const { pathname } = new URL(req.url);
    return {
      headers: req.headers,
      ua: req.headers.get("user-agent"),
      // Most appky volá túto istú funkciu z endpointu `/api/mobil/<operácia>`.
      zApky: pathname.startsWith("/api/mobil/"),
    };
  } catch {
    return { headers: new Headers(), ua: null, zApky: false };
  }
}

/** Verejný kľúč widgetu Turnstile (je v env servera, nie v builde). */
export const nastavenieRegistracieFn = createServerFn({ method: "POST" }).handler(async () => {
  const { nastavenieRegistracie } = await import("./registracia.server");
  return nastavenieRegistracie();
});

const vstupRegistracie = z.object({
  email: z.string().trim().email().max(255),
  heslo: z.string().min(1).max(200),
  meno: z.string().trim().min(1).max(200),
  jazyk: z.string().max(5).nullish(),
  token: z.string().max(4096).nullish(),
  podmienky: z.boolean(),
  gdpr: z.boolean(),
});

export const registrujUcetFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => vstupRegistracie.parse(d))
  .handler(async ({ data }) => {
    const { registrujUcet, ipKlienta } = await import("./registracia.server");
    const k = kontextPoziadavky();
    return registrujUcet(data, { ip: ipKlienta(k.headers), ua: k.ua, zApky: k.zApky });
  });

const vstupPozvanky = z.object({
  token: z.string().regex(/^[a-f0-9]{32,128}$/, "Neplatný formát tokenu"),
  heslo: z.string().min(1).max(200),
  jazyk: z.string().max(5).nullish(),
});

/** Účet pre pozvaného — overí token pozvánky, adresu berie z nej. */
export const registrujPozvanehoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => vstupPozvanky.parse(d))
  .handler(async ({ data }) => {
    const { registrujPozvaneho } = await import("./registracia.server");
    return registrujPozvaneho(data);
  });
