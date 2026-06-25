/**
 * eFaktúra XML generator — produces UBL 2.1 / Peppol BIS 3.0 from an
 * EN16931 DTO. Validation here is structural (required fields, totals match).
 * Schema/Schematron validation is a future step but the hook is in place via
 * `validationErrors`.
 */
import { createHash } from "crypto";
import type { EN16931Invoice, EN16931Party, XmlGenerationResult } from "./types";

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function partyXml(party: EN16931Party, role: "AccountingSupplierParty" | "AccountingCustomerParty"): string {
  const endpoint =
    party.endpointId && party.endpointScheme
      ? `      <cbc:EndpointID schemeID="${esc(party.endpointScheme)}">${esc(party.endpointId)}</cbc:EndpointID>`
      : "";
  const taxScheme = party.vatId
    ? `      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(party.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : "";
  const legalEntity = `      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(party.name)}</cbc:RegistrationName>
${party.registrationId ? `        <cbc:CompanyID>${esc(party.registrationId)}</cbc:CompanyID>\n` : ""}      </cac:PartyLegalEntity>`;
  return `  <cac:${role}>
    <cac:Party>
${endpoint}
      <cac:PartyName><cbc:Name>${esc(party.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
${party.address.street ? `        <cbc:StreetName>${esc(party.address.street)}</cbc:StreetName>\n` : ""}${party.address.city ? `        <cbc:CityName>${esc(party.address.city)}</cbc:CityName>\n` : ""}${party.address.postalCode ? `        <cbc:PostalZone>${esc(party.address.postalCode)}</cbc:PostalZone>\n` : ""}        <cac:Country><cbc:IdentificationCode>${esc(party.address.countryCode)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
${taxScheme}
${legalEntity}
    </cac:Party>
  </cac:${role}>`;
}

function validate(inv: EN16931Invoice): XmlGenerationResult["validationErrors"] {
  const errors: XmlGenerationResult["validationErrors"] = [];
  const need = (cond: boolean, code: string, message: string, path?: string) => {
    if (!cond) errors.push({ code, message, path });
  };
  need(!!inv.documentNumber, "BR-02", "Invoice number is required");
  need(!!inv.issueDate, "BR-03", "Issue date is required");
  need(!!inv.seller?.name, "BR-06", "Seller name is required");
  need(!!inv.buyer?.name, "BR-07", "Buyer name is required");
  need(inv.lines.length > 0, "BR-16", "At least one invoice line is required");
  need(!!inv.seller?.address?.countryCode, "BR-09", "Seller country code is required");
  need(!!inv.buyer?.address?.countryCode, "BR-10", "Buyer country code is required");

  // Totals consistency check (within 1 cent rounding).
  const sumLines = inv.lines.reduce((acc, l) => acc + l.lineExtensionAmount, 0);
  if (Math.abs(sumLines - inv.totals.lineExtensionAmount) > 0.02) {
    errors.push({
      code: "BR-CO-10",
      message: `Sum of line net amounts (${sumLines.toFixed(2)}) must equal line extension total (${inv.totals.lineExtensionAmount.toFixed(2)})`,
    });
  }
  const expectedPayable =
    Math.round((inv.totals.taxExclusiveAmount + inv.totals.taxAmount) * 100) / 100;
  if (Math.abs(expectedPayable - inv.totals.payableAmount) > 0.02) {
    errors.push({
      code: "BR-CO-15",
      message: `Tax inclusive amount must equal taxExclusive + tax (${expectedPayable.toFixed(2)} vs ${inv.totals.payableAmount.toFixed(2)})`,
    });
  }
  return errors;
}

export function generatePeppolBisXml(inv: EN16931Invoice): XmlGenerationResult {
  const linesXml = inv.lines
    .map(
      (l) => `  <cac:InvoiceLine>
    <cbc:ID>${esc(l.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(l.unitCode)}">${l.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(inv.currency)}">${fmt(l.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
${l.description ? `      <cbc:Description>${esc(l.description)}</cbc:Description>\n` : ""}      <cac:ClassifiedTaxCategory>
        <cbc:ID>${esc(l.vatCategory)}</cbc:ID>
        <cbc:Percent>${l.vatPercent}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(inv.currency)}">${fmt(l.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    )
    .join("\n");

  const taxXml = `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(inv.currency)}">${fmt(inv.totals.taxAmount)}</cbc:TaxAmount>
${inv.taxSubtotals
  .map(
    (t) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(inv.currency)}">${fmt(t.taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(inv.currency)}">${fmt(t.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${esc(t.vatCategory)}</cbc:ID>
        <cbc:Percent>${t.vatPercent}</cbc:Percent>
${t.exemptionReason ? `        <cbc:TaxExemptionReason>${esc(t.exemptionReason)}</cbc:TaxExemptionReason>\n` : ""}        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  )
  .join("\n")}
  </cac:TaxTotal>`;

  const paymentXml = inv.paymentMeans
    ? `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${esc(inv.paymentMeans.code)}</cbc:PaymentMeansCode>
${inv.paymentMeans.reference ? `    <cbc:PaymentID>${esc(inv.paymentMeans.reference)}</cbc:PaymentID>\n` : ""}${inv.paymentMeans.iban ? `    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(inv.paymentMeans.iban)}</cbc:ID>
${inv.paymentMeans.accountName ? `      <cbc:Name>${esc(inv.paymentMeans.accountName)}</cbc:Name>\n` : ""}${inv.paymentMeans.bic ? `      <cac:FinancialInstitutionBranch><cbc:ID>${esc(inv.paymentMeans.bic)}</cbc:ID></cac:FinancialInstitutionBranch>\n` : ""}    </cac:PayeeFinancialAccount>\n` : ""}  </cac:PaymentMeans>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${esc(inv.customizationId)}</cbc:CustomizationID>
  <cbc:ProfileID>${esc(inv.profileId)}</cbc:ProfileID>
  <cbc:ID>${esc(inv.documentNumber)}</cbc:ID>
  <cbc:IssueDate>${esc(inv.issueDate)}</cbc:IssueDate>
  <cbc:DueDate>${esc(inv.dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${esc(inv.documentType)}</cbc:InvoiceTypeCode>
${inv.note ? `  <cbc:Note>${esc(inv.note)}</cbc:Note>\n` : ""}  <cbc:DocumentCurrencyCode>${esc(inv.currency)}</cbc:DocumentCurrencyCode>
${inv.buyerReference ? `  <cbc:BuyerReference>${esc(inv.buyerReference)}</cbc:BuyerReference>\n` : ""}${partyXml(inv.seller, "AccountingSupplierParty")}
${partyXml(inv.buyer, "AccountingCustomerParty")}
${paymentXml}
${taxXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(inv.currency)}">${fmt(inv.totals.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(inv.currency)}">${fmt(inv.totals.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(inv.currency)}">${fmt(inv.totals.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(inv.currency)}">${fmt(inv.totals.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>
`;

  const errors = validate(inv);
  return {
    format: "peppol_bis_3",
    schemaVersion: "3.0",
    customizationId: inv.customizationId,
    profileId: inv.profileId,
    xml,
    payloadHash: createHash("sha256").update(xml).digest("hex"),
    validationErrors: errors,
    valid: errors.length === 0,
  };
}