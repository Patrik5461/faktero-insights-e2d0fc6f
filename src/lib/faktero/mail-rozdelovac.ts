/** Rozdeľovač dokladov — čisté pravidlá bez databázy. */

export type FirmaNaRozdelenie = {
  id: string;
  name: string | null;
  ico: string | null;
  ic_dph: string | null;
};

const cisteIco = (v: unknown) => String(v ?? "").replace(/\s/g, "");
const cisteIcDph = (v: unknown) =>
  String(v ?? "")
    .replace(/\s/g, "")
    .toUpperCase();

/**
 * Firma používateľa, na ktorú je doklad vystavený: najprv podľa IČO
 * odberateľa, potom podľa IČ DPH. Keď sedí viac firiem (rovnaké IČO), nejde
 * sa naslepo — vráti `null` a doklad čaká na ručné priradenie.
 */
export function firmaPodlaOdberatela(
  ai: Record<string, unknown> | null | undefined,
  firmy: FirmaNaRozdelenie[],
): FirmaNaRozdelenie | null {
  const ico = cisteIco(ai?.buyer_ico);
  const icDph = cisteIcDph(ai?.buyer_ic_dph);
  if (ico) {
    const zhoda = firmy.filter((f) => cisteIco(f.ico) === ico);
    if (zhoda.length === 1) return zhoda[0]!;
    if (zhoda.length > 1) return null;
  }
  if (icDph) {
    const zhoda = firmy.filter((f) => cisteIcDph(f.ic_dph) === icDph);
    if (zhoda.length === 1) return zhoda[0]!;
  }
  return null;
}

/** Adresa rozdeľovača: `rozdelovac-<náhodný chvost>`, aby sa nedala uhádnuť. */
export function localPartRozdelovaca(nahodne: () => number = Math.random): string {
  const znaky = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += znaky[Math.floor(nahodne() * znaky.length)];
  return `rozdelovac-${s}`;
}
