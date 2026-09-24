/**
 * Prepočet cudzej meny na eurá pre účely DPH.
 *
 * Zákon je v tomto konkrétny: pri faktúre v cudzej mene sa daň prepočíta
 * referenčným kurzom Európskej centrálnej banky platným v deň **predchádzajúci**
 * dňu vzniku daňovej povinnosti (§ 26 ods. 1 zákona č. 222/2004 Z. z.), a daň
 * v eurách musí byť na faktúre uvedená. ECB kurzy zverejňuje len v pracovné
 * dni, takže sa berie posledný zverejnený pred týmto dňom.
 */

export type Kurz = { den: string; mena: string; kurz: number };

/** Deň, ktorého kurz sa použije — deň pred dňom dodania. */
export function denKurzu(datumDodania: string): string {
  const d = new Date(`${datumDodania}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Z ponuky kurzov vyberie ten posledný, ktorý platil najneskôr v daný deň. */
export function kurzKDatumu(kurzy: Kurz[], mena: string, den: string): Kurz | null {
  const m = mena.toUpperCase();
  const vhodne = kurzy
    .filter((k) => k.mena.toUpperCase() === m && k.den <= den)
    .sort((a, b) => (a.den < b.den ? 1 : -1));
  return vhodne[0] ?? null;
}

/**
 * Suma v cudzej mene na eurá. Kurz je „koľko meny za jedno euro", takže sa
 * delí — pri 25,4 CZK za euro je 254 CZK rovných 10 eur.
 */
export function naEur(suma: number, kurz: number): number {
  if (!Number.isFinite(kurz) || kurz <= 0) return 0;
  return Math.round((Number(suma) / kurz) * 100) / 100;
}

/** Text pod súčty faktúry — musí povedať aj to, odkiaľ kurz je. */
export function textPrepoctu(
  mena: string,
  kurz: number,
  den: string,
  danEur: number,
  jazyk: "sk" | "cz" = "sk",
): string {
  const [r, m, d] = den.split("-");
  const datum = `${Number(d)}. ${Number(m)}. ${r}`;
  const suma = danEur.toLocaleString(jazyk === "cz" ? "cs-CZ" : "sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return jazyk === "cz"
    ? `DPH v přepočtu: ${suma} EUR (kurz ECB z ${datum}: 1 EUR = ${kurz} ${mena})`
    : `DPH v prepočte: ${suma} EUR (kurz ECB z ${datum}: 1 EUR = ${kurz} ${mena})`;
}

/** Mena, pri ktorej sa prepočítavať netreba. */
export function trebaPrepocet(mena: string | null | undefined): boolean {
  return Boolean(mena) && String(mena).toUpperCase() !== "EUR";
}
