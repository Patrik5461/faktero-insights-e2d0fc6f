/*
  Do ktorej časti kontrolného výkazu DPH patrí doklad — jedno pravidlo pre
  výkaz Faktera (`dph-vykazy.ts`) aj pre export do Pohody (`pohoda-kv.ts`),
  aby ten istý doklad nikdy neskončil v dvoch rôznych riadkoch.

  Podľa metodického pokynu FS SR ku kontrolnému výkazu (oddiel 3, časti 3.1.1
  a 3.4.2) a odpovedí FS (podpora.financnasprava.sk, „Údaje o odberateľovi“):
   - A.1 — faktúra, ktorú dodávateľ musel vyhotoviť (§ 72): zdaniteľnej osobe
     alebo právnickej osobe. Odberateľ bez IČ DPH (podnikateľ neplatiteľ,
     občianske združenie) do A.1 patrí tiež, len stĺpec IČ DPH ostane prázdny.
   - D.2 — faktúra nezdaniteľnej fyzickej osobe (občanovi), ktorú vyhotoviť
     nemusel: „Údaje z faktúr vyhotovených pre nezdaniteľnú osobu … sa
     neuvádzajú v časti A.1.“
  Faktero rozozná podnikateľa či právnickú osobu podľa toho, že má na faktúre
  IČ DPH, IČO alebo DIČ; odberateľ bez nich je občan → D.2.

   - B.2 len z faktúry, „z ktorej príjemca plnenia uplatňuje odpočítanie
     dane“ — bez nároku na odpočet alebo s členením DPH „nezahrnovať do
     priznania“ (PN, UN, PNxx) tam nepatrí.

  Výsledok je kód členenia (A1, A2, B1, B2, B3, C1, C2, D1, D2), alebo "" =
  do kontrolného výkazu nepatrí.
*/

import { jeNezahrnovat } from "./uctovanie-agenda";

/** Členenia, ktoré má zmysel ručne zvoliť na vystavenom doklade. */
export const KV_KODY_VYSTAVENE = ["A1", "A2", "C1", "D1", "D2", "X"];

/** Ručne zvolené členenie: „X“ (nezahŕňať) = "", prázdne = automaticky (null). */
export function rucneKv(kod: unknown): string | null {
  const k = String(kod ?? "")
    .trim()
    .toUpperCase();
  if (!k) return null;
  return k === "X" ? "" : k;
}

/** Odberateľ je podnikateľ alebo právnická osoba (má IČ DPH, IČO alebo DIČ). */
export function odberatelPodnikatel(o: {
  icDph?: string | null;
  ico?: string | null;
  dic?: string | null;
}): boolean {
  return [o.icDph, o.ico, o.dic].some((x) => String(x ?? "").trim() !== "");
}

/** Vystavený doklad (faktúra, dobropis, vrubopis, daňový doklad k platbe). */
export type KvVystavenehoVstup = {
  /** Typ dokladu (`regular`, `credit_note`, `debit_note`, `proforma`, `advance_payment`). */
  typ: string;
  /** Opravný doklad aj vtedy, keď typ nie je dobropis (vyplnená pôvodná faktúra). */
  opravny?: boolean;
  /** Ručne zvolené členenie (faktúra alebo položka). */
  kvDokladu?: string | null;
  /** Predvolené KV firmy pre bežnú faktúru (Predkontácie → Predvolené). */
  predvolene?: string | null;
  reverseCharge?: boolean;
  /** Tuzemské prenesenie (§ 69 ods. 12). */
  tuzemskePdp?: boolean;
  /** Doklad nesie nenulovú DPH. */
  maDph: boolean;
  icDphOdberatela?: string | null;
  icoOdberatela?: string | null;
  dicOdberatela?: string | null;
  /** Členenie DPH — „nezahrnovať do priznania“ (UN) do KV nepatrí. */
  clenenieDph?: string | null;
};

export function kvVystavenehoDokladu(o: KvVystavenehoVstup): string {
  // Zálohová faktúra nie je daňový doklad.
  if (o.typ === "proforma") return "";
  const r = rucneKv(o.kvDokladu);
  if (r !== null) return r === "" || KV_KODY_VYSTAVENE.includes(r) ? r : kvAuto(o);
  return kvAuto(o);
}

function kvAuto(o: KvVystavenehoVstup): string {
  const opravny = Boolean(o.opravny) || o.typ === "credit_note" || o.typ === "debit_note";
  const podnikatel = odberatelPodnikatel({
    icDph: o.icDphOdberatela,
    ico: o.icoOdberatela,
    dic: o.dicOdberatela,
  });
  /*
    C.1 — opravná faktúra k A.1 alebo A.2. Oprava faktúry občanovi (tá bola
    v D.2) patrí podľa metodického pokynu (3.3.1) do súhrnu D.2, aj oprava
    podľa § 25a, keď odberateľ nebol zdaniteľnou osobou.
  */
  if (opravny && (o.tuzemskePdp || (!o.reverseCharge && o.maDph)))
    return o.tuzemskePdp || podnikatel ? "C1" : "D2";
  // A.2 — tuzemské prenesenie (dodávateľ uvádza aj bez dane).
  if (o.tuzemskePdp) return "A2";
  if (jeNezahrnovat(o.clenenieDph)) return "";
  // Oslobodené dodanie do EÚ a vývoz do KV nepatria — ani ich oprava.
  if (o.reverseCharge || opravny) return "";
  if (!o.maDph) return "";
  const p = rucneKv(o.predvolene);
  if (p !== null) return p;
  return podnikatel ? "A1" : "D2";
}

/**
 * Ručne zvolené A.1 pri odberateľovi bez IČ DPH, IČO aj DIČ — vyzerá to na
 * občana, ktorého faktúra do A.1 nepatrí (D.2). Vráti text upozornenia alebo null.
 */
export function upozornenieA1(o: {
  kv?: string | null;
  icDph?: string | null;
  ico?: string | null;
  dic?: string | null;
}): string | null {
  if (rucneKv(o.kv) !== "A1") return null;
  if (odberatelPodnikatel(o)) return null;
  return "Faktúra má ručne zvolené členenie KV A.1, ale odberateľ nemá IČ DPH, IČO ani DIČ. Faktúra súkromnej osobe (občanovi) patrí do D.2 — A.1 je len pre podnikateľov a právnické osoby.";
}

/** Prijatý doklad (prijatá faktúra, dobropis, bloček). */
export type KvPrijatehoVstup = {
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
  /** Členenie DPH — „nezahrnovať do priznania“ (PN) do KV nepatrí. */
  clenenieDph?: string | null;
  /**
   * Nadobudnutie tovaru z EÚ: výkaz Faktera ho samozdaní priamo z faktúry
   * (B.1); do Pohody faktúra ide bez členenia, B.1 nesie interný doklad.
   */
  nadobudnutieDoB1?: boolean;
};

export function kvPrijatehoDokladu(o: KvPrijatehoVstup): string {
  const r = rucneKv(o.kvDokladu);
  if (r !== null) return r;
  if (jeNezahrnovat(o.clenenieDph)) return "";
  if (o.pdp) return "B1";
  if (o.rezim === "nadobudnutie") return o.nadobudnutieDoB1 ? "B1" : "";
  // Dovoz ide len do priznania.
  if (o.rezim === "dovoz" || o.rezim === "bez_dane") return "";
  if (!o.maDph) return "";
  // C.2 aj bez nároku na odpočet (odpočítaná daň je vtedy nula).
  if (o.dobropis) return "C2";
  // Bez nároku na odpočet sa faktúra do B.2/B.3 neuvádza.
  if (o.odpocet === false) return "";
  const p = rucneKv(o.predvolene);
  if (p !== null) return p;
  return o.blocek ? "B3" : "B2";
}

/**
 * Členenie DPH prijatého dokladu tak, ako ide do Pohody: vlastné na doklade,
 * podľa kategórie, pri bločku predvolené pre bločky, inak pre prijaté.
 */
export function clenenieDphPrijateho(o: {
  vlastne?: string | null;
  podlaKategorie?: string | null;
  blocek: boolean;
  predvoleneDoklady?: string | null;
  predvolenePrijata?: string | null;
}): string | null {
  const t = (v: unknown) => String(v ?? "").trim() || null;
  return (
    t(o.vlastne) ||
    t(o.podlaKategorie) ||
    (o.blocek ? t(o.predvoleneDoklady) : null) ||
    t(o.predvolenePrijata)
  );
}
