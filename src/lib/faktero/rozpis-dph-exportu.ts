/*
  Rozpis DPH po sadzbách pre tabuľkové exporty (Excel zoznamov, CSV v ZIP-e
  odovzdania, súpiska bločkov) a priehradky sadzieb pre účtovné programy.

  Patrik 3. 11. 2026: „Pri exportoch musí exportovať aj základ a aj rozpis
  DPH.“ Súpisky dovtedy niesli len „Základ / DPH / Spolu“ — účtovníčka z nich
  nevedela, koľko je v 23 % a koľko v 19 %, a doklad musela otvárať.

  Zdroje rozpisu sú tie isté, z ktorých píše Pohoda:
   - vystavená faktúra — položky (so zľavou na doklad), dorovnané na hlavičku;
   - prijatá faktúra — `rozpisPrijatej` (položky, samofaktúra, inak hlavička);
   - bloček / doklad — `rozpisBlocku` (`vat_breakdown`, inak hlavička).

  Stĺpce sa tvoria len zo sadzieb, ktoré sa v exporte naozaj vyskytli, a to
  vzostupne cez `zoradSadzby` (0 → 5 → 19 → 23). Prenesenie daňovej
  povinnosti má vlastné stĺpce — nie je to oslobodené plnenie a do stĺpca
  sadzby by sa započítalo dvakrát.
*/

import {
  krajinaDane,
  najblizsiaSadzba,
  sadzbyKuDnu,
  zoradSadzby,
  type KrajinaDane,
} from "./vat-rates";
import { riadkySoZlavou } from "./zlavy";

export type RiadokRozpisuDph = {
  sadzba: number;
  zaklad: number;
  dph: number;
  /** Prenesenie daňovej povinnosti (§ 69 ods. 12) — daň priznáva odberateľ. */
  pdp?: boolean;
};

const cislo = (h: unknown): number => {
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tuzemské prenesenie celej faktúry (nie dodanie do EÚ ani vývoz — tie sú 0 %). */
export function tuzemskePrenesenie(inv: { reverse_charge?: unknown; reverse_charge_type?: unknown }): boolean {
  return Boolean(inv?.reverse_charge) && !/^(eu|export)/i.test(String(inv?.reverse_charge_type ?? ""));
}

/**
 * Rozpis vystavenej faktúry po sadzbách z položiek. Zľava na doklad sa
 * rozpočíta do riadkov a výsledok sa dorovná na hlavičku (`subtotal`,
 * `vat_total`) — súčet stĺpcov tak vždy sedí so „Základ spolu“ a „DPH
 * spolu“, aj keď je dobropis uložený so záporným znamienkom.
 */
export function rozpisVystavenej(
  inv: Record<string, any>,
  items: Record<string, any>[] | null | undefined,
  /** Krajina firmy — na odhad sadzby faktúry bez položiek. */
  krajina?: string | null,
): RiadokRozpisuDph[] {
  const zaklad = cislo(inv?.subtotal);
  const dph = cislo(inv?.vat_total);
  const pdpCela = tuzemskePrenesenie(inv ?? {});
  const polozky = riadkySoZlavou(items ?? [], inv?.discount_total);
  if (!polozky.length) {
    if (!zaklad && !dph) return [];
    const sadzba = zaklad && dph ? najblizsiaSadzba((dph / zaklad) * 100, krajinaDane(krajina)) : 0;
    return [{ sadzba, zaklad: r2(zaklad), dph: r2(dph), ...(pdpCela ? { pdp: true } : {}) }];
  }
  const po = new Map<string, RiadokRozpisuDph>();
  for (const p of polozky) {
    const pdp = pdpCela || Boolean(p?.prenesenie);
    const sadzba = cislo(p?.vat_rate);
    const k = `${sadzba}|${pdp}`;
    const r = po.get(k) ?? { sadzba, zaklad: 0, dph: 0, ...(pdp ? { pdp: true } : {}) };
    r.zaklad += cislo(p?.subtotal);
    r.dph += cislo(p?.vat_amount);
    po.set(k, r);
  }
  const riadky = [...po.values()];
  dorovnaj(riadky, "zaklad", zaklad);
  dorovnaj(riadky, "dph", dph);
  return zoradRozpis(riadky);
}

/**
 * Prenásobí riadky tak, aby ich súčet bol `ciel` (hlavička dokladu), a halier
 * zo zaokrúhlenia pridá najväčšiemu riadku. Bez hlavičky (0) riadky ostanú.
 */
function dorovnaj(riadky: RiadokRozpisuDph[], pole: "zaklad" | "dph", ciel: number) {
  const spolu = riadky.reduce((a, r) => a + r[pole], 0);
  if (ciel && spolu && Math.abs(spolu - ciel) >= 0.005) {
    const k = ciel / spolu;
    for (const r of riadky) r[pole] = r[pole] * k;
  }
  for (const r of riadky) r[pole] = r2(r[pole]);
  const rozdiel = r2((ciel || spolu) - riadky.reduce((a, r) => a + r[pole], 0));
  if (rozdiel && Math.abs(rozdiel) <= 0.05) {
    const naj = [...riadky].sort((a, b) => Math.abs(b[pole]) - Math.abs(a[pole]))[0];
    if (naj) naj[pole] = r2(naj[pole] + rozdiel);
  }
}

/** Vzostupne podľa sadzby, prenesenie za bežnými riadkami. */
export function zoradRozpis<T extends RiadokRozpisuDph>(riadky: T[]): T[] {
  return [...riadky].sort(
    (a, b) => Number(Boolean(a.pdp)) - Number(Boolean(b.pdp)) || a.sadzba - b.sadzba,
  );
}

export type StlpecRozpisu = {
  druh: "zaklad" | "dph" | "pdp";
  sadzba: number;
};

/**
 * Stĺpce rozpisu pre celú dávku dokladov: pre každú použitú sadzbu základ a
 * daň (pri 0 % len základ), za nimi základ v prenesení po sadzbách.
 */
export function stlpceRozpisu(rozpisy: RiadokRozpisuDph[][]): StlpecRozpisu[] {
  const vsetky = rozpisy.flat();
  const bezne = zoradSadzby([...new Set(vsetky.filter((r) => !r.pdp).map((r) => r.sadzba))]);
  const pdp = zoradSadzby([...new Set(vsetky.filter((r) => r.pdp).map((r) => r.sadzba))]);
  return [
    ...bezne.flatMap((s): StlpecRozpisu[] =>
      s === 0
        ? [{ druh: "zaklad", sadzba: 0 }]
        : [
            { druh: "zaklad", sadzba: s },
            { druh: "dph", sadzba: s },
          ],
    ),
    ...pdp.map((s): StlpecRozpisu => ({ druh: "pdp", sadzba: s })),
  ];
}

/** Hodnota stĺpca rozpisu pre jeden doklad (súčet riadkov danej sadzby). */
export function hodnotaStlpca(rozpis: RiadokRozpisuDph[], s: StlpecRozpisu): number {
  const vybrane = rozpis.filter((r) => (s.druh === "pdp") === Boolean(r.pdp) && r.sadzba === s.sadzba);
  return r2(vybrane.reduce((a, r) => a + (s.druh === "dph" ? r.dph : r.zaklad), 0));
}

/** Názov stĺpca v slovenčine (súpisky CSV) — Excel zoznamu si ho preloží cez `t()`. */
export function nazovStlpca(s: StlpecRozpisu): string {
  if (s.druh === "pdp") return s.sadzba ? `Základ v prenesení ${s.sadzba} %` : "Základ v prenesení";
  return `${s.druh === "dph" ? "DPH" : "Základ"} ${s.sadzba} %`;
}

/** Strojový názov stĺpca (CSV v ZIP-e odovzdania): `zaklad_23`, `dph_23`, `zaklad_pdp_23`. */
export function kodStlpca(s: StlpecRozpisu): string {
  const sd = String(s.sadzba).replace(".", "_");
  return s.druh === "pdp" ? `zaklad_pdp_${sd}` : `${s.druh}_${sd}`;
}

/* ------------------------------------------- priehradky účtovných programov */

export type Hladina = "zakladna" | "znizena" | "znizena2" | "nulova";

/**
 * Priehradky sadzieb dokladu tak, ako ich vedú účtovné programy (Omega
 * „vyššia / nižšia / znížená 2“, Money `SazbaDPH2 / SazbaDPH1 / DalsiSazba`,
 * Flexi `Zakl / Sniz / Sniz2`).
 *
 * Dovtedy sa priraďovali podľa poradia na doklade — najvyššia sadzba bola
 * „základná“. Bloček len s 19 % tak išiel do Flexi ako základná sadzba
 * (Flexi by k nemu dosadila 23 %) a doklad len s 5 % do Omegy ako „vyššia“.
 * Teraz rozhoduje tabuľka sadzieb krajiny ku dňu plnenia (SK od 2025:
 * 23 základná, 19 znížená, 5 druhá znížená; CZ 21 / 12; historické 20 / 10
 * podľa tabuľky, v ktorej platili).
 *
 * Keď by dve sadzby dokladu padli do tej istej priehradky (opravný doklad
 * mieša 20 % a 23 %), druhá dostane najbližšiu voľnú — formát ich inak
 * nedokáže uniesť obe.
 */
export function priehradkySadzieb(
  sadzby: number[],
  krajina?: string | null,
  den?: string | null,
): Map<number, Hladina> {
  const kr: KrajinaDane = krajinaDane(krajina);
  const dnes = sadzbyKuDnu(kr, den || null);
  const historia = HISTORIA[kr];
  const out = new Map<number, Hladina>();
  const obsadene = new Set<Hladina>();
  const kladne = [...new Set(sadzby.map((s) => Number(s) || 0))].filter((s) => s > 0).sort((a, b) => b - a);
  const odhad = (s: number): Hladina => {
    if (s === dnes.high) return "zakladna";
    if (s === dnes.low) return "znizena";
    if (dnes.third != null && s === dnes.third) return "znizena2";
    const h = historia.find((t) => t.high === s || t.low === s || t.third === s);
    if (h) return s === h.high ? "zakladna" : s === h.low ? "znizena" : "znizena2";
    if (s > dnes.low) return "zakladna";
    return dnes.third != null && s <= dnes.third ? "znizena2" : "znizena";
  };
  const poradie: Hladina[] = ["zakladna", "znizena", "znizena2"];
  for (const s of kladne) {
    let h = odhad(s);
    if (obsadene.has(h)) h = poradie.find((x) => !obsadene.has(x)) ?? h;
    obsadene.add(h);
    out.set(s, h);
  }
  out.set(0, "nulova");
  return out;
}

/** Všetky tabuľky sadzieb krajiny — na zaradenie historickej sadzby. */
const HISTORIA: Record<KrajinaDane, { high: number; low: number; third: number | null }[]> = {
  SK: [sadzbyKuDnu("SK", "2025-01-01"), sadzbyKuDnu("SK", "2024-12-31")],
  CZ: [sadzbyKuDnu("CZ", "2024-01-01"), sadzbyKuDnu("CZ", "2023-12-31")],
  DE: [sadzbyKuDnu("DE", "2021-01-01"), sadzbyKuDnu("DE", "2020-07-01"), sadzbyKuDnu("DE", "2006-12-31")],
};

/** Sadzba dokladu v danej priehradke (alebo `undefined`). */
export function sadzbaVHladine(mapa: Map<number, Hladina>, h: Hladina): number | undefined {
  for (const [s, x] of mapa) if (x === h && s > 0) return s;
  return undefined;
}
