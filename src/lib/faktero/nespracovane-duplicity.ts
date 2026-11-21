/*
  „Odstrániť duplicity“ v Nespracovaných dokladoch — čistá logika.

  Nespracovaný doklad je duplicitou, keď
    (b) ten istý doklad už vo firme je — prijatá faktúra, bloček alebo iný
        doklad s rovnakým súborom (`subor_hash`, ako pri nahratí v
        `duplicita-suboru`), alebo s rovnakým IČO dodávateľa + číslom + sumou;
    (a) inak, keď ho rovnako (súbor, alebo IČO + číslo + suma) zdieľa iný
        nespracovaný — ponechá sa najstarší, novšie idú do koša.
  Doklad, ktorý sa ešte číta, sa porovnáva len podľa súboru (údaje ešte nemá).
*/
import type { AgendaDuplicitySuboru } from "./duplicita-suboru";

export type NespracovanyNaDuplicity = {
  id: string;
  vytvorene: string;
  hash: string | null;
  ico: string | null;
  cislo: string | null;
  suma: number | null;
  popis: string;
};

export type ExistujuciDoklad = {
  agenda: Exclude<AgendaDuplicitySuboru, "nespracovany">;
  id: string;
  hash: string | null;
  ico: string | null;
  cislo: string | null;
  suma: number | null;
  popis: string;
};

export type NajdenaDuplicita = {
  id: string;
  popis: string;
  /** Čoho je duplicitou. */
  povod: { agenda: AgendaDuplicitySuboru; id: string; popis: string };
  /** Podľa čoho sa zhoduje. */
  podla: "subor" | "udaje";
};

const normIco = (v: string | null | undefined) => (v ?? "").replace(/\s/g, "").replace(/^0+/, "");
const normCislo = (v: string | null | undefined) => (v ?? "").replace(/\s/g, "").toUpperCase();

/** Kľúč IČO + číslo + suma, alebo null keď niečo chýba. */
export function klucUdajov(d: { ico: string | null; cislo: string | null; suma: number | null }): string | null {
  const ico = normIco(d.ico);
  const cislo = normCislo(d.cislo);
  if (!ico || !cislo || d.suma == null || !Number.isFinite(Number(d.suma))) return null;
  return `${ico}|${cislo}|${Math.round(Number(d.suma) * 100)}`;
}

export function najdiDuplicityNespracovanych(
  nespracovane: NespracovanyNaDuplicity[],
  existujuce: ExistujuciDoklad[],
): NajdenaDuplicita[] {
  const podlaHashu = new Map<string, ExistujuciDoklad>();
  const podlaUdajov = new Map<string, ExistujuciDoklad>();
  for (const e of existujuce) {
    if (e.hash && !podlaHashu.has(e.hash)) podlaHashu.set(e.hash, e);
    const k = klucUdajov(e);
    if (k && !podlaUdajov.has(k)) podlaUdajov.set(k, e);
  }
  const out: NajdenaDuplicita[] = [];
  const zvysne: NespracovanyNaDuplicity[] = [];
  for (const n of nespracovane) {
    const kH = n.hash ? podlaHashu.get(n.hash) : undefined;
    const kU = kH ? undefined : (() => {
      const k = klucUdajov(n);
      return k ? podlaUdajov.get(k) : undefined;
    })();
    const e = kH ?? kU;
    if (e) out.push({ id: n.id, popis: n.popis, povod: { agenda: e.agenda, id: e.id, popis: e.popis }, podla: kH ? "subor" : "udaje" });
    else zvysne.push(n);
  }
  // Medzi sebou: najstarší ostáva (pri rovnakom čase rozhodne id, nech je výsledok stály).
  const poradie = [...zvysne].sort((x, y) => x.vytvorene.localeCompare(y.vytvorene) || x.id.localeCompare(y.id));
  const prvyHash = new Map<string, NespracovanyNaDuplicity>();
  const prvyUdaje = new Map<string, NespracovanyNaDuplicity>();
  for (const n of poradie) {
    const k = klucUdajov(n);
    const pH = n.hash ? prvyHash.get(n.hash) : undefined;
    const pU = pH ? undefined : k ? prvyUdaje.get(k) : undefined;
    const p = pH ?? pU;
    if (p) {
      out.push({ id: n.id, popis: n.popis, povod: { agenda: "nespracovany", id: p.id, popis: p.popis }, podla: pH ? "subor" : "udaje" });
      continue;
    }
    if (n.hash) prvyHash.set(n.hash, n);
    if (k) prvyUdaje.set(k, n);
  }
  return out;
}
