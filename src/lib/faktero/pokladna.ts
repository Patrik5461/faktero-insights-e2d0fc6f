/**
 * Pokladňa — stav hotovosti a priebežný zostatok.
 *
 * Do pokladne vstupujú dva zdroje: pokladničné doklady (`cash_entries`) a
 * doklady z evidencie výdavkov, ktoré boli zaplatené **hotovosťou**. Doklad
 * zaplatený kartou alebo prevodom hotovosť neuberá, hoci výdavok to je.
 *
 * Sumy z databázy prichádzajú cez PostgREST ako reťazce (`numeric` sa
 * neserializuje na číslo), takže sa všade prevádzajú cez `cislo()` — bez toho
 * by `"12.50" + "3.20"` dalo `"12.503.20"` a zostatok by bol nezmysel.
 */

export type TypPohybu = "prijem" | "vydaj";

export type PokladnicnyDoklad = {
  id?: string;
  entry_number?: string | null;
  entry_date?: string | null;
  type?: string | null;
  amount?: unknown;
  description?: string | null;
};

export type VydavkovyDoklad = {
  id?: string;
  issue_date?: string | null;
  total_amount?: unknown;
  payment_method?: string | null;
  supplier_name?: string | null;
  document_number?: string | null;
};

export const PLATBA_POPIS: Record<string, string> = {
  hotovost: "Hotovosť",
  karta: "Karta",
  prevod: "Prevodom",
};

export function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function centy(n: number): number {
  return Math.round(cislo(n) * 100) / 100;
}

/** Doklad z evidencie výdavkov uberá z pokladne len keď bol platený hotovosťou. */
export function jeHotovostny(d: VydavkovyDoklad): boolean {
  return (d.payment_method ?? "hotovost") === "hotovost";
}

export type Riadok = {
  id: string;
  datum: string;
  cislo: string;
  popis: string;
  typ: TypPohybu;
  suma: number;
  zdroj: "pokladnicny" | "doklad";
  zostatok: number;
};

/**
 * Zlúči obidva zdroje do jedného priebehu a dopočíta zostatok po každom riadku.
 * Zoradené od najstaršieho, aby zostatok narastal v čase; do zobrazenia sa
 * potom otočí.
 */
export function priebehPokladne(
  doklady: PokladnicnyDoklad[],
  vydavky: VydavkovyDoklad[],
  pociatocnyStav = 0,
): Riadok[] {
  const riadky: Omit<Riadok, "zostatok">[] = [];

  for (const d of doklady ?? []) {
    const typ: TypPohybu = d.type === "prijem" ? "prijem" : "vydaj";
    riadky.push({
      id: String(d.id ?? ""),
      datum: d.entry_date ?? "",
      cislo: d.entry_number ?? "",
      popis: d.description ?? "",
      typ,
      suma: centy(Math.abs(cislo(d.amount))),
      zdroj: "pokladnicny",
    });
  }

  for (const v of vydavky ?? []) {
    if (!jeHotovostny(v)) continue;
    const suma = centy(Math.abs(cislo(v.total_amount)));
    if (suma === 0) continue;
    riadky.push({
      id: String(v.id ?? ""),
      datum: v.issue_date ?? "",
      cislo: v.document_number ?? "",
      popis: v.supplier_name ?? "Doklad",
      typ: "vydaj",
      suma,
      zdroj: "doklad",
    });
  }

  // V rámci jedného dňa idú príjmy pred výdavkami. Poradie podľa čísla dokladu
  // by inak postavilo bloček („BL-1") pred vklad („PD20260001") a priebežný
  // zostatok by v ten deň ukázal mínus, hoci v pokladni nikdy nechýbalo.
  const poradieTypu = (t: TypPohybu) => (t === "prijem" ? 0 : 1);
  riadky.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
    if (a.typ !== b.typ) return poradieTypu(a.typ) - poradieTypu(b.typ);
    return a.cislo.localeCompare(b.cislo);
  });

  let zostatok = centy(pociatocnyStav);
  return riadky.map((r) => {
    zostatok = centy(zostatok + (r.typ === "prijem" ? r.suma : -r.suma));
    return { ...r, zostatok };
  });
}

export type StavPokladne = {
  prijmy: number;
  vydavky: number;
  zostatok: number;
  pocet: number;
  /** Záporná pokladňa je vždy chyba v evidencii — v hotovosti sa do mínusu ísť nedá. */
  zaporny: boolean;
};

export function stavPokladne(
  doklady: PokladnicnyDoklad[],
  vydavky: VydavkovyDoklad[],
  pociatocnyStav = 0,
): StavPokladne {
  const riadky = priebehPokladne(doklady, vydavky, pociatocnyStav);
  const prijmy = centy(riadky.filter((r) => r.typ === "prijem").reduce((s, r) => s + r.suma, 0));
  const vydavkySpolu = centy(
    riadky.filter((r) => r.typ === "vydaj").reduce((s, r) => s + r.suma, 0),
  );
  const zostatok = centy(pociatocnyStav + prijmy - vydavkySpolu);
  return {
    prijmy,
    vydavky: vydavkySpolu,
    zostatok,
    pocet: riadky.length,
    zaporny: zostatok < 0,
  };
}
