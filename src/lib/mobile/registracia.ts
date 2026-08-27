/**
 * Pravidlá registrácie účtu a založenia firmy v telefóne.
 *
 * Sú tu, a nie v obrazovke, aby sa dali overiť testom: na telefóne sa
 * vyplnený formulár skúša ťažko a chybná podmienka sa prejaví až tým, že
 * tlačidlo nič nespraví.
 */
import type { Kluc } from "./preklady";

/** Kam má viesť odkaz z potvrdzovacieho e-mailu. */
export function adresaPotvrdenia(nativna: boolean, origin: string | null, server: string): string {
  /*
    V zabalenej appke je pôvod `capacitor://localhost` — takú adresu Supabase
    medzi povolené presmerovania nepustí a odkaz z e-mailu by skončil chybou.
    Potvrdenie preto vždy mieri na web; do appky sa človek vráti prihlásením.
  */
  if (nativna || !origin || !origin.startsWith("http")) return `${server}/dashboard`;
  return `${origin}/dashboard`;
}

export type VstupRegistracie = {
  meno: string;
  email: string;
  heslo: string;
  podmienky: boolean;
  gdpr: boolean;
};

/**
 * Vráti kľúč hlášky, prečo sa registrovať nedá — alebo `null`, keď je všetko
 * v poriadku. Kľúč, nie vetu: obrazovka ju preloží do jazyka appky.
 */
export function overRegistraciu(v: VstupRegistracie): Kluc | null {
  if (!v.meno.trim()) return "reg.chyba.meno";
  const email = v.email.trim();
  // Nie na overenie e-mailu (to vie len doručenie), ale na preklep bez odoslania.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "reg.chyba.email";
  if (v.heslo.length < 8) return "reg.chyba.heslo";
  if (!v.podmienky || !v.gdpr) return "reg.chyba.suhlasy";
  return null;
}

export type VstupFirmy = {
  name: string;
  ico?: string;
  email?: string;
  iban?: string;
};

/** To isté pre založenie firmy. Povinný je len názov — zvyšok sa dá doplniť neskôr. */
export function overFirmu(v: VstupFirmy): Kluc | null {
  if (!v.name.trim()) return "vf.chyba.nazov";
  const ico = (v.ico ?? "").replace(/\s+/g, "");
  if (ico && !/^\d{6,8}$/.test(ico)) return "vf.chyba.ico";
  const email = (v.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "vf.chyba.email";
  const iban = (v.iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return "vf.chyba.iban";
  return null;
}

/** Údaje firmy do tvaru, aký čaká `create_company_with_owner`. */
export function firmaNaZapis(v: Record<string, string>) {
  const cistaHodnota = (k: string) => {
    const x = (v[k] ?? "").trim();
    return x === "" ? undefined : x;
  };
  return {
    _name: (v.name ?? "").trim(),
    _ico: cistaHodnota("ico")?.replace(/\s+/g, ""),
    _dic: cistaHodnota("dic"),
    _ic_dph: cistaHodnota("ic_dph"),
    _street: cistaHodnota("street"),
    _city: cistaHodnota("city"),
    _zip: cistaHodnota("zip"),
    _country: cistaHodnota("country") ?? "SK",
    _email: cistaHodnota("email"),
    _phone: cistaHodnota("phone"),
    _iban: cistaHodnota("iban")?.replace(/\s+/g, "").toUpperCase(),
    _default_currency: "EUR",
  };
}
