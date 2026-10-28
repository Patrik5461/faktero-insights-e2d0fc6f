/**
 * Čisté pravidlá pre označenia dokladov a pohybov v appke — štítky,
 * „Pohyb nemá doklad“ / „Transakčná daň“ a stav úhrady prijatej faktúry.
 *
 * Zápis robí obrazovka (RLS ako na webe, pohyb cez `pohyb-oznac`); tu je len
 * to, čo sa dá overiť testom bez servera a bez prehliadača.
 */
import type { StavPohybu, Vybavenie } from "@/lib/faktero/pohyb-vybavenie";
import type { Kluc } from "./preklady";

/** Rovnaké stropy ako web (`StitkyDokladu`) a obmedzenie v databáze. */
export const NAJVIAC_STITKOV = 5;
export const DLZKA_STITKU = 40;

/**
 * Pridá štítok. `null` = nie je čo pridať (prázdny, už tam je, alebo je ich
 * plný počet) — obrazovka vtedy nič nezapisuje.
 */
export function pridajStitok(zoznam: readonly string[], novy: string): string[] | null {
  const s = novy.replace(/\s+/g, " ").trim().slice(0, DLZKA_STITKU);
  if (!s) return null;
  if (zoznam.some((x) => x.toLowerCase() === s.toLowerCase())) return null;
  if (zoznam.length >= NAJVIAC_STITKOV) return null;
  return [...zoznam, s];
}

export function odoberStitok(zoznam: readonly string[], stitok: string): string[] {
  return zoznam.filter((x) => x !== stitok);
}

/** Čo sa dá s pohybom urobiť. Spárovaný s dokladom sa neoznačuje — tak to drží aj server. */
export function akciePohybu(stav: StavPohybu | null | undefined): (Vybavenie | null)[] {
  if (stav === "sparovany") return [];
  if (stav === "bez_dokladu") return ["transakcna_dan", null];
  if (stav === "transakcna_dan") return ["bez_dokladu", null];
  return ["bez_dokladu", "transakcna_dan"];
}

/** Štítok stavu pohybu do zoznamu; nespárovaný sa nekreslí (je ich väčšina). */
export function stitokPohybu(
  stav: StavPohybu | null | undefined,
): { kluc: Kluc; ton: "zelena" | "neutral" } | null {
  if (stav === "sparovany") return { kluc: "banka.sparovane", ton: "zelena" };
  if (stav === "bez_dokladu") return { kluc: "banka.bezDokladu", ton: "neutral" };
  if (stav === "transakcna_dan") return { kluc: "banka.transakcnaDan", ton: "neutral" };
  return null;
}

/** Suma z políčka v telefóne — „12,50“, „1 200,5“ aj „12.50“. Neplatná je 0. */
export function sumaZPolicka(v: string | null | undefined): number {
  const n = Number(
    String(v ?? "")
      .replace(/[\s ]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * Text splatnosti prijatej faktúry: po splatnosti, dnes, alebo o koľko dní.
 * `dni` z `dniPoSplatnosti` (kladné = po splatnosti).
 */
export function splatnostKluc(dni: number | null): { kluc: Kluc; n: number } | null {
  if (dni == null) return null;
  if (dni > 0) return { kluc: "pf.poSplatnosti", n: dni };
  if (dni === 0) return { kluc: "pf.splatnaDnes", n: 0 };
  return { kluc: "pf.doSplatnosti", n: -dni };
}
