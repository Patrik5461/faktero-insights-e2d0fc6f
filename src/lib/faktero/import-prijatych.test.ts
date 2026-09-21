import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
  citajCsv,
  cisloZTextu,
  datumZTextu,
  jePohodaXmlObsah,
  klucDuplicity,
  pohodaPrijate,
  priradSkeny,
  tabulkaNaZaznamy,
} from "./import-prijatych";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" id="doklado" ico="12345678" application="Doklado" version="2.0">
  <dat:dataPackItem id="1" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>receivedInvoice</inv:invoiceType>
        <inv:originalDocument>FA2026/0815</inv:originalDocument>
        <inv:symVar>20260815</inv:symVar>
        <inv:date>2026-09-01</inv:date>
        <inv:dateDue>2026-09-15</inv:dateDue>
        <inv:text>Telekomunikačné služby</inv:text>
        <inv:partnerIdentity><typ:address><typ:company>Slovak Telekom, a.s.</typ:company><typ:ico>35763469</typ:ico><typ:icDph>SK2020273893</typ:icDph></typ:address></inv:partnerIdentity>
        <inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>
      </inv:invoiceHeader>
      <inv:invoiceSummary><inv:homeCurrency><typ:priceHigh>100.00</typ:priceHigh><typ:priceHighVAT>23.00</typ:priceHighVAT></inv:homeCurrency></inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
  <dat:dataPackItem id="2" version="2.0">
    <inv:invoice version="2.0"><inv:invoiceHeader><inv:invoiceType>issuedInvoice</inv:invoiceType></inv:invoiceHeader></inv:invoice>
  </dat:dataPackItem>
  <dat:dataPackItem id="3" version="2.0">
    <vch:voucher version="2.0">
      <vch:voucherHeader>
        <vch:voucherType>expense</vch:voucherType>
        <vch:originalDocument>0045/12</vch:originalDocument>
        <vch:date>2026-09-03</vch:date>
        <vch:text>Pohonné hmoty</vch:text>
        <vch:partnerIdentity><typ:address><typ:company>Slovnaft, a.s.</typ:company><typ:ico>31322832</typ:ico></typ:address></vch:partnerIdentity>
      </vch:voucherHeader>
      <vch:voucherDetail><vch:voucherItem><vch:text>Natural 95</vch:text><vch:quantity>40</vch:quantity><vch:homeCurrency><typ:unitPrice>1.30</typ:unitPrice><typ:price>52.00</typ:price><typ:priceVAT>11.96</typ:priceVAT></vch:homeCurrency></vch:voucherItem></vch:voucherDetail>
      <vch:voucherSummary><vch:homeCurrency><typ:priceHigh>52.00</typ:priceHigh><typ:priceHighVAT>11.96</typ:priceHighVAT></vch:homeCurrency></vch:voucherSummary>
    </vch:voucher>
  </dat:dataPackItem>
</dat:dataPack>`;

describe("import prijatých dokladov — Pohoda XML", () => {
  it("rozpozná Pohoda XML", () => {
    expect(jePohodaXmlObsah(XML)).toBe(true);
    expect(jePohodaXmlObsah("<root/>")).toBe(false);
  });

  it("vyberie prijatú faktúru a bloček, vydanú preskočí", () => {
    const z = pohodaPrijate(parser.parse(XML));
    expect(z).toHaveLength(2);
    expect(z[0]).toMatchObject({
      typ: "faktura",
      cislo: "FA2026/0815",
      dodavatel: "Slovak Telekom, a.s.",
      ico: "35763469",
      icDph: "SK2020273893",
      vs: "20260815",
      vystavenie: "2026-09-01",
      splatnost: "2026-09-15",
      zaklad: 100,
      dph: 23,
      spolu: 123,
      uhrada: "prevod",
    });
    expect(z[1]).toMatchObject({
      typ: "blocek",
      cislo: "0045/12",
      dodavatel: "Slovnaft, a.s.",
      spolu: 63.96,
      uhrada: "hotovost",
    });
    expect(z[1]!.polozky[0]).toMatchObject({ name: "Natural 95", quantity: 40, vat_rate: 23 });
  });
});

describe("import prijatých dokladov — tabuľka", () => {
  it("CSV s položkami spojí do dokladov a nájde hlavičku pod názvom firmy", () => {
    const csv = [
      "Export dokladov Faktero Demo s.r.o.;;;;;;;",
      "Typ dokladu;Číslo dokladu;Dodávateľ;IČO;Dátum vystavenia;Dátum splatnosti;Suma s DPH;Názov položky;Množstvo;Jednotková cena",
      'Prijatá faktúra;FA-1;"Firma ""A"", s.r.o.";12345678;1.9.2026;15.9.2026;"1 230,00";Servis;1;1000',
      "Prijatá faktúra;FA-1;\"Firma \"\"A\"\", s.r.o.\";12345678;1.9.2026;15.9.2026;\"1 230,00\";Materiál;2;0",
      "Pokladničný doklad;B-7;Shell;;3.9.2026;;45,10;;;",
    ].join("\r\n");
    const z = tabulkaNaZaznamy(citajCsv(csv), "CSV");
    expect(z).toHaveLength(2);
    expect(z[0]).toMatchObject({
      typ: "faktura",
      cislo: "FA-1",
      dodavatel: 'Firma "A", s.r.o.',
      vystavenie: "2026-09-01",
      splatnost: "2026-09-15",
      spolu: 1230,
    });
    expect(z[0]!.polozky.map((p) => p.name)).toEqual(["Servis", "Materiál"]);
    expect(z[1]).toMatchObject({ typ: "blocek", cislo: "B-7", spolu: 45.1 });
  });

  it("bez hlavičky s aspoň dvomi známymi stĺpcami nevráti nič", () => {
    expect(tabulkaNaZaznamy([["a", "b"], ["1", "2"]], "CSV")).toEqual([]);
  });

  it("čísla a dátumy vrátane Excelu", () => {
    expect(cisloZTextu("1.234,56 €")).toBe(1234.56);
    expect(cisloZTextu("")).toBeNull();
    expect(datumZTextu(46266)).toBe("2026-09-01");
    expect(datumZTextu("")).toBeNull();
  });
});

describe("skeny a duplicity", () => {
  it("sken sa priradí podľa čísla dokladu v mene súboru", () => {
    const m = priradSkeny(
      [{ cislo: "FA2026/0815" }, { cislo: "12" }, { cislo: "0045/12" }],
      [{ meno: "Slovnaft_0045-12.pdf" }, { meno: "fa2026_0815.PDF" }, { meno: "iny.pdf" }],
    );
    expect(m.get(0)).toBe(1);
    expect(m.get(2)).toBe(0);
    expect(m.has(1)).toBe(false);
  });

  it("kľúč duplicity nezávisí od zápisu čísla", () => {
    const a = { typ: "faktura" as const, cislo: "FA 2026/0815", ico: "35763469", dodavatel: "X", vystavenie: null, spolu: 1 };
    const b = { ...a, cislo: "fa2026-0815", dodavatel: "Y" };
    expect(klucDuplicity(a)).toBe(klucDuplicity(b));
  });
});

import { riadokBlocku, riadokPrijatejFaktury, zaznamZAI } from "./import-prijatych";

describe("riadky do databázy", () => {
  const zaklad = {
    typ: "faktura" as const, zdroj: "Pohoda XML", cislo: null, dodavatel: null, ico: null, dic: null, icDph: null,
    iban: null, vs: null, vystavenie: null, splatnost: null, zaklad: 100, dph: 23, spolu: null, mena: "EUR",
    uhrada: null, poznamka: null, druh: "Dobropis", polozky: [],
  };

  it("prijatá faktúra dostane náhrady za povinné polia a dopočíta sumu", () => {
    const r = riadokPrijatejFaktury(zaklad, { stav: "exported", dnes: "2026-09-21", zdrojAplikacie: "Doklado" });
    expect(r).toMatchObject({
      supplier_name: "Neurčený dodávateľ",
      invoice_number: "bez čísla",
      issue_date: "2026-09-21",
      due_date: "2026-09-21",
      amount_total: 123,
      status: "booked",
      source: "import",
    });
    expect(r.note).toContain("Dobropis");
    expect(r.note).toContain("Importované z Doklado");
  });

  it("hotovostný bloček mimo pokladne", () => {
    const b = { ...zaklad, typ: "blocek" as const, uhrada: "hotovost" as const, spolu: 12, zaklad: null, dph: null };
    const mimo = riadokBlocku(b, { stav: "processed", dnes: "2026-09-21", zdrojAplikacie: "Doklado", doPokladne: false });
    expect(mimo.payment_method).toBe("hotovost");
    expect(mimo.mimo_pokladne).toBe(true);
    expect(mimo.note).toContain("do pokladne sa nezapočítalo");
    expect(mimo.processed_at).not.toBeNull();
    expect(mimo.exported_at).toBeNull();
    const v = riadokBlocku(b, { stav: "exported", dnes: "2026-09-21", zdrojAplikacie: "Doklado", doPokladne: true });
    expect(v.payment_method).toBe("hotovost");
    expect(v.mimo_pokladne).toBe(false);
    const bezUhrady = riadokBlocku({ ...b, uhrada: null }, { stav: "new", dnes: "2026-09-21", zdrojAplikacie: "Doklado", doPokladne: false });
    expect(bezUhrady.payment_method).toBe("karta");
    expect(v.exported_at).not.toBeNull();
  });

  it("sken prečítaný AI: faktúra podľa čísla, inak bloček", () => {
    expect(zaznamZAI({ invoice_number: "FA1", amount_total: "10,5" }, "a.pdf")).toMatchObject({ typ: "faktura", spolu: 10.5 });
    expect(zaznamZAI({ supplier_name: "Shell", amount_total: 40 }, "b.jpg")).toMatchObject({ typ: "blocek", dodavatel: "Shell" });
  });
});
