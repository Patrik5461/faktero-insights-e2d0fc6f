/*
  Súčty na Prehľade počíta databáza (`prehlad_suhrn`, SECURITY INVOKER).
  Predtým si stránka ťahala všetky faktúry za 13 mesiacov, všetky prijaté
  faktúry, platby, odberateľov, záznamy API a celý sklad len kvôli pár
  číslam (PALIERA: ~560 kB JSON v desiatke dotazov). Tu sa odpoveď funkcie
  len prevedie na tvar, s ktorým pracujú panely na stránke.

  Pravidlá sčítavania (zálohová sa nepočíta, dobropis odpočítava, po
  splatnosti z dátumu) drží SQL funkcia — rovnaké ako `faktury-sumy.ts`.
*/

export type KosVeku = { pocet: number; suma: number };

export type PrehladSuhrn = {
  pocet_faktur: number;
  ma_zaplatenu: boolean;
  mesiac_obrat: number;
  minuly_obrat: number;
  neuhradene_suma: number;
  neuhradene_pocet: number;
  po_splatnosti_suma: number;
  po_splatnosti_pocet: number;
  dlznikov: number;
  priemer_dni_uhrady: number | null;
  dph_odvod: number;
  prijmy_rok: number;
  trzby_365: number;
  stavy: Record<string, number>;
  dlznici: { meno: string; suma: number }[];
  vek_pohladavok: KosVeku[];
  vek_zavazkov: KosVeku[];
  vyhlad: { prijem: number; vydaj: number }[];
  zaplatene_30: number;
  zavazky_neuhradene: number;
  zavazky_po_splatnosti: number;
  zavazky_pocet: number;
  dph_odpocet: number;
  vydavky_rok: number;
  sklad_pod_minimom: number;
  km_mesiac: number;
  api_dnes: number;
  api_mesiac: number;
  api_uspesne: number;
};

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function kose(v: unknown): KosVeku[] {
  const pole = Array.isArray(v) ? v : [];
  return Array.from({ length: 5 }, (_, i) => ({
    pocet: n(pole[i]?.pocet),
    suma: n(pole[i]?.suma),
  }));
}

/** Odpoveď RPC v pevnom tvare — chýbajúce alebo textové čísla (numeric) ako čísla. */
export function normalizujPrehlad(d: any): PrehladSuhrn {
  const x = d && typeof d === "object" ? d : {};
  const stavy: Record<string, number> = {};
  for (const [k, v] of Object.entries(x.stavy ?? {})) stavy[k] = n(v);
  const vyhlad = Array.isArray(x.vyhlad) ? x.vyhlad : [];
  return {
    pocet_faktur: n(x.pocet_faktur),
    ma_zaplatenu: !!x.ma_zaplatenu,
    mesiac_obrat: n(x.mesiac_obrat),
    minuly_obrat: n(x.minuly_obrat),
    neuhradene_suma: n(x.neuhradene_suma),
    neuhradene_pocet: n(x.neuhradene_pocet),
    po_splatnosti_suma: n(x.po_splatnosti_suma),
    po_splatnosti_pocet: n(x.po_splatnosti_pocet),
    dlznikov: n(x.dlznikov),
    priemer_dni_uhrady: x.priemer_dni_uhrady == null ? null : n(x.priemer_dni_uhrady),
    dph_odvod: n(x.dph_odvod),
    prijmy_rok: n(x.prijmy_rok),
    trzby_365: n(x.trzby_365),
    stavy,
    dlznici: (Array.isArray(x.dlznici) ? x.dlznici : []).map((d: any) => ({
      meno: String(d?.meno ?? ""),
      suma: n(d?.suma),
    })),
    vek_pohladavok: kose(x.vek_pohladavok),
    vek_zavazkov: kose(x.vek_zavazkov),
    vyhlad: Array.from({ length: 4 }, (_, i) => ({
      prijem: n(vyhlad[i]?.prijem),
      vydaj: n(vyhlad[i]?.vydaj),
    })),
    zaplatene_30: n(x.zaplatene_30),
    zavazky_neuhradene: n(x.zavazky_neuhradene),
    zavazky_po_splatnosti: n(x.zavazky_po_splatnosti),
    zavazky_pocet: n(x.zavazky_pocet),
    dph_odpocet: n(x.dph_odpocet),
    vydavky_rok: n(x.vydavky_rok),
    sklad_pod_minimom: n(x.sklad_pod_minimom),
    km_mesiac: n(x.km_mesiac),
    api_dnes: n(x.api_dnes),
    api_mesiac: n(x.api_mesiac),
    api_uspesne: n(x.api_uspesne),
  };
}

/** Prázdny prehľad — kým odpoveď nepríde alebo keď zlyhá. */
export const PRAZDNY_PREHLAD: PrehladSuhrn = normalizujPrehlad({});

/** Ukazovatele horného pásu a panelov — tie isté kľúče ako pôvodné `computeMetrics`. */
export function metrikyPrehladu(s: PrehladSuhrn) {
  const monthRevenueDelta =
    s.minuly_obrat > 0 ? ((s.mesiac_obrat - s.minuly_obrat) / s.minuly_obrat) * 100 : 0;
  const cashflow = s.zaplatene_30 - s.po_splatnosti_suma;
  const cashflowDelta = s.zaplatene_30 > 0 ? (cashflow / s.zaplatene_30) * 100 : 0;
  return {
    monthRevenue: s.mesiac_obrat,
    prevMonthRevenue: s.minuly_obrat,
    monthRevenueDelta,
    unpaidAmount: s.neuhradene_suma,
    unpaidCount: s.neuhradene_pocet,
    overdueAmount: s.po_splatnosti_suma,
    overdueCount: s.po_splatnosti_pocet,
    cashflow,
    cashflowDelta,
    receivables: s.neuhradene_suma,
    debtorCount: s.dlznikov,
    avgPayDays: s.priemer_dni_uhrady,
    vatOut: s.dph_odvod,
    vatIn: s.dph_odpocet,
    yearIncome: s.prijmy_rok,
    yearExpenses: s.vydavky_rok,
  };
}

/** Obrat dní pohľadávok (DSO) z neuhradených a tržieb za 365 dní. */
export function dsoPrehladu(s: PrehladSuhrn) {
  const days = s.trzby_365 > 0 ? (s.neuhradene_suma / s.trzby_365) * 365 : 0;
  return { days, receivables: s.neuhradene_suma, revenue365: s.trzby_365 };
}

/** Úspešnosť volaní API v percentách; bez volaní 100 %. */
export function apiStatistika(s: PrehladSuhrn) {
  return {
    today: s.api_dnes,
    month: s.api_mesiac,
    successRate: s.api_mesiac > 0 ? (s.api_uspesne / s.api_mesiac) * 100 : 100,
  };
}

/** Miestny dátum RRRR-MM-DD — „dnes“ podľa prehliadača, nie podľa UTC. */
export function miestnyDatum(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${den}`;
}
