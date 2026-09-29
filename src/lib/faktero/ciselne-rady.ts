/**
 * Číselné rady dokladov — spoločné pravidlá pre databázu aj rozhranie.
 *
 * Rad je šablóna čísla viazaná na druh dokladu. Firma ich môže mať na jeden
 * druh viac (pobočka, prevádzka, oddelený rad za rok) a pri vystavovaní si
 * vyberie, z ktorého sa číslo vezme. Jeden rad na druh je predvolený —
 * z neho číslujú všetky cesty, ktoré sa nepýtajú (appka, API, opakované
 * faktúry).
 */

export const DRUHY_RADOV = [
  "invoice",
  "proforma",
  "credit_note",
  "advance_payment",
  "quote",
  "sales_order",
  "purchase_order",
  "cash",
] as const;

export type DruhRadu = (typeof DRUHY_RADOV)[number];

export const NAZVY_DRUHOV: Record<DruhRadu, string> = {
  invoice: "Faktúry",
  proforma: "Zálohové faktúry",
  credit_note: "Dobropisy",
  advance_payment: "Doklady k prijatej platbe",
  quote: "Cenové ponuky",
  sales_order: "Prijaté objednávky",
  purchase_order: "Objednávky u dodávateľa",
  cash: "Pokladničné doklady",
};

export type CiselnyRad = {
  id: string;
  kind: DruhRadu;
  name: string;
  format: string;
  is_default: boolean;
  active: boolean;
  /** Od ktorého poradia rad začína. */
  start_from?: number;
};

/** Tokeny, ktoré šablóna pozná. Text okolo nich je predpona či oddeľovač. */
export const TOKENY = ["{YYYY}", "{YY}", "{MM}", "{NN}", "{NNN}", "{NNNN}", "{NNNNN}"] as const;

const PORADIE = /\{(N{2,6})\}/g;

/**
 * Chyba v šablóne, alebo `null` keď je v poriadku.
 *
 * Bez tokenu poradia by každý doklad dostal to isté číslo a druhý zápis by
 * spadol na jedinečnosti — to je najčastejší preklep, preto vlastná veta.
 */
export function chybaSablony(format: string): string | null {
  const f = (format ?? "").trim();
  if (!f) return "Šablóna nesmie byť prázdna.";
  if (f.length > 40) return "Šablóna je pridlhá — najviac 40 znakov.";
  if (!PORADIE.test(f)) {
    PORADIE.lastIndex = 0;
    return "Šablóna musí obsahovať poradie — {NN} až {NNNNNN}, počet N určuje počet číslic.";
  }
  PORADIE.lastIndex = 0;
  const zvysok = f.replace(/\{(YYYY|YY|MM|N{2,6})\}/g, "");
  if (/[{}]/.test(zvysok)) return "Šablóna obsahuje neznámy token v zložených zátvorkách.";
  if (/\s/.test(f)) return "V čísle dokladu nemajú byť medzery.";
  return null;
}

/** Ukážka čísla zo šablóny — to isté, čo vyrobí databáza. */
export function ukazkaCisla(format: string, poradie = 1, den: Date = new Date()): string {
  const f = (format ?? "").trim();
  if (!f) return "";
  const rok = String(den.getFullYear());
  const mesiac = String(den.getMonth() + 1).padStart(2, "0");
  let sirka = 4;
  for (const m of f.matchAll(PORADIE)) sirka = Math.max(sirka === 4 ? 0 : sirka, m[1].length);
  if (!sirka) sirka = 4;
  return f
    .replace(/\{YYYY\}/g, rok)
    .replace(/\{YY\}/g, rok.slice(2))
    .replace(/\{MM\}/g, mesiac)
    .replace(PORADIE, String(poradie).padStart(sirka, "0"));
}

/** Rad sa resetuje mesačne, keď je v šablóne mesiac — inak ročne. */
export function resetujeSaMesacne(format: string): boolean {
  return (format ?? "").includes("{MM}");
}

/** Druh radu pre faktúru podľa typu dokladu. */
export function druhPodlaTypuFaktury(typ: string | null | undefined): DruhRadu {
  switch (typ) {
    case "proforma":
      return "proforma";
    case "credit_note":
      return "credit_note";
    case "advance_payment":
      return "advance_payment";
    default:
      return "invoice";
  }
}

/**
 * Šablóna a poradie odvodené z ručne napísaného čísla.
 *
 * Keď človek prepíše číslo na doklade a povie „pokračuj v tomto rade",
 * treba z toho čísla spraviť vzor. Rok sa spozná podľa dátumu dokladu
 * (`2026` aj `26`), mesiac len tesne za rokom — inak by sa ako mesiac
 * čítalo čokoľvek dvojciferné. Poradie je posledná skupina číslic.
 *
 * `null` znamená, že sa to odvodiť nedá: bez poradia alebo s jednou
 * číslicou by ďalšie číslo bolo hádanie, nie pokračovanie.
 */
export function sablonaZCisla(
  cislo: string,
  datum: string | Date,
): { format: string; poradie: number } | null {
  const c = (cislo ?? "").trim();
  if (!c || c.length > 40) return null;

  const den = typeof datum === "string" ? new Date(`${datum}T00:00:00`) : datum;
  if (!den || Number.isNaN(den.getTime())) return null;
  const rok = String(den.getFullYear());
  const rok2 = rok.slice(2);
  const mesiac = String(den.getMonth() + 1).padStart(2, "0");

  /*
    Rok sa z čísla odkrojí ako prvý — v „20260007" je zlepený s poradím a bez
    tohto kroku by celý blok vyšiel ako poradie dvadsať miliónov.
  */
  let predRokom = "";
  let znackaRoku = "";
  let zvysok = c;
  const kandidati: [hodnota: string, znacka: string][] = [
    [rok + mesiac, "{YYYY}{MM}"],
    [rok, "{YYYY}"],
    [rok2 + mesiac, "{YY}{MM}"],
  ];
  for (const [hodnota, znacka] of kandidati) {
    const kde = c.indexOf(hodnota);
    if (kde === -1) continue;
    predRokom = c.slice(0, kde);
    znackaRoku = znacka;
    zvysok = c.slice(kde + hodnota.length);
    break;
  }

  // Poradie je posledná skupina číslic za rokom a musí byť na konci.
  const poradia = [...zvysok.matchAll(/\d+/g)];
  const posledna = poradia[poradia.length - 1];
  if (!posledna || posledna[0].length < 2) return null;
  const zaciatok = posledna.index ?? 0;
  if (zaciatok + posledna[0].length !== zvysok.length) return null;
  const poradie = Number(posledna[0]);
  if (!Number.isFinite(poradie) || poradie < 1) return null;

  const medzi = zvysok.slice(0, zaciatok);
  const vzor = `${predRokom}${znackaRoku}${medzi}`;

  /*
    Zvyšné číslice vo vzore by z neho spravili predponu, ktorá sa o rok
    rozíde s realitou (napr. cudzí rok v čísle) — vtedy radšej priznať, že
    sa rad odvodiť nedá.
  */
  if (/\d/.test(vzor)) return null;

  const format = `${vzor}{${"N".repeat(Math.min(posledna[0].length, 6))}}`;
  return chybaSablony(format) ? null : { format, poradie };
}
