/*
  Výber dokladov v zozname appky — čistá logika.

  V zozname Prijatých dokladov sa dajú riadky zaškrtnúť a dole lišta povie,
  koľko je vybraných a za koľko (s DPH aj bez), a koľko z nich ešte nebolo
  odovzdaných do účtovníctva. Nad vybranými sa dá hromadne zmeniť kategória
  alebo ich zmazať (do koša).

  Sumy sa sčítavajú len v rovnakej mene. Bloček v CZK a v EUR spolu nedávajú
  žiadne číslo — preto súčet vracia riadok za každú menu.
*/

export type DokladNaSucet = {
  id: string;
  total_amount: number | string | null;
  net_amount?: number | string | null;
  vat_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
};

export type SucetMeny = { mena: string; pocet: number; sDph: number; bezDph: number };

export type SuhrnVyberu = {
  pocet: number;
  sumy: SucetMeny[];
  naExport: { pocet: number; sumy: SucetMeny[] };
};

function cislo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const zaokruhli = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Suma bez DPH. Keď doklad základ nemá, odvodí sa zo sumy a DPH; doklad bez
 * DPH (neplatiteľ, bloček bez rozpisu) má základ rovný sume.
 */
export function bezDph(d: DokladNaSucet): number {
  const zaklad = cislo(d.net_amount);
  if (zaklad != null) return zaklad;
  const spolu = cislo(d.total_amount) ?? 0;
  return spolu - (cislo(d.vat_amount) ?? 0);
}

/** Súčty po menách. Domáce euro je prvé, ostatné meny podľa abecedy. */
export function sumyPoMenach(doklady: DokladNaSucet[]): SucetMeny[] {
  const mapa = new Map<string, SucetMeny>();
  for (const d of doklady) {
    const mena = (d.currency || "EUR").toUpperCase();
    const r = mapa.get(mena) ?? { mena, pocet: 0, sDph: 0, bezDph: 0 };
    r.pocet += 1;
    r.sDph += cislo(d.total_amount) ?? 0;
    r.bezDph += bezDph(d);
    mapa.set(mena, r);
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, sDph: zaokruhli(r.sDph), bezDph: zaokruhli(r.bezDph) }))
    .sort((a, b) => (a.mena === "EUR" ? -1 : b.mena === "EUR" ? 1 : a.mena.localeCompare(b.mena)));
}

/**
 * Doklad, ktorý ešte pôjde do účtovníctva — rovnaké pravidlo ako na webe
 * (`doklady.index`): spracovaný a ešte neodovzdaný.
 */
export function jeNaExport(d: DokladNaSucet): boolean {
  return d.status === "processed" && !d.exported_at;
}

/**
 * Doklad, ktorý sa dá meniť. Odovzdaný alebo zamknutý doklad je už v
 * účtovníctve — web ho tiež nedovolí upraviť.
 */
export function daSaUpravit(d: DokladNaSucet): boolean {
  return !d.exported_at && !d.locked_at;
}

export function suhrnVyberu(doklady: DokladNaSucet[], vybrane: ReadonlySet<string>): SuhrnVyberu {
  const vyber = doklady.filter((d) => vybrane.has(d.id));
  const naExport = vyber.filter(jeNaExport);
  return {
    pocet: vyber.length,
    sumy: sumyPoMenach(vyber),
    naExport: { pocet: naExport.length, sumy: sumyPoMenach(naExport) },
  };
}

/** Zaškrtne alebo odškrtne jeden riadok. Vracia novú množinu. */
export function prepniVyber(vybrane: ReadonlySet<string>, id: string): Set<string> {
  const nove = new Set(vybrane);
  if (nove.has(id)) nove.delete(id);
  else nove.add(id);
  return nove;
}

/** Sú vybrané všetky zobrazené riadky? Prázdny zoznam nie je „všetko". */
export function vsetkyVybrane(vybrane: ReadonlySet<string>, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => vybrane.has(id));
}

/**
 * „Vybrať všetko" — zaškrtne všetky zobrazené; keď už sú, výber zruší.
 * Riadky mimo zobrazenia (skryté hľadaním) sa výberom nemenia.
 */
export function vybratVsetko(vybrane: ReadonlySet<string>, ids: string[]): Set<string> {
  const nove = new Set(vybrane);
  if (vsetkyVybrane(vybrane, ids)) ids.forEach((id) => nove.delete(id));
  else ids.forEach((id) => nove.add(id));
  return nove;
}

/** Výber po obnovení zoznamu — zmazané doklady z neho vypadnú. */
export function orezVyber(vybrane: ReadonlySet<string>, ids: string[]): Set<string> {
  const existuju = new Set(ids);
  return new Set([...vybrane].filter((id) => existuju.has(id)));
}
