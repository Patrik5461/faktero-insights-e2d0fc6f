/**
 * Čísla za mesiac na Prehľade appky — Tržby, Náklady, DPH, Neuhradené.
 *
 * Počíta sa tými istými pravidlami ako nástenka na webe (`faktury-sumy`):
 * koncept, zrušená a zálohová faktúra nie sú tržba, dobropis odpočítava.
 * Nič sa neodhaduje — kde sa číslo nedá spočítať presne, vráti sa `null`
 * a appka ho vynechá:
 *
 * - doklad v cudzej mene bez prepočtu (`*_eur` = domáca mena firmy) by sa
 *   musel sčítať „koruna za euro" — taký súčet je nepravda, nie číslo;
 * - DPH má zmysel len u platiteľa; neplatiteľ by videl nulu, ktorá vyzerá
 *   ako „nič neodvádzam" aj tam, kde to neplatí.
 *
 * DPH je daň z vystavených faktúr mesiaca (na výstupe), nie výsledok priznania
 * — odpočet z prijatých dokladov tu zámerne nie je, ten má vlastné pravidlá
 * (pomer, nárok, kontrola bločkov) a počíta sa vo výkazoch DPH na webe.
 */
import { jeOtvorena, jeZapocitatelny, znamienkoDokladu } from "@/lib/faktero/faktury-sumy";

export type FakturaMesiaca = {
  type: string | null;
  status: string | null;
  currency: string | null;
  total: number | string | null;
  subtotal: number | string | null;
  vat_total: number | string | null;
  total_eur?: number | string | null;
  subtotal_eur?: number | string | null;
  vat_total_eur?: number | string | null;
  paid_at?: string | null;
  deleted_at?: string | null;
};

export type PrijataMesiaca = {
  type: string | null;
  status: string | null;
  currency: string | null;
  amount_without_vat: number | string | null;
  amount_without_vat_eur?: number | string | null;
  deleted_at?: string | null;
};

export type BlocekMesiaca = {
  currency: string | null;
  net_amount: number | string | null;
  total_amount: number | string | null;
  vat_amount: number | string | null;
};

export type CislaMesiaca = {
  /** Tržby bez DPH. */
  trzby: number | null;
  /** Náklady bez DPH — prijaté faktúry a bločky. */
  naklady: number | null;
  /** DPH z vystavených faktúr; `null` u neplatiteľa. */
  dph: number | null;
  /** Koľko z faktúr vystavených tento mesiac ešte nie je uhradené (s DPH). */
  neuhradene: number | null;
  mena: string;
};

/** Prvý deň mesiaca a prvý deň nasledujúceho — `od <= dátum < do`. */
export function hraniceMesiaca(dnes = new Date()): { od: string; do: string } {
  const r = dnes.getFullYear();
  const m = dnes.getMonth();
  const iso = (rok: number, mesiac: number) =>
    `${rok + Math.floor(mesiac / 12)}-${String((mesiac % 12) + 1).padStart(2, "0")}-01`;
  return { od: iso(r, m), do: iso(r, m + 1) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hodnota poľa v domácej mene. `undefined` znamená „nedá sa" — doklad je
 * v cudzej mene a prepočet chýba.
 */
function vDomacej(
  mena: string | null,
  domaca: string,
  hodnota: unknown,
  prepocet: unknown,
): number | undefined {
  if ((mena || domaca) === domaca) return Number(hodnota ?? 0) || 0;
  if (prepocet == null || prepocet === "") return undefined;
  return Number(prepocet) || 0;
}

/** Súčet cez doklady; jediný doklad bez prepočtu zhodí celý súčet na `null`. */
function sucet<T>(doklady: T[], hodnota: (d: T) => number | undefined): number | null {
  let s = 0;
  for (const d of doklady) {
    const v = hodnota(d);
    if (v === undefined) return null;
    s += v;
  }
  return r2(s);
}

export function spocitajMesiac({
  faktury,
  prijate,
  blocky,
  domaca,
  platitelDph,
}: {
  /** Faktúry s dátumom vystavenia v mesiaci. */
  faktury: FakturaMesiaca[];
  /** Prijaté faktúry s dátumom dodania (inak vystavenia) v mesiaci. */
  prijate: PrijataMesiaca[];
  /** Bločky a doklady s dátumom vystavenia v mesiaci. */
  blocky: BlocekMesiaca[];
  domaca: string;
  platitelDph: boolean;
}): CislaMesiaca {
  const zapocitatelne = faktury.filter((f) => jeZapocitatelny(f));

  const trzby = sucet(zapocitatelne, (f) => {
    const v = vDomacej(f.currency, domaca, f.subtotal, f.subtotal_eur);
    return v === undefined ? v : znamienkoDokladu(f.type, f.total) * v;
  });

  /*
    DPH na výstupe patrí aj daňovému dokladu k prijatej platbe — povinnosť
    vzniká už platbou (`jeZapocitatelny` ho z obratu vyraďuje, z dane nie).
  */
  const sDph = faktury.filter(
    (f) =>
      jeZapocitatelny(f) ||
      (f.type === "advance_payment" &&
        !f.deleted_at &&
        f.status !== "draft" &&
        f.status !== "cancelled"),
  );
  const dph = platitelDph
    ? sucet(sDph, (f) => {
        const v = vDomacej(f.currency, domaca, f.vat_total, f.vat_total_eur);
        return v === undefined ? v : znamienkoDokladu(f.type, f.total) * v;
      })
    : null;

  const neuhradene = sucet(
    faktury.filter((f) => jeOtvorena(f)),
    (f) => vDomacej(f.currency, domaca, f.total, f.total_eur),
  );

  /* Prijatá zálohová faktúra nie je náklad — zúčtuje ju až ostrá faktúra. */
  const naNaklady = prijate.filter(
    (p) => !p.deleted_at && p.type !== "proforma" && p.status !== "cancelled",
  );
  const zPrijatych = sucet(naNaklady, (p) => {
    const v = vDomacej(p.currency, domaca, p.amount_without_vat, p.amount_without_vat_eur);
    return v === undefined ? v : znamienkoDokladu(p.type, p.amount_without_vat) * v;
  });
  /* Bloček prepočet na domácu menu nemá — v cudzej mene sa sčítať nedá. */
  const zBlockov = sucet(blocky, (b) => {
    if ((b.currency || domaca) !== domaca) return undefined;
    if (b.net_amount != null && b.net_amount !== "") return Number(b.net_amount) || 0;
    return (Number(b.total_amount ?? 0) || 0) - (Number(b.vat_amount ?? 0) || 0);
  });
  const naklady = zPrijatych === null || zBlockov === null ? null : r2(zPrijatych + zBlockov);

  return { trzby, naklady, dph, neuhradene, mena: domaca };
}
