/*
  Kódy zaúčtovania podľa agendy dokladu a stráž nad ich zmyslom.

  Číselník predkontácií má kľúč firma + druh + kód + agenda — ten istý kód
  („2“) môže mať firma v prijatých faktúrach, v ostatných záväzkoch aj vo
  vydaných faktúrach, každý raz s inými účtami. Kontrola exportov 29. 10. 2026
  našla, že sa kód hľadal len podľa textu: prijaté faktúry odišli do Pohody
  ako záväzok a Omega zaúčtovala prijatú faktúru na 311/602. Preto sa kód
  hľadá najprv v agendách, kam doklad patrí.

  Ďalej sa tu stráži, či členenie DPH a riadok KV sedia so smerom dokladu
  (vystavená faktúra s PD, prijatá s UD) a či si neplatiteľ neodpočítava DPH.
  Čisté funkcie bez databázy.
*/

import { rezimFirmy, type FirmaDph } from "./dph-rezim";
import type { DokladUctovania, KodUctovania } from "./zauctovanie-export";

/** Riadok číselníka predkontácií, ako ho vráti databáza. */
export type RiadokKodu = {
  kod: unknown;
  agenda?: unknown;
  popis?: unknown;
  ucet_md?: unknown;
  ucet_d?: unknown;
};

const text = (v: unknown) => String(v ?? "").trim();

/** Kľúč kódu v mape: agenda a kód (agenda „“ = všetky agendy). */
export const klucKodu = (agenda: unknown, kod: unknown) => `${text(agenda)}|${text(kod)}`;

/** Číselník → mapa podľa agendy a kódu. Kód z inej agendy už neprepíše iný. */
export function mapaKodov(riadky: RiadokKodu[]): Record<string, KodUctovania> {
  const out: Record<string, KodUctovania> = {};
  for (const r of riadky ?? []) {
    const kod = text(r.kod);
    if (!kod) continue;
    out[klucKodu(r.agenda, kod)] = {
      kod,
      agenda: text(r.agenda),
      popis: (r.popis as string | null) ?? null,
      ucetMd: (r.ucet_md as string | null) ?? null,
      ucetD: (r.ucet_d as string | null) ?? null,
    };
  }
  return out;
}

/** Agendy Pohody, v ktorých sa kód pre doklad hľadá — v poradí, ako majú prednosť. */
export function agendyDokladu(
  d: Pick<DokladUctovania, "agenda" | "druh" | "forma"> & { dokladKPlatbe?: boolean },
): string[] {
  if (d.agenda === "vystavena")
    return d.druh === "zaloha" || d.dokladKPlatbe
      ? ["issuedAdvanceInvoice", "issuedInvoice", "claim"]
      : ["issuedInvoice", "claim"];
  if (d.agenda === "prijata")
    return d.druh === "zaloha"
      ? ["receivedAdvanceInvoice", "receivedInvoice", "commitment"]
      : ["receivedInvoice", "commitment"];
  // Bloček: podľa toho, ako ide do účtovníctva.
  if (d.forma === "pokladna") return ["cashPaid", "receivedInvoice", "internalDocument"];
  if (d.forma === "interny") return ["internalDocument", "receivedInvoice", "cashPaid"];
  return ["receivedInvoice", "internalDocument", "cashPaid", "commitment"];
}

/** Agendy na strane výstupu (vystavené doklady). */
const AGENDY_VYSTUP = [
  "issuedInvoice",
  "issuedAdvanceInvoice",
  "claim",
  "cashReceived",
  "bankReceived",
];

/**
 * Kód z číselníka pre riadok dokladu: agenda dokladu, potom kód pre všetky
 * agendy, potom mapa v starom tvare (kľúč = kód) a nakoniec kód z ľubovoľnej
 * agendy na tej istej strane (prijaté / vydané). Kód z opačnej strany sa
 * nepoužije — radšej chýbajúce účty ako zaúčtovanie prijatej faktúry do výnosov.
 */
export function kodPreDoklad(
  kody: Record<string, KodUctovania> | null | undefined,
  kod: unknown,
  d: Pick<DokladUctovania, "agenda" | "druh" | "forma"> & { dokladKPlatbe?: boolean },
): KodUctovania | undefined {
  const k = text(kod);
  if (!k || !kody) return undefined;
  for (const a of agendyDokladu(d)) {
    const hit = kody[klucKodu(a, k)];
    if (hit) return hit;
  }
  const vsetky = kody[klucKodu("", k)] ?? kody[k];
  if (vsetky) return vsetky;
  const vystup = d.agenda === "vystavena";
  return Object.values(kody).find(
    (x) => x.kod === k && x.agenda != null && AGENDY_VYSTUP.includes(x.agenda) === vystup,
  );
}

/**
 * Kódy, s ktorými prijatá faktúra ide do Pohody ako záväzok (agenda
 * „Ostatné záväzky“). Kód, ktorý firma má aj v prijatých faktúrach, záväzkom
 * nie je — prijatá faktúra s ním ostáva prijatou faktúrou.
 */
export function zavazkoveKody(riadky: { kod: unknown; agenda: unknown }[]): string[] {
  const prijate = new Set(
    (riadky ?? []).filter((r) => text(r.agenda) === "receivedInvoice").map((r) => text(r.kod)),
  );
  return [
    ...new Set(
      (riadky ?? [])
        .filter((r) => text(r.agenda) === "commitment" && text(r.kod) && !prijate.has(text(r.kod)))
        .map((r) => text(r.kod)),
    ),
  ];
}

export type SmerDokladu = "vydane" | "prijate";

/**
 * Smer členenia DPH podľa kódu Pohody: U… uskutočnené (vydané), P… prijaté
 * (UD, UDpdp, UN / PD, PN, PDpdp). Vlastné kódy iného tvaru sa nestrážia.
 */
export function smerClenenia(kod: unknown): SmerDokladu | null {
  const k = text(kod);
  if (/^U[A-Z]/.test(k)) return "vydane";
  if (/^P[A-Z]/.test(k)) return "prijate";
  return null;
}

/** Smer riadku kontrolného výkazu DPH: A.1–A.2, C.1, D.1–D.2 vydané; B.1–B.3, C.2 prijaté. */
export function smerKv(kv: unknown): SmerDokladu | null {
  const k = text(kv).toUpperCase().replace(/[.\s]/g, "");
  if (/^A[12]$|^C1$|^D[12]$/.test(k)) return "vydane";
  if (/^B[123]$|^C2$/.test(k)) return "prijate";
  return null;
}

/**
 * Dôvod (bez čísla dokladu), prečo členenie alebo KV nesedí so smerom
 * dokladu — alebo `null`. Do vystavenej faktúry nepatrí členenie prijatého
 * plnenia (PD) ani riadok B KV, do prijatej nie uskutočnené plnenie (UD).
 */
export function prekazkaClenenia(
  smer: SmerDokladu,
  clenenia: unknown[],
  kvs: unknown[] = [],
): string | null {
  const doklad = smer === "vydane" ? "vystavenej faktúre" : "prijatom doklade";
  for (const c of clenenia) {
    const s = smerClenenia(c);
    if (s && s !== smer)
      return `členenie DPH ${text(c)} patrí ${s === "prijate" ? "prijatým" : "vydaným"} dokladom, nie ${doklad} — opravte zaúčtovanie`;
  }
  for (const k of kvs) {
    const s = smerKv(k);
    if (s && s !== smer)
      return `riadok kontrolného výkazu ${text(k)} patrí ${s === "prijate" ? "prijatým" : "vydaným"} dokladom, nie ${doklad} — opravte zaúčtovanie`;
  }
  return null;
}

/** Členenie „nezahrnovať do priznania“ (PN, UN, PNxx). */
export const jeNezahrnovat = (kod: unknown) => /^[PU]N/.test(text(kod));

/**
 * Je firma neplatiteľ DPH? Podľa `vat_payer` + `vat_scheme` (nie IČ DPH).
 * Blokuje sa len pri výslovne zvolenom režime (`vat_scheme`): firmy
 * z prenosu majú `vat_payer=false` bez režimu, hoci platiteľmi sú —
 * vtedy nevieme a nič sa neblokuje.
 */
export function jeNeplatitel(firma: FirmaDph | null | undefined): boolean {
  if (!firma || !text(firma.vat_scheme)) return false;
  return !rezimFirmy(firma).platitel;
}

/** Dôvod pre vystavený doklad neplatiteľa s DPH (bez čísla dokladu). */
export const DOVOD_NEPLATITEL_VYSTAVENA =
  "firma nie je platiteľ DPH, faktúra má DPH — opravte faktúru, alebo zapnite platiteľa DPH v nastaveniach firmy";
/** Dôvod pre prijatý doklad neplatiteľa s odpočtom DPH (bez čísla dokladu). */
export const DOVOD_NEPLATITEL_PRIJATY =
  "firma nie je platiteľ DPH a DPH si odpočítať nemôže — zaúčtujte doklad bez nároku na odpočet (DPH do nákladu), alebo zapnite platiteľa DPH v nastaveniach firmy";

/**
 * Prekážka zaúčtovaného dokladu pre programy mimo Pohody (Omega, Money,
 * Flexi, MRP, DATEV, CSV) — alebo `null`. Text je „číslo — dôvod“.
 */
export function prekazkaUctovania(
  d: DokladUctovania,
  firma: FirmaDph | null | undefined,
): string | null {
  const cislo = d.cislo || (d.agenda === "doklad" ? "bloček" : "?");
  const smer: SmerDokladu = d.agenda === "vystavena" ? "vydane" : "prijate";
  const clenenie = prekazkaClenenia(
    smer,
    [d.clenenie, ...d.riadky.map((r) => r.clenenie), ...(d.polozky ?? []).map((p) => p.clenenie)],
    [d.kv, ...d.riadky.map((r) => r.kv)],
  );
  if (clenenie) return `${cislo} — ${clenenie}`;
  if (jeNeplatitel(firma)) {
    if (smer === "vydane") {
      if (d.riadky.some((r) => Math.abs(r.dph) > 0.005))
        return `${cislo} — ${DOVOD_NEPLATITEL_VYSTAVENA}`;
    } else if (
      // Prenesenie (samozdanenie) odvádza aj registrovaná osoba — to odpočet nie je.
      !d.prenesenieDph &&
      d.riadky.some(
        (r) =>
          Math.abs(r.dph) > 0.005 &&
          r.odpocet &&
          String(r.kv ?? "").trim() !== "X" &&
          !jeNezahrnovat(r.clenenie),
      )
    )
      return `${cislo} — ${DOVOD_NEPLATITEL_PRIJATY}`;
  }
  return null;
}
