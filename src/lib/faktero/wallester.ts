/**
 * Prevod dát z Wallesteru do podoby, akú drží Faktero.
 *
 * Wallester nie je banka s IBAN-om, ale vydavateľ platobných kariet: účet je
 * kartový účet v jednej mene a pohyby sú platby kartou. Pre knihu bánk je to
 * ten istý tvar ako pri ostatných — a pre párovanie dokladov je to dokonca
 * najlepší zdroj, aký môže byť: bloček z obchodu má oproti sebe platbu s menom
 * toho istého obchodníka.
 *
 * **Znamienko sumy si odvodzujeme sami.** Ich rozhranie hovorí, že
 * `account_amount` je „Account amount", a nikde neuvádza, či je nákup záporný.
 * Spoliehať sa na to, čo príde, by znamenalo tipovať; preto sa smer berie
 * z druhu transakcie, kde je jednoznačný, a suma sa použije v absolútnej
 * hodnote. Pri druhu `Other` sa znamienko nechá tak, ako prišlo — tam sa nedá
 * povedať nič lepšie.
 */

export type WallesterUcet = {
  id: string;
  name?: string | null;
  currency_code?: string | null;
  available_amount?: number | null;
  balance?: number | null;
  is_main?: boolean | null;
};

export type WallesterPohyb = {
  id?: string | null;
  group?: string | null;
  account_amount?: number | null;
  account_currency_code?: string | null;
  merchant_name?: string | null;
  merchant_city?: string | null;
  processed_at?: string | null;
  created_at?: string | null;
  purchase_date?: string | null;
  is_failed?: boolean | null;
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

/** Druhy, ktoré peniaze z účtu uberajú. */
const ODCHOD = new Set(["Purchase", "InternetPurchase", "Withdraw"]);
/** Druhy, ktoré peniaze pridávajú. */
const PRICHOD = new Set(["Deposit", "Refund"]);

export function ucetZWallesteru(u: WallesterUcet): UcetNaZapis {
  return {
    external_account_id: String(u.id),
    // Kartový účet IBAN nemá; vymyslený by zlieval účty dokopy.
    iban: null,
    account_name: u.name?.trim() || `Wallester ${u.currency_code ?? ""}`.trim(),
    currency: u.currency_code ?? "EUR",
    // Disponibilná suma je to, čím sa dá platiť — rovnako ako pri ostatných bankách.
    balance: Number(u.available_amount ?? u.balance ?? 0),
  };
}

function den(p: WallesterPohyb): string | null {
  for (const kandidat of [p.processed_at, p.purchase_date, p.created_at]) {
    if (!kandidat) continue;
    const t = Date.parse(kandidat);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Suma so správnym znamienkom podľa druhu transakcie. */
export function sumaPohybu(p: WallesterPohyb): number | null {
  const raw = Number(p.account_amount);
  if (!Number.isFinite(raw)) return null;
  const skupina = String(p.group ?? "");
  if (ODCHOD.has(skupina)) return -Math.abs(raw);
  if (PRICHOD.has(skupina)) return Math.abs(raw);
  return raw;
}

/**
 * Pohyb Wallesteru na pohyb Faktera. `null` znamená, že sa zapísať nedá.
 *
 * Neúspešné transakcie sa vynechávajú: peniaze sa nepohli a v knihe bánk by
 * boli riadok, ktorý sa nikdy nespáruje s ničím.
 */
export function pohybZWallesteru(p: WallesterPohyb): PohybNaZapis | null {
  if (p.is_failed) return null;
  const datum = den(p);
  const suma = sumaPohybu(p);
  if (!datum || suma === null || !p.id) return null;

  const obchodnik = p.merchant_name?.trim() || null;
  const mesto = p.merchant_city?.trim() || null;
  return {
    external_id: String(p.id),
    booking_date: datum,
    amount: suma,
    currency: p.account_currency_code ?? "EUR",
    // Karta variabilný symbol nemá — dopisovať ho odniekiaľ by bola nepravda.
    variable_symbol: null,
    counterparty: obchodnik,
    description: [obchodnik, mesto].filter(Boolean).join(", ") || null,
  };
}

export function pohybyZWallesteru(pohyby: WallesterPohyb[] | null | undefined): PohybNaZapis[] {
  return (pohyby ?? []).map(pohybZWallesteru).filter((p): p is PohybNaZapis => p !== null);
}

/** Okno sťahovania. Rok dozadu, rovnako ako pri ostatných napojeniach. */
export function oknoPohybov(teraz: Date = new Date()): { od: string; do: string } {
  const od = new Date(teraz);
  od.setUTCFullYear(od.getUTCFullYear() - 1);
  return { od: od.toISOString().slice(0, 10), do: teraz.toISOString().slice(0, 10) };
}
