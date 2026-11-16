/*
  Hromadné akcie v Nespracovaných dokladoch — čo sa dá označiť, ako sa výber
  delí na nespracované doklady a bločky, prečo sa doklad hromadne nevytvorí
  a súhrn na konci.

  Hromadné „Vytvoriť“ volá ten istý server ako detail, len bez otázok: čo by
  sa v detaile potvrdzovalo (nesúlad sumy bločku, rozpis DPH, vlastný IBAN,
  možná duplicita, cudzí odberateľ), sa tu preskočí s dôvodom a človek to
  doklad po doklade vyrieši v detaile. Nič sa nedopĺňa ani nehádá.
*/
import { kontrolaNespracovaneho } from "@/components/faktero/dph-formular";
import { nesediZChyby } from "./cudzia-faktura";
import { rozlozChybuBlocku, rozlozChybuPrijatej } from "./duplicita-zauctovania";
import {
  NAZVY_POLI,
  chybajuce,
  kontrolaSumy,
  upravCelkomDokladu,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
  type VolbyKontroly,
} from "./nespracovane";
import { smerPodlaIban, type UcetFirmy } from "./nespracovane-iban";
import { PREDPONA_DUPLICITY } from "./prijate-duplicity";

export type TypRiadku = "nespracovany" | "blocek";

export type RiadokVyberu = {
  /** Kľúč riadku v zozname (`n-…` nespracovaný, `b-…` bloček) — id sa medzi tabuľkami nebijú, ale istota. */
  kluc: string;
  id: string;
  typ: string;
  stav?: string | null;
};

/** Text na preklad cez `t()` s parametrami. */
export type Dovod = { text: string; params?: Record<string, string | number> };

export type Preskoceny = { popis: string; dovod: Dovod };

/** Označiť sa dá nespracovaný doklad aj bloček — nie však, kým ho AI číta. */
export function jeVyberatelny(r: RiadokVyberu): boolean {
  return (r.typ === "nespracovany" || r.typ === "blocek") && r.stav !== "cita";
}

/**
 * Vybrané riadky rozdelené podľa typu. Berú sa len zobrazené a označiteľné —
 * skrytý (odfiltrovaný) doklad sa hromadne nezmení, aj keby kľúč vo výbere
 * zostal.
 */
export function rozdelVyber<T extends RiadokVyberu>(
  zobrazene: readonly T[],
  vybrane: ReadonlySet<string>,
): { nespracovane: T[]; blocky: T[] } {
  const nespracovane: T[] = [];
  const blocky: T[] = [];
  for (const r of zobrazene) {
    if (!vybrane.has(r.kluc) || !jeVyberatelny(r)) continue;
    if (r.typ === "blocek") blocky.push(r);
    else nespracovane.push(r);
  }
  return { nespracovane, blocky };
}

/** Krátky popis dokladu do zoznamu preskočených. */
export function popisRiadku(r: { dodavatel?: string | null; cislo?: string | null; subor?: string | null }): string {
  return [r.dodavatel, r.cislo].filter((v) => v && String(v).trim()).join(" · ") || r.subor || "Doklad";
}

export type PodkladVytvorenia = {
  druh: string | null;
  stav?: string | null;
  udaje: UdajeNespracovaneho;
  povinne?: string[];
  nastavenia?: VolbyKontroly & { typPodlaIban?: boolean | null };
  krajinaFirmy?: string | null;
  vlastneUcty?: UcetFirmy[] | null;
  ibanOdberatela?: string | null;
};

/**
 * Prečo sa nespracovaný doklad hromadne nevytvorí — `null`, keď sa môže
 * poslať na server. Rovnaké kontroly ako tlačidlo „Vytvoriť“ v detaile;
 * otázky detailu sa tu nekladú, doklad sa preskočí.
 */
export function dovodNevytvorenia(p: PodkladVytvorenia): Dovod | null {
  if (p.stav === "cita") return { text: "Doklad sa ešte číta" };
  const druh = (p.druh || null) as DruhNespracovaneho | null;
  if (!druh) return { text: "Nie je určený druh dokladu" };
  // Detail pri otvorení doplní sumu dokladu (`celkomDokladu`) — podľa nej sa kontroluje rozpis.
  const u = upravCelkomDokladu(null, p.udaje);
  const chyby = chybajuce(druh, u, p.povinne ?? [], p.nastavenia ?? {});
  if (chyby.length) return { text: "Doplňte: {polia}", params: { polia: chyby.map((k) => NAZVY_POLI[k] ?? k).join(", ") } };
  if (druh === "blocek" && !kontrolaSumy(u).sedi) return { text: "Súčet nesedí so sumou bločku" };
  if (druh !== "ostatny") {
    const k = kontrolaNespracovaneho(u, p.krajinaFirmy ?? null, druh);
    if (!k.ok)
      return {
        text: "Rozpis DPH nesedí: {chyby}",
        params: { chyby: k.chyby.map((c) => c.sprava).join("; ") },
      };
  }
  const smer = smerPodlaIban({
    zapnute: Boolean(p.nastavenia?.typPodlaIban),
    druh,
    ibanDokladu: u.dodavatel.iban,
    ibanOdberatela: p.ibanOdberatela ?? null,
    ucty: p.vlastneUcty ?? [],
  });
  if (smer?.smer === "vystavena")
    return { text: "IBAN {iban} na doklade je váš — vyzerá ako vaša vystavená faktúra", params: { iban: smer.iban } };
  return null;
}

/**
 * Chyba servera pri vytváraní ako dôvod preskočenia. Duplicitu, možnú
 * duplicitu a cudzieho odberateľa detail rieši otázkou — hromadne sa doklad
 * len preskočí.
 */
export function dovodZChybyServera(sprava: unknown): Dovod {
  const s = String(sprava ?? "").trim();
  const prijata = rozlozChybuPrijatej(s);
  if (prijata) return { text: "Táto faktúra už je v evidencii: {popis}", params: { popis: prijata.popis } };
  if (s.startsWith(PREDPONA_DUPLICITY))
    return { text: "Možná duplicita — rozhodnite v detaile: {popis}", params: { popis: s.slice(PREDPONA_DUPLICITY.length) } };
  if (nesediZChyby(s)) return { text: "Odberateľ na doklade je iná firma — rozhodnite v detaile" };
  const blocek = rozlozChybuBlocku(s);
  if (blocek) return { text: "Rovnaký bloček už je uložený: {popis}", params: { popis: blocek.popis } };
  return { text: s || "Doklad sa nepodarilo vytvoriť" };
}

/** Polia hromadnej zmeny, ktoré vie prevziať aj bloček (zaúčtovanie v Dokladoch). */
export const POLIA_PRE_BLOCKY = ["predkontacia", "clenenie", "stredisko", "cinnost"] as const;

export type ZmenaHromadna = Partial<
  Record<"druh" | "jobId" | "predkontacia" | "clenenie" | "stredisko" | "cinnost", string>
>;

/**
 * Hromadná zmena rozdelená pre bločky: čo sa na bločkoch zmení (vstup pre
 * `zauctujDokladyFn`) a čo nie (druh a zákazka — bloček ich v Nespracovaných
 * nemení).
 */
export function zmenaPreBlocky(zmena: ZmenaHromadna): {
  zmena: Partial<Record<(typeof POLIA_PRE_BLOCKY)[number], string>>;
  nemenia: ("druh" | "jobId")[];
} {
  const out: Partial<Record<(typeof POLIA_PRE_BLOCKY)[number], string>> = {};
  for (const k of POLIA_PRE_BLOCKY) {
    const v = (zmena[k] ?? "").trim();
    if (v) out[k] = v;
  }
  const nemenia = (["druh", "jobId"] as const).filter((k) => (zmena[k] ?? "").trim());
  return { zmena: out, nemenia: [...nemenia] };
}

/** Text tlačidla — podľa toho, čo je vo výbere. */
export function textSpracovania(pocet: { nespracovane: number; blocky: number }): string {
  if (pocet.nespracovane && pocet.blocky) return "Vytvoriť a spracovať ({n})";
  if (pocet.blocky) return "Spracovať bločky ({n})";
  return "Vytvoriť doklady ({n})";
}
