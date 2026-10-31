/*
  Mobilná appka: skener → „Galéria / PDF" → faktúra v PDF so zabudovaným
  Factur-X (ZUGFeRD). Údaje sa prečítajú zo strojového XML, takže AI sa
  nevolá a test nič nestojí. Rozpoznaný doklad sa jedným ťuknutím uloží ako
  prijatá faktúra; sumy, IČO, IBAN aj jednotka položky („ks", nie „C62")
  musia sedieť. Prijatá faktúra aj záznam v Nespracovaných sa na konci zmažú.
*/
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { cestaModulu } from "../lib/prostredie.mjs";
import { otvorApku, tlacidlo, zalozka } from "../lib/apka.mjs";

async function pdfSFacturX(cislo, icoOdberatela) {
  const { PDFDocument, StandardFonts } = createRequire(import.meta.url)(cestaModulu("pdf-lib"));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocument><ram:ID>${cislo}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261028</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Kancelársky papier A4</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>4.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">10</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>23</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>40.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
<ram:ApplicableHeaderTradeAgreement>
<ram:SellerTradeParty><ram:Name>${cislo} Dodávateľ s.r.o.</ram:Name><ram:SpecifiedLegalOrganization><ram:ID>51234567</ram:ID></ram:SpecifiedLegalOrganization><ram:PostalTradeAddress><ram:PostcodeCode>81101</ram:PostcodeCode><ram:LineOne>Hlavná 1</ram:LineOne><ram:CityName>Bratislava</ram:CityName><ram:CountryID>SK</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">SK2120123456</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>Test</ram:Name><ram:SpecifiedLegalOrganization><ram:ID>${icoOdberatela}</ram:ID></ram:SpecifiedLegalOrganization></ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery/>
<ram:ApplicableHeaderTradeSettlement><ram:PaymentReference>2026301</ram:PaymentReference><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>SK3112000000198742637541</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
<ram:ApplicableTradeTax><ram:CalculatedAmount>9.20</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>40.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>23</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261111</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>40.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>40.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">9.20</ram:TaxTotalAmount><ram:GrandTotalAmount>49.20</ram:GrandTotalAmount><ram:DuePayableAmount>49.20</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
  const pdf = await PDFDocument.create();
  const strana = pdf.addPage([595, 842]);
  const pismo = await pdf.embedFont(StandardFonts.Helvetica);
  strana.drawText(`Faktura ${cislo} - 49,20 EUR`, { x: 50, y: 780, size: 14, font: pismo });
  await pdf.attach(new TextEncoder().encode(xml), "factur-x.xml", { mimeType: "application/xml" });
  return pdf.save();
}

export default {
  popis: "appka: skener, faktúra v PDF s Factur-X (bez AI) uložená ako prijatá",
  limit: 180000,
  async spusti(t) {
    const cislo = `${t.znacka}-SKEN`;
    const firma = await t.rest.get(`companies?id=eq.${t.firmy.test}&select=ico`);
    const subor = path.join(t.vystup, "subory", `${cislo}.pdf`);
    writeFileSync(subor, await pdfSFacturX(cislo, firma.data?.[0]?.ico ?? ""));

    t.uprac("prijatá faktúra a Nespracované", async () => {
      const p = await t.rest.get(
        `purchase_invoices?company_id=eq.${t.firmy.test}&invoice_number=eq.${encodeURIComponent(cislo)}&select=id`,
      );
      for (const x of p.data ?? []) {
        const r = await t.rest.delete(`purchase_invoices?id=eq.${x.id}`);
        if (r.status >= 300) throw new Error(`prijatá: ${r.status} ${r.text.slice(0, 160)}`);
      }
      // Appka súbor premenuje („doklad-z-appky.pdf") — hľadá sa podľa prečítaného čísla.
      const n = await t.rest.get(
        `nespracovane_doklady?company_id=eq.${t.firmy.test}&udaje->>cislo=eq.${encodeURIComponent(cislo)}&select=id`,
      );
      for (const x of n.data ?? []) await t.rest.delete(`nespracovane_doklady?id=eq.${x.id}`);
    });

    const page = await otvorApku(t);

    await t.krok("skener → Galéria / PDF → rozpoznaný doklad", async () => {
      await zalozka(page, 2);
      await tlacidlo(page, /^Galéria \/ PDF$/).click();
      const [vyber] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 20000 }),
        tlacidlo(page, /^Vybrať súbor/).click(),
      ]);
      await vyber.setFiles({
        name: `${cislo}.pdf`,
        mimeType: "application/pdf",
        buffer: readFileSync(subor),
      });
      await tlacidlo(page, /^Uložiť ako prijatú faktúru$/).waitFor({ timeout: 60000 });
      const text = await page.locator("main").last().innerText();
      t.over(/49,20/.test(text), "rozpoznaný doklad nemá sumu 49,20");
      t.over(text.includes(cislo), `rozpoznaný doklad nemá číslo ${cislo}`);
      t.over(/40,00\s€\s\/\s9,20\s€/.test(text), "základ a DPH nesedia");
    });

    await t.krok("uloženie ako prijatá faktúra", async () => {
      await tlacidlo(page, /^Uložiť ako prijatú faktúru$/).click();
      const f = await t.cakajNa("prijatá faktúra v databáze", async () => {
        const r = await t.rest.get(
          `purchase_invoices?company_id=eq.${t.firmy.test}&invoice_number=eq.${encodeURIComponent(cislo)}&deleted_at=is.null&select=*`,
        );
        return r.data?.[0];
      });
      t.over(Number(f.amount_total) === 49.2, `suma ${f.amount_total}`);
      t.over(Number(f.amount_without_vat) === 40 && Number(f.vat_amount) === 9.2, "základ/DPH");
      t.over(f.supplier_ico === "51234567", `IČO dodávateľa ${f.supplier_ico}`);
      t.over(f.supplier_iban === "SK3112000000198742637541", "IBAN dodávateľa");
      t.over(f.due_date === "2026-11-11", `splatnosť ${f.due_date}`);
      const pol = (f.items ?? [])[0];
      t.over(pol && Number(pol.quantity) === 10, "položka chýba alebo má zlé množstvo");
      t.over(pol.unit === "ks", `jednotka položky „${pol.unit}“, čakal som „ks“`);
    });
  },
};
