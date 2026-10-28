/*
  Zvýraznenie vyťažených údajov v náhľade dokladu.

  AI vracia len hodnoty, nie miesto na doklade. Miesto sa preto hľadá spätne:
  hodnota poľa (číslo faktúry, VS, IBAN, IČO, dátum, suma…) sa prevedie na
  tvary, v akých býva vytlačená („2026-10-12" → „12.10.2026", „12. 10. 2026";
  1234.5 → „1 234,50", „1.234,50"; IBAN s medzerami aj bez), a tie sa hľadajú
  v slovách textovej vrstvy PDF. Medzery medzi slovami sú voliteľné, takže
  „SK31 1200 0000…" nájde aj IBAN zapísaný bez medzier.

  Obrázky ani skeny bez textovej vrstvy slová nemajú — nezvýrazní sa nič.
  Čisté funkcie bez Reactu, aby sa dali otestovať.
*/
import { sucty, type UdajeNespracovaneho } from "./nespracovane";
import {
  poleVyberu,
  type KlucPola,
  type Obdlznik,
  type SlovoNahladu,
  type TypPola,
} from "./vyber-z-dokladu";

/** Polia, ktorých miesto sa v náhľade zvýrazňuje. */
export const POLIA_ZVYRAZNENIA: KlucPola[] = [
  "cislo",
  "vs",
  "objednavka",
  "dodavatel.iban",
  "dodavatel.ico",
  "dodavatel.dic",
  "dodavatel.icDph",
  "datumVystavenia",
  "datumDodania",
  "splatnost",
  "celkom",
];

/** Najviac toľko výskytov jednej hodnoty — inak by suma v tabuľke svietila všade. */
const MAX_VYSKYTOV = 4;
/** Kratšia hodnota by sa našla náhodou (VS „1" je na doklade všade). */
const MIN_DLZKA = 3;

export type Zvyraznenie = {
  kluc: KlucPola;
  /** Index strany (od 0). */
  strana: number;
  /** Obdĺžniky výskytu — jeden na riadok, v zlomkoch strany. */
  r: Obdlznik[];
};

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

/** Tvar na porovnanie: veľké písmená, bez medzier. */
export function normalizujText(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toLocaleUpperCase("sk");
}

function skupinyTisicov(cele: string, oddelovac: string): string {
  return cele.replace(/\B(?=(\d{3})+(?!\d))/g, oddelovac);
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
    const [cele, des] = Math.abs(n).toFixed(2).split(".");
    for (const [tisice, desatinna] of [
      ["", ","],
      ["", "."],
      [".", ","],
      [",", "."],
      ["'", "."],
    ])
      pridaj(`${skupinyTisicov(cele, tisice)}${desatinna}${des}`);
    return [...vysledok];
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
 */
function vyrazPre(varianta: string, typ: TypPola): RegExp {
  const znaky = [...varianta].map(escape).join(" ?");
  const prvy = varianta[0] ?? "";
  const posledny = varianta[varianta.length - 1] ?? "";
  const pred = ALNUM.test(prvy)
    ? `(?<![\\p{L}\\d])${typ === "suma" || typ === "ico" ? "(?<!\\d )" : ""}`
    : "";
  const za = ALNUM.test(posledny) ? "(?![\\p{L}\\d])" : "";
  return new RegExp(`${pred}${znaky}${za}`, "gu");
}

/** Slová strany v jednom prúde (oddelené medzerou) a začiatok každého slova v ňom. */
function prudSlov(slova: SlovoNahladu[]): { text: string; zaciatky: number[] } {
  const zaciatky: number[] = [];
  let text = "";
  for (const s of slova) {
    if (text) text += " ";
    zaciatky.push(text.length);
    text += normalizujText(s.text);
  }
  return { text, zaciatky };
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

/** Výskyty hodnoty v slovách jednej strany — každý ako zoznam obdĺžnikov (po riadkoch). */
export function najdiVSlovach(
  slova: SlovoNahladu[],
  varianty: string[],
  typ: TypPola,
): Obdlznik[][] {
  if (!slova.length || !varianty.length) return [];
  const { text, zaciatky } = prudSlov(slova);
  const pouzite = new Set<number>();
  const vyskyty: Obdlznik[][] = [];
  // Dlhší tvar má prednosť — „1.234,50" pred kratšími zhodami.
  for (const v of [...varianty].sort((a, b) => b.length - a.length)) {
    for (const m of text.matchAll(vyrazPre(v, typ))) {
      const od = m.index ?? 0;
      const po = od + m[0].length;
      const indexy: number[] = [];
      zaciatky.forEach((z, i) => {
        const koniec = z + normalizujText(slova[i].text).length;
        if (z < po && koniec > od) indexy.push(i);
      });
      if (!indexy.length || indexy.some((i) => pouzite.has(i))) continue;
      indexy.forEach((i) => pouzite.add(i));
      vyskyty.push(obdlznikySlov(indexy.map((i) => slova[i])));
      if (vyskyty.length >= MAX_VYSKYTOV) return vyskyty;
    }
  }
  return vyskyty;
}

/**
 * Zvýraznenia všetkých vyplnených polí na všetkých stranách. `strany` sú slová
 * textovej vrstvy po stranách (prázdna strana = obrázok alebo sken).
 */
export function zvyrazneniaUdajov(
  strany: SlovoNahladu[][],
  u: UdajeNespracovaneho,
  polia: KlucPola[] = POLIA_ZVYRAZNENIA,
): Zvyraznenie[] {
  if (!strany.some((s) => s.length)) return [];
  const out: Zvyraznenie[] = [];
  for (const kluc of polia) {
    if (!POLIA_ZVYRAZNENIA.includes(kluc)) continue;
    const typ = poleVyberu(kluc).typ;
    const varianty = variantyHladania(typ, hodnotaPola(u, kluc));
    if (!varianty.length) continue;
    let pocet = 0;
    strany.forEach((slova, strana) => {
      if (pocet >= MAX_VYSKYTOV) return;
      for (const r of najdiVSlovach(slova, varianty, typ)) {
        if (pocet++ >= MAX_VYSKYTOV) break;
        out.push({ kluc, strana, r });
      }
    });
  }
  return out;
}

/** Polia zvýraznenia, ktoré formulár pri danom druhu ukazuje. */
export function poliaZvyrazneniaPreDruh(polia: KlucPola[]): KlucPola[] {
  return POLIA_ZVYRAZNENIA.filter((k) => polia.includes(k));
}
