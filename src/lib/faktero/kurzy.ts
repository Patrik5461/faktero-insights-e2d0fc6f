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
  jazyk: "sk" | "cz" | "de" = "sk",
  krajina: KrajinaKurzu = "SK",
  /** Odkiaľ je kurz (`exchange_rate_source` dokladu); prázdne = ECB/ČNB podľa krajiny. */
  zdroj?: ZdrojKurzu | null,
): string {
  const [r, m, d] = den.split("-");
  const datum = jazyk === "de" ? `${d}.${m}.${r}` : `${Number(d)}. ${Number(m)}. ${r}`;
  const loc = jazyk === "cz" ? "cs-CZ" : jazyk === "de" ? "de-DE" : "sk-SK";
  const suma = danDomaca.toLocaleString(loc, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  /*
    Nemecká firma vedie daň v eurách ako slovenská (kurz ECB). § 16 Abs. 6
    UStG predpisuje mesačný priemer BMF; denný kurz smie firma použiť len
    s povolením Finanzamtu — veta preto hovorí, odkiaľ kurz je (`zdroj`).
    Bez zdroja (staršie doklady) ostáva pôvodná veta s ECB.
  */
  if (jazyk === "de" && krajina !== "CZ") {
    const k = kurz.toLocaleString(loc, { maximumFractionDigits: 6 });
    if (zdroj === "bmf")
      return `USt. umgerechnet: ${suma} EUR (Umsatzsteuer-Umrechnungskurs des BMF für ${MESIACE_DE[Number(m) - 1]} ${r}: 1 EUR = ${k} ${mena}, § 16 Abs. 6 UStG)`;
    if (zdroj === "ecb_tageskurs")
      return `USt. umgerechnet: ${suma} EUR (EZB-Referenzkurs vom ${datum}: 1 EUR = ${k} ${mena}; Tageskurs mit Genehmigung des Finanzamts, § 16 Abs. 6 Satz 4 UStG)`;
    if (zdroj === "ecb_predbezne")
      return `USt. umgerechnet: ${suma} EUR (vorläufig zum EZB-Referenzkurs vom ${datum}: 1 EUR = ${k} ${mena}; maßgeblich ist der Monatskurs des BMF, § 16 Abs. 6 UStG)`;
    return `USt. umgerechnet: ${suma} EUR (EZB-Referenzkurs vom ${datum}: 1 EUR = ${k} ${mena})`;
  }
  if (zdroj === "bmf" && krajina !== "CZ") {
    const uvodBmf = jazyk === "cz" ? "DPH v přepočtu" : "DPH v prepočte";
    const k = kurz.toLocaleString(loc, { maximumFractionDigits: 6 });
    return `${uvodBmf}: ${suma} EUR (${jazyk === "cz" ? "měsíční kurz BMF za" : "mesačný kurz BMF za"} ${m}/${r}: 1 EUR = ${k} ${mena})`;
  }
  const uvod = jazyk === "cz" ? "DPH v přepočtu" : "DPH v prepočte";
  if (krajina === "CZ") {
    const k = kurz.toLocaleString(loc, { maximumFractionDigits: 4 });
    return `${uvod}: ${suma} CZK (kurz ČNB z ${datum}: 1 ${mena} = ${k} CZK)`;
  }
  // Kurz v zápise jazyka dokladu (1,113 — nie 1.113 ako v JavaScripte).
  const k = kurz.toLocaleString(loc, { maximumFractionDigits: 6 });
  return `${uvod}: ${suma} EUR (kurz ECB z ${datum}: 1 EUR = ${k} ${mena})`;
}

/* ─── Nemecko: mesačný kurz BMF (§ 16 Abs. 6 UStG) ──────────────────────

  Nemecká firma prepočítava cudziu menu **mesačným priemerným kurzom, ktorý
  zverejňuje BMF** („Umsatzsteuer-Umrechnungskurse“) za mesiac, v ktorom bolo
  plnenie dodané. Denný kurz (tu ECB z dňa dodania) smie použiť len s
  povolením Finanzamtu (§ 16 Abs. 6 Satz 4). BMF zverejňuje kurz mesiaca až
  na začiatku nasledujúceho mesiaca — faktúra z bežného mesiaca preto dostane
  predbežne kurz ECB a po zverejnení sa doklad prepočíta (`ecb_predbezne`).
  Kurzy BMF sú „X za 1 EUR“ ako ECB, takže sa delí rovnako (`naEur`).
*/

/** Odkiaľ je kurz na doklade (`exchange_rate_source`). */
export type ZdrojKurzu = "ecb" | "cnb" | "bmf" | "ecb_predbezne" | "ecb_tageskurs";

/** Voľba nemeckej firmy (`companies.kurz_de_zdroj`). */
export type NastavenieKurzuDe = "bmf" | "ecb_tageskurs";

export const MESIACE_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export type KurzBmf = { mesiac: string; mena: string; kurz: number };

/** Prvý deň mesiaca dodania — kľúč kurzu BMF. */
export function mesiacBmf(datumDodania: string): string {
  return `${String(datumDodania).slice(0, 7)}-01`;
}

/** Nastavenie firmy na bezpečnú hodnotu — čokoľvek iné ako denný kurz znamená BMF. */
export function nastavenieKurzuDe(v: unknown): NastavenieKurzuDe {
  return v === "ecb_tageskurs" ? "ecb_tageskurs" : "bmf";
}

/**
 * Výber kurzu pre doklad podľa krajiny firmy.
 *
 *  - SK: ECB, posledný zverejnený pred dňom dodania (`ecb`),
 *  - CZ: ČNB platný v deň plnenia (`cnb`, kurzy sa podávajú v `cnb`),
 *  - DE s BMF: kurz BMF za mesiac dodania (`bmf`); kým ho BMF nezverejní,
 *    ECB z dňa dodania (`ecb_predbezne`),
 *  - DE s denným kurzom: ECB z dňa dodania (`ecb_tageskurs`).
 */
export function vyberKurz(p: {
  krajina: "SK" | "CZ" | "DE";
  mena: string;
  datumDodania: string;
  nastavenieDe?: NastavenieKurzuDe | null;
  ecb?: Kurz[];
  cnb?: Kurz[];
  bmf?: KurzBmf[];
}): { kurz: number; den: string; zdroj: ZdrojKurzu } | null {
  const mena = String(p.mena).toUpperCase();
  if (p.krajina === "CZ") {
    if (mena === "CZK") return null;
    const k = kurzKDatumu(p.cnb ?? [], mena, denKurzu(p.datumDodania, "CZ"));
    return k ? { kurz: k.kurz, den: k.den, zdroj: "cnb" } : null;
  }
  if (mena === "EUR") return null;
  if (p.krajina === "SK") {
    const k = kurzKDatumu(p.ecb ?? [], mena, denKurzu(p.datumDodania, "SK"));
    return k ? { kurz: k.kurz, den: k.den, zdroj: "ecb" } : null;
  }
  const nastavenie = nastavenieKurzuDe(p.nastavenieDe);
  if (nastavenie === "bmf") {
    const mesiac = mesiacBmf(p.datumDodania);
    const b = (p.bmf ?? []).find((x) => x.mesiac === mesiac && x.mena.toUpperCase() === mena);
    if (b && b.kurz > 0) return { kurz: b.kurz, den: mesiac, zdroj: "bmf" };
  }
  // Denný kurz: deň dodania (nie deň pred ním ako na Slovensku).
  const k = kurzKDatumu(p.ecb ?? [], mena, p.datumDodania);
  if (!k) return null;
  return {
    kurz: k.kurz,
    den: k.den,
    zdroj: nastavenie === "bmf" ? "ecb_predbezne" : "ecb_tageskurs",
  };
}

/**
 * Riadky CSV z dátového portálu BMF („uu-kurse-RRRR-csv.csv“): bodkočiarka,
 * hlavička `Land;Währung;Januar[1];Februar [2];…`, bunky „1,1738 USD“ alebo
 * „19.757,02 IDR“; prázdna bunka = mesiac ešte nezverejnený.
 */
export function kurzyZBmfCsv(text: string, rok: number): KurzBmf[] {
  const von: KurzBmf[] = [];
  let hlavicka = false;
  for (const riadok of text.split(/\r?\n/)) {
    const bunky = riadok.split(";");
    if (/^\s*Land\s*$/i.test(bunky[0] ?? "")) {
      hlavicka = true;
      continue;
    }
    if (!hlavicka || !/1\s*Euro/i.test(bunky[1] ?? "")) continue;
    for (let i = 0; i < 12; i++) {
      const b = String(bunky[2 + i] ?? "").trim();
      const m = /^([\d.]+(?:,\d+)?)\s+([A-Z]{3})$/.exec(b);
      if (!m) continue;
      const kurz = Number(m[1].replace(/\./g, "").replace(",", "."));
      if (!(kurz > 0)) continue;
      von.push({ mesiac: `${rok}-${String(i + 1).padStart(2, "0")}-01`, mena: m[2], kurz });
    }
  }
  return von;
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
