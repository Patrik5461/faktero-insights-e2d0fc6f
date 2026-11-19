/*
  Import číselníkov z XML súboru Pohody s náhľadom — čisté funkcie bez databázy.

  Súbor je odpoveď Pohody (`rsp:responsePack`) na žiadosť o zoznamy
  (`ziadostCiselnikov`), ktorú účtovníčka načíta cez Súbor → Dátová
  komunikácia → XML import/export. Rozoberá ho ten istý parser ako konektor
  (`rozoberCiselnikyPohody`) — zoznamy `lst:` sa hľadajú bez ohľadu na obal,
  takže prejde aj dátový balík s rovnakými prvkami.

  Pravidlá zápisu (na rozdiel od konektora, ktorý berie zoznam ako úplný):
   - nový kód sa založí so zdrojom 'pohoda' a príznakom aktívny z Pohody
     (alebo aktívny vždy, keď si to človek zvolí),
   - existujúci kód (rovnaký druh, kód aj agenda) sa len doplní — popis a
     účty, keď sa zmenili; zdroj sa nemení,
   - nič sa nemaže ani nevypína.
*/

import { rozoberCiselnikyPohody, type DruhCiselnika, type ZaznamCiselnika } from "./predkontacie";

/* ------------------------------------------------------------ kódovanie */

/** Bajty sú platné UTF-8 a obsahujú aspoň jeden viacbajtový znak. */
function jeUtf8SDiakritikou(b: Uint8Array): boolean {
  let viac = false;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) continue;
    const n = c >= 0xf0 && c < 0xf5 ? 3 : c >= 0xe0 && c < 0xf0 ? 2 : c >= 0xc2 && c < 0xe0 ? 1 : -1;
    if (n < 0) return false;
    for (let k = 1; k <= n; k++) if (i + k >= b.length || (b[i + k] & 0xc0) !== 0x80) return false;
    i += n;
    viac = true;
  }
  return viac;
}

/**
 * Text XML z bajtov. Pohoda zapisuje Windows-1250 a hlásí to v hlavičke;
 * BOM a hlavička rozhodnú. Súbor, ktorý hlavičkou tvrdí Windows-1250, no je
 * v skutočnosti UTF-8 (prešiel editorom), sa prečíta ako UTF-8 — text
 * v 1250 s diakritikou platné UTF-8 prakticky nikdy nie je.
 */
export function dekodujXml(bajty: Uint8Array): string {
  if (bajty[0] === 0xef && bajty[1] === 0xbb && bajty[2] === 0xbf)
    return new TextDecoder("utf-8").decode(bajty.subarray(3));
  if (bajty[0] === 0xff && bajty[1] === 0xfe) return new TextDecoder("utf-16le").decode(bajty.subarray(2));
  if (bajty[0] === 0xfe && bajty[1] === 0xff) return new TextDecoder("utf-16be").decode(bajty.subarray(2));
  let hlavicka = "";
  for (let i = 0; i < Math.min(bajty.length, 200); i++) hlavicka += String.fromCharCode(bajty[i]);
  const kod = (/encoding\s*=\s*["']([\w.-]+)["']/i.exec(hlavicka)?.[1] ?? "utf-8").toLowerCase();
  if (kod !== "utf-8" && kod !== "utf8" && jeUtf8SDiakritikou(bajty)) return new TextDecoder("utf-8").decode(bajty);
  try {
    return new TextDecoder(kod).decode(bajty);
  } catch {
    return new TextDecoder("utf-8").decode(bajty);
  }
}

/* ---------------------------------------------------------------- rozbor */

export type VysledokXml = {
  zaznamy: ZaznamCiselnika[];
  /** Chyby, ktoré Pohoda vrátila pri jednotlivých zoznamoch (bez tých, čo nič neznamenajú). */
  upozornenia: string[];
  chyba: string | null;
};

const ZOZNAMY =
  /<(?:[\w.-]+:)?list(AccountingDoubleEntry|AccountingSingleEntry|ClassificationVAT|Centre|Activity|NumericalSeries|Contract|BankAccount)\b/;

/**
 * Súbor z Pohody → záznamy číselníka. Žiadosť namiesto odpovede, iný XML
 * alebo odpoveď bez zoznamov sa povie zrozumiteľne.
 */
export function rozoberXmlCiselnikov(xml: string, dnes = new Date()): VysledokXml {
  const text = String(xml ?? "").replace(/^﻿/, "");
  if (!/^\s*</.test(text)) return { zaznamy: [], upozornenia: [], chyba: "Súbor nie je XML." };
  if (/<(?:[\w.-]+:)?dataPack\b/.test(text) && /list\w+Request\b/.test(text) && !/responsePack\b/.test(text))
    return {
      zaznamy: [],
      upozornenia: [],
      chyba:
        "Toto je žiadosť pre Pohodu, nie jej odpoveď. Načítajte ju v Pohode (Súbor → Dátová komunikácia → XML import/export) a sem nahrajte súbor, ktorý Pohoda uloží do priečinka Response.",
    };
  const upozornenia: string[] = [];
  const reChyba = /<(?:[\w.-]+:)?responsePackItem\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = reChyba.exec(text))) {
    if (!/state\s*=\s*["']error["']/i.test(m[1])) continue;
    const n = /note\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[1]);
    const pozn = (n?.[1] ?? n?.[2] ?? "").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    // Žiadosť pýta podvojné aj jednoduché predkontácie — jedna z nich vždy zlyhá.
    if (/nepoužíva pri zvolenom type|nepoužívá při zvoleném typu/i.test(pozn)) continue;
    upozornenia.push(pozn || "Pohoda vrátila chybu bez popisu.");
  }
  const zaznamy = rozoberCiselnikyPohody(text, dnes);
  if (!zaznamy.length)
    return {
      zaznamy,
      upozornenia,
      chyba: ZOZNAMY.test(text)
        ? "Zoznamy v súbore sú prázdne — Pohoda v nich neposlala žiadny kód."
        : "V súbore nie sú číselníky z Pohody (predkontácie, členenia DPH, rady, strediská…).",
    };
  return { zaznamy, upozornenia, chyba: null };
}

/* ----------------------------------------------------------------- náhľad */

export type ExistujuciXml = {
  id: string;
  druh: string;
  kod: string;
  agenda: string | null;
  popis: string | null;
  ucet_md: string | null;
  ucet_d: string | null;
  aktivne: boolean | null;
  zdroj?: string | null;
};

export type StavXml = "novy" | "zmena" | "bez_zmeny";
export type PoleZmenyXml = "popis" | "ucet_md" | "ucet_d" | "aktivne";

export type RiadokXml = ZaznamCiselnika & {
  stav: StavXml;
  zmeny: PoleZmenyXml[];
  vybrany: boolean;
};

export type MoznostiXml = {
  /** Kód, ktorý je v Pohode neaktívny (napr. UDpdp), sa uloží ako aktívny. */
  neaktivneAkoAktivne: boolean;
};

const kluc = (druh: string, kod: string, agenda: string | null | undefined) => `${druh}|${kod}|${agenda ?? ""}`;
const rovnake = (a: string | null | undefined, b: string | null | undefined) =>
  String(a ?? "").trim() === String(b ?? "").trim();

/** Aktívny príznak, s ktorým sa záznam uloží. */
export function aktivnePriUlozeni(z: Pick<ZaznamCiselnika, "aktivne">, o: MoznostiXml): boolean {
  return o.neaktivneAkoAktivne ? true : z.aktivne;
}

/**
 * Čo sa na existujúcom zázname zmení. Prázdne pole z Pohody nič nezmaže;
 * vypnutý kód sa zapne len pri voľbe „aj neaktívne ako aktívne“ a zapnutý
 * sa importom nikdy nevypne (vypína ho len človek).
 */
export function zmenyXml(z: ZaznamCiselnika, e: ExistujuciXml, o: MoznostiXml): PoleZmenyXml[] {
  const out: PoleZmenyXml[] = [];
  if (z.popis && !rovnake(z.popis, e.popis)) out.push("popis");
  if (z.ucet_md && !rovnake(z.ucet_md, e.ucet_md)) out.push("ucet_md");
  if (z.ucet_d && !rovnake(z.ucet_d, e.ucet_d)) out.push("ucet_d");
  if (e.aktivne === false && aktivnePriUlozeni(z, o)) out.push("aktivne");
  return out;
}

export function nahladXml(zaznamy: ZaznamCiselnika[], existujuce: ExistujuciXml[], o: MoznostiXml): RiadokXml[] {
  const mapa = new Map<string, ExistujuciXml>();
  for (const e of existujuce) mapa.set(kluc(e.druh, e.kod, e.agenda), e);
  return zaznamy.map((z) => {
    const e = mapa.get(kluc(z.druh, z.kod, z.agenda));
    if (!e) return { ...z, stav: "novy", zmeny: [], vybrany: true };
    const zmeny = zmenyXml(z, e, o);
    return zmeny.length ? { ...z, stav: "zmena", zmeny, vybrany: true } : { ...z, stav: "bez_zmeny", zmeny, vybrany: false };
  });
}

/** Náhľad po zmene voľby — zaškrtnutie, ktoré človek zmenil, ostane, ak sa stav nezmenil. */
export function prepocitajNahladXml(riadky: RiadokXml[], existujuce: ExistujuciXml[], o: MoznostiXml): RiadokXml[] {
  const nove = nahladXml(riadky, existujuce, o);
  return nove.map((n, i) => (n.stav === riadky[i].stav ? { ...n, vybrany: riadky[i].vybrany } : n));
}

/* ----------------------------------------------------------- plán zápisu */

export type PlanXml = {
  vlozit: (ZaznamCiselnika & { company_id: string; zdroj: "pohoda" })[];
  upravit: { id: string; zmeny: Partial<Record<PoleZmenyXml | "pohoda_id", string | boolean | null>> }[];
  bezZmeny: number;
};

/**
 * Plán zápisu vybraných záznamov — stav sa počíta znova z aktuálnych dát
 * (nie z toho, čo poslal prehliadač).
 */
export function planXml(
  companyId: string,
  zaznamy: ZaznamCiselnika[],
  existujuce: (ExistujuciXml & { pohoda_id?: string | null })[],
  o: MoznostiXml,
): PlanXml {
  const mapa = new Map<string, ExistujuciXml & { pohoda_id?: string | null }>();
  for (const e of existujuce) mapa.set(kluc(e.druh, e.kod, e.agenda), e);
  const plan: PlanXml = { vlozit: [], upravit: [], bezZmeny: 0 };
  const videne = new Set<string>();
  for (const z of zaznamy) {
    const k = kluc(z.druh, z.kod, z.agenda);
    if (videne.has(k)) continue;
    videne.add(k);
    const e = mapa.get(k);
    if (!e) {
      plan.vlozit.push({ ...z, aktivne: aktivnePriUlozeni(z, o), company_id: companyId, zdroj: "pohoda" });
      continue;
    }
    const polia = zmenyXml(z, e, o);
    if (!polia.length) {
      plan.bezZmeny++;
      continue;
    }
    const zmeny: PlanXml["upravit"][number]["zmeny"] = {};
    for (const p of polia) zmeny[p] = p === "aktivne" ? true : z[p];
    if (z.pohoda_id && !e.pohoda_id) zmeny.pohoda_id = z.pohoda_id;
    plan.upravit.push({ id: e.id, zmeny });
  }
  return plan;
}

/** Počty podľa druhu — pre súhrn v náhľade. */
export function poctyPodlaDruhu<T extends { druh: DruhCiselnika }>(riadky: T[]): Map<DruhCiselnika, number> {
  const m = new Map<DruhCiselnika, number>();
  for (const r of riadky) m.set(r.druh, (m.get(r.druh) ?? 0) + 1);
  return m;
}
