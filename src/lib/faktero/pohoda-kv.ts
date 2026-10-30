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
  výkazy Faktera (`kv-clenenie.ts`, `dph-vykazy.ts`). Česká Pohoda element
  nemá (kontrolné hlásenie si odvodí z členenia DPH).
*/

import { KV_PDP_PRIJATE, KV_PDP_VYDANE } from "./pohoda-kontrola";
import { jeNezahrnovat } from "./uctovanie-agenda";

/** Ručne zvolené členenie: „X“ (nezahŕňať) = nič, prázdne = automaticky (null). */
function rucne(kod: unknown): string | null {
  const k = String(kod ?? "").trim();
  if (!k) return null;
  return k.toUpperCase() === "X" ? "" : k;
}

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
  /** Členenie DPH dokladu — „nezahrnovať do priznania“ (UN) do KV nepatrí. */
  clenenieDph?: string | null;
}): string {
  if (o.cz || o.typ === "proforma") return "";
  const r = rucne(o.kvDokladu);
  if (r !== null) return r;
  const opravny = o.typ === "credit_note" || o.typ === "debit_note";
  // C.1 — opravná faktúra, aj k tuzemskému preneseniu (oprava A.2), ako výkazy Faktera.
  if (opravny && (o.tuzemskePdp || (!o.reverseCharge && o.maDph))) return "C1";
  // A.2 — tuzemské prenesenie (dodávateľ uvádza aj bez dane).
  if (o.tuzemskePdp) return KV_PDP_VYDANE;
  if (jeNezahrnovat(o.clenenieDph)) return "";
  // Oslobodené dodanie do EÚ a vývoz do KV nepatria — ani ich oprava.
  if (o.reverseCharge || opravny) return "";
  if (!o.maDph) return "";
  const p = rucne(o.predvolene);
  if (p !== null) return p;
  // A.1 len pre odberateľa platiteľa (IČ DPH); ostatné vydané faktúry sú D.2.
  return String(o.icDphOdberatela ?? "").trim() ? "A1" : "D2";
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
  const r = rucne(o.kvDokladu);
  if (r !== null) return r;
  if (jeNezahrnovat(o.clenenieDph)) return "";
  if (o.pdp) return KV_PDP_PRIJATE;
  // Dovoz ide len do priznania; nadobudnutie z EÚ samozdaní interný doklad (B.1).
  if (o.rezim === "dovoz" || o.rezim === "nadobudnutie" || o.rezim === "bez_dane") return "";
  if (!o.maDph) return "";
  // C.2 aj bez nároku na odpočet (odpočítaná daň je vtedy nula) — ako výkazy Faktera.
  if (o.dobropis) return "C2";
  // Bez nároku na odpočet sa faktúra do B.2/B.3 neuvádza.
  if (o.odpocet === false) return "";
  const p = rucne(o.predvolene);
  if (p !== null) return p;
  return o.blocek ? "B3" : "B2";
}
