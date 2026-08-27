import { citaj, zapis } from "./trvale-ulozisko";

/**
 * Jazyk mobilnej aplikácie.
 *
 * Slovenčina je zdroj: kľúče aj náhradné znenie sú slovenské, takže text, ktorý
 * sa ešte nepreložil, sa zobrazí po slovensky a nie ako kód. Chýbajúci preklad
 * má vyzerať ako chýbajúci preklad, nie ako pokazená appka.
 *
 * Hlásenia zo servera ostávajú zatiaľ slovenské — vznikajú v spoločnom kóde s
 * webom a preložiť ich znamená zasiahnuť do osemdesiatich súborov. Je to
 * vedomý dlh, nie prehliadnutie.
 */

export const JAZYKY = [
  { kod: "sk", nazov: "Slovenčina" },
  { kod: "cs", nazov: "Čeština" },
  { kod: "en", nazov: "English" },
  { kod: "de", nazov: "Deutsch" },
  { kod: "hu", nazov: "Magyar" },
] as const;

export type Jazyk = (typeof JAZYKY)[number]["kod"];

const KLUC = "faktero.jazyk";
const VYCHODZI: Jazyk = "sk";

function jePodporovany(v: unknown): v is Jazyk {
  return JAZYKY.some((j) => j.kod === v);
}

/**
 * Jazyk telefónu, keď si človek ešte nevybral.
 *
 * Čítame len prvé dva znaky — `de-AT` aj `de-DE` je nemčina. Čo nepoznáme,
 * ide na slovenčinu; ponúkať Angličanovi maďarčinu len preto, že je bližšie
 * v abecede, nemá zmysel.
 */
export function jazykZariadenia(): Jazyk {
  if (typeof navigator === "undefined") return VYCHODZI;
  for (const v of navigator.languages ?? [navigator.language]) {
    const k = String(v ?? "")
      .slice(0, 2)
      .toLowerCase();
    if (jePodporovany(k)) return k;
  }
  return VYCHODZI;
}

export function nacitajJazyk(): Jazyk {
  try {
    const v = citaj(KLUC);
    if (jePodporovany(v)) return v;
  } catch {
    /* zakázané úložisko nie je dôvod, aby appka prestala fungovať */
  }
  return jazykZariadenia();
}

export function ulozJazyk(j: Jazyk): void {
  try {
    zapis(KLUC, j);
  } catch {
    /* voľba potom platí len pre túto reláciu */
  }
}

/** Locale na formátovanie čísel a dátumov. */
export function locale(j: Jazyk): string {
  return { sk: "sk-SK", cs: "cs-CZ", en: "en-GB", de: "de-DE", hu: "hu-HU" }[j];
}

/**
 * Množné číslo.
 *
 * Slovenčina a čeština majú tri tvary (1 / 2–4 / 5+), angličtina, nemčina a
 * maďarčina dva. Písať si tie pravidlá ručne pre päť jazykov je zbytočné —
 * `Intl.PluralRules` ich pozná a povie kategóriu, my len vyberieme tvar.
 */
export type Tvary = { one: string; few?: string; other: string };

export function tvar(j: Jazyk, pocet: number, tvary: Tvary): string {
  const n = Math.abs(Math.trunc(Number(pocet) || 0));
  let kat: Intl.LDMLPluralRule = "other";
  try {
    kat = new Intl.PluralRules(locale(j)).select(n);
  } catch {
    kat = n === 1 ? "one" : "other";
  }
  if (kat === "one") return tvary.one;
  if (kat === "few" && tvary.few) return tvary.few;
  return tvary.other;
}
