/**
 * Spoločné pomôcky demo dát: deterministická náhoda (rovnaké dáta pri každom
 * štarte), dátumy relatívne k dnešku a stabilné id.
 */
import { createHash } from "node:crypto";

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Stabilné UUID z textu — rovnaký kľúč dá vždy rovnaké id (odkazy medzi tabuľkami). */
export function uid(kluc: string): string {
  const h = createHash("sha1")
    .update("faktero-demo:" + kluc)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Náhoda so semienkom (mulberry32). */
export function nahoda(semienko: number) {
  let a = semienko >>> 0;
  const dalsie = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    cislo: dalsie,
    cele: (od: number, po: number) => od + Math.floor(dalsie() * (po - od + 1)),
    vyber: <T>(z: readonly T[]): T => z[Math.floor(dalsie() * z.length)],
    sanca: (p: number) => dalsie() < p,
  };
}

/** Dátum `posun` dní od dneška (YYYY-MM-DD, Bratislava). */
export function den(posun = 0): string {
  return new Date(Date.now() + posun * 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Bratislava",
  });
}

/** Časová pečiatka `posun` dní od teraz (ISO), voliteľne s hodinou. */
export function cas(posun = 0, hodina = 10, minuta = 0): string {
  const d = new Date(
    den(posun) + `T${String(hodina).padStart(2, "0")}:${String(minuta).padStart(2, "0")}:00+01:00`,
  );
  return d.toISOString();
}

export function pridajDni(datum: string, n: number): string {
  const d = new Date(datum + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Výpočet riadku dokladu: množstvo × cena − zľava → základ, DPH, spolu (na centy). */
export function riadok(mnozstvo: number, cena: number, sadzba: number, zlava = 0) {
  const zaklad = r2(mnozstvo * cena * (1 - zlava / 100));
  const dph = r2((zaklad * sadzba) / 100);
  return { subtotal: zaklad, vat_amount: dph, total: r2(zaklad + dph) };
}
