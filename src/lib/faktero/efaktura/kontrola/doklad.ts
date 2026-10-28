/**
 * Pohľad na načítaný UBL doklad, nad ktorým bežia pravidlá kontroly.
 *
 * Mená v cestách sa píšu s predponami `cac:`/`cbc:` bez ohľadu na to, aké
 * predpony použil dokument — porovnáva sa menný priestor, nie predpona.
 */
import type { XmlUzol } from "./xml-strom";

export const NS_CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
export const NS_CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
export const NS_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
export const NS_CREDIT = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";

const PREDPONY: Record<string, string> = { cac: NS_CAC, cbc: NS_CBC };

function sedi(u: XmlUzol, krok: string): boolean {
  const d = krok.indexOf(":");
  const ns = PREDPONY[krok.slice(0, d)];
  return u.ns === ns && u.meno === krok.slice(d + 1);
}

/** Všetky prvky na relatívnej ceste (`cac:A/cbc:B`). */
export function vsetky(u: XmlUzol | null | undefined, cesta: string): XmlUzol[] {
  if (!u) return [];
  let vrstva = [u];
  for (const krok of cesta.split("/")) {
    vrstva = vrstva.flatMap((x) => x.deti.filter((d) => sedi(d, krok)));
    if (!vrstva.length) return [];
  }
  return vrstva;
}

export function prvy(u: XmlUzol | null | undefined, cesta: string): XmlUzol | null {
  return vsetky(u, cesta)[0] ?? null;
}

/** Orezaný text prvku na ceste, alebo `null`, keď prvok chýba alebo je prázdny. */
export function text(u: XmlUzol | null | undefined, cesta?: string): string | null {
  const x = cesta ? prvy(u, cesta) : u;
  const t = x?.text.trim();
  return t ? t : null;
}

/** Všetci potomkovia s daným menom (v celom podstrome). */
export function potomkovia(u: XmlUzol, krok: string): XmlUzol[] {
  const out: XmlUzol[] = [];
  const prejdi = (x: XmlUzol) => {
    for (const d of x.deti) {
      if (sedi(d, krok)) out.push(d);
      prejdi(d);
    }
  };
  prejdi(u);
  return out;
}

/** Desatinné číslo v tvare xs:decimal. Iný tvar (čiarka, medzery) vráti NaN. */
export function cislo(t: string | null | undefined): number {
  if (t == null) return NaN;
  const s = t.trim();
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
}

/** Číslo z prvku na ceste; `null`, keď prvok chýba. */
export function suma(u: XmlUzol | null | undefined, cesta: string): number | null {
  const t = text(u, cesta);
  return t == null ? null : cislo(t);
}

/** Zaokrúhlenie na centy ako v schematrone (`round(x * 100) div 100`). */
export const r2 = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
export const rovnake = (a: number, b: number) => Math.abs(a - b) < 0.0005;
export const f2 = (n: number) => (Number.isFinite(n) ? r2(n).toFixed(2) : String(n));

export type Riadok = {
  uzol: XmlUzol;
  /** Poradie v dokumente od 1 — na zobrazenie. */
  poradie: number;
  id: string | null;
  mnozstvo: XmlUzol | null;
  suma: number | null;
  kategoria: string | null;
  sadzba: number | null;
  kategoriaUzol: XmlUzol | null;
};

export type ZlavaPriplatok = {
  uzol: XmlUzol;
  priplatok: boolean;
  suma: number | null;
  kategoria: string | null;
  sadzba: number | null;
};

export type RozpisDph = {
  uzol: XmlUzol;
  zaklad: number | null;
  dan: number | null;
  kategoria: string | null;
  sadzba: number | null;
  dovodKod: string | null;
  dovod: string | null;
  kategoriaUzol: XmlUzol | null;
};

export type Doklad = {
  koren: XmlUzol;
  dobropis: boolean;
  /** Meno prvku riadku: InvoiceLine / CreditNoteLine. */
  menoRiadku: string;
  menoMnozstva: string;
  menoTypu: string;
  mena: string | null;
  predavajuci: XmlUzol | null;
  kupujuci: XmlUzol | null;
  krajinaPredavajuceho: string | null;
  krajinaKupujuceho: string | null;
  riadky: Riadok[];
  zlavyPriplatky: ZlavaPriplatok[];
  taxTotaly: XmlUzol[];
  rozpis: RozpisDph[];
  sucty: XmlUzol | null;
};

const kategoriaDph = (u: XmlUzol | null) => {
  // Len daňová schéma VAT — iné dane (napr. spotrebné) EN 16931 nerieši.
  const schema = text(u, "cac:TaxScheme/cbc:ID");
  return schema && schema.toUpperCase() !== "VAT" ? null : u;
};

export function zostavDoklad(koren: XmlUzol): Doklad {
  const dobropis = koren.meno === "CreditNote";
  const menoRiadku = dobropis ? "cac:CreditNoteLine" : "cac:InvoiceLine";
  const menoMnozstva = dobropis ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity";
  const predavajuci = prvy(koren, "cac:AccountingSupplierParty/cac:Party");
  const kupujuci = prvy(koren, "cac:AccountingCustomerParty/cac:Party");
  const krajina = (p: XmlUzol | null) =>
    text(p, "cac:PostalAddress/cac:Country/cbc:IdentificationCode")?.toUpperCase() ?? null;
  const taxTotaly = vsetky(koren, "cac:TaxTotal");
  return {
    koren,
    dobropis,
    menoRiadku,
    menoMnozstva,
    menoTypu: dobropis ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode",
    mena: text(koren, "cbc:DocumentCurrencyCode"),
    predavajuci,
    kupujuci,
    krajinaPredavajuceho: krajina(predavajuci),
    krajinaKupujuceho: krajina(kupujuci),
    riadky: vsetky(koren, menoRiadku).map((u, i) => {
      const kat = kategoriaDph(prvy(u, "cac:Item/cac:ClassifiedTaxCategory"));
      const sadzba = text(kat, "cbc:Percent");
      return {
        uzol: u,
        poradie: i + 1,
        id: text(u, "cbc:ID"),
        mnozstvo: prvy(u, menoMnozstva),
        suma: suma(u, "cbc:LineExtensionAmount"),
        kategoria: text(kat, "cbc:ID")?.toUpperCase() ?? null,
        sadzba: sadzba == null ? null : cislo(sadzba),
        kategoriaUzol: kat,
      };
    }),
    zlavyPriplatky: vsetky(koren, "cac:AllowanceCharge").map((u) => {
      const kat = kategoriaDph(prvy(u, "cac:TaxCategory"));
      const sadzba = text(kat, "cbc:Percent");
      return {
        uzol: u,
        priplatok: text(u, "cbc:ChargeIndicator")?.toLowerCase() === "true",
        suma: suma(u, "cbc:Amount"),
        kategoria: text(kat, "cbc:ID")?.toUpperCase() ?? null,
        sadzba: sadzba == null ? null : cislo(sadzba),
      };
    }),
    taxTotaly,
    rozpis: taxTotaly.flatMap((tt) =>
      vsetky(tt, "cac:TaxSubtotal").map((u) => {
        const kat = kategoriaDph(prvy(u, "cac:TaxCategory"));
        const sadzba = text(kat, "cbc:Percent");
        return {
          uzol: u,
          zaklad: suma(u, "cbc:TaxableAmount"),
          dan: suma(u, "cbc:TaxAmount"),
          kategoria: text(kat, "cbc:ID")?.toUpperCase() ?? null,
          sadzba: sadzba == null ? null : cislo(sadzba),
          dovodKod: text(kat, "cbc:TaxExemptionReasonCode"),
          dovod: text(kat, "cbc:TaxExemptionReason"),
          kategoriaUzol: kat,
        };
      }),
    ),
    sucty: prvy(koren, "cac:LegalMonetaryTotal"),
  };
}

/** IČ DPH strany (PartyTaxScheme so schémou VAT). */
export function icDph(strana: XmlUzol | null): XmlUzol | null {
  return (
    vsetky(strana, "cac:PartyTaxScheme").find(
      (p) =>
        (text(p, "cac:TaxScheme/cbc:ID") ?? "").toUpperCase() === "VAT" && text(p, "cbc:CompanyID"),
    ) ?? null
  );
}
