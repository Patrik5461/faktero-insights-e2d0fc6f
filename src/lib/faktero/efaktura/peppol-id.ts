/**
 * Peppol identifikátor slovenskej firmy.
 *
 * Slovensko používa schému **0245** a v nej DIČ — desať číslic bez predpony
 * „SK". Kód dovtedy skladal `9944:<IČ DPH>`; overené proti ePoštákovi to
 * nenájde nikoho:
 *
 *   0245:5843291067    → sendable
 *   9944:SK5843291067  → not_registered
 *   9944:5843291067    → not_registered
 *
 * Preto sa to počíta tu na jednom mieste a je to otestované — chybné
 * adresovanie by sa inak prejavilo až tým, že faktúra nikam nedorazí.
 */

/** Slovenská schéma Peppol. */
export const SCHEMA_SK = "0245";

/** Slovenské DIČ — 10 číslic (staršie fyzické osoby 9). Iné hodnoty nie sú slovenské DIČ. */
const SK_DIC = /^\d{9,10}$/;

/**
 * Vytiahne slovenské DIČ z toho, čo je po ruke: `dic`, alebo IČ DPH bez
 * predpony „SK". Zahraničné IČ DPH (DE…, CZ…) do schémy 0245 nepatrí —
 * predtým z neho vzniklo `0245:DE123456789`, ktoré v sieti neexistuje.
 */
export function dicZUdajov(dic?: string | null, icDph?: string | null): string | null {
  const zDic = ocisti(dic);
  if (zDic && SK_DIC.test(zDic)) return zDic;
  const zIcDph = ocisti(icDph)?.toUpperCase();
  if (!zIcDph?.startsWith("SK")) return null;
  // IČ DPH je „SK" + DIČ. Schéma 0245 chce samotné DIČ.
  const v = zIcDph.slice(2);
  return SK_DIC.test(v) ? v : null;
}

/**
 * Schémy Peppol pre IČ DPH podľa krajiny (číselník EAS, docs.peppol.eu,
 * stav 2026-10). Hodnota je celé IČ DPH aj s predponou krajiny. Slovensko
 * tu nie je zámerne — doručuje sa cez 0245 a DIČ.
 */
export const SCHEMA_DPH: Record<string, string> = {
  AD: "9922",
  AL: "9923",
  AT: "9914",
  BA: "9924",
  BE: "9925",
  BG: "9926",
  CH: "9927",
  CY: "9928",
  CZ: "9929",
  DE: "9930",
  EE: "9931",
  EL: "9933",
  ES: "9920",
  FR: "9957",
  GB: "9932",
  GR: "9933",
  HR: "9934",
  HU: "9910",
  IE: "9935",
  IT: "0211",
  LI: "9936",
  LT: "9937",
  LU: "9938",
  LV: "9939",
  MC: "9940",
  ME: "9941",
  MK: "9942",
  MT: "9943",
  NL: "9944",
  PL: "9945",
  PT: "9946",
  RO: "9947",
  RS: "9948",
  SI: "9949",
  SM: "9951",
  TR: "9952",
  VA: "9953",
};

/** Peppol id zahraničnej firmy z jej IČ DPH (`9930:DE123456789`), inak null. */
export function peppolIdZDph(icDph?: string | null): string | null {
  const v = ocisti(icDph)?.toUpperCase();
  if (!v || !/^[A-Z]{2}[0-9A-Z]{2,14}$/.test(v)) return null;
  const schema = SCHEMA_DPH[v.slice(0, 2)];
  return schema ? `${schema}:${v}` : null;
}

function ocisti(hodnota?: string | null): string | null {
  if (!hodnota) return null;
  const v = String(hodnota).replace(/\s/g, "").trim();
  return v || null;
}

/**
 * Peppol id príjemcu. Uprednostní to, čo je zadané natvrdo — firma môže mať
 * pridelené id, ktoré sa z DIČ odvodiť nedá.
 */
export function peppolId(args: {
  zadane?: string | null;
  dic?: string | null;
  icDph?: string | null;
}): string | null {
  const zadane = ocisti(args.zadane);
  // Zadané už schému obsahuje; bez nej by sa poslalo neúplné id.
  if (zadane) return zadane.includes(":") ? zadane : `${SCHEMA_SK}:${zadane}`;
  const dic = dicZUdajov(args.dic, args.icDph);
  if (dic) return `${SCHEMA_SK}:${dic}`;
  // Zahraničný odberateľ — schéma podľa krajiny IČ DPH (aj keď je IČ DPH v poli DIČ).
  return peppolIdZDph(args.icDph) ?? peppolIdZDph(args.dic);
}

/** Schéma z celého id — to, čo sa ukladá k doručeniu. */
export function schemaZId(id: string | null | undefined): string | null {
  if (!id) return null;
  const [schema] = id.split(":");
  return schema || null;
}
