/**
 * Strojové údaje faktúry vložené v PDF (alebo poslané ako samostatné XML).
 *
 * České faktúry často nesú v PDF prílohu ISDOC, nemecké a francúzske
 * ZUGFeRD / Factur-X (CII) a eFaktúry z Peppolu sú UBL. Keď tam XML je,
 * údaje sú presné do centa — netreba ich hádať z obrázka cez AI, ktoré sa
 * občas pomýli v čísle či sume a stojí peniaze.
 *
 * Výstup má **rovnaký tvar ako odpoveď AI** (`precitajDoklad`), takže zvyšok
 * (návrh druhu, údaje nespracovaného dokladu, rozpis DPH) sa nemení. Položky
 * `total` sú s DPH a `unit_price` bez DPH — tak ich chápe `rozpisZAi`.
 */
import { XMLParser } from "fast-xml-parser";

export type ZdrojXml = "isdoc" | "zugferd" | "ubl";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function text(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

function uzol(o: unknown, ...cesta: string[]): any {
  let cur: any = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

const h = (o: unknown, ...cesta: string[]) => text(uzol(o, ...cesta));

function pole(v: unknown): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function cislo(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** `20261010` (CII formát 102) aj `2026-10-10` → `2026-10-10`. */
function datum(v: string): string | null {
  const s = v.trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** IČ DPH patrí do `supplier_ic_dph`, slovenské DIČ (10 číslic bez predpony) do `supplier_dic`. */
function danoveCisla(ids: string[]): { dic: string | null; icDph: string | null } {
  let dic: string | null = null;
  let icDph: string | null = null;
  for (const raw of ids) {
    const id = raw.replace(/\s/g, "").toUpperCase();
    if (!id) continue;
    if (/^[A-Z]{2}[0-9A-Z]+$/.test(id)) icDph ??= id;
    else if (/^\d{8,10}$/.test(id)) dic ??= id;
  }
  return { dic, icDph };
}

/** Sadzba z položiek — keď sa súčet s DPH nedá vypočítať, položka sa vynechá. */
function polozka(
  nazov: string,
  mnozstvo: number | null,
  jednotka: string,
  cenaBezDph: number | null,
  sadzba: number | null,
  zakladRiadku: number | null,
) {
  const zaklad =
    zakladRiadku ?? (cenaBezDph !== null && mnozstvo !== null ? cenaBezDph * mnozstvo : null);
  return {
    name: nazov,
    quantity: mnozstvo,
    unit: jednotka || null,
    unit_price: cenaBezDph,
    vat_rate: sadzba,
    total: zaklad === null ? null : r2(zaklad * (1 + (sadzba ?? 0) / 100)),
  };
}

function podtyp(kod: string, nazov?: string): "ostra" | "zalohova" | "dobropis" {
  if (kod === "381" || kod === "2" || /dobropis|credit/i.test(nazov ?? "")) return "dobropis";
  if (kod === "386" || kod === "4") return "zalohova";
  return "ostra";
}

/* ---------------- ISDOC ---------------- */

function zIsdoc(inv: any): Record<string, unknown> {
  const dod = uzol(inv, "AccountingSupplierParty", "Party") ?? {};
  const odb = uzol(inv, "AccountingCustomerParty", "Party") ?? {};
  const platby = pole(uzol(inv, "PaymentMeans", "Payment")).flatMap((p) =>
    pole(uzol(p, "Details")),
  );
  const prva = (k: string) => platby.map((d) => h(d, k)).find(Boolean) ?? "";
  const dane = danoveCisla(pole(uzol(dod, "PartyTaxScheme")).map((t) => h(t, "CompanyID")));
  const kod = h(inv, "DocumentType");
  const ulica = [h(dod, "PostalAddress", "StreetName"), h(dod, "PostalAddress", "BuildingNumber")]
    .filter(Boolean)
    .join(" ");
  const riadky = pole(uzol(inv, "InvoiceLines", "InvoiceLine"));
  return {
    supplier_name: h(dod, "PartyName", "Name") || null,
    supplier_ico: h(dod, "PartyIdentification", "ID") || null,
    supplier_dic: dane.dic,
    supplier_ic_dph: dane.icDph,
    supplier_iban: prva("IBAN") || null,
    supplier_street: ulica || null,
    supplier_city: h(dod, "PostalAddress", "CityName") || null,
    supplier_zip: h(dod, "PostalAddress", "PostalZone") || null,
    supplier_country: h(dod, "PostalAddress", "Country", "IdentificationCode") || null,
    buyer_name: h(odb, "PartyName", "Name") || null,
    buyer_ico: h(odb, "PartyIdentification", "ID") || null,
    invoice_number: h(inv, "ID") || null,
    variable_symbol: prva("VariableSymbol") || null,
    constant_symbol: prva("ConstantSymbol") || null,
    specific_symbol: prva("SpecificSymbol") || null,
    issue_date: datum(h(inv, "IssueDate")),
    delivery_date: datum(h(inv, "TaxPointDate")),
    due_date: datum(prva("PaymentDueDate")),
    currency: h(inv, "LocalCurrencyCode") || "EUR",
    amount_without_vat: cislo(h(inv, "LegalMonetaryTotal", "TaxExclusiveAmount")),
    vat_amount: cislo(h(inv, "TaxTotal", "TaxAmount")),
    amount_total: cislo(h(inv, "LegalMonetaryTotal", "TaxInclusiveAmount")),
    items: riadky.map((r) =>
      polozka(
        h(r, "Item", "Description"),
        cislo(h(r, "InvoicedQuantity")),
        text(uzol(r, "InvoicedQuantity", "@unitCode")),
        cislo(h(r, "UnitPrice")),
        cislo(h(r, "ClassifiedTaxCategory", "Percent")),
        cislo(h(r, "LineExtensionAmount")),
      ),
    ),
    document_subtype: podtyp(kod),
  };
}

/* ---------------- ZUGFeRD / Factur-X (CII) ---------------- */

function zCii(doc: any): Record<string, unknown> {
  const hlav = uzol(doc, "ExchangedDocument");
  const tx = uzol(doc, "SupplyChainTradeTransaction");
  const dohoda = uzol(tx, "ApplicableHeaderTradeAgreement");
  const dod = uzol(dohoda, "SellerTradeParty") ?? {};
  const odb = uzol(dohoda, "BuyerTradeParty") ?? {};
  const vyrov = uzol(tx, "ApplicableHeaderTradeSettlement") ?? {};
  const sucty = uzol(vyrov, "SpecifiedTradeSettlementHeaderMonetarySummation") ?? {};
  const mena = h(vyrov, "InvoiceCurrencyCode") || "EUR";
  // Daň môže byť dvakrát (v mene faktúry a v domácej mene) — berie sa tá v mene faktúry.
  const dph = pole(uzol(sucty, "TaxTotalAmount")).find(
    (t) => !t?.["@currencyID"] || t["@currencyID"] === mena,
  );
  const dane = danoveCisla(pole(uzol(dod, "SpecifiedTaxRegistration")).map((t) => h(t, "ID")));
  const datumVnoreny = (o: any) => datum(h(o, "DateTimeString"));
  const riadky = pole(uzol(tx, "IncludedSupplyChainTradeLineItem"));
  const prenesenie = pole(uzol(vyrov, "ApplicableTradeTax")).some(
    (t) => h(t, "CategoryCode") === "AE",
  );
  return {
    supplier_name: h(dod, "Name") || null,
    supplier_ico: h(dod, "SpecifiedLegalOrganization", "ID") || null,
    supplier_dic: dane.dic,
    supplier_ic_dph: dane.icDph,
    supplier_iban:
      h(
        vyrov,
        "SpecifiedTradeSettlementPaymentMeans",
        "PayeePartyCreditorFinancialAccount",
        "IBANID",
      ) || null,
    supplier_street: h(dod, "PostalTradeAddress", "LineOne") || null,
    supplier_city: h(dod, "PostalTradeAddress", "CityName") || null,
    supplier_zip: h(dod, "PostalTradeAddress", "PostcodeCode") || null,
    supplier_country: h(dod, "PostalTradeAddress", "CountryID") || null,
    buyer_name: h(odb, "Name") || null,
    buyer_ico: h(odb, "SpecifiedLegalOrganization", "ID") || null,
    invoice_number: h(hlav, "ID") || null,
    document_title: h(hlav, "Name") || null,
    variable_symbol: h(vyrov, "PaymentReference") || null,
    order_number: h(dohoda, "BuyerOrderReferencedDocument", "IssuerAssignedID") || null,
    issue_date: datumVnoreny(uzol(hlav, "IssueDateTime")),
    delivery_date: datumVnoreny(
      uzol(
        tx,
        "ApplicableHeaderTradeDelivery",
        "ActualDeliverySupplyChainEvent",
        "OccurrenceDateTime",
      ),
    ),
    due_date: datumVnoreny(uzol(vyrov, "SpecifiedTradePaymentTerms", "DueDateDateTime")),
    currency: mena,
    amount_without_vat: cislo(h(sucty, "TaxBasisTotalAmount")),
    vat_amount: cislo(text(dph)),
    amount_total: cislo(h(sucty, "GrandTotalAmount")),
    reverse_charge: prenesenie,
    items: riadky.map((r) =>
      polozka(
        h(r, "SpecifiedTradeProduct", "Name"),
        cislo(h(r, "SpecifiedLineTradeDelivery", "BilledQuantity")),
        text(uzol(r, "SpecifiedLineTradeDelivery", "BilledQuantity", "@unitCode")),
        cislo(h(r, "SpecifiedLineTradeAgreement", "NetPriceProductTradePrice", "ChargeAmount")),
        cislo(h(r, "SpecifiedLineTradeSettlement", "ApplicableTradeTax", "RateApplicablePercent")),
        cislo(
          h(
            r,
            "SpecifiedLineTradeSettlement",
            "SpecifiedTradeSettlementLineMonetarySummation",
            "LineTotalAmount",
          ),
        ),
      ),
    ),
    document_subtype: podtyp(h(hlav, "TypeCode"), h(hlav, "Name")),
  };
}

/* ---------------- UBL (Peppol, XRechnung) ---------------- */

function zUbl(inv: any, dobropis: boolean): Record<string, unknown> {
  const dod = uzol(inv, "AccountingSupplierParty", "Party") ?? {};
  const odb = uzol(inv, "AccountingCustomerParty", "Party") ?? {};
  const dane = danoveCisla(pole(uzol(dod, "PartyTaxScheme")).map((t) => h(t, "CompanyID")));
  const platba = pole(uzol(inv, "PaymentMeans"))[0];
  const riadky = pole(uzol(inv, dobropis ? "CreditNoteLine" : "InvoiceLine"));
  const mn = dobropis ? "CreditedQuantity" : "InvoicedQuantity";
  const prenesenie = pole(uzol(inv, "TaxTotal", "TaxSubtotal")).some(
    (t) => h(t, "TaxCategory", "ID") === "AE",
  );
  return {
    supplier_name:
      h(dod, "PartyLegalEntity", "RegistrationName") || h(dod, "PartyName", "Name") || null,
    // V slovenskom Peppole je IČO `PartyLegalEntity/CompanyID`, inde to býva registračné číslo.
    supplier_ico:
      h(dod, "PartyLegalEntity", "CompanyID") || h(dod, "PartyIdentification", "ID") || null,
    supplier_dic: dane.dic,
    supplier_ic_dph: dane.icDph,
    supplier_iban: h(platba, "PayeeFinancialAccount", "ID") || null,
    supplier_street: h(dod, "PostalAddress", "StreetName") || null,
    supplier_city: h(dod, "PostalAddress", "CityName") || null,
    supplier_zip: h(dod, "PostalAddress", "PostalZone") || null,
    supplier_country: h(dod, "PostalAddress", "Country", "IdentificationCode") || null,
    buyer_name:
      h(odb, "PartyLegalEntity", "RegistrationName") || h(odb, "PartyName", "Name") || null,
    buyer_ico: h(odb, "PartyLegalEntity", "CompanyID") || null,
    invoice_number: h(inv, "ID") || null,
    variable_symbol: (h(platba, "PaymentID") || "").replace(/\D/g, "") || null,
    order_number: h(inv, "OrderReference", "ID") || null,
    issue_date: datum(h(inv, "IssueDate")),
    delivery_date: datum(h(inv, "Delivery", "ActualDeliveryDate")) ?? datum(h(inv, "TaxPointDate")),
    due_date: datum(h(inv, "DueDate")) ?? datum(h(platba, "PaymentDueDate")),
    currency: h(inv, "DocumentCurrencyCode") || "EUR",
    amount_without_vat: cislo(h(inv, "LegalMonetaryTotal", "TaxExclusiveAmount")),
    vat_amount: cislo(h(inv, "TaxTotal", "TaxAmount")),
    amount_total: cislo(h(inv, "LegalMonetaryTotal", "TaxInclusiveAmount")),
    reverse_charge: prenesenie,
    items: riadky.map((r) =>
      polozka(
        h(r, "Item", "Name"),
        cislo(h(r, mn)),
        text(uzol(r, mn, "@unitCode")),
        cislo(h(r, "Price", "PriceAmount")),
        cislo(h(r, "Item", "ClassifiedTaxCategory", "Percent")),
        cislo(h(r, "LineExtensionAmount")),
      ),
    ),
    document_subtype: dobropis ? "dobropis" : podtyp(h(inv, "InvoiceTypeCode")),
  };
}

/**
 * Údaje faktúry z XML v tvare odpovede AI, alebo `null`, keď to nie je
 * žiadny zo známych formátov (alebo chýba suma — vtedy nech radšej číta AI).
 */
export function dokladZXml(
  xml: string,
): (Record<string, unknown> & { zdroj_udajov: ZdrojXml }) | null {
  if (!xml || !/<\?xml|<[A-Za-z]/.test(xml.slice(0, 500))) return null;
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  let out: Record<string, unknown> | null = null;
  let zdroj: ZdrojXml | null = null;
  if (doc?.CrossIndustryInvoice) {
    out = zCii(doc.CrossIndustryInvoice);
    zdroj = "zugferd";
  } else if (doc?.Invoice && /isdoc\.cz/i.test(xml.slice(0, 3000))) {
    out = zIsdoc(doc.Invoice);
    zdroj = "isdoc";
  } else if (doc?.Invoice) {
    out = zUbl(doc.Invoice, false);
    zdroj = "ubl";
  } else if (doc?.CreditNote) {
    out = zUbl(doc.CreditNote, true);
    zdroj = "ubl";
  }
  if (!out || !zdroj) return null;
  if (out.amount_total == null && out.amount_without_vat == null) return null;
  // Dobropis má v XML kladné sumy; zvyšok systému ho spozná podľa podtypu.
  return { ...out, document_type: "faktura", zdroj_udajov: zdroj };
}
