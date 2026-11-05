/*
  Zvýraznenie vyťažených údajov v náhľade dokladu.

  AI vracia hodnoty a (Gemini) aj ich polohy. Miesto sa hľadá predovšetkým
  spätne v textovej vrstve PDF — je presná: hodnota (číslo faktúry, VS, IBAN,
  IČO, dátum, suma, názov položky…) sa prevedie na tvary, v akých býva
  vytlačená („2026-10-12" → „12.10.2026", „12. 10. 2026"; 1234.5 → „1 234,50",
  „1.234,50"; IBAN s medzerami aj bez), a tie sa hľadajú v slovách strany.
  Medzery medzi slovami sú voliteľné, takže „SK31 1200 0000…" nájde aj IBAN
  zapísaný bez medzier.

  Tá istá hodnota býva na doklade viackrát (dátum vystavenia = dátum dodania,
  DPH riadku = DPH spolu, základ = cena položky). Kto výskyt dostane, rozhodnú
  KOTVY — popisy v tom istom riadku alebo hlavička stĺpca nad hodnotou
  („Dátum dodania", „Základná", „Nie je predmetom DPH", „23 %", názov
  položky). Výskyt pripadne údaju s najsilnejšou kotvou; riadok rozpisu DPH sa
  tak priradí podľa hlavičky stĺpca, nie podľa poradia, a stĺpec „Celkom"
  ostane súčtom.

  Obrázky ani skeny bez textovej vrstvy slová nemajú — pre ne (a pre údaje,
  ktoré sa v texte nenašli) sa použije poloha, ktorú vrátila AI
  (`polohy-ai.ts`), ak hodnota ešte sedí s tým, čo AI prečítala. Prepísané
  pole teda svoju polohu stratí.

  Čisté funkcie bez Reactu, aby sa dali otestovať.
*/
import { sucty, type UdajeNespracovaneho } from "./nespracovane";
import type { DoplnokZvyraznenia, PolohaAi } from "./polohy-ai";
import { kategoriaRiadku } from "./rozpis-dph-kontrola";
import {
  poleVyberu,
  polePodlaPopisu,
  type KlucPola,
  type Obdlznik,
  type SlovoNahladu,
  type TypPola,
} from "./vyber-z-dokladu";

/* ------------------------------------------------------------- údaje */

/** Skupina údaja — každá má v náhľade vlastnú farbu či štýl rámčeka. */
export type SkupinaZvyraznenia =
  "dodavatel" | "odberatel" | "doklad" | "datumy" | "sumy" | "dph" | "platba" | "polozky";

export const SKUPINY_ZVYRAZNENIA: SkupinaZvyraznenia[] = [
  "dodavatel",
  "odberatel",
  "doklad",
  "datumy",
  "sumy",
  "dph",
  "platba",
  "polozky",
];

export const NAZVY_SKUPIN: Record<SkupinaZvyraznenia, string> = {
  dodavatel: "Dodávateľ",
  odberatel: "Odberateľ",
  doklad: "Doklad",
  datumy: "Dátumy",
  sumy: "Sumy",
  dph: "Rozpis DPH",
  platba: "Platba",
  polozky: "Položky",
};

/** Typ hľadania — typy polí formulára a dva len pre položky. */
type TypHladania = TypPola | "mnozstvo" | "sadzba";

/** Popisy pri hodnote — v riadku vedľa nej alebo v hlavičke stĺpca nad ňou. */
type Kotva = {
  texty: string[];
  kde: "riadok" | "stlpec" | "oboje";
  /** Váha skupiny kotiev (predvolene 1). */
  vaha?: number;
  /** Bez útlmu podľa vzdialenosti — názov položky je v riadku ďaleko vľavo. */
  bezUtlmu?: boolean;
};

/** Jeden údaj, ktorého miesto sa v náhľade zvýrazní. */
export type UdajZvyraznenia = {
  /** Jednoznačné id („cislo", „bezDph", „rozpis.1.zaklad", „polozky.0.nazov"). */
  id: string;
  /** Pole formulára, ktoré údaj predstavuje (výber z dokladu, prepojenie). */
  pole: KlucPola | null;
  skupina: SkupinaZvyraznenia;
  /** Slovenský popis pre `t()` (s parametrami `popisParam`). */
  popis: string;
  popisParam?: Record<string, string | number>;
  /** Krátky štítok priamo pri rámčeku (sadzba, „bez DPH", „spl."). */
  stitok?: string;
  stitokParam?: Record<string, string | number>;
  typ: TypHladania;
  hodnota: string | number | null;
  /** Vlastné tvary hľadania (inak z typu a hodnoty). */
  varianty?: string[];
  kotvy?: Kotva[];
  /** Výskyt bez kotvy sa neráta (množstvo „1" je na doklade všade). */
  lenSKotvou?: boolean;
  /** Keď má niektorý výskyt kotvu, ostanú len tie najlepšie. */
  uzsit?: boolean;
  /** Najviac toľko výskytov. */
  max?: number;
};

/** Zvýraznené miesto údaja na strane. */
export type Zvyraznenie = {
  /** Id údaja (`UdajZvyraznenia.id`). */
  kluc: string;
  pole: KlucPola | null;
  skupina: SkupinaZvyraznenia;
  popis: string;
  popisParam?: Record<string, string | number>;
  stitok?: string;
  stitokParam?: Record<string, string | number>;
  /** Hodnota v tvare na ukázanie (bublina, slovo nad skenom). */
  text: string;
  /** Index strany (od 0). */
  strana: number;
  /** Obdĺžniky výskytu — jeden na riadok, v zlomkoch strany. */
  r: Obdlznik[];
  /** Odkiaľ miesto je. */
  zdroj: "text" | "ai";
};

/** Polia formulára, ktorých miesto sa zvýrazňuje (ostatné údaje nemajú pole). */
export const POLIA_ZVYRAZNENIA: KlucPola[] = [
  "dodavatel.nazov",
  "dodavatel.ico",
  "dodavatel.dic",
  "dodavatel.icDph",
  "dodavatel.iban",
  "dodavatel.ulica",
  "dodavatel.mesto",
  "dodavatel.psc",
  "cislo",
  "vs",
  "ks",
  "ss",
  "objednavka",
  "dodaciList",
  "opravuje",
  "mena",
  "datumVystavenia",
  "datumDodania",
  "splatnost",
  "celkom",
  "ostatny.predmet",
  "ostatny.lehota",
];

/** Najviac toľko výskytov jednej hodnoty — inak by suma v tabuľke svietila všade. */
const MAX_VYSKYTOV = 4;
/** Kratšia hodnota by sa našla náhodou (VS „1" je na doklade všade). */
const MIN_DLZKA = 3;
/** Najviac toľko položiek — dlhý doklad by hľadanie zbytočne spomalil. */
const MAX_POLOZIEK = 40;

/** Hodnota poľa v údajoch dokladu (prázdna = null). */
export function hodnotaPola(u: UdajeNespracovaneho, kluc: KlucPola): string | number | null {
  if (kluc === "celkom") {
    const c = u.celkom ?? sucty(u).celkom;
    return typeof c === "number" && Number.isFinite(c) && c !== 0 ? c : null;
  }
  let v: unknown;
  if (kluc.startsWith("dodavatel."))
    v = (u.dodavatel as Record<string, unknown>)[kluc.slice("dodavatel.".length)];
  else if (kluc.startsWith("ostatny."))
    v = (u.ostatny as Record<string, unknown>)[kluc.slice("ostatny.".length)];
  else v = (u as Record<string, unknown>)[kluc];
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/* ---- kotvy (popisy, podľa ktorých sa výskyty rozdelia medzi údaje) ---- */

const K_ZAKLAD = ["Základ", "Základ dane", "Základ DPH", "Základ daně", "Zaklad dane"];
const K_DPH = ["DPH", "Daň", "Výška DPH", "Suma DPH", "Daň z pridanej hodnoty", "Dan"];
const K_SPOLU = ["Spolu", "Celkom", "Celkem", "Súčet", "Sumár", "Total"];

/** Popisy sadzby alebo kategórie riadku rozpisu (hlavička stĺpca či text v riadku). */
function kotvySadzby(sadzba: number, kategoria: string): string[] {
  const p = String(sadzba).replace(".", ",");
  const percenta = [`${p} %`, `${p},00 %`, `${p}.00 %`, `${p}%`];
  if (kategoria === "out_of_scope")
    return [
      "Nie je predmetom DPH",
      "Nie je predmetom dane",
      "Nepodlieha DPH",
      "Mimo predmetu DPH",
      "Není předmětem daně",
      "Nepodléhá DPH",
    ];
  if (kategoria === "exempt")
    return ["Oslobodené", "Oslobodená", "Oslobodené od dane", "Osvobozeno", "Osvobozené"];
  if (kategoria === "reverse_charge")
    return [
      "Prenesenie daňovej povinnosti",
      "Prenesenie",
      "PDP",
      "§ 69 ods. 12",
      "Reverse charge",
      "Přenesení daňové povinnosti",
      ...percenta,
    ];
  const nazvy: Record<number, string[]> = {
    23: ["Základná", "Základná sadzba"],
    21: ["Základní", "Základní sazba"],
    20: ["Základná"],
    19: ["1. znížená", "Znížená", "Znížená sadzba"],
    12: ["Snížená", "Snížená sazba", "1. snížená"],
    10: ["2. znížená"],
    5: ["2. znížená"],
  };
  return [...percenta, ...(nazvy[sadzba] ?? [])];
}

const K_DATUM: Partial<Record<KlucPola, string[]>> = {
  datumVystavenia: [
    "Dátum vystavenia",
    "Vystavené",
    "Vystavená",
    "Dátum vyhotovenia",
    "Dátum vydania",
    "Datum vystavení",
    "Vystaveno",
  ],
  datumDodania: [
    "Dátum dodania",
    "Dátum dodania tovaru",
    "DUZP",
    "Dátum uskutočnenia zdaniteľného plnenia",
    "Dátum zdaniteľného plnenia",
    "Dátum vzniku daňovej povinnosti",
    "Dátum dodania služby",
    "Datum zdanitelného plnění",
    "Datum uskutečnění zdanitelného plnění",
    "Dodanie",
  ],
  splatnost: [
    "Dátum splatnosti",
    "Splatnosť",
    "Splatné do",
    "Splatná dňa",
    "Datum splatnosti",
    "Splatnost",
  ],
};

const K_POLA: Partial<Record<KlucPola, string[]>> = {
  cislo: [
    "Faktúra č.",
    "Faktúra číslo",
    "Číslo faktúry",
    "Faktúra",
    "Číslo dokladu",
    "Doklad č.",
    "Faktura č.",
    "Číslo",
  ],
  vs: ["VS", "Variabilný symbol", "Var. symbol", "Variabilní symbol"],
  ks: ["KS", "Konštantný symbol", "Konšt. symbol", "Konstantní symbol"],
  ss: ["ŠS", "Špecifický symbol", "Špec. symbol", "Specifický symbol"],
  objednavka: ["Objednávka", "Číslo objednávky", "Objednávka č.", "Obj. č."],
  dodaciList: ["Dodací list", "Dodací list č.", "Číslo dodacieho listu"],
  opravuje: ["Opravuje", "K faktúre", "Pôvodná faktúra", "Opravovaný doklad", "K faktúre č."],
  "dodavatel.iban": ["IBAN"],
  "dodavatel.ico": ["IČO", "IČ"],
  "dodavatel.dic": ["DIČ"],
  "dodavatel.icDph": ["IČ DPH", "IČ pre DPH"],
};

/* ------------------------------------------------- zoznam údajov */

const r2 = (n: number) => Math.round(n * 100) / 100;
const cisloAleboNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** Tvary množstva („60", „60,00", „1,5"). */
function variantyMnozstva(q: number): string[] {
  const a = Math.abs(q);
  const out = new Set<string>();
  const zaklad = String(a);
  out.add(zaklad.replace(".", ","));
  out.add(zaklad);
  const s = a.toFixed(2);
  out.add(s.replace(".", ","));
  out.add(s);
  return [...out].map(normalizujText);
}

/** Tvary sadzby položky („23 %", „23"). */
function variantySadzby(s: number): string[] {
  const p = String(s);
  return [...new Set([`${p}%`, `${p.replace(".", ",")}%`, `${p},00%`, p, p.replace(".", ",")])].map(
    normalizujText,
  );
}

/** Tvary formy úhrady — kód z formulára aj vytlačený text od AI. */
function variantyPlatby(kod: string, text?: string): string[] {
  const podlaKodu: Record<string, string[]> = {
    prevod: ["Prevodom", "Prevodným príkazom", "Bankovým prevodom", "Bankový prevod", "Prevod"],
    hotovost: ["Hotovosť", "V hotovosti", "Hotovostne", "Hotově", "Hotovost"],
    karta: ["Kartou", "Platobná karta", "Platba kartou", "Karta"],
  };
  const out = [...(text ? [text] : []), ...(podlaKodu[kod] ?? [])];
  return [...new Set(out.map(normalizujText))].filter((v) => v.length >= MIN_DLZKA);
}

function popisRiadkuDph(
  sadzba: number,
  kategoria: string,
  co: "zaklad" | "dph",
): { popis: string; stitok: string } {
  if (kategoria === "out_of_scope")
    return { popis: "Nie je predmetom DPH — suma", stitok: "mimo DPH" };
  if (kategoria === "exempt") return { popis: "Oslobodené od DPH — suma", stitok: "oslobodené" };
  if (kategoria === "reverse_charge")
    return co === "zaklad"
      ? { popis: "Prenesenie daňovej povinnosti — základ", stitok: "PDP základ" }
      : { popis: "Prenesenie daňovej povinnosti — DPH", stitok: "PDP DPH" };
  if (kategoria === "needs_review")
    return co === "zaklad"
      ? { popis: "Základ {sadzba} % (kategória na kontrolu)", stitok: "{sadzba} % základ" }
      : { popis: "DPH {sadzba} % (kategória na kontrolu)", stitok: "{sadzba} % DPH" };
  return co === "zaklad"
    ? { popis: "Základ DPH {sadzba} %", stitok: "{sadzba} % základ" }
    : { popis: "DPH {sadzba} %", stitok: "{sadzba} % DPH" };
}

/**
 * Všetky údaje dokladu, ktorých miesto sa dá v náhľade zvýrazniť: polia
 * formulára, súčty, každý riadok rozpisu DPH, položky, odberateľ (z AI),
 * platba. `polia` sú polia, ktoré formulár pri druhu dokladu ukazuje —
 * ostatné sa nezvýraznia; súčty, rozpis a položky idú s poľom „celkom",
 * odberateľ s IČO dodávateľa.
 */
export function udajeNaZvyraznenie(
  u: UdajeNespracovaneho,
  polia: KlucPola[] = POLIA_ZVYRAZNENIA,
  doplnok?: DoplnokZvyraznenia,
): UdajZvyraznenia[] {
  const out: UdajZvyraznenia[] = [];
  const ukazuje = (k: KlucPola) => polia.includes(k);
  const pole = (
    k: KlucPola,
    skupina: SkupinaZvyraznenia,
    popis: string,
    navyse: Partial<UdajZvyraznenia> = {},
  ) => {
    if (!ukazuje(k)) return;
    const typ = poleVyberu(k).typ;
    const kotvy = K_DATUM[k] ?? K_POLA[k];
    out.push({
      id: k,
      pole: k,
      skupina,
      popis,
      typ,
      hodnota: hodnotaPola(u, k),
      ...(kotvy ? { kotvy: [{ texty: kotvy, kde: "oboje" as const }] } : {}),
      ...navyse,
    });
  };

  // Dodávateľ
  pole("dodavatel.nazov", "dodavatel", "Názov dodávateľa", { max: 2 });
  pole("dodavatel.ico", "dodavatel", "IČO dodávateľa");
  pole("dodavatel.dic", "dodavatel", "DIČ dodávateľa");
  pole("dodavatel.icDph", "dodavatel", "IČ DPH dodávateľa");
  pole("dodavatel.ulica", "dodavatel", "Ulica dodávateľa", { max: 2 });
  pole("dodavatel.mesto", "dodavatel", "Mesto dodávateľa", { max: 2 });
  pole("dodavatel.psc", "dodavatel", "PSČ dodávateľa", { max: 2 });

  // Odberateľ — formulár ho nemá (je to vlastná firma), hodnoty sú z AI.
  const o = doplnok?.odberatel;
  if (o && ukazuje("dodavatel.ico")) {
    const odb = (
      k: keyof NonNullable<DoplnokZvyraznenia["odberatel"]>,
      typ: TypPola,
      popis: string,
      kotvy?: string[],
    ) => {
      const h = String(o[k] ?? "").trim();
      if (!h) return;
      out.push({
        id: `odberatel.${k}`,
        pole: null,
        skupina: "odberatel",
        popis,
        typ,
        hodnota: h,
        max: 2,
        ...(kotvy ? { kotvy: [{ texty: kotvy, kde: "oboje" as const }] } : {}),
      });
    };
    odb("nazov", "text", "Názov odberateľa");
    odb("ico", "ico", "IČO odberateľa", K_POLA["dodavatel.ico"]);
    odb("dic", "dic", "DIČ odberateľa", K_POLA["dodavatel.dic"]);
    odb("icDph", "icdph", "IČ DPH odberateľa", K_POLA["dodavatel.icDph"]);
    odb("ulica", "text", "Ulica odberateľa");
    odb("mesto", "text", "Mesto odberateľa");
    odb("psc", "psc", "PSČ odberateľa");
  }

  // Doklad
  pole("cislo", "doklad", "Číslo dokladu");
  pole("objednavka", "doklad", "Číslo objednávky");
  pole("dodaciList", "doklad", "Číslo dodacieho listu");
  if (ukazuje("opravuje")) {
    const h = hodnotaPola(u, "opravuje") ?? doplnok?.opravuje ?? null;
    pole("opravuje", "doklad", "Opravuje doklad č.", { hodnota: h });
  }
  pole("mena", "doklad", "Mena", { max: 2 });
  pole("ostatny.predmet", "doklad", "Predmet", { max: 1 });
  if (doplnok?.prenesenie && ukazuje("celkom"))
    out.push({
      id: "prenesenie",
      pole: null,
      skupina: "doklad",
      popis: "Text o prenesení daňovej povinnosti",
      stitok: "PDP",
      typ: "text",
      hodnota: doplnok.prenesenie,
      max: 1,
    });

  // Dátumy
  pole("datumVystavenia", "datumy", "Dátum vystavenia", { stitok: "vystavenie" });
  pole("datumDodania", "datumy", "Dátum dodania (DUZP)", { stitok: "dodanie" });
  pole("splatnost", "datumy", "Splatnosť", { stitok: "splatnosť" });
  pole("ostatny.lehota", "datumy", "Lehota", { stitok: "lehota" });

  // Platba
  pole("dodavatel.iban", "platba", "IBAN dodávateľa (na úhradu)");
  if (doplnok?.swift && ukazuje("dodavatel.iban"))
    out.push({
      id: "swift",
      pole: null,
      skupina: "platba",
      popis: "SWIFT/BIC dodávateľa",
      typ: "text",
      hodnota: doplnok.swift,
      kotvy: [{ texty: ["SWIFT", "BIC", "SWIFT/BIC"], kde: "oboje" }],
    });
  pole("vs", "platba", "Variabilný symbol");
  pole("ks", "platba", "Konštantný symbol");
  pole("ss", "platba", "Špecifický symbol");
  if (ukazuje("celkom") && (u.platba || doplnok?.formaUhrady)) {
    const varianty = variantyPlatby(u.platba, doplnok?.formaUhrady);
    if (varianty.length)
      out.push({
        id: "platba",
        pole: null,
        skupina: "platba",
        popis: "Forma úhrady",
        typ: "text",
        hodnota: doplnok?.formaUhrady || u.platba,
        varianty,
        max: 1,
      });
  }

  if (!ukazuje("celkom")) return out.filter(vyplneny);

  // Sumy
  const s = sucty(u);
  const celkom = cisloAleboNull(hodnotaPola(u, "celkom"));
  const zaloha = cisloAleboNull(u.zaloha) ?? cisloAleboNull(doplnok?.zaloha);
  const kUhrade =
    cisloAleboNull(doplnok?.kUhrade) ??
    (zaloha != null && celkom != null ? r2(Math.abs(celkom) - Math.abs(zaloha)) : null);
  const jeKUhrade =
    kUhrade != null && celkom != null && Math.abs(Math.abs(kUhrade) - Math.abs(celkom)) >= 0.005;
  const suma = (
    id: string,
    popis: string,
    stitok: string,
    hodnota: number | null,
    kotvy: Kotva[],
    navyse: Partial<UdajZvyraznenia> = {},
  ) => {
    if (hodnota == null) return;
    out.push({
      id,
      pole: null,
      skupina: "sumy",
      popis,
      stitok,
      typ: "suma",
      hodnota,
      kotvy,
      ...navyse,
    });
  };
  suma("bezDph", "Suma bez DPH spolu", "bez DPH", cisloAleboNull(s.zaklad), [
    {
      texty: [
        "Spolu bez DPH",
        "Celkom bez DPH",
        "Bez DPH",
        "Základ spolu",
        "Celkem bez DPH",
        "Suma bez DPH",
        ...K_ZAKLAD,
      ],
      kde: "oboje",
    },
    { texty: K_SPOLU, kde: "oboje", vaha: 0.6 },
  ]);
  suma("dph", "DPH spolu", "DPH", cisloAleboNull(s.dph), [
    { texty: ["DPH spolu", "DPH celkom", "Spolu DPH", "DPH celkem", ...K_DPH], kde: "oboje" },
    { texty: K_SPOLU, kde: "oboje", vaha: 0.6 },
  ]);
  if (ukazuje("celkom") && celkom != null)
    out.push({
      id: "celkom",
      pole: "celkom",
      skupina: "sumy",
      popis: jeKUhrade ? "Suma spolu s DPH" : "Suma spolu (k úhrade)",
      stitok: "spolu",
      typ: "suma",
      hodnota: celkom,
      kotvy: [
        {
          texty: [
            "Spolu s DPH",
            "Celkom s DPH",
            "Celková suma",
            "Suma spolu",
            "Celkem s DPH",
            ...K_SPOLU,
            ...(jeKUhrade
              ? []
              : ["K úhrade", "Na úhradu", "Suma na úhradu", "K zaplacení", "Celkom k úhrade"]),
          ],
          kde: "oboje",
        },
      ],
    });
  if (jeKUhrade)
    suma("kUhrade", "Suma k úhrade (po odpočítaní zálohy)", "k úhrade", kUhrade, [
      {
        texty: [
          "K úhrade",
          "Na úhradu",
          "Suma na úhradu",
          "Zostáva uhradiť",
          "K zaplacení",
          "Celkom k úhrade",
        ],
        kde: "oboje",
        vaha: 1.5,
      },
    ]);
  suma("zaloha", "Odpočítaná záloha", "záloha", zaloha, [
    {
      texty: [
        "Záloha",
        "Zálohy",
        "Uhradená záloha",
        "Zaplatená záloha",
        "Odpočet zálohy",
        "Uhrazená záloha",
      ],
      kde: "oboje",
      vaha: 1.5,
    },
  ]);
  suma("zlava", "Zľava", "zľava", cisloAleboNull(doplnok?.zlava), [
    { texty: ["Zľava", "Zľava na doklad", "Sleva"], kde: "oboje", vaha: 1.5 },
  ]);
  suma(
    "zaokruhlenie",
    "Zaokrúhlenie",
    "zaokrúhlenie",
    cisloAleboNull(u.zaokruhlenie),
    [{ texty: ["Zaokrúhlenie", "Zaokrouhlení"], kde: "oboje", vaha: 1.5 }],
    { lenSKotvou: true },
  );

  // Rozpis DPH — každý riadok podľa sadzby a kategórie
  u.rozpis.forEach((r, i) => {
    const sadzba = Number(r.sadzba) || 0;
    const kategoria = kategoriaRiadku({ rate: sadzba, vat_category: r.vat_category });
    const kotvaSadzby: Kotva = { texty: kotvySadzby(sadzba, kategoria), kde: "oboje", vaha: 1.2 };
    for (const co of ["zaklad", "dph"] as const) {
      const h = cisloAleboNull(co === "zaklad" ? r.zaklad : r.dph);
      if (h == null) continue;
      const { popis, stitok } = popisRiadkuDph(sadzba, kategoria, co);
      out.push({
        id: `rozpis.${i}.${co}`,
        pole: null,
        skupina: "dph",
        popis,
        popisParam: { sadzba: String(sadzba).replace(".", ",") },
        stitok,
        stitokParam: { sadzba: String(sadzba).replace(".", ",") },
        typ: "suma",
        hodnota: h,
        kotvy: [kotvaSadzby, { texty: co === "zaklad" ? K_ZAKLAD : K_DPH, kde: "oboje" }],
        uzsit: true,
        max: 2,
      });
    }
  });

  // Položky — hodnoty v riadku, kde je názov položky
  if (!u.polozkyVypnute)
    u.polozky.slice(0, MAX_POLOZIEK).forEach((p, i) => {
      const nazov = String(p.name ?? "").trim();
      if (!nazov) return;
      const n = i + 1;
      const variantyNazvu = variantyNazvuPolozky(nazov);
      out.push({
        id: `polozky.${i}.nazov`,
        pole: null,
        skupina: "polozky",
        popis: "Položka {n} — názov",
        popisParam: { n },
        typ: "text",
        hodnota: nazov,
        varianty: variantyNazvu,
        max: 1,
      });
      const kotvaRiadku: Kotva = { texty: [nazov], kde: "riadok", vaha: 3, bezUtlmu: true };
      const vRiadku = (
        pole: string,
        popis: string,
        typ: TypHladania,
        hodnota: number | null,
        varianty?: string[],
      ) => {
        if (hodnota == null) return;
        out.push({
          id: `polozky.${i}.${pole}`,
          pole: null,
          skupina: "polozky",
          popis,
          popisParam: { n },
          typ,
          hodnota,
          ...(varianty ? { varianty } : {}),
          kotvy: [kotvaRiadku],
          lenSKotvou: true,
          uzsit: true,
          max: 1,
        });
      };
      const q = cisloAleboNull(p.quantity);
      vRiadku(
        "mnozstvo",
        "Položka {n} — množstvo",
        "mnozstvo",
        q,
        q != null ? variantyMnozstva(q) : undefined,
      );
      const cena = cisloAleboNull(p.unit_price);
      vRiadku(
        "cena",
        "Položka {n} — jednotková cena",
        "suma",
        cena,
        cena != null ? variantySumy(cena, 4) : undefined,
      );
      vRiadku("spolu", "Položka {n} — suma riadku", "suma", cisloAleboNull(p.total));
      const sadzba = p.vat_rate == null ? null : Number(p.vat_rate);
      if (sadzba != null && Number.isFinite(sadzba))
        vRiadku("sadzba", "Položka {n} — sadzba DPH", "sadzba", sadzba, variantySadzby(sadzba));
    });

  return out.filter(vyplneny);
}

/** Údaj s hodnotou — prázdne pole sa nehľadá ani neukazuje. */
const vyplneny = (d: UdajZvyraznenia) => d.hodnota != null && d.hodnota !== "";

/** Názov položky — celý, a pri dlhom aj prvé slová (AI ho občas skráti či upraví). */
function variantyNazvuPolozky(nazov: string): string[] {
  const out = new Set<string>([normalizujText(nazov)]);
  const slova = nazov.split(/\s+/).filter(Boolean);
  if (slova.length > 3) {
    const zaciatok = normalizujText(slova.slice(0, 3).join(" "));
    if (zaciatok.length >= 8) out.add(zaciatok);
  }
  return [...out].filter((v) => v.length >= MIN_DLZKA);
}

/* --------------------------------------------------------- hľadanie */

/** Tvar na porovnanie: veľké písmená, bez medzier. */
export function normalizujText(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toLocaleUpperCase("sk");
}

function skupinyTisicov(cele: string, oddelovac: string): string {
  return cele.replace(/\B(?=(\d{3})+(?!\d))/g, oddelovac);
}

/** Tvary sumy s 2 desatinnými miestami (a pri jednotkovej cene aj s viac). */
function variantySumy(n: number, maxDesatinnych = 2): string[] {
  const vysledok = new Set<string>();
  const desatinne = new Set([2]);
  /*
    Jednotková cena s viac desatinnými miestami (1,5235) — len keď ich naozaj
    má; „360,000" by sa inak našlo aj v „360,00 0 %" (medzery sú voliteľné).
  */
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6)
    for (let d = 3; d <= maxDesatinnych; d++)
      if (Math.abs(Number(n.toFixed(d)) - n) < 1e-9 || d === maxDesatinnych) {
        desatinne.add(d);
        break;
      }
  for (const d of desatinne) {
    const [cele, des] = Math.abs(n).toFixed(d).split(".");
    for (const [tisice, desatinna] of [
      ["", ","],
      ["", "."],
      [".", ","],
      [",", "."],
      ["'", "."],
    ]) {
      const v = normalizujText(`${skupinyTisicov(cele, tisice)}${desatinna}${des}`);
      if (v.length >= MIN_DLZKA) vysledok.add(v);
    }
  }
  return [...vysledok];
}

/**
 * Tvary, v akých môže byť hodnota na doklade vytlačená — už normalizované
 * (bez medzier, veľkými písmenami). Prázdne pole = nehľadať.
 */
export function variantyHladania(typ: TypPola, hodnota: string | number | null): string[] {
  if (hodnota == null || hodnota === "") return [];
  const vysledok = new Set<string>();
  const pridaj = (s: string) => {
    const n = normalizujText(s);
    if (n.length >= MIN_DLZKA) vysledok.add(n);
  };

  if (typ === "suma") {
    const n = typeof hodnota === "number" ? hodnota : Number(String(hodnota).replace(",", "."));
    if (!Number.isFinite(n) || n === 0) return [];
    return variantySumy(n);
  }

  if (typ === "datum") {
    const m = String(hodnota).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return [];
    const [, y, mm, dd] = m;
    const d = String(Number(dd));
    const mes = String(Number(mm));
    const yy = y.slice(2);
    for (const den of new Set([dd, d]))
      for (const mesiac of new Set([mm, mes]))
        for (const odd of [".", "/", "-"]) {
          pridaj(`${den}${odd}${mesiac}${odd}${y}`);
          if (odd !== "-") pridaj(`${den}${odd}${mesiac}${odd}${yy}`);
        }
    pridaj(`${y}-${mm}-${dd}`);
    return [...vysledok];
  }

  const s = String(hodnota);
  pridaj(s);
  // IČO uložené s doplnenými nulami býva vytlačené bez nich.
  if (typ === "ico") {
    const bezNul = normalizujText(s).replace(/^0+/, "");
    if (bezNul.length >= 6) pridaj(bezNul);
  }
  // IČ DPH býva aj s medzerou za kódom štátu — pokryje to voliteľná medzera.
  return [...vysledok];
}

// Bez „-" a „/" — v režime `u` je ich escapovanie chyba a mimo [] escapovať netreba.
const escape = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALNUM = /[\p{L}\d]/u;

/**
 * Výraz, ktorý nájde normalizovaný tvar v prúde slov oddelených jednou medzerou
 * (medzera medzi ľubovoľnými dvoma znakmi je voliteľná). Hodnota sa nesmie
 * nalepiť na ďalšie písmená či číslice — „2.10.2026" nesmie zobrať „12.10.2026".
 * Pri sume a IČO nesmie stáť pred ňou ani „číslica medzera" (skupina tisícov).
 * Množstvo a sadzba nesmú byť začiatkom desatinného čísla („23" z „23,10").
 */
function vyrazPre(varianta: string, typ: TypHladania): RegExp {
  const znaky = [...varianta].map(escape).join(" ?");
  const prvy = varianta[0] ?? "";
  const posledny = varianta[varianta.length - 1] ?? "";
  const cislovy = typ === "suma" || typ === "ico" || typ === "mnozstvo" || typ === "sadzba";
  /*
    Pred číslom nesmie byť skupina tisícov („1 234,50" — „234,50" nie je
    hodnota). Skupina tisícov sú 1–3 číslice na začiatku čísla; „0,00 116,87"
    sú dve bunky tabuľky, nie jedno číslo.
  */
  const pred = ALNUM.test(prvy) ? `(?<![\\p{L}\\d])${cislovy ? "(?<!\\d[.,])" : ""}` : "";
  const za = ALNUM.test(posledny)
    ? `(?![\\p{L}\\d])${typ === "mnozstvo" || typ === "sadzba" || typ === "suma" ? "(?! ?[.,] ?\\d)" : ""}`
    : "";
  return new RegExp(`${pred}${znaky}${za}`, "gu");
}

type Prud = { text: string; zaciatky: number[]; dlzky: number[] };

/** Slová strany v jednom prúde (oddelené medzerou) a začiatok každého slova v ňom. */
function prudSlov(slova: SlovoNahladu[]): Prud {
  const zaciatky: number[] = [];
  const dlzky: number[] = [];
  let text = "";
  for (const s of slova) {
    if (text) text += " ";
    zaciatky.push(text.length);
    const n = normalizujText(s.text);
    dlzky.push(n.length);
    text += n;
  }
  return { text, zaciatky, dlzky };
}

/** Obdĺžniky slov — slová na jednom riadku sa zlúčia do jedného. */
export function obdlznikySlov(slova: SlovoNahladu[]): Obdlznik[] {
  const riadky: SlovoNahladu[][] = [];
  for (const s of slova) {
    const r = riadky.find((x) => {
      const a = x[0];
      return Math.abs(a.y + a.h / 2 - (s.y + s.h / 2)) < Math.max(a.h, s.h) / 2;
    });
    if (r) r.push(s);
    else riadky.push([s]);
  }
  return riadky.map((r) => {
    const x = Math.min(...r.map((s) => s.x));
    const y = Math.min(...r.map((s) => s.y));
    const x2 = Math.max(...r.map((s) => s.x + s.w));
    const y2 = Math.max(...r.map((s) => s.y + s.h));
    return { x, y, w: x2 - x, h: y2 - y };
  });
}

type Vyskyt = { indexy: number[]; r: Obdlznik[]; box: Obdlznik };

function obal(r: Obdlznik[]): Obdlznik {
  const x = Math.min(...r.map((a) => a.x));
  const y = Math.min(...r.map((a) => a.y));
  const x2 = Math.max(...r.map((a) => a.x + a.w));
  const y2 = Math.max(...r.map((a) => a.y + a.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Všetky výskyty tvarov v prúde slov (slovo patrí najviac jednému výskytu). */
function vyskyty(
  slova: SlovoNahladu[],
  prud: Prud,
  varianty: string[],
  typ: TypHladania,
  max: number,
): Vyskyt[] {
  if (!slova.length || !varianty.length) return [];
  const { text, zaciatky, dlzky } = prud;
  const pouzite = new Set<number>();
  const out: Vyskyt[] = [];
  // Dlhší tvar má prednosť — „1.234,50" pred kratšími zhodami.
  for (const v of [...varianty].sort((a, b) => b.length - a.length)) {
    for (const m of text.matchAll(vyrazPre(v, typ))) {
      const od = m.index ?? 0;
      const po = od + m[0].length;
      const indexy: number[] = [];
      zaciatky.forEach((z, i) => {
        if (z < po && z + dlzky[i] > od) indexy.push(i);
      });
      if (!indexy.length || indexy.some((i) => pouzite.has(i))) continue;
      if (CISLOVE.has(typ) && jeChvostCisla(slova, indexy[0])) continue;
      indexy.forEach((i) => pouzite.add(i));
      const r = obdlznikySlov(indexy.map((i) => slova[i]));
      out.push({ indexy, r, box: obal(r) });
      if (out.length >= max) return out;
    }
  }
  return out;
}

const CISLOVE = new Set<TypHladania>(["suma", "ico", "mnozstvo", "sadzba"]);

/**
 * Je slovo koncom väčšieho čísla so skupinou tisícov („1 234,50" — „234,50"
 * nie je hodnota)? Predchádza mu 1–3 číslice tesne vedľa (úzka medzera).
 * Bunky tabuľky („0,00 116,87", „0 26,90") majú medzi sebou širokú medzeru.
 */
function jeChvostCisla(slova: SlovoNahladu[], i: number): boolean {
  const pred = slova[i - 1];
  const s = slova[i];
  if (!pred || !s || !/^\d{1,3}$/.test(pred.text.trim())) return false;
  if (!vRiadku(pred, s)) return false;
  const medzera = s.x - (pred.x + pred.w);
  return medzera < Math.max(pred.h, s.h) * 0.6;
}

/** Výskyty hodnoty v slovách jednej strany — každý ako zoznam obdĺžnikov (po riadkoch). */
export function najdiVSlovach(
  slova: SlovoNahladu[],
  varianty: string[],
  typ: TypPola,
): Obdlznik[][] {
  return vyskyty(slova, prudSlov(slova), varianty, typ, MAX_VYSKYTOV).map((v) => v.r);
}

/* ------------------------------------------------------------ kotvy */

const stred = (r: Obdlznik) => r.y + r.h / 2;
const vRiadku = (a: Obdlznik, b: Obdlznik) =>
  Math.abs(stred(a) - stred(b)) < Math.max(a.h, b.h) * 0.6;

/** Sila jednej kotvy pri výskyte (0 = nie je pri ňom). */
function silaKotvy(kotva: Obdlznik, v: Obdlznik, kde: Kotva["kde"], bezUtlmu: boolean): number {
  let s = 0;
  if (kde !== "stlpec" && vRiadku(kotva, v)) {
    const dx = Math.max(0, Math.max(kotva.x, v.x) - Math.min(kotva.x + kotva.w, v.x + v.w));
    const vlavo = kotva.x + kotva.w / 2 <= v.x + v.w / 2;
    s = Math.max(s, (bezUtlmu ? 1 : 1 / (1 + 8 * dx)) * (vlavo ? 1 : 0.7));
  }
  if (kde !== "riadok") {
    const prekryv = Math.min(kotva.x + kotva.w, v.x + v.w) - Math.max(kotva.x, v.x);
    const dy = v.y - (kotva.y + kotva.h);
    if (prekryv > -0.005 && dy > -0.003 && dy < 0.35)
      s = Math.max(s, bezUtlmu ? 0.8 : 0.8 / (1 + 8 * Math.max(0, dy)));
  }
  return s;
}

/** Hodnotenie výskytu podľa kotiev údaja (súčet najlepšej kotvy z každej skupiny). */
function skoreVyskytu(
  v: Vyskyt,
  kotvy: Kotva[] | undefined,
  najdiKotvu: (texty: string[]) => Vyskyt[],
): number {
  if (!kotvy?.length) return 0;
  let spolu = 0;
  for (const k of kotvy) {
    let naj = 0;
    for (const a of najdiKotvu(k.texty)) {
      if (a.indexy.some((i) => v.indexy.includes(i))) continue;
      naj = Math.max(naj, silaKotvy(a.box, v.box, k.kde, Boolean(k.bezUtlmu)));
    }
    spolu += naj * (k.vaha ?? 1);
  }
  return spolu;
}

/* ------------------------------------------------- hodnota a poloha */

/** Hodnota údaja v tvare, ako býva vytlačená (bublina, slovo nad skenom). */
export function textUdaja(typ: TypHladania, hodnota: string | number | null): string {
  if (hodnota == null || hodnota === "") return "";
  if (typ === "datum") {
    const m = String(hodnota).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(hodnota);
  }
  if (typ === "suma") {
    const n = typeof hodnota === "number" ? hodnota : Number(String(hodnota).replace(",", "."));
    if (!Number.isFinite(n)) return String(hodnota);
    const [cele, des] = Math.abs(n).toFixed(2).split(".");
    return `${n < 0 ? "-" : ""}${cele.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${des}`;
  }
  if (typ === "sadzba") return `${String(hodnota).replace(".", ",")} %`;
  if (typ === "mnozstvo") return String(hodnota).replace(".", ",");
  return String(hodnota).trim();
}

/** Sedí hodnota od AI s hodnotou údaja? (dobropis býva v údajoch záporný) */
function hodnotaSedi(typ: TypHladania, teraz: string | number | null, ai: string | number | null) {
  if (teraz == null || teraz === "" || ai == null || ai === "") return false;
  if (typ === "suma" || typ === "mnozstvo" || typ === "sadzba") {
    const a = Number(String(teraz).replace(",", "."));
    const b = Number(String(ai).replace(",", "."));
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;
  }
  const norm = (v: string | number) => {
    const n = normalizujText(String(v)).replace(/[-./,]/g, "");
    return typ === "ico" ? n.replace(/^0+/, "") : n;
  };
  return norm(teraz) === norm(ai);
}

/**
 * Platí ešte poloha od AI? Len keď hodnota poľa je tá istá, akú AI prečítala —
 * prepísané pole by inak ukazovalo na iné miesto, než odkiaľ hodnota je.
 */
export function polohaPlati(
  p: PolohaAi,
  u: UdajeNespracovaneho,
  doplnok?: DoplnokZvyraznenia,
): boolean {
  const udaje = udajeNaZvyraznenie(u, undefined, doplnok);
  return udajePolohy(p, udaje).length > 0;
}

/** Údaje, ktorým poloha od AI patrí (sedí id aj hodnota). */
function udajePolohy(p: PolohaAi, udaje: UdajZvyraznenia[]): UdajZvyraznenia[] {
  if (p.kluc.includes("*")) {
    const vzor = new RegExp(`^${p.kluc.replace(/\./g, "\\.").replace("*", "(\\d+)")}$`);
    const kandidati = udaje
      .map((d) => ({ d, m: d.id.match(vzor) }))
      .filter((x) => x.m && hodnotaSedi(x.d.typ, x.d.hodnota, p.hodnota));
    // Ten istý index má prednosť (riadok sa nepresunul), inak riadok s tou istou hodnotou.
    kandidati.sort(
      (a, b) => Number(Number(b.m![1]) === p.index) - Number(Number(a.m![1]) === p.index),
    );
    return kandidati.slice(0, 1).map((x) => x.d);
  }
  return udaje.filter((d) => d.id === p.kluc && hodnotaSedi(d.typ, d.hodnota, p.hodnota));
}

/* -------------------------------------------------------- výsledok */

function zvyraznenieUdaja(
  d: UdajZvyraznenia,
  strana: number,
  r: Obdlznik[],
  zdroj: "text" | "ai",
): Zvyraznenie {
  return {
    kluc: d.id,
    pole: d.pole,
    skupina: d.skupina,
    popis: d.popis,
    ...(d.popisParam ? { popisParam: d.popisParam } : {}),
    ...(d.stitok ? { stitok: d.stitok } : {}),
    ...(d.stitokParam ? { stitokParam: d.stitokParam } : {}),
    text: textUdaja(d.typ, d.hodnota),
    strana,
    r,
    zdroj,
  };
}

/**
 * Zvýraznenia všetkých vyplnených údajov na všetkých stranách. `strany` sú
 * slová textovej vrstvy po stranách (prázdna strana = obrázok alebo sken).
 */
export function zvyrazneniaUdajov(
  strany: SlovoNahladu[][],
  u: UdajeNespracovaneho,
  polia: KlucPola[] = POLIA_ZVYRAZNENIA,
  polohy: PolohaAi[] = [],
  doplnok?: DoplnokZvyraznenia,
): Zvyraznenie[] {
  const udaje = udajeNaZvyraznenie(u, polia, doplnok);
  const out: Zvyraznenie[] = [];
  if (strany.some((s) => s.length)) out.push(...zTextu(strany, udaje));
  // Čo sa v textovej vrstve nenašlo (alebo žiadna nie je), doplní poloha od AI.
  const najdene = new Set(out.map((z) => z.kluc));
  for (const p of polohy) {
    for (const d of udajePolohy(p, udaje)) {
      if (najdene.has(d.id)) continue;
      najdene.add(d.id);
      out.push(zvyraznenieUdaja(d, p.strana, [p.r], "ai"));
    }
  }
  return out;
}

function zTextu(strany: SlovoNahladu[][], udaje: UdajZvyraznenia[]): Zvyraznenie[] {
  type Kandidat = { d: UdajZvyraznenia; strana: number; v: Vyskyt; skore: number; kluc: string };
  const kandidati: Kandidat[] = [];
  const prudy = strany.map(prudSlov);
  const kotvyStran = strany.map(() => new Map<string, Vyskyt[]>());

  for (const d of udaje) {
    const varianty =
      d.varianty ??
      (d.typ === "mnozstvo" || d.typ === "sadzba" ? [] : variantyHladania(d.typ, d.hodnota));
    if (!varianty.length) continue;
    strany.forEach((slova, strana) => {
      if (!slova.length) return;
      const najdiKotvu = (texty: string[]) => {
        const k = texty.join("\u0001");
        let v = kotvyStran[strana].get(k);
        if (!v) {
          v = vyskyty(slova, prudy[strana], texty.map(normalizujText), "text", 40);
          kotvyStran[strana].set(k, v);
        }
        return v;
      };
      for (const v of vyskyty(slova, prudy[strana], varianty, d.typ, 12)) {
        const skore = skoreVyskytu(v, d.kotvy, najdiKotvu);
        if (d.lenSKotvou && skore <= 0) continue;
        kandidati.push({ d, strana, v, skore, kluc: `${strana}:${v.indexy.join(",")}` });
      }
    });
  }

  /*
    Ten istý výskyt (rovnaké slová) chce viac údajov — dostane ho ten s
    najsilnejšou kotvou; pri rovnosti všetci (dátum vystavenia aj dodania na
    jednom mieste bez popisu).
  */
  const najlepsie = new Map<string, number>();
  for (const k of kandidati) najlepsie.set(k.kluc, Math.max(najlepsie.get(k.kluc) ?? 0, k.skore));
  const podlaUdaja = new Map<string, Kandidat[]>();
  for (const k of kandidati) {
    const zoznam = podlaUdaja.get(k.d.id) ?? [];
    zoznam.push(k);
    podlaUdaja.set(k.d.id, zoznam);
  }

  const out: Zvyraznenie[] = [];
  for (const d of udaje) {
    const vsetky = podlaUdaja.get(d.id);
    if (!vsetky?.length) continue;
    let vybrane = vsetky.filter((k) => k.skore >= (najlepsie.get(k.kluc) ?? 0) - 1e-9);
    // Všetky výskyty mu iní vzali — ostane mu ten jeho najlepší (jediné miesto hodnoty na doklade).
    if (!vybrane.length) vybrane = [...vsetky].sort((a, b) => b.skore - a.skore).slice(0, 1);
    if (d.uzsit) {
      const max = Math.max(...vybrane.map((k) => k.skore));
      if (max > 0) vybrane = vybrane.filter((k) => k.skore >= max * 0.6);
    }
    for (const k of vybrane.slice(0, d.max ?? MAX_VYSKYTOV))
      out.push(zvyraznenieUdaja(d, k.strana, k.v.r, "text"));
  }
  return out;
}

/** Polia zvýraznenia, ktoré formulár pri danom druhu ukazuje. */
export function poliaZvyrazneniaPreDruh(polia: KlucPola[]): KlucPola[] {
  return POLIA_ZVYRAZNENIA.filter((k) => polia.includes(k));
}

/** Patrí zvýraznenie k aktívnemu poľu či údaju (formulár hlási `KlucPola` alebo id údaja)? */
export function jeAktivne(
  z: Pick<Zvyraznenie, "kluc" | "pole">,
  aktivne: string | null | undefined,
) {
  return Boolean(aktivne) && (z.kluc === aktivne || z.pole === aktivne);
}

/**
 * Popisy polí v detailoch dokladov (kompaktný detail prijatej faktúry,
 * bločku), ktoré sa líšia od popisov formulára Nespracovaných. Hodnota je
 * pole formulára alebo id údaja zvýraznenia.
 */
const POPISY_DETAILU: Record<string, string> = {
  "číslo faktúry": "cislo",
  "dátum vydania": "datumVystavenia",
  "dátum daňovej povinnosti": "datumVystavenia",
  "dátum splatnosti": "splatnost",
  "celková suma": "celkom",
  "suma celkom": "celkom",
  "suma bez dph": "bezDph",
  "základ dph": "bezDph",
  "bez dph": "bezDph",
  dph: "dph",
  "suma dph": "dph",
  "k úhrade": "kUhrade",
  "na úhradu": "kUhrade",
  záloha: "zaloha",
};

/** Pole (alebo id údaja) podľa (slovenského) popisu rámčeka v detaile dokladu. */
export function polePopisuDetailu(popis: string | null | undefined): string | null {
  const p = String(popis ?? "").trim();
  if (!p) return null;
  return POPISY_DETAILU[p.toLocaleLowerCase("sk")] ?? polePodlaPopisu(p);
}
