/*
  Členenie kontrolného výkazu DPH (`classificationKVDPH`) pre slovenskú Pohodu.

  Príručka POHODA SK (8.2 Kontrolný výkaz DPH,
  https://www.stormware.sk/prirucka-pohoda-online/Dan_z_pridanej_hodnoty/Kontrolny_vykaz_DPH/):
  „Do kontrolného výkazu vstupujú doklady, ktoré … majú priradené príslušné
  členenie KV DPH v poli Členenie KV DPH“ a „Ak doklad nemá vstupovať do
  kontrolného výkazu, pole členenie KV DPH nevypĺňajte.“ Prázdne pole teda
  neznamená „Pohoda si ho odvodí“, ale „do KV nepatrí“ — doklad bez členenia
  by z kontrolného výkazu v Pohode ticho vypadol. Schéma (invoice.xsd)
  predvolenú hodnotu pre `classificationKVDPH` neuvádza.

  Preto sa členenie posiela vždy, keď doklad do KV patrí: ručne zvolené,
  inak predvolené firmy, inak to, čo určuje zákon — rovnako ako ho skladajú
  výkazy Faktera (`kv-urcenie.ts`). Česká Pohoda element
  nemá (kontrolné hlásenie si odvodí z členenia DPH).
*/

import { kvPrijatehoDokladu, kvVystavenehoDokladu } from "./kv-urcenie";

/*
  Samotné pravidlá sú v `kv-urcenie.ts` — tie isté používa výkaz Faktera.
  Tu sa pridáva len to, čo je osobitné pre Pohodu: česká Pohoda element nemá.
*/

/**
 * Vystavený doklad (faktúra, dobropis, vrubopis, daňový doklad k platbe).
 * Zálohová faktúra do KV nepatrí (nie je daňový doklad).
 */
export function kvVystavenehoPrePohodu(o: {
  cz: boolean;
  /** Typ dokladu vo Fakteri (`regular`, `credit_note`, `debit_note`, `proforma`, `advance_payment`). */
  typ: string;
  /** `kv_clenenie` dokladu. */
  kvDokladu?: string | null;
  /** Predvolené KV firmy pre bežnú faktúru (Predkontácie → Predvolené). */
  predvolene?: string | null;
  reverseCharge?: boolean;
  /** Tuzemské prenesenie (§ 69 ods. 12) na celej faktúre. */
  tuzemskePdp?: boolean;
  /** Doklad nesie nenulovú DPH. */
  maDph: boolean;
  /** IČ DPH odberateľa. */
  icDphOdberatela?: string | null;
  /** IČO a DIČ odberateľa — podnikateľ bez IČ DPH ide do A.1, občan do D.2. */
  icoOdberatela?: string | null;
  dicOdberatela?: string | null;
  /** Členenie DPH dokladu — „nezahrnovať do priznania“ (UN) do KV nepatrí. */
  clenenieDph?: string | null;
}): string {
  if (o.cz) return "";
  return kvVystavenehoDokladu(o);
}

/** Prijatý doklad (prijatá faktúra, dobropis, bloček). */
export function kvPrijatehoPrePohodu(o: {
  cz: boolean;
  kvDokladu?: string | null;
  /** Predvolené KV firmy (prijatá faktúra / bloček). */
  predvolene?: string | null;
  blocek: boolean;
  dobropis: boolean;
  /** Celý doklad v prenesení daňovej povinnosti (samozdanenie). */
  pdp: boolean;
  /** `dph_rezim` prijatej faktúry. */
  rezim?: string | null;
  maDph: boolean;
  /** `false` = bez nároku na odpočet. */
  odpocet?: boolean | null;
  /** Členenie DPH dokladu — „nezahrnovať do priznania“ (PN) do KV nepatrí. */
  clenenieDph?: string | null;
}): string {
  if (o.cz) return "";
  // Nadobudnutie z EÚ samozdaní v Pohode interný doklad (B.1), faktúra ide bez členenia.
  return kvPrijatehoDokladu({ ...o, nadobudnutieDoB1: false });
}
