import { normVs } from "./parovanie";

/**
 * Prevod dát z Revolut Business do podoby, akú drží Faktero.
 *
 * Jeden rozdiel oproti ostatným bankám riadi celý tento súbor: **transakcia
 * v Revolute nie je jeden riadok, ale má „nohy"** (`legs`). Prevod medzi
 * vlastnými menami je jediná transakcia s dvoma nohami — z jedného účtu odíde,
 * na druhý príde. Do knihy bánk preto nepatrí transakcia, ale tá jej noha,
 * ktorá sa dotýka daného účtu; inak by sa výmena eur za doláre zapísala raz
 * a jeden z účtov by o nej nevedel.
 *
 * Suma na nohe už znamienko má — Revolut ho dáva správne, na rozdiel od
 * Wallesteru netreba nič odvodzovať.
 */

export type RevolutUcet = {
  id: string;
  name?: string | null;
  balance?: number | null;
  currency?: string | null;
  state?: string | null;
  public?: boolean | null;
};

export type RevolutNoha = {
  leg_id: string;
  account_id: string;
  amount: number;
  currency: string;
  description?: string | null;
  balance?: number | null;
};

export type RevolutTransakcia = {
  id: string;
  type?: string | null;
  state?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  reference?: string | null;
  legs?: RevolutNoha[] | null;
  merchant?: { name?: string | null; city?: string | null } | null;
};

export type UcetNaZapis = {
  external_account_id: string;
  iban: string | null;
  account_name: string | null;
  currency: string;
  balance: number;
};

export type PohybNaZapis = {
  external_id: string;
  booking_date: string;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export function ucetZRevolutu(u: RevolutUcet): UcetNaZapis {
  return {
    external_account_id: String(u.id),
    // IBAN dáva Revolut až v detaile účtu a nie pre každú menu; radšej nič než
    // vymyslené číslo, podľa ktorého by sa účty zlievali.
    iban: null,
    account_name: u.name?.trim() || `Revolut ${u.currency ?? ""}`.trim(),
    currency: u.currency ?? "EUR",
    balance: Number(u.balance ?? 0),
  };
}

/** Účet, ktorý je zrušený, do knihy bánk nepatrí. */
export function jeZivy(u: RevolutUcet): boolean {
  return (u.state ?? "active") === "active";
}

function den(t: RevolutTransakcia): string | null {
  for (const kandidat of [t.completed_at, t.created_at]) {
    if (!kandidat) continue;
    const ms = Date.parse(kandidat);
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Protistrana.
 *
 * Pri platbe kartou je to obchodník — presne ten údaj, podľa ktorého sa dá
 * doklad spárovať s platbou. Pri prevode je meno v popise nohy a vyberať ho
 * z vety by znamenalo hádať, tak sa nechá popis a protistrana ostane prázdna.
 */
export function protistranaZRevolutu(t: RevolutTransakcia): string | null {
  return t.merchant?.name?.trim() || null;
}

/**
 * Nohy transakcie na pohyby jedného účtu.
 *
 * Nezaúčtované stavy sa vynechávajú: peniaze sa ešte nepohli a v knihe bánk by
 * z nich bol riadok, ktorý sa nikdy nespáruje.
 */
export function pohybyZTransakcie(t: RevolutTransakcia, accountId: string): PohybNaZapis[] {
  if ((t.state ?? "") !== "completed") return [];
  const datum = den(t);
  if (!datum) return [];

  const obchodnik = protistranaZRevolutu(t);
  const mesto = t.merchant?.city?.trim() || null;
  const vs = normVs(t.reference);

  return (t.legs ?? [])
    .filter((n) => n.account_id === accountId && Number.isFinite(Number(n.amount)))
    .map((n) => ({
      // Nie samotné `id` transakcie: pri výmene mien by mali obe nohy rovnaký
      // identifikátor a druhá by sa zahodila ako duplicita.
      external_id: `${t.id}:${n.leg_id}`,
      booking_date: datum,
      amount: Number(n.amount),
      currency: n.currency ?? "EUR",
      // Variabilný symbol len keď je referencia naozaj číslo.
      variable_symbol: vs.length >= 3 && vs.length <= 10 ? vs : null,
      counterparty: obchodnik,
      description:
        [obchodnik, mesto].filter(Boolean).join(", ") ||
        n.description?.trim() ||
        t.reference?.trim() ||
        null,
    }));
}

export function pohybyZRevolutu(
  transakcie: RevolutTransakcia[] | null | undefined,
  accountId: string,
): PohybNaZapis[] {
  return (transakcie ?? []).flatMap((t) => pohybyZTransakcie(t, accountId));
}

/** Okno sťahovania. Rok dozadu, rovnako ako pri ostatných napojeniach. */
export function oknoPohybov(teraz: Date = new Date()): { od: string; do: string } {
  const od = new Date(teraz);
  od.setUTCFullYear(od.getUTCFullYear() - 1);
  return { od: od.toISOString().slice(0, 10), do: teraz.toISOString().slice(0, 10) };
}
