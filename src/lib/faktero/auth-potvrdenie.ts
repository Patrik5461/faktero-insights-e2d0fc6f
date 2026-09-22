/*
  Potvrdenie z e-mailu (registrácia, pozvánka, zmena e-mailu) na vlastnej
  adrese. Predvolené šablóny Supabase posielajú odkaz na `…supabase.co/auth/v1/verify`
  — cudzia adresa v e-maile od Faktera pôsobí podozrivo a poštové programy ju
  radi označia. Šablóna preto mieri na `/auth/potvrdenie?token_hash=…&type=…&next=…`
  a overenie urobí naša stránka cez `verifyOtp`.
*/

export const TYPY_POTVRDENIA = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
export type TypPotvrdenia = (typeof TYPY_POTVRDENIA)[number];

export function jeTypPotvrdenia(v: unknown): v is TypPotvrdenia {
  return TYPY_POTVRDENIA.includes(v as TypPotvrdenia);
}

const NASE_HOSTY = new Set(["www.faktero.sk", "faktero.sk"]);

/**
 * Kam po potvrdení. Len cesta na našom webe — odkaz z e-mailu nesmie poslúžiť
 * na presmerovanie na cudziu stránku („otvorený redirect“).
 */
export function bezpecnyCiel(next: unknown, origin: string, predvolene = "/dashboard"): string {
  if (typeof next !== "string" || !next.trim()) return predvolene;
  const t = next.trim();
  if (t.startsWith("/") && !t.startsWith("//") && !t.startsWith("/\\")) return t;
  try {
    const u = new URL(t);
    const nas = new URL(origin);
    if (u.protocol === "https:" && (u.host === nas.host || NASE_HOSTY.has(u.host))) {
      return `${u.pathname}${u.search}${u.hash}` || predvolene;
    }
  } catch {
    /* nie je to adresa */
  }
  return predvolene;
}
