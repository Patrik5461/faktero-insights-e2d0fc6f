/*
  Filtre Zaúčtovanie a Úhrada pre zoznamy prijatých faktúr a prijatých
  zálohových faktúr (`purchase_invoices`) — idú priamo do dotazu, nie len
  v pamäti (strop 1 000 riadkov na požiadavku).

  V adrese:
    ?f[zauct]=ano|nie                 — zaúčtované (`zauctovane_at`)
    ?f[uhrada]=hotovost|karta|prevod  — spôsob úhrady (`payment_method`)

  Prijatá faktúra má kódy z formulára (prevod, hotovost, karta, dobierka,
  inkaso, zaloha, zapocet); z API a starších importov prídu aj anglické
  (bank_transfer, cash, card). Bez spôsobu úhrady sa platí prevodom.
*/

export type FilterUhrady = "hotovost" | "karta" | "prevod";

export const KODY_UHRADY: Record<FilterUhrady, string[]> = {
  hotovost: ["hotovost", "cash"],
  karta: ["karta", "card", "credit_card"],
  prevod: ["prevod", "bank_transfer", "transfer"],
};

export function jeFilterUhrady(v: unknown): v is FilterUhrady {
  return v === "hotovost" || v === "karta" || v === "prevod";
}

/** Podmienka PostgREST `or` pre spôsob úhrady (prevod berie aj prázdny). */
export function podmienkaUhrady(uhrada: FilterUhrady): string {
  const kody = `payment_method.in.(${KODY_UHRADY[uhrada].join(",")})`;
  return uhrada === "prevod" ? `payment_method.is.null,${kody}` : kody;
}

/** Premietne Zaúčtovanie a Úhradu do dotazu Supabase. */
export function pouziFiltrePrijatych<Q>(q: Q, f: { zauct?: string | null; uhrada?: string | null }): Q {
  let d: any = q;
  if (f.zauct === "ano") d = d.not("zauctovane_at", "is", null);
  else if (f.zauct === "nie") d = d.is("zauctovane_at", null);
  if (jeFilterUhrady(f.uhrada)) d = d.or(podmienkaUhrady(f.uhrada));
  return d as Q;
}
