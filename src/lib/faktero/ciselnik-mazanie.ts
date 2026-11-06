/*
  Mazanie kódov z číselníka účtovníctva (tabuľka `predkontacie`: predkontácie,
  členenia DPH, strediská, činnosti, číselné rady, pokladne, zákazky a bankové
  účty z Pohody).

  Doklady sa na kód neodkazujú cudzím kľúčom, ale textom (`pohoda_predkontacia`,
  `stredisko`, `rozuctovanie[].clenenie`…). Databáza by teda zmazanie dovolila
  vždy a doklad by ostal s kódom, ktorý v číselníku už nie je — výber by ho
  neukázal a kontrola pred exportom by hlásila neznámy kód. Preto sa pred
  zmazaním zistí, kde všade sa kód používa; použité sa nezmažú a ponúkne sa
  ich deaktivácia (vypnutý kód sa v novom výbere neponúka, staré doklady ho
  ponechajú).

  Tu je len opis, kde sa čo hľadá, a vyhodnotenie — dotazy robí
  `ciselnik-mazanie.server.ts` klientom prihláseného (RLS).
*/
import type { DruhCiselnika } from "./predkontacie";

/** Kde je kód použitý — kľúč textu v hláške. */
export type KdePouzite = "doklady" | "pravidla" | "nastavenia" | "ciselnik" | "ucty" | "system";

export const NAZOV_KDE: Record<KdePouzite, string> = {
  doklady: "doklady",
  pravidla: "pravidlá a predlohy účtovania",
  nastavenia: "predvolené nastavenia firmy",
  ciselnik: "pomer inej predkontácie",
  ucty: "bankové účty firmy",
  // Systémové členenie DPH a KV (B1-1) sa nemaže, dá sa len skryť.
  system: "systémový číselník — dá sa len skryť",
};

/** Stĺpec s kódom v tabuľke, ktorá má `company_id`. */
export type ZdrojStlpca = { tabulka: string; stlpec: string; kde: KdePouzite };

const DOKLADY = ["purchase_invoices", "expense_documents", "invoices"] as const;
const naDokladoch = (stlpec: string): ZdrojStlpca[] =>
  DOKLADY.map((tabulka) => ({ tabulka, stlpec, kde: "doklady" as const }));

export type ZdrojePouzitia = {
  /** Obyčajné stĺpce s kódom (tabuľky s `company_id`). */
  stlpce: ZdrojStlpca[];
  /** Stĺpec v `invoice_items` (firma cez `invoices`). */
  polozkyFaktur?: string;
  /** Kľúče v rozúčtovaní dokladov a v pomere pravidiel (`rozuctovanie` jsonb). */
  kluceRozuctovania: string[];
  /** Stĺpce firmy (predvolené kódy) — regulárny výraz na meno stĺpca. */
  firma: RegExp | null;
  /** Predkontácie podľa označenia platby (`companies.pohoda_predkontacie_oznaceni`). */
  oznaceniPlatby?: boolean;
  /** Pomer inej predkontácie (`predkontacie.pomer`) — kľúče, ktoré nesú kód. */
  kluceVPomere?: string[];
};

const KLUCE_PREDKONTACIE = ["predkontacia", "lenZaklad", "zdanitelna", "nezdanitelna"];
const KLUCE_CLENENIA = ["clenenie", "clenenieBezOdpoctu"];

/** Kde všade sa hľadá kód podľa druhu číselníka. Zákazky majú vlastnú cestu (cez `jobs`). */
export const ZDROJE: Record<Exclude<DruhCiselnika, "zakazka">, ZdrojePouzitia> = {
  predkontacia: {
    stlpce: [
      ...naDokladoch("pohoda_predkontacia"),
      { tabulka: "pravidla_uctovania", stlpec: "predkontacia", kde: "pravidla" },
      { tabulka: "predlohy_uctovania", stlpec: "predkontacia", kde: "pravidla" },
      { tabulka: "vyuctovania_vydavkov", stlpec: "predkontacia", kde: "doklady" },
    ],
    polozkyFaktur: "pohoda_predkontacia",
    kluceRozuctovania: KLUCE_PREDKONTACIE,
    firma: /^pohoda_predkontacia/,
    oznaceniPlatby: true,
    kluceVPomere: KLUCE_PREDKONTACIE,
  },
  clenenie_dph: {
    stlpce: [
      ...naDokladoch("pohoda_clenenie_dph"),
      { tabulka: "pravidla_uctovania", stlpec: "clenenie_dph", kde: "pravidla" },
      { tabulka: "predlohy_uctovania", stlpec: "clenenie_dph", kde: "pravidla" },
      { tabulka: "vyuctovania_vydavkov", stlpec: "clenenie_dph", kde: "doklady" },
    ],
    polozkyFaktur: "pohoda_clenenie_dph",
    kluceRozuctovania: KLUCE_CLENENIA,
    firma: /^pohoda_clenenie_dph/,
    kluceVPomere: KLUCE_CLENENIA,
  },
  stredisko: {
    stlpce: naDokladoch("stredisko"),
    polozkyFaktur: "stredisko",
    kluceRozuctovania: ["stredisko"],
    firma: /^pohoda_stredisko$/,
  },
  cinnost: {
    stlpce: naDokladoch("cinnost"),
    polozkyFaktur: "cinnost",
    kluceRozuctovania: ["cinnost"],
    firma: null,
  },
  ciselny_rad: {
    stlpce: [
      { tabulka: "purchase_invoices", stlpec: "pohoda_rad", kde: "doklady" },
      { tabulka: "expense_documents", stlpec: "pohoda_rad", kde: "doklady" },
    ],
    kluceRozuctovania: [],
    firma: /^pohoda_rad_/,
  },
  pokladna: {
    stlpce: [{ tabulka: "expense_documents", stlpec: "pohoda_pokladna", kde: "doklady" }],
    kluceRozuctovania: [],
    firma: /^pohoda_pokladna$/,
  },
  bankovy_ucet: {
    stlpce: [{ tabulka: "company_bank_accounts", stlpec: "pohoda_skratka", kde: "ucty" }],
    kluceRozuctovania: [],
    firma: /^pohoda_banka$/,
  },
  kv_clenenie: {
    stlpce: [
      ...naDokladoch("kv_clenenie"),
      { tabulka: "pravidla_uctovania", stlpec: "kv_clenenie", kde: "pravidla" },
      { tabulka: "predlohy_uctovania", stlpec: "kv_clenenie", kde: "pravidla" },
      { tabulka: "vyuctovania_vydavkov", stlpec: "kv_clenenie", kde: "doklady" },
    ],
    polozkyFaktur: "kv_clenenie",
    kluceRozuctovania: ["kv"],
    firma: /^kv_clenenie_/,
  },
};

/** Tabuľky rozúčtovania (`rozuctovanie` jsonb): doklady a pravidlá. */
export const TABULKY_ROZUCTOVANIA: { tabulka: string; kde: KdePouzite }[] = [
  ...DOKLADY.map((tabulka) => ({ tabulka, kde: "doklady" as const })),
  { tabulka: "pravidla_uctovania", kde: "pravidla" },
];

/** Doklady so zákazkou (`job_id`). */
export const TABULKY_ZAKAZKY = DOKLADY;

/** Všetky textové hodnoty pod danými kľúčmi kdekoľvek v JSON (rozúčtovanie, pomer). */
export function kodyVJson(json: unknown, kluce: readonly string[], out = new Set<string>()): Set<string> {
  if (!kluce.length || json == null) return out;
  if (Array.isArray(json)) {
    for (const x of json) kodyVJson(x, kluce, out);
  } else if (typeof json === "object") {
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (kluce.includes(k) && v.trim()) out.add(v.trim());
      } else kodyVJson(v, kluce, out);
    }
  }
  return out;
}

export type RiadokCiselnika = { id: string; kod: string; druh: string; zdroj?: string | null };
export type PouzityKod = { id: string; kod: string; kde: KdePouzite[] };

/**
 * Rozdelí vybrané riadky na tie, ktoré sa smú zmazať, a použité.
 *
 * Kód, ktorý v číselníku ostane v inom riadku (rovnaký kód pre inú agendu,
 * ktorý sa nemaže), sa zmazať smie — doklady ho naďalej nájdu.
 */
export function rozdelNaMazanie(
  vybrane: readonly RiadokCiselnika[],
  ostatne: readonly RiadokCiselnika[],
  pouzitie: ReadonlyMap<string, ReadonlySet<KdePouzite>>,
): { zmazat: string[]; pouzite: PouzityKod[] } {
  const vybraneIds = new Set(vybrane.map((r) => r.id));
  const ostaneKod = new Set(ostatne.filter((r) => !vybraneIds.has(r.id)).map((r) => r.kod.trim()));
  const zmazat: string[] = [];
  const pouzite: PouzityKod[] = [];
  for (const r of vybrane) {
    if (r.zdroj === "system") {
      pouzite.push({ id: r.id, kod: r.kod, kde: ["system"] });
      continue;
    }
    const kde = pouzitie.get(r.kod.trim());
    if (kde && kde.size && !ostaneKod.has(r.kod.trim())) pouzite.push({ id: r.id, kod: r.kod, kde: [...kde] });
    else zmazat.push(r.id);
  }
  return { zmazat, pouzite };
}
