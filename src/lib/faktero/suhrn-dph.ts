/*
  Súčty dokladov so základom dane, DPH a celkovou sumou — po menách a po
  sadzbách DPH (P-1007). Lišta pod zoznamom ich ukazuje za označené doklady
  aj za celý vyfiltrovaný zoznam.

  Za filter ich počíta databáza (`suhrn_vystavenych_faktur`), lebo zoznam
  vystavených faktúr je stránkovaný na serveri. Za výber sa rátajú tu, z
  načítaných riadkov a ich položiek. Pravidlá musia byť v oboch rovnaké:

  - stornovaná faktúra sa nepočíta nikdy;
  - koncept len v záložke Koncepty (inak by do obratu vošlo, čo ešte nie je doklad);
  - zálohová faktúra a daňový doklad k prijatej platbe len vo vlastnej
    záložke — v spoločnom zozname by sa to isté plnenie zrátalo druhýkrát;
  - dobropis odpočítava (`znamienkoDokladu` otáča len kladne uložený);
  - meny sa nesčítavajú.
*/
import { znamienkoDokladu } from "./faktury-sumy";
import { sumyPoMenach, jeMimoSuctu, type PolozkaSuhrnu } from "./suhrn-vyberu";

export type SadzbaSuhrnu = {
  /** Sadzba DPH v percentách; `null` = prenesenie (pdp) alebo doklad bez položiek. */
  sadzba: number | null;
  /** Prenesenie daňovej povinnosti — DPH na doklade nie je. */
  pdp: boolean;
  zaklad: number;
  dph: number;
  celkom: number;
};

export type MenaSuhrnu = {
  mena: string;
  pocet: number;
  /** `null`, keď niektorému dokladu suma bez DPH chýba (prijaté, bločky). */
  zaklad: number | null;
  dph: number | null;
  celkom: number;
  sadzby: SadzbaSuhrnu[];
};

export type SuhrnDph = {
  /** Koľko dokladov do súčtu vstúpilo spolu s tými mimo neho. */
  pocet: number;
  /** Koľko z nich sa nepočíta (storno, zálohová, koncept…). */
  mimo: number;
  meny: MenaSuhrnu[];
};

/** Čo zoznam práve ukazuje — podľa toho sa rozhodne o zálohových a konceptoch. */
export type KontextSuctu = {
  /** Filter typu zoznamu (`invoices.type`); `null` = všetky typy. */
  typy?: string[] | null;
  /** Filter stavu zoznamu; `draft` = záložka Koncepty. */
  status?: string | null;
};

export type HlavickaVystavenej = {
  id?: string;
  type?: string | null;
  status?: string | null;
  currency?: string | null;
  subtotal?: number | string | null;
  vat_total?: number | string | null;
  total?: number | string | null;
  reverse_charge?: boolean | null;
  deleted_at?: string | null;
};

export type PolozkaVystavenej = {
  vat_rate?: number | string | null;
  subtotal?: number | string | null;
  vat_amount?: number | string | null;
};

const MIMO_SPOLOCNEHO = new Set(["proforma", "advance_payment"]);

const cislo = (h: unknown): number => {
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const menaDokladu = (m: unknown) => String(m || "EUR").toUpperCase();

/** Vstúpi doklad do súčtu v zozname s daným filtrom? (rovnako ako SQL `zapocitane`) */
export function zapocitatVoZozname(r: HlavickaVystavenej, k: KontextSuctu = {}): boolean {
  if (r.deleted_at) return false;
  if (r.status === "cancelled") return false;
  if (r.status === "draft" && k.status !== "draft") return false;
  const typ = String(r.type ?? "");
  if (MIMO_SPOLOCNEHO.has(typ)) return k.typy?.length === 1 && k.typy[0] === typ;
  return true;
}

/**
 * Rozpis jedného dokladu po sadzbách z jeho položiek, dorovnaný na hlavičku.
 * Zľava na celý doklad je len v hlavičke — riadky ju nemajú, preto sa
 * základy aj dane riadkov prenásobia pomerom hlavičky k súčtu riadkov.
 * Doklad bez položiek ide celý do riadku bez sadzby.
 */
export function rozpisDokladu(
  h: HlavickaVystavenej,
  polozky: PolozkaVystavenej[] = [],
): Omit<SadzbaSuhrnu, "celkom">[] {
  const pdp = !!h.reverse_charge;
  const zaklad = cislo(h.subtotal);
  const dph = cislo(h.vat_total);
  if (!polozky.length) return [{ sadzba: null, pdp, zaklad, dph }];
  const po = new Map<string, { sadzba: number | null; zaklad: number; dph: number }>();
  for (const p of polozky) {
    const sadzba = pdp || p.vat_rate == null || p.vat_rate === "" ? null : cislo(p.vat_rate);
    const k = String(sadzba);
    const s = po.get(k) ?? { sadzba, zaklad: 0, dph: 0 };
    s.zaklad += cislo(p.subtotal);
    s.dph += cislo(p.vat_amount);
    po.set(k, s);
  }
  const spoluZ = [...po.values()].reduce((a, s) => a + s.zaklad, 0);
  const spoluD = [...po.values()].reduce((a, s) => a + s.dph, 0);
  return [...po.values()].map((s) => ({
    sadzba: s.sadzba,
    pdp: pdp && s.sadzba == null,
    zaklad: spoluZ !== 0 ? (s.zaklad * zaklad) / spoluZ : s.zaklad,
    dph: spoluD !== 0 ? (s.dph * dph) / spoluD : s.dph,
  }));
}

/** Poradie sadzieb: najvyššia hore, prenesenie a doklady bez rozpisu na koniec. */
function zoradSadzby(a: SadzbaSuhrnu, b: SadzbaSuhrnu): number {
  if (a.pdp !== b.pdp) return a.pdp ? 1 : -1;
  if (a.sadzba == null) return b.sadzba == null ? 0 : 1;
  if (b.sadzba == null) return -1;
  return b.sadzba - a.sadzba;
}

/** Poradie mien: EUR prvé, potom podľa počtu dokladov. */
function zoradMeny(a: MenaSuhrnu, b: MenaSuhrnu): number {
  if ((a.mena === "EUR") !== (b.mena === "EUR")) return a.mena === "EUR" ? -1 : 1;
  return b.pocet - a.pocet || a.mena.localeCompare(b.mena);
}

/** Súčet vystavených dokladov (výber) — tie isté pravidlá ako databáza za filter. */
export function suhrnVystavenych(
  doklady: (HlavickaVystavenej & { polozky?: PolozkaVystavenej[] })[],
  k: KontextSuctu = {},
): SuhrnDph {
  const meny = new Map<
    string,
    {
      pocet: number;
      zaklad: number;
      dph: number;
      celkom: number;
      sadzby: Map<string, SadzbaSuhrnu>;
    }
  >();
  let zapocitanych = 0;
  for (const d of doklady) {
    if (!zapocitatVoZozname(d, k)) continue;
    zapocitanych++;
    const mena = menaDokladu(d.currency);
    const zn = znamienkoDokladu(d.type, d.total);
    const m = meny.get(mena) ?? { pocet: 0, zaklad: 0, dph: 0, celkom: 0, sadzby: new Map() };
    m.pocet++;
    m.zaklad += zn * cislo(d.subtotal);
    m.dph += zn * cislo(d.vat_total);
    m.celkom += zn * cislo(d.total);
    for (const c of rozpisDokladu(d, d.polozky)) {
      const kluc = `${c.sadzba}|${c.pdp}`;
      const s = m.sadzby.get(kluc) ?? {
        sadzba: c.sadzba,
        pdp: c.pdp,
        zaklad: 0,
        dph: 0,
        celkom: 0,
      };
      s.zaklad += zn * c.zaklad;
      s.dph += zn * c.dph;
      m.sadzby.set(kluc, s);
    }
    meny.set(mena, m);
  }
  return {
    pocet: doklady.length,
    mimo: doklady.length - zapocitanych,
    meny: [...meny.entries()]
      .map(([mena, m]) => ({
        mena,
        pocet: m.pocet,
        zaklad: r2(m.zaklad),
        dph: r2(m.dph),
        celkom: r2(m.celkom),
        sadzby: [...m.sadzby.values()]
          .map((s) => ({
            ...s,
            zaklad: r2(s.zaklad),
            dph: r2(s.dph),
            celkom: r2(s.zaklad + s.dph),
          }))
          .sort(zoradSadzby),
      }))
      .sort(zoradMeny),
  };
}

/** Odpoveď `suhrn_vystavenych_faktur` v tvare pre lištu — čísla z JSON-u môžu prísť ako text. */
export function normalizujSuhrn(json: unknown): SuhrnDph {
  const o = (json ?? {}) as Record<string, any>;
  const meny = Array.isArray(o.meny) ? o.meny : [];
  return {
    pocet: cislo(o.pocet),
    mimo: cislo(o.mimo),
    meny: meny
      .map((m: any) => ({
        mena: menaDokladu(m?.mena),
        pocet: cislo(m?.pocet),
        zaklad: m?.zaklad == null ? null : cislo(m.zaklad),
        dph: m?.dph == null ? null : cislo(m.dph),
        celkom: cislo(m?.celkom),
        sadzby: (Array.isArray(m?.sadzby) ? m.sadzby : [])
          .map((s: any) => ({
            sadzba: s?.sadzba == null ? null : cislo(s.sadzba),
            pdp: !!s?.pdp,
            zaklad: cislo(s?.zaklad),
            dph: cislo(s?.dph),
            celkom: cislo(s?.celkom),
          }))
          .sort(zoradSadzby),
      }))
      .sort(zoradMeny),
  };
}

/**
 * Súčet z riadkov prijatých faktúr, bločkov či Nespracovaných (`PolozkaSuhrnu`).
 * Rozpis po sadzbách tieto doklady v zozname nemajú — len základ a DPH spolu.
 */
export function suhrnZPoloziek(polozky: PolozkaSuhrnu[]): SuhrnDph {
  const pocty = new Map<string, number>();
  for (const p of polozky) {
    if (jeMimoSuctu(p)) continue;
    const mena = menaDokladu(p.mena);
    pocty.set(mena, (pocty.get(mena) ?? 0) + 1);
  }
  const mimo = polozky.filter(jeMimoSuctu).length;
  return {
    pocet: polozky.length,
    mimo,
    meny: sumyPoMenach(polozky)
      .map((s) => ({
        mena: s.mena,
        pocet: pocty.get(s.mena) ?? 0,
        zaklad: s.bezDph,
        dph: s.bezDph == null ? null : r2(s.celkom - s.bezDph),
        celkom: s.celkom,
        sadzby: [],
      }))
      .sort(zoradMeny),
  };
}

/** Rozpis po sadzbách má zmysel len pri viac ako jednej sadzbe v mene. */
export function maRozneSadzby(m: MenaSuhrnu): boolean {
  return m.sadzby.length > 1;
}
