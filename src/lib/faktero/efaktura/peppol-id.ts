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

/** Vytiahne DIČ z toho, čo je po ruke: `dic`, alebo IČ DPH bez predpony. */
export function dicZUdajov(dic?: string | null, icDph?: string | null): string | null {
  const zDic = ocisti(dic);
  if (zDic) return zDic;
  const zIcDph = ocisti(icDph);
  if (!zIcDph) return null;
  // IČ DPH je „SK" + DIČ. Schéma 0245 chce samotné DIČ.
  return zIcDph.replace(/^SK/i, "") || null;
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
  return dic ? `${SCHEMA_SK}:${dic}` : null;
}

/** Schéma z celého id — to, čo sa ukladá k doručeniu. */
export function schemaZId(id: string | null | undefined): string | null {
  if (!id) return null;
  const [schema] = id.split(":");
  return schema || null;
}
