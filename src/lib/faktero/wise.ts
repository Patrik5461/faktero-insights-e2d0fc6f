/**
 * Prevod dát z Wise do podoby, akú drží Faktero.
 *
 * Oddelené od volania siete naschvál: práve tu sa dá pomýliť v znamienku,
 * v mene alebo v tom, čo je vlastne protistrana — a to sa overuje testom,
 * nie skúšaním naostro s cudzími peniazmi.
 *
 * Dva rozdiely oproti Tatra banke, ktoré určujú celý tvar:
 *
 * - **Wise nemá jeden účet, ale zostatky po menách.** Každá mena je vo Fakteri
 *   samostatný účet; sčítavať ich nemá zmysel a kurz sa nikde nedopočítava.
 * - **Wise nemá IBAN pri každom zostatku.** Účet sa preto rozoznáva podľa
 *   identifikátora zostatku, nie podľa IBAN-u.
 */

export type WiseZostatok = {
  id: number;
  currency: string;
  type?: string;
  name?: string | null;
  amount?: { value: number; currency: string } | null;
  cashAmount?: { value: number; currency: string } | null;
};

export type WisePohyb = {
  type?: string;
  date?: string;
  amount?: { value: number; currency: string } | null;
  totalFees?: { value: number; currency: string } | null;
  details?: {
    type?: string;
    description?: string | null;
    senderName?: string | null;
    recipientName?: string | null;
    paymentReference?: string | null;
  } | null;
  referenceNumber?: string | null;
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

/** Zostatky Wise na účty Faktera. Sporiace („jarmoky") sem nepatria. */
export function ucetZWise(z: WiseZostatok): UcetNaZapis {
  return {
    external_account_id: String(z.id),
    // Wise dáva IBAN až v detaile účtu a nie pre každú menu; radšej nič než
    // vymyslené číslo, podľa ktorého by sa účty zlievali.
    iban: null,
    account_name: z.name?.trim() || `Wise ${z.currency}`,
    currency: z.currency,
    // `cashAmount` je to, čím sa dá naozaj platiť; `amount` obsahuje aj to, čo
    // je zamknuté v investícii.
    balance: Number(z.cashAmount?.value ?? z.amount?.value ?? 0),
  };
}

/** Len bežné zostatky — sporiace nie sú prevádzkový účet. */
export function jeBezny(z: WiseZostatok): boolean {
  return (z.type ?? "STANDARD") === "STANDARD";
}

function dovnutraDatumu(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Variabilný symbol vieme len vtedy, keď je referencia naozaj číslo. */
export function vsZReferencie(ref: string | null | undefined): string | null {
  const cistý = String(ref ?? "").trim();
  if (!/^\d{1,10}$/.test(cistý)) return null;
  return cistý;
}

/**
 * Protistrana pohybu.
 *
 * Wise ju dáva podľa druhu inak: pri prijatej platbe je to odosielateľ, pri
 * odoslanej príjemca, a pri karte nie je vôbec — tam je obchodník len v texte.
 * Vymýšľať ho z popisu by znamenalo, že sa doklady spárujú s nesprávnym
 * obchodníkom, tak radšej ostane prázdny a rozhodne suma s dátumom.
 */
export function protistranaZWise(p: WisePohyb): string | null {
  const d = p.details ?? {};
  const kto = (d.senderName ?? d.recipientName ?? "").trim();
  return kto || null;
}

/**
 * Pohyb Wise na pohyb Faktera. `null` znamená, že sa zapísať nedá — bez dátumu
 * alebo bez sumy by v banke visel riadok, ktorý nič nehovorí.
 *
 * Suma sa berie tak, ako ju dáva Wise: záporná pri odchode peňazí. Poplatok je
 * v nej už zahrnutý (`totalFees` je len rozpis), takže sa nikde neodpočítava
 * druhýkrát.
 */
export function pohybZWise(p: WisePohyb, balanceId: string): PohybNaZapis | null {
  const den = dovnutraDatumu(p.date);
  const suma = Number(p.amount?.value);
  if (!den || !Number.isFinite(suma)) return null;

  const popis = (p.details?.description ?? "").trim() || null;
  return {
    // Referencia Wise je jedinečná v rámci účtu; s účtom pred ňou sa nezrazí
    // s pohybom z iného zostatku.
    external_id: `${balanceId}:${p.referenceNumber ?? `${den}:${suma}:${popis ?? ""}`}`,
    booking_date: den,
    amount: suma,
    currency: p.amount?.currency ?? "EUR",
    variable_symbol: vsZReferencie(p.details?.paymentReference),
    counterparty: protistranaZWise(p),
    description: popis,
  };
}

/** Celý výpis na pohyby. Nezapísateľné riadky sa ticho vynechajú. */
export function pohybyZVypisu(
  vypis: { transactions?: WisePohyb[] } | null | undefined,
  balanceId: string,
): PohybNaZapis[] {
  return (vypis?.transactions ?? [])
    .map((p) => pohybZWise(p, balanceId))
    .filter((p): p is PohybNaZapis => p !== null);
}

/**
 * Okno výpisu. Wise pustí naraz najviac rok, tak sa berie rok dozadu — dlhšiu
 * históriu si človek dotiahne opakovaným spustením.
 */
export function oknoVypisu(teraz: Date = new Date()): { od: string; do: string } {
  const doKedy = new Date(teraz);
  const od = new Date(teraz);
  od.setUTCFullYear(od.getUTCFullYear() - 1);
  od.setUTCDate(od.getUTCDate() + 1);
  return { od: od.toISOString(), do: doKedy.toISOString() };
}
