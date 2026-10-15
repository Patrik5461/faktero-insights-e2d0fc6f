/*
  Učenie z opráv pri prijatých dokladoch.

  Keď človek pri dodávateľovi zvolí kategóriu, predkontáciu, členenie DPH,
  KV, stredisko, činnosť, zákazku či (pri bločku) spôsob úhrady, zapamätá
  sa to v `doklad_navyky` — jeden riadok na firmu, dodávateľa a druh
  dokladu, v ňom posledných niekoľko volieb pre každé pole. Pri ďalšom
  doklade od toho istého dodávateľa sa návrh doplní do prázdnych polí.

  Ručné pravidlá účtovania majú vždy prednosť: spúšťač v databáze dopĺňa
  len PRÁZDNE polia, takže naučená hodnota v `udaje` by pravidlo potichu
  prebila. Polia, ktoré pravidlo vypĺňa, sa preto učením nedopĺňajú vôbec
  (`chranene`), a pri vytvorení dokladu sa naučená hodnota v takom poli
  vyprázdni, aby ju spúšťač nahradil pravidlom (`bezNaucenychPodPravidlom`).

  Čisté funkcie — zápis a čítanie z databázy je v `ucenie-z-oprav.server.ts`.
*/

import type { DruhNespracovaneho, UdajeNespracovaneho } from "./nespracovane";
import { holyText, type Pravidlo } from "./pravidla-uctovania";

/** Polia, ktoré sa učia. */
export type PoleUcenia =
  "kategoria" | "predkontacia" | "clenenie" | "kv" | "stredisko" | "cinnost" | "zakazka" | "platba";

export const POLIA_UCENIA: PoleUcenia[] = [
  "kategoria",
  "predkontacia",
  "clenenie",
  "kv",
  "stredisko",
  "cinnost",
  "zakazka",
  "platba",
];

/** Popisy pre štítok „naučené" na webe. */
export const NAZVY_POLI_UCENIA: Record<PoleUcenia, string> = {
  kategoria: "kategória",
  predkontacia: "predkontácia",
  clenenie: "členenie DPH",
  kv: "členenie KV",
  stredisko: "stredisko",
  cinnost: "činnosť",
  zakazka: "zákazka",
  platba: "spôsob úhrady",
};

/** Druhy, pri ktorých sa učí (iný doklad nemá zaúčtovanie). */
export type DruhUcenia = Exclude<DruhNespracovaneho, "ostatny">;
export const DRUHY_UCENIA: DruhUcenia[] = ["faktura", "zalohova", "dobropis", "blocek"];
export const jeDruhUcenia = (d: unknown): d is DruhUcenia => DRUHY_UCENIA.includes(d as DruhUcenia);

/** Jedna voľba: hodnota (aj prázdna — „nechcem nič"), čas a doklad, z ktorého je. */
export type Volba = { h: string; t: string; d?: string | null };
/** Obsah stĺpca `polia`: pre každé pole posledné voľby, najstaršia prvá. */
export type PoliaNavyku = Partial<Record<PoleUcenia, Volba[]>>;

/** Koľko posledných volieb sa pri poli drží. */
export const MAX_VOLIEB = 10;

/** Právne formy a výplň, ktoré v názve dodávateľa nič nehovoria. */
const PRAVNE_FORMY =
  /\b(s\s*r\s*o|spol|a\s*s|k\s*s|v\s*o\s*s|s\s*e|se|sro|as|gmbh|ag|ltd|llc|inc|kft|zrt|sp\s*z\s*o\s*o|o\s*z|n\s*o|druzstvo)\b/g;

/**
 * Kľúč dodávateľa: IČO (len číslice, aspoň 6), inak IČ DPH (bez medzier,
 * veľkými), inak názov bez diakritiky, právnej formy a interpunkcie.
 * Bez ničoho z toho `null` — taký doklad sa neučí.
 */
export function klucDodavatela(d: {
  ico?: string | null;
  icDph?: string | null;
  nazov?: string | null;
}): string | null {
  const ico = String(d.ico ?? "").replace(/\D/g, "");
  // Krátke IČO sa píše aj bez úvodných núl — doplnia sa na 8 miest.
  if (ico.length >= 6) return `ico:${ico.length < 8 ? ico.padStart(8, "0") : ico}`;
  const dph = String(d.icDph ?? "")
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase();
  if (dph.length >= 8) return `dph:${dph}`;
  const nazov = holyText(d.nazov)
    .replace(/[^0-9a-z]+/g, " ")
    .replace(PRAVNE_FORMY, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nazov.length >= 2) return `nazov:${nazov.slice(0, 120)}`;
  return null;
}

/**
 * Návrh pre jedno pole z posledných volieb (najstaršia prvá):
 *  1. posledné dve voľby sú rovnaké → tá (oprava potvrdená dvakrát za sebou
 *     prebije aj dlhú starú históriu),
 *  2. inak najčastejšia hodnota, ak padla aspoň 2× (pri zhode novšia),
 *  3. inak nič.
 * Prázdna hodnota je tiež voľba („bez kódu") — vtedy sa nedopĺňa nič.
 */
export function navrhPola(volby: Volba[] | null | undefined): string | null {
  const v = (volby ?? []).filter((x) => x && typeof x.h === "string");
  if (!v.length) return null;
  const posl = v[v.length - 1]!.h;
  let vysledok: string | null = null;
  if (v.length >= 2 && v[v.length - 2]!.h === posl) vysledok = posl;
  else {
    const pocty = new Map<string, { n: number; posledne: number }>();
    v.forEach((x, i) => {
      const p = pocty.get(x.h) ?? { n: 0, posledne: -1 };
      pocty.set(x.h, { n: p.n + 1, posledne: i });
    });
    let naj: { h: string; n: number; posledne: number } | null = null;
    for (const [h, p] of pocty)
      if (p.n >= 2 && (!naj || p.n > naj.n || (p.n === naj.n && p.posledne > naj.posledne)))
        naj = { h, ...p };
    vysledok = naj?.h ?? null;
  }
  return vysledok && vysledok.trim() ? vysledok.trim() : null;
}

/** Hodnota poľa v údajoch formulára. */
export function hodnotaPola(u: UdajeNespracovaneho, pole: PoleUcenia): string {
  switch (pole) {
    case "kategoria":
      return u.kategoria ?? "";
    case "zakazka":
      return u.jobId ?? "";
    case "platba":
      return u.platba ?? "";
    default:
      return (u.kody?.[pole] as string | undefined) ?? "";
  }
}

function nastavPole(u: UdajeNespracovaneho, pole: PoleUcenia, h: string): UdajeNespracovaneho {
  switch (pole) {
    case "kategoria":
      return { ...u, kategoria: h };
    case "zakazka":
      return { ...u, jobId: h };
    case "platba":
      return { ...u, platba: h };
    default:
      return { ...u, kody: { ...u.kody, [pole]: h } };
  }
}

/** Spôsob úhrady sa učí len pri bločku — faktúra sa takmer vždy platí prevodom. */
export const poleSaUci = (druh: DruhUcenia, pole: PoleUcenia) =>
  pole !== "platba" || druh === "blocek";

/**
 * Doplní naučené hodnoty LEN do prázdnych polí. Nikdy neprepíše, čo
 * prečítala AI alebo vyplnil človek. `chranene` sú polia, ktoré vypĺňa
 * ručné pravidlo, alebo ktoré človek po predchádzajúcom doplnení zmenil.
 * `platneZakazky` — zákazka sa navrhne, len kým je otvorená.
 *
 * Do `udaje.naucene` zapíše pole → doplnená hodnota; web podľa toho
 * ukáže štítok „naučené", kým sa hodnota v poli nezmení.
 */
export function doplnNaucene(
  u: UdajeNespracovaneho,
  druh: DruhUcenia,
  polia: PoliaNavyku | null | undefined,
  moznosti: { chranene?: Iterable<PoleUcenia>; platneZakazky?: Set<string> | null } = {},
): UdajeNespracovaneho {
  if (!polia) return u;
  const chranene = new Set(moznosti.chranene ?? []);
  let out = u;
  const naucene: Record<string, string> = { ...(u.naucene ?? {}) };
  for (const pole of POLIA_UCENIA) {
    if (!poleSaUci(druh, pole) || chranene.has(pole)) continue;
    if (hodnotaPola(out, pole).trim()) continue;
    const navrh = navrhPola(polia[pole]);
    if (!navrh) continue;
    if (pole === "zakazka" && moznosti.platneZakazky && !moznosti.platneZakazky.has(navrh))
      continue;
    if (pole === "platba" && !["hotovost", "karta", "prevod"].includes(navrh)) continue;
    out = nastavPole(out, pole, navrh);
    naucene[pole] = navrh;
  }
  return Object.keys(naucene).length ? { ...out, naucene } : out;
}

/**
 * Polia, ktoré človek po predchádzajúcom doplnení zmenil (aj vyprázdnil) —
 * pri ďalšom čítaní („Čítať znova") sa do nich učenie znova nepchá.
 */
export function zmeneneNaucene(u: UdajeNespracovaneho): PoleUcenia[] {
  return Object.entries(u.naucene ?? {})
    .filter(
      ([pole, h]) =>
        POLIA_UCENIA.includes(pole as PoleUcenia) && hodnotaPola(u, pole as PoleUcenia) !== h,
    )
    .map(([pole]) => pole as PoleUcenia);
}

/** Polia, ktoré sú stále tak, ako ich doplnilo učenie (človek ich nezmenil). */
export function staleNaucene(u: UdajeNespracovaneho): PoleUcenia[] {
  return Object.entries(u.naucene ?? {})
    .filter(
      ([pole, h]) =>
        POLIA_UCENIA.includes(pole as PoleUcenia) && hodnotaPola(u, pole as PoleUcenia) === h,
    )
    .map(([pole]) => pole as PoleUcenia);
}

/** Polia, ktoré ručné pravidlo vyplní (spúšťač `faktero_uplatni_pravidlo`). */
export function poliaPravidla(
  p: Pick<Pravidlo, "kategoria" | "predkontacia" | "clenenie_dph" | "kv_clenenie"> | null,
): PoleUcenia[] {
  if (!p) return [];
  const out: PoleUcenia[] = [];
  if (String(p.kategoria ?? "").trim()) out.push("kategoria");
  if (String(p.predkontacia ?? "").trim()) out.push("predkontacia");
  if (String(p.clenenie_dph ?? "").trim()) out.push("clenenie");
  if (String(p.kv_clenenie ?? "").trim()) out.push("kv");
  return out;
}

/**
 * Pred zápisom dokladu: naučené hodnoty, ktoré človek nechal tak, v poliach,
 * ktoré vypĺňa ručné pravidlo, sa vyprázdnia — spúšťač ich potom doplní
 * z pravidla (inak by naučená hodnota pravidlo prebila, lebo spúšťač
 * prázdne pole nevidí). Čo človek zadal sám, ostáva.
 */
export function bezNaucenychPodPravidlom(
  u: UdajeNespracovaneho,
  polia: Iterable<PoleUcenia>,
): UdajeNespracovaneho {
  const pravidlo = new Set(polia);
  let out = u;
  for (const pole of staleNaucene(u)) if (pravidlo.has(pole)) out = nastavPole(out, pole, "");
  return out;
}

/** Voľby z formulára pri vytvorení dokladu — všetky učené polia, aj prázdne. */
export function volbyZUdajov(
  u: UdajeNespracovaneho,
  druh: DruhUcenia,
): Partial<Record<PoleUcenia, string>> {
  const out: Partial<Record<PoleUcenia, string>> = {};
  for (const pole of POLIA_UCENIA)
    if (poleSaUci(druh, pole)) out[pole] = hodnotaPola(u, pole).trim();
  return out;
}

/**
 * Pridá voľby do histórie. Voľba z toho istého dokladu (oprava už
 * vytvoreného) nahradí predchádzajúcu — oprava sa nepočíta ako ďalší doklad.
 */
export function pridajVolby(
  polia: PoliaNavyku | null | undefined,
  volby: Partial<Record<PoleUcenia, string | null | undefined>>,
  kedy: string,
  dokladId?: string | null,
): PoliaNavyku {
  const out: PoliaNavyku = {};
  for (const pole of POLIA_UCENIA) {
    const stare = Array.isArray(polia?.[pole]) ? polia![pole]! : [];
    if (!(pole in volby) || volby[pole] === undefined) {
      if (stare.length) out[pole] = stare;
      continue;
    }
    const h = String(volby[pole] ?? "")
      .trim()
      .slice(0, 60);
    const bez = dokladId ? stare.filter((x) => x.d !== dokladId) : stare;
    out[pole] = [...bez, { h, t: kedy, ...(dokladId ? { d: dokladId } : {}) }].slice(-MAX_VOLIEB);
  }
  return out;
}

/** Druh z riadka `purchase_invoices` (rovnako ako `udajeZPrijatej`). */
export function druhPrijatej(p: {
  type?: string | null;
  amount_total?: number | string | null;
  opravuje_cislo?: string | null;
}): DruhUcenia {
  if (p.type === "proforma") return "zalohova";
  if (String(p.opravuje_cislo ?? "").trim() || Number(p.amount_total ?? 0) < 0) return "dobropis";
  return "faktura";
}
