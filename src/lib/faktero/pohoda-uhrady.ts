/**
 * Spätný smer mosta (Patrik 25. 11.): úhrady z Pohody do Faktera.
 *
 * Konektor posiela Pohode dávku s dokladmi; do tej istej dávky sa pridá
 * žiadosť o zoznam faktúr zmenených od poslednej synchronizácie
 * (`lst:listInvoiceRequest` s `ftr:lastChanges`) aj so záložkou Likvidácia
 * (`restrictionData/liquidations`). Pohoda zoznam vráti v odpovedi, ktorú
 * konektor pošle na `/api/v1/pohoda/odpoved`.
 *
 * Úhrady sa berú z jednotlivých likvidácií (dátum + suma + id likvidácie
 * v Pohode), nie zo súhrnného „stavu likvidácie“ — id likvidácie z nej robí
 * identifikátor úhrady vo Fakteri, takže tá istá sa nezapíše dvakrát.
 *
 * Čisté funkcie bez databázy — overené testami a proti list.xsd/filter.xsd.
 */
import { XMLParser } from "fast-xml-parser";
import { cisloPohody, hodnotaPohody, textUzla, uzolPohody, zoznamPohody } from "./pohoda-citanie";

/** Druhy faktúr, ktoré sa v Pohode uhrádzajú (dobropisy a interné nie). */
export const DRUHY_UHRAD = [
  { id: "UHR-VYDANE", invoiceType: "issuedInvoice" },
  { id: "UHR-VYDANE-ZALOHY", invoiceType: "issuedAdvanceInvoice" },
  { id: "UHR-PRIJATE", invoiceType: "receivedInvoice" },
  { id: "UHR-PRIJATE-ZALOHY", invoiceType: "receivedAdvanceInvoice" },
] as const;

export function jeIdUhrad(id: string | null | undefined): boolean {
  return String(id ?? "").startsWith("UHR-");
}

const LST = 'xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"';
const FTR = 'xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"';

/** `2026-11-25T08:00:00` — Pohoda chce dátum a čas bez časového pásma (miestny čas). */
export function casPrePohodu(d: Date): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
  return p.replace(" ", "T");
}

/** Položky dávky so žiadosťou o faktúry zmenené od `od` aj s likvidáciami. */
export function polozkyZiadostiUhrad(od: Date, odsadenie = "  "): string {
  const o = odsadenie;
  const cas = casPrePohodu(od);
  return DRUHY_UHRAD.map(
    (d) => `
${o}<dat:dataPackItem id="${d.id}" version="2.0">
${o}  <lst:listInvoiceRequest version="2.0" invoiceType="${d.invoiceType}" invoiceVersion="2.0">
${o}    <lst:requestInvoice>
${o}      <ftr:filter>
${o}        <ftr:lastChanges>${cas}</ftr:lastChanges>
${o}      </ftr:filter>
${o}    </lst:requestInvoice>
${o}    <lst:restrictionData>
${o}      <lst:documents>false</lst:documents>
${o}      <lst:liquidations>true</lst:liquidations>
${o}    </lst:restrictionData>
${o}  </lst:listInvoiceRequest>
${o}</dat:dataPackItem>`,
  ).join("");
}

/** Pridá žiadosť o úhrady do hotovej dávky; prázdna dávka dostane vlastnú obálku. */
export function pridajZiadostUhrad(xml: string, ico: string | null | undefined, od: Date): string {
  if (!xml.trim()) {
    return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="FAKTERO-UHRADY" ico="${String(ico ?? "").replace(/[^0-9A-Za-z]/g, "")}" application="Faktero" version="2.0" note="Úhrady z Pohody pre Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  ${LST}
  ${FTR}
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${polozkyZiadostiUhrad(od)}
</dat:dataPack>
`;
  }
  let s = xml;
  for (const ns of [LST, FTR]) if (!s.includes(ns)) s = s.replace(/(<dat:dataPack\b[^>]*?)(>)/, `$1\n  ${ns}$2`);
  return s.replace(/<\/dat:dataPack>\s*$/, `${polozkyZiadostiUhrad(od)}\n</dat:dataPack>\n`);
}

export type LikvidaciaPohody = { id: string; datum: string; suma: number };

export type FakturaZPohody = {
  druh: "vydana" | "prijata";
  zaloha: boolean;
  /** Číslo dokladu v Pohode. */
  cislo: string;
  vs: string | null;
  /** Číslo dokladu dodávateľa (prijaté). */
  povodneCislo: string | null;
  ico: string | null;
  /** Celková suma s DPH v domácej mene (súčet súhrnu). */
  suma: number | null;
  likvidacie: LikvidaciaPohody[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (meno) => ["responsePackItem", "invoice", "liquidation"].includes(meno),
});

const DRUH_PODLA_TYPU: Record<string, { druh: "vydana" | "prijata"; zaloha: boolean }> = {
  issuedInvoice: { druh: "vydana", zaloha: false },
  issuedAdvanceInvoice: { druh: "vydana", zaloha: true },
  receivedInvoice: { druh: "prijata", zaloha: false },
  receivedAdvanceInvoice: { druh: "prijata", zaloha: true },
};

function sucetSuhrnu(h: any): number | null {
  if (!h || typeof h !== "object") return null;
  const casti = ["priceNone", "priceLow", "priceLowVAT", "priceHigh", "priceHighVAT", "price3", "price3VAT"];
  let s = 0;
  let nieco = false;
  for (const c of casti) {
    const v = cisloPohody(h[c]);
    if (v != null) {
      s += v;
      nieco = true;
    }
  }
  const zaokr = cisloPohody(uzolPohody(h, "round", "priceRound"));
  if (zaokr != null) s += zaokr;
  return nieco ? Math.round(s * 100) / 100 : null;
}

/**
 * Faktúry zo zoznamov v odpovedi Pohody (len položky `UHR-…`). Faktúra bez
 * čísla sa vynechá — nie je ako ju spárovať.
 */
export function rozoberUhradyZPohody(xml: string): FakturaZPohody[] {
  let o: any;
  try {
    o = parser.parse(xml);
  } catch {
    return [];
  }
  const out: FakturaZPohody[] = [];
  for (const item of zoznamPohody(o?.responsePack?.responsePackItem)) {
    if (!jeIdUhrad(item?.["@_id"])) continue;
    for (const f of zoznamPohody(item?.listInvoice?.invoice)) {
      const h = f?.invoiceHeader ?? {};
      const typ = DRUH_PODLA_TYPU[textUzla(h.invoiceType)];
      if (!typ) continue;
      const cislo = hodnotaPohody(h, "number", "numberRequested") || textUzla(h.number);
      if (!cislo) continue;
      const likvidacie: LikvidaciaPohody[] = [];
      for (const l of zoznamPohody(f?.liquidations?.liquidation)) {
        const id = textUzla(l?.id);
        const datum = textUzla(l?.date).slice(0, 10);
        const suma = cisloPohody(l?.amount);
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || suma == null || suma === 0) continue;
        likvidacie.push({ id, datum, suma: Math.round(Math.abs(suma) * 100) / 100 });
      }
      out.push({
        ...typ,
        cislo,
        vs: textUzla(h.symVar) || null,
        povodneCislo: textUzla(h.originalDocument) || null,
        ico: hodnotaPohody(h, "partnerIdentity", "address", "ico") || null,
        suma: sucetSuhrnu(uzolPohody(f, "invoiceSummary", "homeCurrency")),
        likvidacie,
      });
    }
  }
  return out;
}

/** Odpoveď obsahuje odpoveď na žiadosť o úhrady (aj prázdny zoznam)? */
export function maOdpovedUhrad(xml: string): boolean {
  return /<(?:[\w.-]+:)?responsePackItem\b[^>]*\bid="UHR-/i.test(xml);
}
