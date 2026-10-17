/**
 * ZUGFeRD 2.x / Factur-X — faktúra ako PDF s vloženým strojovým XML.
 *
 * Nemecko berie od 1. 1. 2025 ako e-faktúru aj „hybrid“: čitateľné PDF, v
 * ktorom je ako príloha `factur-x.xml` v syntaxi UN/CEFACT CII D16B (profil
 * EN 16931, v ZUGFeRD nazývaný „COMFORT“). Odberateľ, ktorý e-faktúry
 * spracúva strojovo, si údaje vezme z XML; človek si prečíta PDF. Rozhodujúce
 * je XML — preto sa do PDF vkladá **len vtedy, keď prejde kontrolami**; s
 * chybou by bolo horšie ako žiadne.
 *
 * Pre nemeckú firmu je takto vystavené **každé PDF faktúry** (nie je to
 * prepínač v nastaveniach): pre odberateľa bez e-fakturácie je to obyčajné
 * PDF, pre toho s ňou je to zákonom uznaná e-faktúra (§ 14 Abs. 1 UStG,
 * BMF 15. 10. 2024) a firma tak spĺňa povinnosť vystavovať e-faktúry
 * (od 2027/2028) bez ďalšieho kroku.
 *
 * Čo k plnej zhode s PDF/A-3b chýba (PDF z pdf-lib nie je overené
 * validátorom veraPDF):
 *  - vložené písma sú podmnožiny Roboto cez fontkit — nie je overené, že
 *    šírky glyfov a CIDSet zodpovedajú PDF/A (6.2.11);
 *  - obrázky loga a pečiatky môžu mať alfa kanál (SMask) — PDF/A-3 ho
 *    dovoľuje, ale skupina priehľadnosti strany nemá vlastný farebný priestor;
 *  - odkazy (anotácie, napr. PAYME) nemajú nastavený príznak tlače;
 *  - metadáta Info sa zosúlaďujú s XMP len v poliach, ktoré tu nastavujeme.
 * Doplnené je: XMP s `pdfaid:part=3` a schémou `fx:` vrátane popisu rozšírenia
 * (pdfaExtension), OutputIntent so sRGB profilom, ID v trailere, príloha v
 * `EmbeddedFiles` aj v `AF` s `AFRelationship /Alternative`.
 */
import { PDFDocument, PDFHexString, PDFName, PDFString, AFRelationship } from "pdf-lib";
import type { EN16931Invoice, EN16931Party } from "./efaktura/types";
import { esc } from "./efaktura/xml.server";
import {
  EN16931_GUIDELINE_ID,
  chybyNemeckejFaktury,
  mapToEN16931De,
  type ChybaEfaktury,
  type PodkladyFaktury,
} from "./xrechnung.server";
import { SRGB_ICC_BASE64 } from "./srgb-icc";

export const FACTURX_SUBOR = "factur-x.xml";
const FX_NS = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";

const fmt = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
/** CII dátum vo formáte 102 — `20261017`. */
const d102 = (iso: string) => String(iso).slice(0, 10).replace(/-/g, "");
const dt = (iso: string, pfx = "udt") =>
  `<${pfx}:DateTimeString format="102">${d102(iso)}</${pfx}:DateTimeString>`;

function stranaCii(p: EN16931Party, predavajuci: boolean): string {
  const a = p.address;
  const k = p.contact;
  const kontakt =
    predavajuci && k && (k.name || k.phone || k.email)
      ? `<ram:DefinedTradeContact>${k.name ? `<ram:PersonName>${esc(k.name)}</ram:PersonName>` : ""}${
          k.phone
            ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(k.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>`
            : ""
        }${
          k.email
            ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(k.email)}</ram:URIID></ram:EmailURIUniversalCommunication>`
            : ""
        }</ram:DefinedTradeContact>`
      : "";
  return [
    `<ram:Name>${esc(p.name)}</ram:Name>`,
    p.legalInfo ? `<ram:Description>${esc(p.legalInfo)}</ram:Description>` : "",
    p.registrationId
      ? `<ram:SpecifiedLegalOrganization><ram:ID>${esc(p.registrationId)}</ram:ID></ram:SpecifiedLegalOrganization>`
      : "",
    kontakt,
    `<ram:PostalTradeAddress>${a.postalCode ? `<ram:PostcodeCode>${esc(a.postalCode)}</ram:PostcodeCode>` : ""}${
      a.street ? `<ram:LineOne>${esc(a.street)}</ram:LineOne>` : ""
    }${a.city ? `<ram:CityName>${esc(a.city)}</ram:CityName>` : ""}<ram:CountryID>${esc(a.countryCode)}</ram:CountryID></ram:PostalTradeAddress>`,
    p.endpointId && p.endpointScheme
      ? `<ram:URIUniversalCommunication><ram:URIID schemeID="${esc(p.endpointScheme)}">${esc(p.endpointId)}</ram:URIID></ram:URIUniversalCommunication>`
      : "",
    p.vatId
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>`
      : "",
    p.taxRegistrationId
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.taxRegistrationId)}</ram:ID></ram:SpecifiedTaxRegistration>`
      : "",
  ]
    .filter(Boolean)
    .join("");
}

/**
 * CII D16B (`CrossIndustryInvoice`) z faktúry v tvare EN 16931. Poradie
 * prvkov drží XSD — prehodené prvky by schéma odmietla.
 */
export function generateCiiXml(inv: EN16931Invoice): string {
  const mena = esc(inv.currency);
  const riadky = inv.lines
    .map(
      (l) =>
        `<ram:IncludedSupplyChainTradeLineItem>` +
        `<ram:AssociatedDocumentLineDocument><ram:LineID>${esc(l.id)}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
        `<ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name>${
          l.description ? `<ram:Description>${esc(l.description)}</ram:Description>` : ""
        }${
          l.colnyKod
            ? `<ram:DesignatedProductClassification><ram:ClassCode listID="HS">${esc(l.colnyKod)}</ram:ClassCode></ram:DesignatedProductClassification>`
            : ""
        }${l.krajinaPovodu ? `<ram:OriginTradeCountry><ram:ID>${esc(l.krajinaPovodu)}</ram:ID></ram:OriginTradeCountry>` : ""}</ram:SpecifiedTradeProduct>` +
        `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${fmt(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
        `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${esc(l.unitCode)}">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
        `<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${esc(l.vatCategory)}</ram:CategoryCode>${
          l.vatCategory === "O"
            ? ""
            : `<ram:RateApplicablePercent>${l.vatPercent}</ram:RateApplicablePercent>`
        }</ram:ApplicableTradeTax>` +
        `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${fmt(l.lineExtensionAmount)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
        `</ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join("\n");

  const dane = inv.taxSubtotals
    .map(
      (t) =>
        `<ram:ApplicableTradeTax><ram:CalculatedAmount>${fmt(t.taxAmount)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${
          t.exemptionReason
            ? `<ram:ExemptionReason>${esc(t.exemptionReason)}</ram:ExemptionReason>`
            : ""
        }<ram:BasisAmount>${fmt(t.taxableAmount)}</ram:BasisAmount><ram:CategoryCode>${esc(t.vatCategory)}</ram:CategoryCode>${
          t.exemptionReasonCode
            ? `<ram:ExemptionReasonCode>${esc(t.exemptionReasonCode)}</ram:ExemptionReasonCode>`
            : ""
        }${t.vatCategory === "O" ? "" : `<ram:RateApplicablePercent>${t.vatPercent}</ram:RateApplicablePercent>`}</ram:ApplicableTradeTax>`,
    )
    .join("");

  const pm = inv.paymentMeans;
  const platba = pm
    ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${esc(pm.code)}</ram:TypeCode>${
        pm.iban
          ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(pm.iban)}</ram:IBANID>${
              pm.accountName ? `<ram:AccountName>${esc(pm.accountName)}</ram:AccountName>` : ""
            }</ram:PayeePartyCreditorFinancialAccount>`
          : ""
      }${
        pm.iban && pm.bic
          ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(pm.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>`
          : ""
      }</ram:SpecifiedTradeSettlementPaymentMeans>`
    : "";
  const dobropis = inv.documentType === "381";
  const podmienky =
    inv.paymentTerms || (inv.dueDate && !dobropis)
      ? `<ram:SpecifiedTradePaymentTerms>${inv.paymentTerms ? `<ram:Description>${esc(inv.paymentTerms)}</ram:Description>` : ""}${
          inv.dueDate && !dobropis
            ? `<ram:DueDateDateTime>${dt(inv.dueDate)}</ram:DueDateDateTime>`
            : ""
        }</ram:SpecifiedTradePaymentTerms>`
      : "";
  const s = inv.totals;
  const suhrn =
    `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:LineTotalAmount>${fmt(s.lineExtensionAmount)}</ram:LineTotalAmount>` +
    `<ram:TaxBasisTotalAmount>${fmt(s.taxExclusiveAmount)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="${mena}">${fmt(s.taxAmount)}</ram:TaxTotalAmount>` +
    (s.roundingAmount ? `<ram:RoundingAmount>${fmt(s.roundingAmount)}</ram:RoundingAmount>` : "") +
    `<ram:GrandTotalAmount>${fmt(s.taxInclusiveAmount)}</ram:GrandTotalAmount>` +
    (s.prepaidAmount
      ? `<ram:TotalPrepaidAmount>${fmt(s.prepaidAmount)}</ram:TotalPrepaidAmount>`
      : "") +
    `<ram:DuePayableAmount>${fmt(s.payableAmount)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation>`;
  const predosla = inv.precedingInvoice
    ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(inv.precedingInvoice.id)}</ram:IssuerAssignedID>${
        inv.precedingInvoice.issueDate
          ? `<ram:FormattedIssueDateTime>${dt(inv.precedingInvoice.issueDate, "qdt")}</ram:FormattedIssueDateTime>`
          : ""
      }</ram:InvoiceReferencedDocument>`
    : "";
  const da = inv.deliveryAddress;
  const dodanie =
    (da
      ? `<ram:ShipToTradeParty><ram:PostalTradeAddress>${da.postalCode ? `<ram:PostcodeCode>${esc(da.postalCode)}</ram:PostcodeCode>` : ""}${
          da.street ? `<ram:LineOne>${esc(da.street)}</ram:LineOne>` : ""
        }${da.city ? `<ram:CityName>${esc(da.city)}</ram:CityName>` : ""}<ram:CountryID>${esc(da.countryCode)}</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty>`
      : "") +
    (inv.deliveryDate
      ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${dt(inv.deliveryDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>`
      : "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>${
    inv.profileId
      ? `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${esc(inv.profileId)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>`
      : ""
  }<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${esc(inv.customizationId)}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${esc(inv.documentNumber)}</ram:ID><ram:TypeCode>${esc(inv.documentType)}</ram:TypeCode><ram:IssueDateTime>${dt(inv.issueDate)}</ram:IssueDateTime>${
    inv.note
      ? `<ram:IncludedNote><ram:Content>${esc(inv.note)}</ram:Content></ram:IncludedNote>`
      : ""
  }</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${riadky}
<ram:ApplicableHeaderTradeAgreement>${
    inv.buyerReference ? `<ram:BuyerReference>${esc(inv.buyerReference)}</ram:BuyerReference>` : ""
  }<ram:SellerTradeParty>${stranaCii(inv.seller, true)}</ram:SellerTradeParty><ram:BuyerTradeParty>${stranaCii(inv.buyer, false)}</ram:BuyerTradeParty>${
    inv.orderReference
      ? `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(inv.orderReference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>`
      : ""
  }</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>${dodanie}</ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>${
    pm?.reference ? `<ram:PaymentReference>${esc(pm.reference)}</ram:PaymentReference>` : ""
  }<ram:InvoiceCurrencyCode>${mena}</ram:InvoiceCurrencyCode>${platba}${dane}${podmienky}${suhrn}${predosla}</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/** CII v profile EN 16931 pre faktúru nemeckej firmy, s kontrolou pravidiel. */
export function zugferdXml(p: PodkladyFaktury): { xml: string; chyby: ChybaEfaktury[] } {
  const dto = mapToEN16931De(p, { customizationId: EN16931_GUIDELINE_ID });
  return { xml: generateCiiXml(dto), chyby: chybyNemeckejFaktury(dto, false) };
}

/** Či k faktúre patrí vložené XML — zálohová faktúra (výzva na platbu) a § 25a oprava nie. */
export function maMatZugferd(invoice: any): boolean {
  return invoice?.type !== "proforma" && !invoice?.oprava_25a;
}

function xmpFacturX(m: { nazov: string; autor: string; vytvorene: Date; profil: string }): string {
  const iso = m.vytvorene.toISOString().replace(/\.\d{3}Z$/, "Z");
  const vlastnost = (meno: string, popis: string) =>
    `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${meno}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${popis}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.nazov)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${esc(m.autor)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>Faktero</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Faktero</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:MetadataDate>${iso}</xmp:MetadataDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="${FX_NS}"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>${FACTURX_SUBOR}</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>${m.profil}</fx:ConformanceLevel></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>${FX_NS}</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>${vlastnost(
    "DocumentFileName",
    "The name of the embedded XML document",
  )}${vlastnost("DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER")}${vlastnost(
    "Version",
    "The actual version of the standard applying to the embedded XML document",
  )}${vlastnost("ConformanceLevel", "The conformance level of the embedded XML document")}</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function base64NaBajty(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Vloží CII XML do hotového PDF faktúry ako `factur-x.xml` a doplní
 * metadáta Factur-X / PDF/A-3. Vracia nové bajty PDF.
 */
export async function vlozFacturX(
  pdf: Uint8Array,
  xml: string,
  meta: { cislo: string; firma: string; vytvorene?: Date; profil?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const kedy = meta.vytvorene ?? new Date();
  const nazov = `Rechnung ${meta.cislo}`;

  await doc.attach(new TextEncoder().encode(xml), FACTURX_SUBOR, {
    mimeType: "text/xml",
    description: "Factur-X/ZUGFeRD Rechnung (EN 16931)",
    creationDate: kedy,
    modificationDate: kedy,
    afRelationship: AFRelationship.Alternative,
  });

  // Info slovník rovnako ako XMP — PDF/A chce oboje zhodné.
  doc.setTitle(nazov);
  doc.setAuthor(meta.firma);
  doc.setCreator("Faktero");
  doc.setProducer("Faktero");
  doc.setCreationDate(kedy);
  doc.setModificationDate(kedy);

  const ctx = doc.context;
  const xmp = ctx.stream(
    xmpFacturX({ nazov, autor: meta.firma, vytvorene: kedy, profil: meta.profil ?? "EN 16931" }),
    {
      Type: "Metadata",
      Subtype: "XML",
    },
  );
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(xmp));

  const icc = ctx.stream(base64NaBajty(SRGB_ICC_BASE64), { N: 3 });
  const zamer = ctx.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: ctx.register(icc),
  });
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([ctx.register(zamer)]));

  // Identifikátor súboru v trailere (PDF/A 6.1.3).
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);

  return await doc.save({ useObjectStreams: false });
}
