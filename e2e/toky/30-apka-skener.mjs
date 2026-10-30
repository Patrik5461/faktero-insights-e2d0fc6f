/*
  Mobilná appka (`/app`) — skener bločkov a dávka dokladov.

  Kamera v prehliadači je náhradná: `getUserMedia` vracia plátno s umelým
  obrázkom (e2e/lib/blocek-obrazok.mjs), takže skener z neho číta QR kód aj
  hľadá obrys dokladu presne ako z kamery telefónu.

  1. Slovenský bloček: QR z eKasy (holý UID, ako ho tlačia pokladnice) →
     Finančná správa → bez fotky sa nedá uložiť → odfotenie → nájdený obrys
     a vyrovnanie → úhrada zvolená na skeneri ostáva → uloženie (firma test2).
  2. Ten istý QR vo firme Test, kde už je → upozornenie na duplicitu.
  2b. Platobný QR faktúry (PAY by square) skener prejde a čaká na fotku.
  2c. Fotka bločku s QR z galérie ide cez Finančnú správu, nie na AI.
  3. Český QR EET (QA Česká) → sumu a dátum nesie kód sám, bez Finančnej správy.
  4. Dávka (firma Test): ISDOC v PDF v cudzej mene, Factur-X, prázdny súbor →
     prečítané bez AI, prázdny súbor hlási trvalú chybu (nie „skúste znova“),
     hromadné uloženie.

  AI sa nevolá: fotky bločkov idú cez QR, faktúry nesú XML (pred nasadením opráv z
  vetvy vlna/t3-apka-skener by fotka z galérie v kroku 2c išla raz na AI). Riadky aj
  súbory v Storage sa na konci zmažú.
*/
import { createRequire } from "node:module";
import { cestaModulu } from "../lib/prostredie.mjs";
import {
  fotkaBlocku,
  obrazokQr,
  falosnaKamera,
  prazdnyZaber,
  qrEet,
} from "../lib/blocek-obrazok.mjs";
import { lista, tlacidlo, zalozka } from "../lib/apka.mjs";

const dataUrl = (b, typ = "image/png") => `data:${typ};base64,${Buffer.from(b).toString("base64")}`;

/** Bloček z eKasy, ktorý je vo firme Test (duplicita) a v test2 nie je. */
const QR_SK = "O-D1B26CABEEA54B1FB26CABEEA55B1FD9";

/** Appka s náhradnou kamerou; vráti stránku na Prehľade. */
async function apkaSKamerou(t, firma, obrazok) {
  const page = await t.novaStranka({ mobil: true, firma });
  await falosnaKamera(page, dataUrl(obrazok));
  await t.go("/app", page);
  await lista(page).waitFor({ timeout: 40000 });
  return page;
}

const kamera = (page) => page.getByRole("dialog", { name: "Odfotiť doklad" });
const uprava = (page) => page.getByRole("dialog", { name: "Upraviť doklad" });

/** Vymení obraz v kamere a odfotí ho; vráti rohy obrysu v „Upraviť doklad“. */
async function odfot(page, obrazok) {
  await kamera(page).waitFor({ timeout: 30000 });
  await page.evaluate((u) => window.__e2eKamera(u), dataUrl(obrazok));
  await page.waitForTimeout(1500);
  await kamera(page).getByRole("button", { name: "Odfotiť" }).click();
  await uprava(page).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  return uprava(page)
    .locator('[aria-label^="Roh"]')
    .evaluateAll((el) =>
      el.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    );
}

const textObrazovky = async (page) =>
  (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();

/** ISDOC 6.0.2 českého dodávateľa v eurách (domáca mena CZK, sumy v € v …Curr). */
function isdocVEur(cislo, icoOdberatela) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>1</DocumentType>
  <ID>${cislo}</ID>
  <UUID>6F0B5C0E-9A43-4C4B-8B0F-${String(Date.now()).slice(-12).padStart(12, "0")}</UUID>
  <IssueDate>2026-10-28</IssueDate>
  <TaxPointDate>2026-10-28</TaxPointDate>
  <VATApplicable>true</VATApplicable>
  <LocalCurrencyCode>CZK</LocalCurrencyCode>
  <ForeignCurrencyCode>EUR</ForeignCurrencyCode>
  <CurrRate>25</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty><Party>
    <PartyIdentification><ID>27082440</ID></PartyIdentification>
    <PartyName><Name>${cislo} Dodavatel s.r.o.</Name></PartyName>
    <PostalAddress><StreetName>Vinohradská</StreetName><BuildingNumber>1</BuildingNumber><CityName>Praha</CityName><PostalZone>12000</PostalZone><Country><IdentificationCode>CZ</IdentificationCode><Name>Česká republika</Name></Country></PostalAddress>
    <PartyTaxScheme><CompanyID>CZ27082440</CompanyID><TaxScheme>VAT</TaxScheme></PartyTaxScheme>
  </Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party>
    <PartyIdentification><ID>${icoOdberatela}</ID></PartyIdentification>
    <PartyName><Name>Test</Name></PartyName>
  </Party></AccountingCustomerParty>
  <InvoiceLines><InvoiceLine>
    <ID>1</ID>
    <InvoicedQuantity unitCode="ks">2</InvoicedQuantity>
    <LineExtensionAmountCurr>100.00</LineExtensionAmountCurr>
    <LineExtensionAmount>2500.00</LineExtensionAmount>
    <LineExtensionAmountTaxInclusiveCurr>100.00</LineExtensionAmountTaxInclusiveCurr>
    <LineExtensionAmountTaxInclusive>2500.00</LineExtensionAmountTaxInclusive>
    <LineExtensionTaxAmount>0</LineExtensionTaxAmount>
    <UnitPrice>1250.00</UnitPrice>
    <UnitPriceTaxInclusive>1250.00</UnitPriceTaxInclusive>
    <ClassifiedTaxCategory><Percent>0</Percent><VATCalculationMethod>0</VATCalculationMethod></ClassifiedTaxCategory>
    <Item><Description>Licencia softvéru</Description></Item>
  </InvoiceLine></InvoiceLines>
  <TaxTotal>
    <TaxSubTotal><TaxableAmountCurr>100.00</TaxableAmountCurr><TaxableAmount>2500.00</TaxableAmount><TaxAmountCurr>0</TaxAmountCurr><TaxAmount>0</TaxAmount><TaxInclusiveAmountCurr>100.00</TaxInclusiveAmountCurr><TaxInclusiveAmount>2500.00</TaxInclusiveAmount><AlreadyClaimedTaxableAmount>0</AlreadyClaimedTaxableAmount><AlreadyClaimedTaxAmount>0</AlreadyClaimedTaxAmount><AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount><DifferenceTaxableAmount>2500.00</DifferenceTaxableAmount><DifferenceTaxAmount>0</DifferenceTaxAmount><DifferenceTaxInclusiveAmount>2500.00</DifferenceTaxInclusiveAmount><TaxCategory><Percent>0</Percent></TaxCategory></TaxSubTotal>
    <TaxAmountCurr>0</TaxAmountCurr>
    <TaxAmount>0</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>2500.00</TaxExclusiveAmount><TaxExclusiveAmountCurr>100.00</TaxExclusiveAmountCurr>
    <TaxInclusiveAmount>2500.00</TaxInclusiveAmount><TaxInclusiveAmountCurr>100.00</TaxInclusiveAmountCurr>
    <AlreadyClaimedTaxExclusiveAmount>0</AlreadyClaimedTaxExclusiveAmount><AlreadyClaimedTaxInclusiveAmount>0</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>2500.00</DifferenceTaxExclusiveAmount><DifferenceTaxInclusiveAmount>2500.00</DifferenceTaxInclusiveAmount>
    <PaidDepositsAmount>0</PaidDepositsAmount>
    <PayableAmount>2500.00</PayableAmount><PayableAmountCurr>100.00</PayableAmountCurr>
  </LegalMonetaryTotal>
  <PaymentMeans><Payment><PaidAmount>2500.00</PaidAmount><PaymentMeansCode>42</PaymentMeansCode>
    <Details><PaymentDueDate>2026-11-11</PaymentDueDate><ID>1234567890</ID><BankCode>0800</BankCode><Name>Česká spořitelna</Name><IBAN>CZ6508000000192000145399</IBAN><BIC>GIBACZPX</BIC><VariableSymbol>2026777</VariableSymbol></Details>
  </Payment></PaymentMeans>
</Invoice>`;
}

/** Factur-X (CII) slovenského dodávateľa v eurách. */
function facturX(cislo, icoOdberatela) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocument><ram:ID>${cislo}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261028</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Toner</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>20.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>23</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>20.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
<ram:ApplicableHeaderTradeAgreement>
<ram:SellerTradeParty><ram:Name>${cislo} Kancel s.r.o.</ram:Name><ram:SpecifiedLegalOrganization><ram:ID>51234567</ram:ID></ram:SpecifiedLegalOrganization><ram:PostalTradeAddress><ram:PostcodeCode>81101</ram:PostcodeCode><ram:LineOne>Hlavná 1</ram:LineOne><ram:CityName>Bratislava</ram:CityName><ram:CountryID>SK</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">SK2120123456</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>Test</ram:Name><ram:SpecifiedLegalOrganization><ram:ID>${icoOdberatela}</ram:ID></ram:SpecifiedLegalOrganization></ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery/>
<ram:ApplicableHeaderTradeSettlement><ram:PaymentReference>2026302</ram:PaymentReference><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>SK3112000000198742637541</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
<ram:ApplicableTradeTax><ram:CalculatedAmount>4.60</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>20.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>23</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261111</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>20.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>20.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">4.60</ram:TaxTotalAmount><ram:GrandTotalAmount>24.60</ram:GrandTotalAmount><ram:DuePayableAmount>24.60</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}

async function pdfSPrilohou(text, nazov, xml) {
  const { PDFDocument, StandardFonts } = createRequire(import.meta.url)(cestaModulu("pdf-lib"));
  const pdf = await PDFDocument.create();
  const strana = pdf.addPage([595, 842]);
  const pismo = await pdf.embedFont(StandardFonts.Helvetica);
  strana.drawText(text, { x: 50, y: 780, size: 14, font: pismo });
  await pdf.attach(new TextEncoder().encode(xml), nazov, { mimeType: "application/xml" });
  return Buffer.from(await pdf.save());
}

export default {
  popis:
    "appka: QR bloček SK/CZ s povinnou fotkou a orezaním, duplicita, dávka s ISDOC/Factur-X a chybou",
  limit: 300000,
  async spusti(t) {
    const zaciatok = new Date(Date.now() - 60000).toISOString();

    t.uprac("bločky, prijaté faktúry, Nespracované a ich súbory", async () => {
      const zle = [];
      /** Zmaže riadky aj súbory v košíku (riadok súbor v Storage nechá). */
      const zmaz = async (tabulka, filter, kos) => {
        const r = await t.rest.get(`${tabulka}?${filter}&select=id,file_path`);
        if (r.status !== 200) return zle.push(`${tabulka}: ${r.status}`);
        for (const d of r.data ?? []) {
          const z = await t.rest.delete(`${tabulka}?id=eq.${d.id}`);
          if (z.status >= 300) zle.push(`${tabulka} ${d.id}: ${z.status}`);
        }
        const s = await t.rest.zmazSubory(
          kos,
          (r.data ?? []).map((d) => d.file_path),
        );
        if (s.status >= 300) zle.push(`súbory ${kos}: ${s.status} ${s.text.slice(0, 120)}`);
      };
      await zmaz(
        "expense_documents",
        `company_id=eq.${t.firmy.test2}&qr_raw=eq.${QR_SK}`,
        "expense-receipts",
      );
      await zmaz(
        "expense_documents",
        `company_id=eq.${t.firmy.cz}&qr_raw=like.EET*&created_at=gte.${zaciatok}`,
        "expense-receipts",
      );
      await zmaz(
        "purchase_invoices",
        `company_id=eq.${t.firmy.test}&invoice_number=in.(${t.znacka}-ISD,${t.znacka}-FX)`,
        "purchase-invoices",
      );
      // Všetko, čo appka v Test firme počas toku nahrala a ostalo v Nespracovaných.
      await zmaz(
        "nespracovane_doklady",
        `company_id=eq.${t.firmy.test}&zdroj=eq.apka&created_at=gte.${zaciatok}`,
        "nespracovane",
      );
      if (zle.length) throw new Error(zle.join("; "));
    });

    const fotka = await fotkaBlocku({
      riadky: ["OMV Slovensko, s.r.o.", "Nafta 114,60 EUR", "DPH 23 %"],
      uhol: 6,
    });

    await t.krok(
      "SK eKasa: QR → Finančná správa → povinná fotka → orezanie → uloženie",
      async () => {
        const page = await apkaSKamerou(t, "test2", await prazdnyZaber());
        // Úhrada „Hotovosť“ zvolená na skeneri musí prežiť načítanie bločku.
        await zalozka(page, 2);
        await tlacidlo(page, /^Hotovosť$/).click();
        await page.evaluate((u) => window.__e2eKamera(u), dataUrl(await obrazokQr(QR_SK)));
        // QR sa prečíta sám, bloček príde z Finančnej správy a hneď sa otvorí kamera na fotku.
        await kamera(page).waitFor({ timeout: 40000 });
        const pod = await textObrazovky(page);
        t.over(
          /114,60/.test(pod) && /OMV Slovensko/.test(pod),
          "bloček z Finančnej správy nemá sumu/predajcu",
        );
        t.over(/Z Finančnej správy/.test(pod), "bloček sa nečítal z Finančnej správy");

        // Zrušené fotenie: bloček sa bez fotky uložiť nedá.
        await kamera(page).getByRole("button", { name: "Zrušiť" }).click();
        await page.locator("[data-fotka-povinna]").waitFor({ timeout: 10000 });
        t.over(
          await page.locator("[data-chyba-fotka]").isVisible(),
          "bez fotky nie je tlačidlo „Najprv odfoťte bloček“",
        );
        t.over(
          await tlacidlo(page, /Najprv odfoťte/).isDisabled(),
          "bloček bez fotky sa dá uložiť",
        );

        // Odfotenie: obrys musí nájsť papier (nie celý záber) a vyrovnať ho.
        await page.locator("[data-fotka-povinna]").getByRole("button").first().click();
        const rohy = await odfot(page, fotka);
        t.over(rohy.length === 4, `rohov je ${rohy.length}`);
        t.over(
          await uprava(page).getByRole("button", { name: "Celý obraz" }).isVisible(),
          "obrys dokladu sa nenašiel (ponúka sa „Automaticky“ namiesto „Celý obraz“)",
        );
        const xs = rohy.map((r) => r.x);
        const ys = rohy.map((r) => r.y);
        const sirka = Math.max(...xs) - Math.min(...xs);
        const vyska = Math.max(...ys) - Math.min(...ys);
        // Papier na fotke je na výšku (≈ 62 × 78 % fotky 900 × 1300).
        t.over(
          vyska > sirka * 1.3,
          `obrys nesedí na papier: ${Math.round(sirka)} × ${Math.round(vyska)}`,
        );
        await page.locator("[data-ulozit-doklad]").click();
        await uprava(page).waitFor({ state: "detached", timeout: 30000 });

        const text = await textObrazovky(page);
        t.over(!/Najprv odfoťte/.test(text), "po odfotení stále chýba fotka");
        t.over(/Ako ste platili\?/.test(text), "chýba otázka na úhradu");
        const ulozit = page
          .locator("button", { hasText: /Uložiť doklad|Vyberte spôsob úhrady/ })
          .last();
        t.over(
          !/Vyberte spôsob úhrady/.test(await ulozit.innerText()),
          "úhrada zo skenera (Hotovosť) sa stratila — appka sa pýta znova",
        );
        await tlacidlo(page, /^Uložiť doklad$/).click();
        const d = await t.cakajNa(
          "bloček v test2",
          async () => {
            const r = await t.rest.get(
              `expense_documents?company_id=eq.${t.firmy.test2}&qr_raw=eq.${QR_SK}&select=*`,
            );
            return r.data?.[0];
          },
          { limit: 60000 },
        );
        t.over(Number(d.total_amount) === 114.6, `suma ${d.total_amount}`);
        t.over(d.payment_method === "hotovost", `úhrada ${d.payment_method}`);
        t.over(d.source === "qr", `zdroj ${d.source}`);
        t.over(!!d.file_path, "bloček nemá fotku");
      },
    );

    await t.krok("SK eKasa: ten istý bloček vo firme, kde už je → duplicita", async () => {
      const page = await apkaSKamerou(t, "test", await obrazokQr(QR_SK));
      await zalozka(page, 2);
      await kamera(page).waitFor({ timeout: 40000 });
      await kamera(page).getByRole("button", { name: "Zrušiť" }).click();
      await page
        .getByText("Tento doklad už máte", { exact: false })
        .first()
        .waitFor({ timeout: 20000 });
    });

    await t.krok("skener: platobný QR faktúry (PAY by square) neodvedie na bloček", async () => {
      const page = await apkaSKamerou(t, "test", await prazdnyZaber());
      await zalozka(page, 2);
      await page.locator("[data-spust]").waitFor();
      // Platobný QR z faktúry — skener ho má prejsť a čakať na odfotenie.
      await page.evaluate(
        (u) => window.__e2eKamera(u),
        dataUrl(
          await obrazokQr(
            "0004A000B6KJ7J2HR5I1VQ2QDRDRLHU8FAU5RBF3EQGPE4G7Q3UO7AAM6PEU1V03NDPGJ4E7VQ9O80",
          ),
        ),
      );
      await page.waitForTimeout(3000);
      t.over(
        await page.locator("[data-spust]").isVisible(),
        "platobný QR faktúry odviedol skener na čítanie bločku",
      );
    });

    await t.krok("galéria: fotka bločku s QR ide cez Finančnú správu, nie na AI", async () => {
      const page = await apkaSKamerou(t, "test", await prazdnyZaber());
      await zalozka(page, 2);
      await page.getByRole("button", { name: "Galéria / PDF" }).first().click();
      const [vyber] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 20000 }),
        tlacidlo(page, /^Vybrať súbor/).click(),
      ]);
      await vyber.setFiles({
        name: "blocek.png",
        mimeType: "image/png",
        buffer: await fotkaBlocku({ qr: QR_SK, riadky: ["OMV Slovensko", "114,60 EUR"] }),
      });
      await page.getByText("Z Finančnej správy").first().waitFor({ timeout: 40000 });
      t.over(/114,60/.test(await textObrazovky(page)), "bloček z galérie nemá sumu z eKasy");
      // Vo firme Test už je — upozornenie na duplicitu, neukladá sa.
      await page.getByText("Tento doklad už máte").first().waitFor({ timeout: 20000 });
    });

    await t.krok("CZ EET: QR nesie sumu a dátum, uloží sa vo firme QA Česká", async () => {
      const raw = qrEet({
        bkp: "a1b2c3d4-e5f60718",
        dic: "45316872",
        kc: "117.00",
        dt: "202610281215",
      });
      const page = await apkaSKamerou(t, "cz", await obrazokQr(raw));
      await zalozka(page, 2);
      await kamera(page).waitFor({ timeout: 40000 });
      const text = await textObrazovky(page);
      t.over(/117,00/.test(text), "český bloček nemá sumu 117,00");
      t.over(/Kč|CZK/.test(text), "český bloček nie je v korunách");
      t.over(/28\. 10\. 2026/.test(text), "český bloček nemá dátum z QR");
      await odfot(page, fotka);
      await page.locator("[data-ulozit-doklad]").click();
      await uprava(page).waitFor({ state: "detached", timeout: 30000 });
      await tlacidlo(page, /^Kartou$/).click();
      await tlacidlo(page, /^Uložiť doklad$/).click();
      const d = await t.cakajNa(
        "český bloček",
        async () => {
          const r = await t.rest.get(
            `expense_documents?company_id=eq.${t.firmy.cz}&qr_raw=eq.${encodeURIComponent(raw)}&select=*`,
          );
          return r.data?.[0];
        },
        { limit: 60000 },
      );
      t.over(Number(d.total_amount) === 117, `suma ${d.total_amount}`);
      t.over(d.currency === "CZK", `mena ${d.currency}`);
      t.over(d.issue_date === "2026-10-28", `dátum ${d.issue_date}`);
    });

    await t.krok(
      "dávka: ISDOC v PDF (€ od českého dodávateľa), Factur-X a prázdny súbor",
      async () => {
        const ico =
          (await t.rest.get(`companies?id=eq.${t.firmy.test}&select=ico`)).data?.[0]?.ico ?? "";
        const page = await apkaSKamerou(t, "test", await prazdnyZaber());
        await zalozka(page, 2);
        await page.locator("[data-cip-nastavenia]").click();
        await tlacidlo(page, /^Viac dokladov/).click();
        const [vyber] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 20000 }),
          tlacidlo(page, /^Z galérie/).click(),
        ]);
        await vyber.setFiles([
          {
            name: "faktura-isdoc.pdf",
            mimeType: "application/pdf",
            buffer: await pdfSPrilohou(
              `Faktura ${t.znacka}-ISD`,
              "faktura.isdoc",
              isdocVEur(`${t.znacka}-ISD`, ico),
            ),
          },
          {
            name: "faktura-fx.pdf",
            mimeType: "application/pdf",
            buffer: await pdfSPrilohou(
              `Faktura ${t.znacka}-FX`,
              "factur-x.xml",
              facturX(`${t.znacka}-FX`, ico),
            ),
          },
          // Fotka z iCloudu, ktorá sa ešte nestiahla, príde ako prázdny súbor.
          { name: "prazdny.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) },
        ]);
        const polozky = page
          .getByRole("list", { name: "Viac dokladov naraz" })
          .locator("button[data-stav]");
        await t.cakajNa(
          "rozpoznanie dávky",
          async () => {
            const stavy = await polozky.evaluateAll((el) =>
              el.map((e) => e.getAttribute("data-stav")),
            );
            return (
              stavy.length === 3 && !stavy.some((s) => ["caka", "nahravam", "citam"].includes(s))
            );
          },
          { limit: 90000, krok: 1500 },
        );
        const riadky = await polozky.allInnerTexts();
        const stavy = await polozky.evaluateAll((el) => el.map((e) => e.getAttribute("data-stav")));
        t.log(
          "dávka",
          JSON.stringify(riadky.map((r, i) => `${stavy[i]}: ${r.replace(/\s+/g, " ")}`)),
        );
        t.over(stavy[2] === "chyba", `prázdny súbor: stav ${stavy[2]}`);
        t.over(
          !/skúste znova/i.test(riadky[2]) && !/"code"/.test(riadky[2]),
          `prázdny súbor hlási opakovanie alebo JSON: ${riadky[2].replace(/\s+/g, " ").slice(0, 120)}`,
        );
        t.over(await polozky.nth(2).isDisabled(), "prázdny súbor sa dá ťuknutím nahrávať dokola");
        t.over(
          /100,00\s€/.test(riadky[0]),
          `ISDOC: čakal som 100,00 € (mena faktúry), je „${riadky[0].replace(/\s+/g, " ")}“`,
        );
        t.over(/24,60\s€/.test(riadky[1]), `Factur-X: čakal som 24,60 €, je „${riadky[1]}“`);
        const ulozit = tlacidlo(page, /^Uložiť všetky rozpoznané/);
        if (await ulozit.isEnabled()) {
          await ulozit.click();
          await t.cakajNa(
            "hromadné uloženie",
            async () => {
              const s = await polozky.evaluateAll((el) =>
                el.map((e) => e.getAttribute("data-stav")),
              );
              return !s.includes("ukladam") && s.includes("ulozene");
            },
            { limit: 60000, krok: 1000 },
          );
        }
        const p = await t.rest.get(
          `purchase_invoices?company_id=eq.${t.firmy.test}&invoice_number=in.(${t.znacka}-ISD,${t.znacka}-FX)&select=invoice_number,currency,amount_total,supplier_ico`,
        );
        t.log("prijaté", JSON.stringify(p.data));
        const isd = (p.data ?? []).find((x) => x.invoice_number === `${t.znacka}-ISD`);
        const fx = (p.data ?? []).find((x) => x.invoice_number === `${t.znacka}-FX`);
        t.over(
          fx && Number(fx.amount_total) === 24.6 && fx.supplier_ico === "51234567",
          "Factur-X sa neuložil ako prijatá faktúra",
        );
        t.over(!!isd, "ISDOC sa neuložil ako prijatá faktúra");
        t.over(
          isd.currency === "EUR" && Number(isd.amount_total) === 100,
          `ISDOC uložený ako ${isd.amount_total} ${isd.currency}`,
        );
      },
    );
  },
};
