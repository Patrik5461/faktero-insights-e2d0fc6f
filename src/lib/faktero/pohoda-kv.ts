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

/*
  Členenie KV DPH na POLOŽKE dokladu (len SK).

  Pohoda si členenie KV z hlavičky do položiek nevezme — položka bez neho
  v kontrolnom výkaze chýba (pripomienka 5. 11. 2026: bloček OMV, PHM
  50/30/20 %, položky s členením DPH PN mali v Pohode prázdne „Čl.KV DPH“).
  Preto ho nesie každá položka: vlastné, inak zdedené z dokladu.

  Členenie DPH a členenie KV sú v Pohode dve nezávislé polia (príručka
  POHODA SK, Kontrolný výkaz DPH: „Do kontrolného výkazu vstupujú doklady,
  ktoré … majú priradené príslušné členenie KV DPH“; číselník členení DPH
  slovenskej Pohody — PN „Nezahrňovať do priznania DPH“, PB „Tuzemské plnenia
  – bez nároku“ — o KV nehovorí nič). PN na časti dokladu (neodpočítateľná
  časť PHM) teda KV neruší: B.2/B.3 uvádza celý základ a daň dokladu, odpočet
  počíta Pohoda z členenia DPH. Či doklad do KV patrí vôbec, rozhoduje
  hlavička (`kvPrijatehoDokladu`: celý doklad bez odpočtu do B.2/B.3 nepatrí).

  Vedomé výnimky — položka KV nedostane:
   - CZ Pohoda element nemá (kontrolné hlásenie odvodí z členenia DPH);
   - „X“ (nezahŕňať do KV) zvolené na položke alebo na doklade;
   - členenie DPH, ktoré do KV nepatrí z podstaty (`clenenieBezKv`): UN
     (nezahŕňať do priznania pri vystavených), oslobodené plnenia UN…/RN…
     (§ 65, § 67 — do KV sa neuvádzajú); UN§69 je prenesenie (A.2), to nie;
   - nedaňová položka: bez DPH, keď doklad nie je v prenesení (A.2/B.1 sa
     uvádzajú aj bez dane).
*/

/** Členenie DPH, ktoré Pohoda do kontrolného výkazu nezahŕňa. */
export function clenenieBezKv(clenenie: unknown): boolean {
  const k = String(clenenie ?? "").trim();
  if (!k) return false;
  if (/^UN§69/i.test(k)) return false;
  return /^(UN|RN)/.test(k);
}

/** Sekcia KV v prenesení daňovej povinnosti (uvádza sa aj bez dane). */
const kvPrenesenia = (kv: string) => /^(A2|B1|C1|C2B1)/i.test(kv);

export function kvPolozkyPrePohodu(o: {
  cz: boolean;
  /** Vlastné členenie KV položky (ručne, z rozúčtovania). */
  vlastne?: unknown;
  /** Ručné členenie KV dokladu — „X“ vypne KV aj na položkách. */
  rucneDokladu?: unknown;
  /** Kód KV pre položku v prenesení (B1 prijatá, A2 vystavená), ak ním je. */
  pdp?: string | null;
  /** Členenie DPH položky. */
  clenenie?: unknown;
  /** DPH položky. */
  dph?: unknown;
  /** Členenie KV dokladu (hlavičky). */
  zdedene: string;
}): string {
  if (o.cz) return "";
  const vlastne = String(o.vlastne ?? "").trim();
  if (vlastne) return vlastne.toUpperCase() === "X" ? "" : vlastne;
  if (String(o.rucneDokladu ?? "").trim().toUpperCase() === "X") return "";
  if (o.pdp) return o.pdp;
  if (clenenieBezKv(o.clenenie)) return "";
  const zdedene = String(o.zdedene ?? "").trim();
  if (!zdedene || zdedene.toUpperCase() === "X") return "";
  if (Math.abs(Number(o.dph ?? 0)) < 0.005 && !kvPrenesenia(zdedene)) return "";
  return zdedene;
}
