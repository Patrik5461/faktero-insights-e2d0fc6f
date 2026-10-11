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

/*
  Domáca mena firmy podľa krajiny registrácie. Slovenská firma vedie daň v
  eurách (kurz ECB, „X za 1 EUR“, deň pred dodaním), česká v korunách (kurz
  ČNB, „CZK za 1 X“, platný v deň plnenia — § 4 odst. 5 ZDPH). Stĺpce
  `*_eur` na dokladoch nesú sumy v domácej mene firmy; `exchange_rate` je v
  zápise príslušnej banky.
*/
export type KrajinaKurzu = "SK" | "CZ";

export function krajinaKurzu(country: string | null | undefined): KrajinaKurzu {
  return /^(CZ|CZE|ČESK|CESK|CZECH)/.test(
    String(country ?? "")
      .trim()
      .toUpperCase(),
  )
    ? "CZ"
    : "SK";
}

export function domacaMena(country: string | null | undefined): "EUR" | "CZK" {
  return krajinaKurzu(country) === "CZ" ? "CZK" : "EUR";
}

/** Deň, ktorého kurz sa použije — na Slovensku deň pred dodaním, v Česku deň plnenia. */
export function denKurzu(datumDodania: string, krajina: KrajinaKurzu = "SK"): string {
  if (krajina === "CZ") return datumDodania;
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

/** Suma v cudzej mene na domácu menu firmy podľa zápisu kurzu jej banky. */
export function naDomacu(suma: number, kurz: number, krajina: KrajinaKurzu = "SK"): number {
  if (!Number.isFinite(kurz) || kurz <= 0) return 0;
  if (krajina === "SK") return naEur(suma, kurz);
  // ČNB: „koľko CZK za 1 jednotku meny“ — násobí sa.
  return Math.round(Number(suma) * kurz * 100) / 100;
}

/** Text pod súčty faktúry — musí povedať aj to, odkiaľ kurz je. */
export function textPrepoctu(
  mena: string,
  kurz: number,
  den: string,
  danDomaca: number,
  jazyk: "sk" | "cz" = "sk",
  krajina: KrajinaKurzu = "SK",
): string {
  const [r, m, d] = den.split("-");
  const datum = `${Number(d)}. ${Number(m)}. ${r}`;
  const loc = jazyk === "cz" ? "cs-CZ" : "sk-SK";
  const suma = danDomaca.toLocaleString(loc, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const uvod = jazyk === "cz" ? "DPH v přepočtu" : "DPH v prepočte";
  if (krajina === "CZ") {
    const k = kurz.toLocaleString(loc, { maximumFractionDigits: 4 });
    return `${uvod}: ${suma} CZK (kurz ČNB z ${datum}: 1 ${mena} = ${k} CZK)`;
  }
  return `${uvod}: ${suma} EUR (kurz ECB z ${datum}: 1 EUR = ${kurz} ${mena})`;
}

/** Mena, pri ktorej sa prepočítavať netreba. */
export function trebaPrepocet(mena: string | null | undefined, domaca: string = "EUR"): boolean {
  return Boolean(mena) && String(mena).toUpperCase() !== domaca.toUpperCase();
}

/**
 * Koľko domácej meny firmy je 1 jednotka cudzej, z `exchange_rate` dokladu.
 * Slovenská firma má kurz ECB („X za 1 EUR“ → 1/kurz), česká kurz ČNB
 * („CZK za 1 X“ → kurz). Všetky prepočty do účtovných programov idú cez toto,
 * aby nikto nedelil korunový kurz.
 */
export function domacejZaJednotku(
  exchangeRate: unknown,
  country: string | null | undefined,
): number {
  const k = Number(exchangeRate);
  if (!Number.isFinite(k) || k <= 0) return 0;
  return krajinaKurzu(country) === "CZ" ? k : 1 / k;
}

/**
 * Kurz pre program, ktorý chce „koľko domácej meny za `mnozstvo` jednotiek“
 * (Pohoda, Money, Flexi). Pri lacných menách (forint, jen, pri SK firme aj
 * koruna) sa udáva za 100 jednotiek, aby sa nestratil v zaokrúhlení.
 */
export function kurzZaMnozstvo(
  exchangeRate: unknown,
  country: string | null | undefined,
): { kurz: number; mnozstvo: number } {
  const zaJednu = domacejZaJednotku(exchangeRate, country);
  const mnozstvo = zaJednu > 0 && zaJednu < 0.1 ? 100 : 1;
  return { kurz: Math.round(zaJednu * mnozstvo * 1e6) / 1e6, mnozstvo };
}
