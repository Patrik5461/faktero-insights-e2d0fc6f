/*
  Rozpis DPH podľa sadzieb — sadzba, základ dane a daň — pre súhrn dokladu
  na obrazovke (PDF má vlastný). Riadky sa zoskupia podľa sadzby; halier,
  ktorý vznikne zaokrúhlením skupín, sa pripíše k najväčšej skupine, aby
  súčet rozpisu presne sedel so súčtom dokladu.
*/

export type RiadokRozpisu = {
  vat_rate: number | string | null;
  subtotal: number | string | null;
  vat_amount: number | string | null;
  /** Prenesenie daňovej povinnosti na riadku (sadzba sa neuplatní). */
  prenesenie?: boolean;
};

export type SkupinaRozpisu = {
  sadzba: number;
  prenesenie: boolean;
  zaklad: number;
  dan: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const cislo = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function rozpisPodlaSadzieb(
  riadky: RiadokRozpisu[],
  sucty?: { subtotal?: number | string | null; vat_total?: number | string | null },
): SkupinaRozpisu[] {
  const mapa = new Map<string, SkupinaRozpisu>();
  for (const r of riadky) {
    const prenesenie = Boolean(r.prenesenie);
    const sadzba = cislo(r.vat_rate);
    const kluc = `${prenesenie ? "p" : "s"}:${sadzba}`;
    const g = mapa.get(kluc) ?? { sadzba, prenesenie, zaklad: 0, dan: 0 };
    g.zaklad += cislo(r.subtotal);
    g.dan += prenesenie ? 0 : cislo(r.vat_amount);
    mapa.set(kluc, g);
  }
  const skupiny = [...mapa.values()]
    .map((g) => ({ ...g, zaklad: r2(g.zaklad), dan: r2(g.dan) }))
    .sort((a, b) => Number(a.prenesenie) - Number(b.prenesenie) || b.sadzba - a.sadzba);

  // Dorovnanie na súčty dokladu (zaokrúhlenie po doklade, zľava na doklad).
  if (sucty && skupiny.length) {
    let naj = 0;
    for (let i = 1; i < skupiny.length; i++)
      if (Math.abs(skupiny[i].zaklad) > Math.abs(skupiny[naj].zaklad)) naj = i;
    if (sucty.subtotal != null) {
      const rozdiel = r2(cislo(sucty.subtotal) - skupiny.reduce((s, g) => s + g.zaklad, 0));
      if (Math.abs(rozdiel) <= 0.05) skupiny[naj].zaklad = r2(skupiny[naj].zaklad + rozdiel);
    }
    if (sucty.vat_total != null) {
      const rozdiel = r2(cislo(sucty.vat_total) - skupiny.reduce((s, g) => s + g.dan, 0));
      // Daň sa dorovná len skupine, ktorá daň má.
      const sDanou = skupiny.findIndex((g, i) => i === naj && !g.prenesenie && g.sadzba > 0);
      const ciel = sDanou >= 0 ? sDanou : skupiny.findIndex((g) => !g.prenesenie && g.sadzba > 0);
      if (ciel >= 0 && Math.abs(rozdiel) <= 0.05)
        skupiny[ciel].dan = r2(skupiny[ciel].dan + rozdiel);
    }
  }
  return skupiny;
}
