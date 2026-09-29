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
