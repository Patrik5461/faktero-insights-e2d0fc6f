/**
 * Tvar slova podľa počtu — slovenčina má tri: 1 faktúra / 2–4 faktúry / 0 a 5+ faktúr.
 *
 * `slovoPodlaPoctu` vráti len slovo, `pocetSlovom` aj s číslom („3 faktúry“).
 */
export function slovoPodlaPoctu(
  pocet: number,
  jeden: string,
  dvaAzStyri: string,
  viac: string,
): string {
  const n = Math.abs(Math.trunc(Number(pocet) || 0));
  if (n === 1) return jeden;
  if (n >= 2 && n <= 4) return dvaAzStyri;
  return viac;
}

export function pocetSlovom(
  pocet: number,
  jeden: string,
  dvaAzStyri: string,
  viac: string,
): string {
  return `${pocet} ${slovoPodlaPoctu(pocet, jeden, dvaAzStyri, viac)}`;
}
