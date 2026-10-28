/**
 * Výnosy a náklady po mesiacoch — sekcia na prehľade firmy.
 *
 * Počíta sa tými istými pravidlami ako zvyšok prehľadu a mobilná appka
 * (`faktury-sumy`, `lib/mobile/cisla-mesiaca`):
 *
 * - koncept, stornovaná, zálohová faktúra a daňový doklad k platbe nie sú
 *   výnos (`jeZapocitatelny`); prijatá zálohová faktúra nie je náklad —
 *   zúčtuje ju až ostrá faktúra;
 * - dobropis odpočítava (`znamienkoDokladu` — v DB je uložený záporne,
 *   otáča sa len kladne uložený starý import);
 * - mesiac: vystavená faktúra podľa dátumu vystavenia, prijatá podľa dátumu
 *   dodania (bez neho vystavenia), bloček podľa dátumu vystavenia — tak ako
 *   dlaždice prehľadu a appka;
 * - cudzia mena cez uložené `*_eur` (nesú domácu menu firmy). Doklad bez
 *   prepočtu sa nesčíta „koruna za euro" — vynechá sa a spočíta do
 *   `bezPrepoctu`, aby to stránka mohla povedať. Bloček prepočet nemá vôbec.
 *
 * Uhradené vs. očakávané: vystavená faktúra je uhradená, keď má stav `paid`
 * alebo dátum úhrady; prijatá, keď má stav `paid`. Bloček je zaplatený na
 * mieste, ide vždy do nákladov. Dobropis ide do tej istej skupiny podľa
 * vlastnej úhrady, takže uhradené + očakávané = všetko vystavené.
 */
import { jeZapocitatelny, znamienkoDokladu } from "@/lib/faktero/faktury-sumy";

export type CislaVN = {
  vynosy: number;
  ocakavaneVynosy: number;
  naklady: number;
  ocakavaneNaklady: number;
};

export type MesiacVN = {
  /** „2026-03" */
  mesiac: string;
  sDph: CislaVN;
  bezDph: CislaVN;
};

export type VynosyNaklady = {
  mena: string;
  od: string;
  do: string;
  mesiace: MesiacVN[];
  /** Doklady v cudzej mene bez prepočtu na domácu menu — v súčtoch nie sú. */
  bezPrepoctu: { faktury: number; prijate: number; blocky: number };
};

export type FakturaVN = {
  type: string | null;
  status: string | null;
  currency: string | null;
  total: number | string | null;
  subtotal: number | string | null;
  total_eur?: number | string | null;
  subtotal_eur?: number | string | null;
  issue_date: string | null;
  paid_at?: string | null;
  deleted_at?: string | null;
};

export type PrijataVN = {
  type: string | null;
  status: string | null;
  currency: string | null;
  amount_total: number | string | null;
  amount_without_vat: number | string | null;
  amount_without_vat_eur?: number | string | null;
  vat_amount_eur?: number | string | null;
  issue_date: string | null;
  delivery_date?: string | null;
  deleted_at?: string | null;
};

export type BlocekVN = {
  currency: string | null;
  net_amount: number | string | null;
  total_amount: number | string | null;
  vat_amount: number | string | null;
  issue_date: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
const prazdne = (): CislaVN => ({ vynosy: 0, ocakavaneVynosy: 0, naklady: 0, ocakavaneNaklady: 0 });

/** Mesiace od–do vrátane, „YYYY-MM". Prázdne pole, ak je `od` po `do`. */
export function mesiaceObdobia(od: string, doDna: string): string[] {
  const [r1, m1] = od.slice(0, 7).split("-").map(Number);
  const [rk, mk] = doDna.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = r1 * 12 + m1 - 1; i <= rk * 12 + mk - 1; i++) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Mesiac, do ktorého prijatá faktúra patrí — dodanie, bez neho vystavenie. */
export function mesiacPrijatej(p: Pick<PrijataVN, "delivery_date" | "issue_date">): string | null {
  const d = p.delivery_date || p.issue_date;
  return d ? d.slice(0, 7) : null;
}

/** Vystavená faktúra je uhradená — stav alebo dátum úhrady. */
export function jeUhradenaVystavena(f: Pick<FakturaVN, "status" | "paid_at">): boolean {
  return f.status === "paid" || !!f.paid_at;
}

/** Prijatá faktúra patrí do nákladov (nie koncept, storno ani záloha). */
export function jeNakladom(p: Pick<PrijataVN, "type" | "status" | "deleted_at">): boolean {
  if (p.deleted_at) return false;
  if (p.status === "draft" || p.status === "cancelled") return false;
  return p.type !== "proforma";
}

/**
 * Sumy faktúry v domácej mene, so znamienkom dobropisu. `null` = cudzia
 * mena bez prepočtu.
 */
export function sumyFaktury(f: FakturaVN, domaca: string): { sDph: number; bezDph: number } | null {
  const z = znamienkoDokladu(f.type, f.total);
  if ((f.currency || domaca) === domaca)
    return { sDph: z * num(f.total), bezDph: z * num(f.subtotal) };
  if (f.total_eur == null || f.total_eur === "") return null;
  const sDph = num(f.total_eur);
  /* Starší doklad môže mať prepočítaný len celok — základ potom tým istým pomerom. */
  const bezDph =
    f.subtotal_eur != null && f.subtotal_eur !== ""
      ? num(f.subtotal_eur)
      : num(f.total) !== 0
        ? (sDph * num(f.subtotal)) / num(f.total)
        : 0;
  return { sDph: z * sDph, bezDph: z * bezDph };
}

/** Sumy prijatej faktúry v domácej mene (ako `prijateNaDomacuMenu` na prehľade). */
export function sumyPrijatej(
  p: PrijataVN,
  domaca: string,
): { sDph: number; bezDph: number } | null {
  if ((p.currency || domaca) === domaca)
    return { sDph: num(p.amount_total), bezDph: num(p.amount_without_vat) };
  if (p.amount_without_vat_eur == null || p.amount_without_vat_eur === "") return null;
  const bez = num(p.amount_without_vat_eur);
  return { sDph: bez + num(p.vat_amount_eur), bezDph: bez };
}

/** Sumy bločku; v cudzej mene `null` — bloček prepočet nemá. */
export function sumyBlocku(b: BlocekVN, domaca: string): { sDph: number; bezDph: number } | null {
  if ((b.currency || domaca) !== domaca) return null;
  const sDph = num(b.total_amount);
  const bezDph =
    b.net_amount != null && b.net_amount !== "" ? num(b.net_amount) : sDph - num(b.vat_amount);
  return { sDph, bezDph };
}

export function spocitajVynosyNaklady({
  faktury,
  prijate,
  blocky,
  domaca,
  od,
  do: doDna,
}: {
  faktury: FakturaVN[];
  prijate: PrijataVN[];
  blocky: BlocekVN[];
  domaca: string;
  od: string;
  do: string;
}): VynosyNaklady {
  const mapa = new Map<string, MesiacVN>();
  for (const m of mesiaceObdobia(od, doDna))
    mapa.set(m, { mesiac: m, sDph: prazdne(), bezDph: prazdne() });
  const bezPrepoctu = { faktury: 0, prijate: 0, blocky: 0 };
  const vObdobi = (d: string | null | undefined) => !!d && d >= od && d <= doDna;

  const pripocitaj = (
    mesiac: string | null,
    pole: keyof CislaVN,
    s: { sDph: number; bezDph: number },
  ) => {
    const b = mesiac ? mapa.get(mesiac) : undefined;
    if (!b) return;
    b.sDph[pole] += s.sDph;
    b.bezDph[pole] += s.bezDph;
  };

  for (const f of faktury) {
    if (!jeZapocitatelny(f) || !vObdobi(f.issue_date)) continue;
    const s = sumyFaktury(f, domaca);
    if (!s) {
      bezPrepoctu.faktury++;
      continue;
    }
    pripocitaj(f.issue_date!.slice(0, 7), jeUhradenaVystavena(f) ? "vynosy" : "ocakavaneVynosy", s);
  }

  for (const p of prijate) {
    if (!jeNakladom(p) || !vObdobi(p.delivery_date || p.issue_date)) continue;
    const s = sumyPrijatej(p, domaca);
    if (!s) {
      bezPrepoctu.prijate++;
      continue;
    }
    pripocitaj(mesiacPrijatej(p), p.status === "paid" ? "naklady" : "ocakavaneNaklady", s);
  }

  for (const b of blocky) {
    if (!vObdobi(b.issue_date)) continue;
    const s = sumyBlocku(b, domaca);
    if (!s) {
      bezPrepoctu.blocky++;
      continue;
    }
    pripocitaj(b.issue_date!.slice(0, 7), "naklady", s);
  }

  const zaokruhli = (c: CislaVN): CislaVN => ({
    vynosy: r2(c.vynosy),
    ocakavaneVynosy: r2(c.ocakavaneVynosy),
    naklady: r2(c.naklady),
    ocakavaneNaklady: r2(c.ocakavaneNaklady),
  });
  const mesiace = [...mapa.values()].map((m) => ({
    mesiac: m.mesiac,
    sDph: zaokruhli(m.sDph),
    bezDph: zaokruhli(m.bezDph),
  }));
  return { mena: domaca, od, do: doDna, mesiace, bezPrepoctu };
}

/** Bilancia uhradeného: výnosy − náklady. */
export function bilancia(c: CislaVN): number {
  return r2(c.vynosy - c.naklady);
}

/** Bilancia vrátane očakávaného: všetko vystavené − všetko prijaté. */
export function bilanciaSOcakavanym(c: CislaVN): number {
  return r2(c.vynosy + c.ocakavaneVynosy - c.naklady - c.ocakavaneNaklady);
}

/** Súčet mesiacov za obdobie. */
export function suctyObdobia(mesiace: MesiacVN[], sDph: boolean): CislaVN {
  const s = prazdne();
  for (const m of mesiace) {
    const c = sDph ? m.sDph : m.bezDph;
    s.vynosy += c.vynosy;
    s.ocakavaneVynosy += c.ocakavaneVynosy;
    s.naklady += c.naklady;
    s.ocakavaneNaklady += c.ocakavaneNaklady;
  }
  return {
    vynosy: r2(s.vynosy),
    ocakavaneVynosy: r2(s.ocakavaneVynosy),
    naklady: r2(s.naklady),
    ocakavaneNaklady: r2(s.ocakavaneNaklady),
  };
}

/** Obdobie z predvoľby; `dnes` pre testy. */
export function obdobiePredvolby(
  predvolba: "rok" | "minuly_rok" | "12_mesiacov",
  dnes = new Date(),
): { od: string; do: string } {
  const r = dnes.getFullYear();
  if (predvolba === "minuly_rok") return { od: `${r - 1}-01-01`, do: `${r - 1}-12-31` };
  if (predvolba === "12_mesiacov") {
    const z = new Date(r, dnes.getMonth() - 11, 1);
    const k = new Date(r, dnes.getMonth() + 1, 0);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { od: iso(z), do: iso(k) };
  }
  return { od: `${r}-01-01`, do: `${r}-12-31` };
}
