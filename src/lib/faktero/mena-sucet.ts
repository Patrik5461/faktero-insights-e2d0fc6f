/*
  Súčty po menách — jedno miesto pre zoznamy aj prehľady.

  Rozhodnutie (1. 11. 2026):
  - ZOZNAMY ukazujú súčty po menách vedľa seba: „1 200,00 € · 3 400,00 Kč“.
    Rôzne meny sa nikdy nesčítajú do jedného čísla.
  - PREHĽADY (nástenka, DPH, OSS, zákazky) prepočítajú do domácej meny firmy
    kurzom dokladu (ECB pre SK/DE, ČNB pre CZ) a ukážu značku „prepočítané“.
    Doklad bez kurzu aj bez sumy v domácej mene sa nevymýšľa — vráti `null`
    a volajúci ho ukáže ako „bez prepočtu“.

  Rovnaký tvar súčtu ako `sumyPoMenach` (suhrn-vyberu.ts) a `sumyPodlaMeny`
  (ai-asistent-kontext.ts) — formátovač berie aj ich výstup, tretí formát
  nevzniká. Pravidlá typov dokladov (zálohová mimo súčtu, dobropis odpočítava)
  rieši `sumyPoMenach`; tu sa len sčítava to, čo volajúci podá.
*/
import { formatujMenu } from "./mena";
import { krajinaKurzu, naDomacu } from "./kurzy";

const KOD = /^[A-Za-z]{3}$/;

/**
 * Suma s krátkym symbolom meny („3 400,00 Kč“, nie „3 400,00 CZK“; ostatné meny kódom) — v
 * súčtoch po menách vedľa seba sa číta lepšie. Neznámy kód rieši
 * `formatujMenu` (vypíše ho ako text).
 */
export function formatujMenuKratko(hodnota: unknown, mena: unknown, locale = "sk-SK"): string {
  const kod = typeof mena === "string" && KOD.test(mena) ? mena.toUpperCase() : null;
  const n = Number(hodnota);
  // Len € a Kč — „$“ by zamenil USD s inými dolármi, tie ostanú s kódom.
  if (kod === "EUR" || kod === "CZK") {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: kod,
        currencyDisplay: "narrowSymbol",
      }).format(Number.isFinite(n) ? n : 0);
    } catch {
      /* nižšie */
    }
  }
  return formatujMenu(hodnota, mena, locale);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Kód meny riadku; prázdny alebo nezmyselný = domáca mena. */
export function menaAleboDomaca(mena: unknown, domaca = "EUR"): string {
  return typeof mena === "string" && KOD.test(mena.trim()) ? mena.trim().toUpperCase() : domaca;
}

/**
 * Súčet podľa meny. Poradie: domáca mena prvá, ostatné v poradí prvého
 * výskytu. Sumy sú zaokrúhlené na centy.
 */
export function sucetPoMenach<T>(
  riadky: readonly T[],
  sumaFn: (r: T) => unknown,
  menaFn: (r: T) => unknown,
  domaca = "EUR",
): Map<string, number> {
  const surove = new Map<string, number>();
  for (const r of riadky) {
    const n = Number(sumaFn(r));
    if (!Number.isFinite(n)) continue;
    const m = menaAleboDomaca(menaFn(r), domaca);
    surove.set(m, (surove.get(m) ?? 0) + n);
  }
  const von = new Map<string, number>();
  if (surove.has(domaca)) von.set(domaca, r2(surove.get(domaca)!));
  for (const [m, s] of surove) if (m !== domaca) von.set(m, r2(s));
  return von;
}

/** Čokoľvek, čo nesie súčty po menách — Map, `SumaMeny[]`, `sumyPodlaMeny()`. */
export type SuctyMien =
  | Map<string, number>
  | readonly { mena: string; suma?: number | null; celkom?: number | null }[];

function naDvojice(s: SuctyMien): [string, number][] {
  if (s instanceof Map) return [...s.entries()];
  return s.map((x) => [x.mena, Number(x.suma ?? x.celkom ?? 0)]);
}

/**
 * „1 200,00 € · 3 400,00 Kč“. Prázdny súčet = nula v domácej mene.
 * Meny s nulovým súčtom sa vynechajú (ak nie sú všetky nulové).
 */
export function formatujSucetPoMenach(
  sucty: SuctyMien,
  locale = "sk-SK",
  o: { domaca?: string; oddelovac?: string } = {},
): string {
  const domaca = o.domaca ?? "EUR";
  const dvojice = naDvojice(sucty);
  const nenulove = dvojice.filter(([, s]) => Math.abs(s) >= 0.005);
  const zobraz = nenulove.length ? nenulove : dvojice.slice(0, 1);
  if (!zobraz.length) return formatujMenuKratko(0, domaca, locale);
  return zobraz.map(([m, s]) => formatujMenuKratko(s, m, locale)).join(o.oddelovac ?? " · ");
}

/** Riadok na prepočet do domácej meny. */
export type RiadokNaPrepocet = {
  /** Suma v mene dokladu. */
  suma: unknown;
  /** Mena dokladu; prázdna = domáca. */
  mena?: unknown;
  /** Uložená suma v domácej mene (stĺpce `*_eur` — nesú domácu menu firmy aj pri CZ). */
  sumaDomaca?: unknown;
  /** `exchange_rate` dokladu v zápise banky krajiny (ECB „X za 1 EUR“, ČNB „CZK za 1 X“). */
  kurz?: unknown;
};

const cislo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Suma riadku v domácej mene firmy (`country` firmy rozhodne EUR/CZK a zápis
 * kurzu). Preferuje uloženú sumu `*_eur`, potom kurz dokladu. Keď nie je ani
 * jedno, vráti `null` — nikdy nehádaj kurz 1.
 */
export function sumaVDomacejMene(
  r: RiadokNaPrepocet,
  country: string | null | undefined,
): { suma: number; prepocitane: boolean } | null {
  const krajina = krajinaKurzu(country);
  const domaca = krajina === "CZ" ? "CZK" : "EUR";
  const suma = cislo(r.suma) ?? 0;
  const mena = menaAleboDomaca(r.mena, domaca);
  if (mena === domaca) return { suma: r2(suma), prepocitane: false };
  const ulozena = cislo(r.sumaDomaca);
  if (ulozena !== null) return { suma: r2(ulozena), prepocitane: true };
  const kurz = cislo(r.kurz);
  if (kurz !== null && kurz > 0) return { suma: naDomacu(suma, kurz, krajina), prepocitane: true };
  return null;
}

export type SucetVDomacej = {
  domaca: "EUR" | "CZK";
  /** Súčet všetkého, čo sa dalo vyjadriť v domácej mene. */
  suma: number;
  /** Aspoň jeden riadok bol v cudzej mene a prepočítal sa → ukáž „prepočítané“. */
  prepocitane: boolean;
  /** Riadky bez kurzu — po menách, v pôvodnej mene („bez prepočtu“). */
  bezPrepoctu: Map<string, number>;
};

/** Súčet do domácej meny pre prehľady (rozhodnutie 1). */
export function sucetVDomacejMene<T>(
  riadky: readonly T[],
  naRiadok: (r: T) => RiadokNaPrepocet,
  country: string | null | undefined,
): SucetVDomacej {
  const domaca = krajinaKurzu(country) === "CZ" ? "CZK" : "EUR";
  let suma = 0;
  let prepocitane = false;
  const chybajuce: { mena: string; suma: number }[] = [];
  for (const r of riadky) {
    const x = naRiadok(r);
    const v = sumaVDomacejMene(x, country);
    if (v) {
      suma += v.suma;
      prepocitane ||= v.prepocitane;
    } else chybajuce.push({ mena: menaAleboDomaca(x.mena, domaca), suma: cislo(x.suma) ?? 0 });
  }
  return {
    domaca,
    suma: r2(suma),
    prepocitane,
    bezPrepoctu: sucetPoMenach(chybajuce, (c) => c.suma, (c) => c.mena, domaca),
  };
}
