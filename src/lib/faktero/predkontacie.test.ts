import { describe, expect, it } from "vitest";
import {
  jeIdCiselnika,
  ponuka,
  pridajZiadost,
  rozdelCsv,
  rozoberCiselnikyPohody,
  rozoberTabulku,
  ziadostCiselnikov,
} from "./predkontacie";

const ODPOVED = `<?xml version="1.0" encoding="Windows-1250"?>
<rsp:responsePack version="2.0" id="FAKTERO" state="ok" xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd" xmlns:vat="http://www.stormware.cz/schema/version_2/classificationVAT.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <rsp:responsePackItem version="2.0" id="CIS-PREDKONTACIE" state="ok">
    <lst:listAccountingDoubleEntry version="2.0" dateTimeStamp="2026-10-06T12:00:00" dateValidFrom="2026-10-06" state="ok">
      <lst:itemAccounting id="12" code="1Fp" accounting="Nákup materiálu &amp; tovaru" agenda="receivedInvoice" debit="501" credit="321"/>
      <lst:itemAccounting id="13" code="3Fv" accounting="Tržby za služby" agenda="issuedInvoice" debit="311" credit="602"/>
    </lst:listAccountingDoubleEntry>
  </rsp:responsePackItem>
  <rsp:responsePackItem version="2.0" id="CIS-PREDKONTACIE-JU" state="ok">
    <lst:listAccountingSingleEntry version="2.0" state="ok"/>
  </rsp:responsePackItem>
  <rsp:responsePackItem version="2.0" id="CIS-CLENENIE" state="ok">
    <lst:listClassificationVAT version="2.0" state="ok">
      <lst:classificationVAT version="2.0">
        <vat:classificationVATHeader>
          <vat:id>4</vat:id>
          <vat:code>PD</vat:code>
          <vat:name>Tuzemské plnenie s nárokom na odpočet</vat:name>
          <vat:VATType><typ:ids>prijaté plnenia</typ:ids></vat:VATType>
          <vat:offer>true</vat:offer>
        </vat:classificationVATHeader>
      </lst:classificationVAT>
      <lst:classificationVAT version="2.0">
        <vat:classificationVATHeader>
          <vat:code>PDstare</vat:code>
          <vat:name>Staré</vat:name>
          <vat:VATType><typ:ids>prijaté plnenia</typ:ids></vat:VATType>
          <vat:offer>true</vat:offer>
          <vat:validTill>2020-12-31</vat:validTill>
        </vat:classificationVATHeader>
      </lst:classificationVAT>
    </lst:listClassificationVAT>
  </rsp:responsePackItem>
</rsp:responsePack>`;

describe("odpoveď Pohody", () => {
  const z = rozoberCiselnikyPohody(ODPOVED, new Date("2026-10-06"));

  it("číta predkontácie s účtami a agendou", () => {
    const fp = z.find((x) => x.kod === "1Fp")!;
    expect(fp).toMatchObject({
      druh: "predkontacia",
      popis: "Nákup materiálu & tovaru",
      agenda: "receivedInvoice",
      ucet_md: "501",
      ucet_d: "321",
      pohoda_id: "12",
    });
  });

  it("číta členenie DPH a neplatné označí ako neaktívne", () => {
    expect(z.find((x) => x.kod === "PD")).toMatchObject({
      druh: "clenenie_dph",
      popis: "Tuzemské plnenie s nárokom na odpočet",
      agenda: "prijaté plnenia",
      aktivne: true,
    });
    expect(z.find((x) => x.kod === "PDstare")?.aktivne).toBe(false);
  });

  it("jednoduché účtovníctvo nemá účty", () => {
    const ju = rozoberCiselnikyPohody(
      `<lst:listAccountingSingleEntry><lst:itemAccounting code="P01" accounting="Tovar" agenda="receivedInvoice" accountingType="výdaj"/></lst:listAccountingSingleEntry>`,
    );
    expect(ju).toEqual([
      expect.objectContaining({ kod: "P01", popis: "Tovar", ucet_md: null, ucet_d: null }),
    ]);
  });
});

describe("žiadosť do Pohody", () => {
  it("samostatný súbor má menný priestor list a šesť položiek", () => {
    const x = ziadostCiselnikov("12345678");
    expect(x).toContain('xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"');
    expect(x.match(/<dat:dataPackItem /g)).toHaveLength(6);
  });

  it("do dávky sa pridá raz a s menným priestorom", () => {
    const davka = `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="X" ico="1" application="Faktero" version="2.0" note="n"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem id="a" version="2.0"></dat:dataPackItem>
</dat:dataPack>`;
    const x = pridajZiadost(davka, "1");
    expect(x.match(/xmlns:lst=/g)).toHaveLength(1);
    expect(x.indexOf("CIS-CLENENIE")).toBeLessThan(x.indexOf("</dat:dataPack>"));
    expect(x.indexOf('id="a"')).toBeLessThan(x.indexOf("CIS-PREDKONTACIE"));
  });

  it("prázdna dávka dostane vlastnú obálku", () => {
    expect(pridajZiadost("", "1")).toContain("CIS-PREDKONTACIE");
  });

  it("rozozná položky číselníka", () => {
    expect(jeIdCiselnika("CIS-CLENENIE")).toBe(true);
    expect(jeIdCiselnika("8f0e…")).toBe(false);
  });
});

describe("tabuľka", () => {
  it("nájde hlavičku pod nadpisom a preloží agendu", () => {
    const r = rozoberTabulku(
      rozdelCsv(
        'Predkontácie firmy\nSkratka;Text;Agenda;MD;D\n1Fp;"Materiál; réžia";Prijaté faktúry;501;321\n;prázdny\n',
      ),
    );
    expect(r.chyba).toBeNull();
    expect(r.zaznamy).toEqual([
      expect.objectContaining({
        kod: "1Fp",
        popis: "Materiál; réžia",
        agenda: "receivedInvoice",
        ucet_md: "501",
        ucet_d: "321",
      }),
    ]);
  });

  it("bez stĺpca s kódom povie prečo", () => {
    expect(rozoberTabulku([["a", "b"], ["1", "2"]]).chyba).toMatch(/stĺpec s kódom/);
  });

  it("stĺpec druh rozdelí predkontácie a členenia", () => {
    const r = rozoberTabulku([
      ["Kód", "Popis", "Druh"],
      ["PD", "Tuzemské", "Členenie DPH"],
      ["1Fp", "Materiál", "Predkontácia"],
    ]);
    expect(r.zaznamy.map((z) => z.druh)).toEqual(["clenenie_dph", "predkontacia"]);
  });
});

describe("ponuka", () => {
  it("vhodná agenda ide prvá, neaktívne a duplicity von", () => {
    const z = rozoberCiselnikyPohody(ODPOVED, new Date("2026-10-06"));
    expect(ponuka(z, "predkontacia", ["issuedInvoice"]).map((p) => p.kod)).toEqual(["3Fv", "1Fp"]);
    expect(ponuka(z, "clenenie_dph").map((p) => p.kod)).toEqual(["PD"]);
    expect(ponuka(z, "predkontacia", ["receivedInvoice"])[0]).toMatchObject({
      kod: "1Fp",
      ucty: "501/321",
    });
  });
});

describe("strediská, činnosti a číselné rady z Pohody", () => {
  it("prečíta itemCentre, itemActivity a numericalSeries", () => {
    const xml = `<rsp:responsePack><rsp:responsePackItem id="CIS-STREDISKA" state="ok"><lst:listCentre version="2.0"><lst:itemCentre id="1" code="BA" name="Bratislava"/></lst:listCentre></rsp:responsePackItem>
<rsp:responsePackItem id="CIS-CINNOSTI" state="ok"><lst:listActivity version="2.0"><lst:itemActivity id="2" code="VYR" name="Výroba"/></lst:listActivity></rsp:responsePackItem>
<rsp:responsePackItem id="CIS-RADY" state="ok"><lst:listNumericalSeries version="2.0"><lst:numericalSeries version="2.0"><nms:numericalSeriesHeader><nms:id>7</nms:id><nms:prefix>26FP</nms:prefix><nms:number>1</nms:number><nms:name>Prijaté faktúry</nms:name><nms:agenda>prijate_faktury</nms:agenda><nms:typeOfDocument>prijate_faktury_faktura</nms:typeOfDocument><nms:period>yearlong</nms:period><nms:year>2026</nms:year></nms:numericalSeriesHeader></lst:numericalSeries></lst:listNumericalSeries></rsp:responsePackItem></rsp:responsePack>`;
    const z = rozoberCiselnikyPohody(xml, new Date("2026-10-06"));
    expect(z.find((x) => x.druh === "stredisko")).toMatchObject({ kod: "BA", popis: "Bratislava" });
    expect(z.find((x) => x.druh === "cinnost")).toMatchObject({ kod: "VYR", popis: "Výroba" });
    expect(z.find((x) => x.druh === "ciselny_rad")).toMatchObject({
      kod: "26FP",
      popis: "Prijaté faktúry · 2026",
      agenda: "prijate_faktury:prijate_faktury_faktura",
      aktivne: true,
    });
  });

  it("žiadosť pýta aj strediská, činnosti a rady", () => {
    const x = ziadostCiselnikov("1");
    expect(x).toContain("listCentreRequest");
    expect(x).toContain("listActivityRequest");
    expect(x).toContain("listNumericalSeriesRequest");
  });
});
