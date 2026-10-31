/*
  Import z Pohody (31. 10. 2026): storno, opravný doklad § 25a a XML inej krajiny.

  Do firmy test2 sa nahrá ručne zložená dávka Pohody:
   - faktúra N1 a k nej storno (`cancelDocument`) → N1 musí byť stornovaná
     (status `cancelled`), storno samo nie je doklad;
   - dobropis N2 s vetou „Oprava základu dane podľa § 25a“ → `credit_note`
     s `oprava_25a`, záporný (predtým obyčajný dobropis / vrubopis ťarchopisom).
  Potom české XML (21 %, dateKHDPH) do slovenskej firmy test2 → import sa
  zastaví hneď pri náhľade s hláškou o korunách. Všetko sa na konci zmaže.
*/
import { writeFileSync } from "node:fs";
import path from "node:path";
import { importujZPohody, importovana } from "./60-pohoda-spatny-chod.mjs";

const NS =
  'xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd"';

const faktura = ({
  id,
  typ,
  cislo,
  datum,
  text,
  note = "",
  povodne = "",
  kv = "A1",
  dph = 23,
  cz = false,
}) => `
 <dat:dataPackItem id="${id}" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader>
  <inv:invoiceType>${typ}</inv:invoiceType>
  <inv:number><typ:numberRequested>${cislo}</typ:numberRequested></inv:number>
  <inv:symVar>${cislo.replace(/\D/g, "").slice(-10)}</inv:symVar>${povodne ? `<inv:originalDocumentNumber>${povodne}</inv:originalDocumentNumber>` : ""}
  <inv:date>${datum}</inv:date><inv:dateTax>${datum}</inv:dateTax><inv:dateDue>${datum}</inv:dateDue>${cz ? `<inv:dateKHDPH>${datum}</inv:dateKHDPH>` : ""}
  <inv:text>${text}</inv:text>${note ? `<inv:note>${note}</inv:note>` : ""}${kv && !cz ? `<inv:classificationKVDPH><typ:ids>${kv}</typ:ids></inv:classificationKVDPH>` : ""}
  <inv:partnerIdentity><typ:address><typ:company>E2E odberateľ ${id}</typ:company><typ:ico>35999888</typ:ico><typ:icDph>SK2021999888</typ:icDph></typ:address></inv:partnerIdentity>
 </inv:invoiceHeader>
 <inv:invoiceDetail><inv:invoiceItem><inv:text>Služba</inv:text><inv:quantity>1</inv:quantity><inv:rateVAT>high</inv:rateVAT>
  <inv:homeCurrency><typ:unitPrice>100</typ:unitPrice><typ:price>100</typ:price><typ:priceVAT>${dph}</typ:priceVAT></inv:homeCurrency></inv:invoiceItem></inv:invoiceDetail>
 <inv:invoiceSummary><inv:homeCurrency><typ:priceHigh>100</typ:priceHigh><typ:priceHighVAT>${dph}</typ:priceHighVAT></inv:homeCurrency></inv:invoiceSummary>
 </inv:invoice></dat:dataPackItem>`;

const balik = (polozky) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack ${NS} version="2.0" id="E2E77" ico="86179504" application="E2E" note="E2E">${polozky}\n</dat:dataPack>`;

export default {
  popis:
    "Pohoda import: storno označí doklad ako stornovaný, § 25a ostane opravou, CZ XML do SK firmy sa odmietne",
  limit: 300000,
  async spusti(t) {
    const kod = t.znacka.replace(/\D/g, "").slice(-8);
    const n1 = `E2E${kod}1`;
    const n2 = `E2E${kod}2`;
    const dnes = t.dnes;

    const subor = path.join(t.vystup, "subory", `${t.tok}-storno-25a.xml`);
    writeFileSync(
      subor,
      balik(
        faktura({
          id: "f1",
          typ: "issuedInvoice",
          cislo: n1,
          datum: dnes,
          text: `${t.znacka} storno`,
        }) +
          faktura({
            id: "f2",
            typ: "issuedCreditNotice",
            cislo: n2,
            datum: dnes,
            text: `${t.znacka} § 25a`,
            note: "Oprava základu dane podľa § 25a",
            povodne: n1,
            kv: "C1",
          }) +
          `
 <dat:dataPackItem id="s1" version="2.0"><inv:invoice version="2.0"><inv:cancelDocument><typ:sourceDocument><typ:number>${n1}</typ:number></typ:sourceDocument></inv:cancelDocument>
  <inv:invoiceHeader><inv:invoiceType>issuedInvoice</inv:invoiceType><inv:text>Storno dokladu č. ${n1}</inv:text></inv:invoiceHeader></inv:invoice></dat:dataPackItem>`,
      ),
      "utf8",
    );

    await t.krok("import dávky so stornom a § 25a do test2", async () => {
      const p2 = await t.novaStranka({ firma: "test2" });
      const od = await importujZPohody(t, p2, subor, t.firmy.test2);
      await p2.getByText(/Stornované doklady: 1/).waitFor({ timeout: 15000 });
      const f1 = await importovana(t, t.firmy.test2, n1, od);
      t.over(f1.status === "cancelled", `storno: faktúra ${n1} má stav ${f1.status}`);
      const f2 = await importovana(t, t.firmy.test2, n2, od);
      t.over(f2.type === "credit_note", `§ 25a: druh ${f2.type}`);
      t.over(f2.oprava_25a === true, "§ 25a: chýba príznak oprava_25a");
      t.over(Number(f2.total) === -123, `§ 25a: suma ${f2.total} (čakané -123)`);
      await p2.close();
    });

    await t.krok("české XML do slovenskej firmy sa zastaví pri náhľade", async () => {
      const cz = path.join(t.vystup, "subory", `${t.tok}-cz.xml`);
      writeFileSync(
        cz,
        balik(
          faktura({
            id: "c1",
            typ: "issuedInvoice",
            cislo: `E2E${kod}9`,
            datum: dnes,
            text: "CZ",
            dph: 21,
            cz: true,
          }),
        ),
        "utf8",
      );
      const p2 = await t.novaStranka({ firma: "test2" });
      await t.go("/importy/pohoda", p2);
      await p2.locator('input[type="file"]').first().setInputFiles(cz);
      await p2.getByRole("button", { name: /Načítať náhľad/ }).click();
      await p2
        .getByText(/českej Pohody/)
        .first()
        .waitFor({ timeout: 30000 });
      const r = await t.rest.get(
        `invoices?company_id=eq.${t.firmy.test2}&invoice_number=eq.E2E${kod}9&select=id`,
      );
      t.over(!(r.data ?? []).length, "CZ faktúra sa naimportovala do SK firmy");
      await p2.close();
    });
  },
};
