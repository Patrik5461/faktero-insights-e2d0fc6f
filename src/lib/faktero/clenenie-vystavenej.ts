/*
  Návrh členenia DPH vystaveného dokladu (faktúra, dobropis, ťarchopis) vo
  formulári — kým doklad nie je uložený a motor automatického účtovania ešte
  nič nenavrhol. Poradie je to isté ako pri uložení a exporte:

    pravidlo automatického účtovania (to isté uplatní spúšťač v databáze)
    → neplatiteľ: „nezahrnovať do priznania“ z režimu dane
    → tuzemské prenesenie: členenie firmy pre prenesenie
    → predvolené členenie firmy (Predkontácie → Predvolené)
    → odvodené z režimu dane (`odvodClenenia`, napr. UD, UDpdp, UNoslob).

  Dobropis a ťarchopis majú to isté členenie ako faktúra — opravujú to isté
  plnenie; do KV ich zaradí `kv-urcenie.ts` (C.1 / D.2).
*/

import { odvodClenenia, type KodCiselnika } from "./auto-uctovanie";

export type ZdrojClenenia = "pravidlo" | "firma" | "rezim";

export function navrhClenenieVystavenej(o: {
  pravidlo?: string | null;
  /** Členenie firmy pre tuzemské prenesenie (`pohoda_clenenie_dph_pdp`). */
  pdpFirmy?: string | null;
  /** Predvolené členenie firmy pre vydané faktúry (`pohoda_clenenie_dph`). */
  predvoleneFirmy?: string | null;
  platitel: boolean;
  krajinaFirmy: string;
  /** Kódy, ktoré firma ponúka (číselník z Pohody alebo základné SK). */
  ciselnik: { kod: string; popis?: string | null; agenda?: string | null }[];
  doklad: {
    opravny?: boolean;
    /** Suma DPH; bez sumy sa predpokladá doklad s DPH. */
    dph?: number | null;
    reverseCharge?: boolean;
    reverseChargeType?: string | null;
    euPlnenie?: string | null;
    osobitnaUprava?: string | null;
    ossKrajina?: string | null;
    partnerIcDph?: string | null;
    partnerKrajina?: string | null;
  };
}): { kod: string; zdroj: ZdrojClenenia } | null {
  const t = (v: unknown) => String(v ?? "").trim();
  if (t(o.pravidlo)) return { kod: t(o.pravidlo), zdroj: "pravidlo" };
  const d = o.doklad;
  const odvodene = () =>
    odvodClenenia(
      {
        smer: "vydane",
        krajinaFirmy: o.krajinaFirmy || "SK",
        firmaPlatitel: o.platitel,
        opravny: Boolean(d.opravny),
        dph: d.dph == null ? 1 : Number(d.dph) || 0,
        reverseCharge: Boolean(d.reverseCharge),
        // Prenesenie bez bližšieho typu je vo formulári tuzemské (§ 69 ods. 12).
        reverseChargeType: d.reverseCharge ? t(d.reverseChargeType) || "domestic_69" : null,
        euPlnenie: d.euPlnenie ?? null,
        osobitnaUprava: d.osobitnaUprava ?? null,
        ossKrajina: d.ossKrajina ?? null,
        partnerIcDph: d.partnerIcDph ?? null,
        partnerKrajina: d.partnerKrajina ?? null,
      },
      o.ciselnik.map(
        (c): KodCiselnika => ({
          druh: "clenenie_dph",
          kod: c.kod,
          popis: c.popis ?? null,
          agenda: c.agenda ?? null,
        }),
      ),
    ).clenenieDph;
  // Neplatiteľ daň nevyčísľuje — predvolené firmy (napr. UD) by doklad dalo do priznania.
  if (!o.platitel) {
    const kod = odvodene();
    return kod ? { kod, zdroj: "rezim" } : null;
  }
  const tuzemskePdp =
    Boolean(d.reverseCharge) && (!t(d.reverseChargeType) || d.reverseChargeType === "domestic_69");
  if (tuzemskePdp && t(o.pdpFirmy)) return { kod: t(o.pdpFirmy), zdroj: "firma" };
  // Predvolené firmy je pre bežné tuzemské plnenie — nie pre prenesenie ani doklad bez DPH.
  const sDph = d.dph == null || Math.abs(Number(d.dph) || 0) >= 0.005;
  if (!d.reverseCharge && sDph && t(o.predvoleneFirmy))
    return { kod: t(o.predvoleneFirmy), zdroj: "firma" };
  const kod = odvodene();
  return kod ? { kod, zdroj: "rezim" } : null;
}
