/**
 * Import skladových kariet z CSV/XLSX — rozpoznanie stĺpcov a čísel.
 *
 * Pravidlá (súpis chýb 1. 11. 2026, SA-12a/b/c, F-31):
 * - čo v súbore nie je, sa na existujúcej karte nemení. Predtým schéma
 *   dopĺňala DPH 23 %, nulové ceny aj minimum a import bez stĺpca cien
 *   existujúcim kartám ceny vynuloval;
 * - vlastný export sa dá nahrať späť bez zmeny: „Stav“/„Aktuálny stav“ je
 *   súčasný stav, nie počiatočný, a nesmie z neho vzniknúť ďalší príjem;
 * - čísla v slovenskom zápise („1 234,50“) sú platné, zlý riadok sa hlási
 *   sám a import ostatných riadkov nezastaví;
 * - CSV v UTF-8 bez BOM sa nečíta ako latin1 (Excel na Windows ukladá
 *   cp1250 — tú skúsime, keď súbor nie je platné UTF-8).
 */

export type PoleImportu =
  | "sku"
  | "name"
  | "barcode"
  | "unit"
  | "purchase_price"
  | "sale_price"
  | "vat_rate"
  | "min_stock"
  | "initial_stock"
  | "warehouse_name";

export const POLIA_IMPORTU: PoleImportu[] = [
  "sku",
  "name",
  "barcode",
  "unit",
  "purchase_price",
  "sale_price",
  "vat_rate",
  "min_stock",
  "initial_stock",
  "warehouse_name",
];

/** Popisky polí do výberu mapovania (preložia sa cez `t()`). */
export const NAZVY_POLI: Record<PoleImportu, string> = {
  sku: "SKU (kód položky)",
  name: "Názov",
  barcode: "Čiarový kód",
  unit: "Jednotka",
  purchase_price: "Nákupná cena",
  sale_price: "Predajná cena",
  vat_rate: "DPH %",
  min_stock: "Minimálny stav",
  initial_stock: "Počiatočný stav (vytvorí príjem)",
  warehouse_name: "Sklad",
};

/*
  Aliasy sú v malých písmenách. Obsahujú aj hlavičky vlastného exportu
  (Skladové položky → Export a „Exportovať vybrané“) v slovenčine, češtine
  a nemčine — export ich prekladá podľa jazyka rozhrania.
*/
const ALIASY: Record<PoleImportu, string[]> = {
  sku: ["sku", "kód", "kod", "code", "artikelnummer", "kód položky", "sku (kód položky)"],
  name: [
    "názov",
    "nazov",
    "name",
    "produkt",
    "product",
    "bezeichnung",
    "názov produktu",
    "nazov produktu",
    "název",
    "název produktu",
    "produktbezeichnung",
  ],
  barcode: ["čiarový kód", "ciarovy kod", "barcode", "ean", "čárový kód"],
  unit: ["jednotka", "mj", "unit", "einheit"],
  purchase_price: [
    "nákupná cena",
    "nakupna cena",
    "purchase_price",
    "purchase price",
    "einkaufspreis",
    "nákup",
    "nakup",
    "nákupní cena",
    "einkauf",
  ],
  sale_price: [
    "predajná cena",
    "predajna cena",
    "sale_price",
    "sale price",
    "cena",
    "verkaufspreis",
    "predaj",
    "prodej",
    "prodejní cena",
    "verkauf",
  ],
  vat_rate: ["dph", "dph %", "vat", "vat_rate", "mwst", "mwst. %"],
  min_stock: [
    "minimálny stav",
    "minimalny stav",
    "min stock",
    "min_stock",
    "minimum",
    "min",
    "min.",
    "minimální stav",
    "mindestbestand",
  ],
  // Len výslovne počiatočný stav — „Stav“ z exportu je súčasný stav.
  initial_stock: [
    "počiatočný stav",
    "pociatocny stav",
    "initial stock",
    "initial_stock",
    "počáteční stav",
    "anfangsbestand",
  ],
  warehouse_name: ["sklad", "warehouse", "warehouse_name", "lager"],
};

/**
 * Stĺpce exportu, ktoré sa pri importe zámerne neberú. Súčasný stav,
 * rezervácie a hodnota sa počítajú z pohybov; zapísať sa nedajú.
 */
const IGNOROVANE = new Set([
  "stav",
  "status",
  "aktuálny stav",
  "aktualny stav",
  "aktuální stav",
  "aktueller bestand",
  "rezervované množstvo",
  "rezervované množství",
  "reservierte menge",
  "hodnota skladu",
  "lagerwert",
  "sledovanie skladu",
  "sledování skladu",
  "bestandsführung",
]);

function normalizujHlavicku(h: string): string {
  return String(h ?? "")
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Pole, do ktorého stĺpec patrí; `null` = ignorovať. */
export function rozpoznajStlpec(hlavicka: string): PoleImportu | null {
  const h = normalizujHlavicku(hlavicka);
  if (!h || IGNOROVANE.has(h)) return null;
  for (const pole of POLIA_IMPORTU) if (ALIASY[pole].includes(h)) return pole;
  return null;
}

/** Automatické mapovanie hlavičiek; každé pole dostane najviac jeden stĺpec. */
export function automatickeMapovanie(hlavicky: string[]): Record<string, PoleImportu> {
  const out: Record<string, PoleImportu> = {};
  const pouzite = new Set<PoleImportu>();
  for (const h of hlavicky) {
    const pole = rozpoznajStlpec(h);
    if (pole && !pouzite.has(pole)) {
      out[h] = pole;
      pouzite.add(pole);
    }
  }
  return out;
}

/**
 * Číslo zo súboru. `null` = prázdna bunka (hodnota sa nemení), `NaN` = nedá
 * sa prečítať. Zvláda „1 234,50“, „1.234,50“, „1,234.50“, „12 €“, „23 %“.
 */
export function cisloZImportu(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  let s = String(v)
    .replace(/[\s  ']/g, "")
    .replace(/(€|eur|kč|czk|%)/gi, "");
  if (s === "") return null;
  const ciarka = s.lastIndexOf(",");
  const bodka = s.lastIndexOf(".");
  if (ciarka >= 0 && bodka >= 0) {
    // Desatinný je ten oddeľovač, ktorý je posledný; druhý oddeľuje tisíce.
    s = ciarka > bodka ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ciarka >= 0) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Number(s);
}

export type RiadokImportu = {
  /** Číslo riadku v súbore (hlavička je 1). */
  riadok: number;
  sku?: string;
  name: string;
  barcode?: string;
  unit?: string;
  purchase_price?: number;
  sale_price?: number;
  vat_rate?: number;
  min_stock?: number;
  initial_stock?: number;
  warehouse_name?: string;
};

/** `dovod` je text na preklad (`t(dovod, parametre)`). */
export type ChybaImportu = {
  riadok: number;
  dovod: string;
  parametre?: Record<string, string | number>;
  pole?: PoleImportu;
};

const TEXTOVE: PoleImportu[] = ["sku", "name", "barcode", "unit", "warehouse_name"];
const MAX_DLZKA: Partial<Record<PoleImportu, number>> = {
  sku: 64,
  barcode: 64,
  unit: 16,
  name: 255,
  warehouse_name: 255,
};

/**
 * Z riadkov súboru (objekt hlavička → hodnota) a mapovania urobí riadky na
 * import. Prázdne bunky sa vynechajú, aby sa na karte nezmenili. Riadok bez
 * názvu sa preskočí ticho (prázdny riadok na konci tabuľky), riadok so zlým
 * číslom ide do `chyby` a do importu nejde.
 */
export function pripravRiadky(
  riadky: Record<string, unknown>[],
  mapovanie: Record<string, string>,
): { riadky: RiadokImportu[]; chyby: ChybaImportu[] } {
  const out: RiadokImportu[] = [];
  const chyby: ChybaImportu[] = [];
  riadky.forEach((r, i) => {
    const cislo = i + 2;
    const o: Record<string, unknown> = { riadok: cislo };
    let chyba: ChybaImportu | null = null;
    for (const [hlavicka, pole] of Object.entries(mapovanie)) {
      if (!pole || !POLIA_IMPORTU.includes(pole as PoleImportu)) continue;
      const p = pole as PoleImportu;
      const v = r[hlavicka];
      if (TEXTOVE.includes(p)) {
        const text = String(v ?? "").trim();
        if (!text) continue;
        const max = MAX_DLZKA[p] ?? 255;
        if (text.length > max && !chyba) {
          chyba = {
            riadok: cislo,
            pole: p,
            dovod: "Text je dlhší ako {n} znakov",
            parametre: { n: max },
          };
        }
        o[p] = text;
        continue;
      }
      const n = cisloZImportu(v);
      if (n === null) continue;
      if (Number.isNaN(n)) {
        chyba ??= {
          riadok: cislo,
          pole: p,
          dovod: "Nečitateľné číslo „{v}“",
          parametre: { v: String(v) },
        };
        continue;
      }
      if (p !== "initial_stock" && n < 0) {
        chyba ??= { riadok: cislo, pole: p, dovod: "Záporné číslo" };
        continue;
      }
      if (p === "vat_rate" && n > 100) {
        chyba ??= { riadok: cislo, pole: p, dovod: "Sadzba DPH nad 100 %" };
        continue;
      }
      o[p] = n;
    }
    if (!o.name) return;
    if (chyba) chyby.push(chyba);
    else out.push(o as RiadokImportu);
  });
  return { riadky: out, chyby };
}

/**
 * Text CSV súboru: UTF-8 (s BOM aj bez), a keď to nie je platné UTF-8,
 * Windows-1250 (Excel na slovenských/českých Windows).
 */
export function dekodujCsv(bajty: ArrayBuffer | Uint8Array): string {
  const u8 = bajty instanceof Uint8Array ? bajty : new Uint8Array(bajty);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1250").decode(u8);
  }
}
