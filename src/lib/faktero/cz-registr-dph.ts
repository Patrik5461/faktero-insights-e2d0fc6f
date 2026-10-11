/**
 * Registr plátců DPH (Finanční správa ČR) — čistá logika bez siete.
 *
 * Odberateľ v Česku ručí za DPH dodávateľa (§ 109 ZDPH), keď zaplatí
 * nespoľahlivému platcovi alebo na účet, ktorý platca nezverejnil v registri
 * (pri sume nad dvojnásobok limitu pre hotovosť). Register vracia zverejnené
 * účty v dvoch tvaroch — české číslo (predčíslie-číslo/kód banky) alebo IBAN
 * pri zahraničnom účte — a faktúra nesie IBAN. Porovnáva sa preto vždy IBAN.
 */

export type StavNespolehlivosti = "ANO" | "NE" | "NENALEZEN";

export type ZverejnenyUcet = {
  /** Ako ho ukazuje register: „35-3355550267/0100“ alebo IBAN. */
  zobrazenie: string;
  /** IBAN bez medzier — pre české číslo dopočítaný. */
  iban: string | null;
  od: string | null;
  do: string | null;
};

export type StavPlatce = {
  dic: string;
  nespolehlivy: StavNespolehlivosti;
  datumNespolehlivosti: string | null;
  cisloFu: string | null;
  nazov: string | null;
  ucty: ZverejnenyUcet[];
};

const MOD97 = (s: string) => {
  let zvysok = 0;
  for (const ch of s) zvysok = (zvysok * 10 + Number(ch)) % 97;
  return zvysok;
};

/** Písmená IBAN-u na čísla (A=10 … Z=35) pre výpočet kontroly. */
function naCisla(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
}

/** Platný IBAN (tvar aj kontrolné číslice)? */
export function jePlatnyIban(iban: string): boolean {
  const s = upravIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  return MOD97(naCisla(s.slice(4) + s.slice(0, 4))) === 1;
}

export function upravIban(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** České číslo účtu (predčíslie, číslo, kód banky) → IBAN CZ…. */
export function ceskyUcetNaIban(
  predcisli: string | null | undefined,
  cislo: string,
  kodBanky: string,
): string | null {
  const p = String(predcisli ?? "").replace(/\D/g, "");
  const c = String(cislo ?? "").replace(/\D/g, "");
  const k = String(kodBanky ?? "").replace(/\D/g, "");
  if (!c || c.length > 10 || p.length > 6 || k.length !== 4) return null;
  const bban = k + p.padStart(6, "0") + c.padStart(10, "0");
  const kontrola = 98 - MOD97(naCisla(`${bban}CZ00`));
  return `CZ${String(kontrola).padStart(2, "0")}${bban}`;
}

/**
 * Účet zadaný človekom — IBAN alebo „123-4567890/0100“ — na IBAN.
 * Nerozpoznaný tvar vráti null.
 */
export function ucetNaIban(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const iban = upravIban(s);
  if (/^[A-Z]{2}\d{2}/.test(iban)) return jePlatnyIban(iban) ? iban : null;
  const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(s.replace(/\s+/g, ""));
  return m ? ceskyUcetNaIban(m[1] ?? null, m[2], m[3]) : null;
}

/** IBAN CZ… → „predčíslie-číslo/kód“ (na zobrazenie). */
export function ibanNaCeskyUcet(iban: string): string | null {
  const s = upravIban(iban);
  if (!/^CZ\d{22}$/.test(s)) return null;
  const kod = s.slice(4, 8);
  const pred = s.slice(8, 14).replace(/^0+/, "");
  const cislo = s.slice(14).replace(/^0+/, "");
  return `${pred ? `${pred}-` : ""}${cislo}/${kod}`;
}

/** DIČ bez predpony CZ, len číslice (register chce 1–10 číslic). */
export function dicPreRegister(v: string | null | undefined): string | null {
  const s = String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/^CZ/, "");
  return /^\d{8,10}$/.test(s) ? s : null;
}

/**
 * Je účet z faktúry medzi zverejnenými (a stále platnými) účtami platcu?
 * `null` = faktúra účet nemá alebo sa nedá rozpoznať.
 */
export function jeUcetZverejneny(
  ucet: string | null | undefined,
  ucty: ZverejnenyUcet[],
  dnes = new Date(),
): boolean | null {
  const iban = ucetNaIban(ucet);
  if (!iban) return null;
  const den = dnes.toISOString().slice(0, 10);
  return ucty.some((u) => u.iban === iban && (!u.do || u.do >= den));
}
