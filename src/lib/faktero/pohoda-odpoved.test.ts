/*
  Odpoveď Pohody (`responsePack`) — vzory Stormware (stormware.sk/xml/samples
  a stormware.cz/xml/samples, version_2, adresár Response) a chyby podľa
  response.xsd / documentresponse.xsd.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rozoberBalikOdpovede, suhrnOdpovede } from "./pohoda-odpoved";
import { dekodujOdpoved } from "./pohoda-konektor.server";

const vzor = (meno: string) => {
  const b = readFileSync(new URL(`./__fixtures__/pohoda-odpovede/${meno}`, import.meta.url));
  return dekodujOdpoved(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe("responsePack — vzory Stormware", () => {
  it("SK vydaná faktúra: ok s upozorneniami 603 — číslo z Pohody a upozornenia sa nestratia", () => {
    const o = rozoberBalikOdpovede(vzor("sk_Response_vydana_faktura_pdf.xml"));
    expect(o.stav).toBe("ok");
    expect(o.ico).toBe("36255789");
    expect(o.polozky).toHaveLength(1);
    const p = o.polozky[0]!;
    expect(p).toMatchObject({ id: "01", stav: "warning", cislo: "FV00123", agenda: "invoice" });
    expect(p.detaily!.filter((d) => d.errno === 603)).toHaveLength(8);
    // Diakritika z Windows-1250 a pole, ktoré Pohoda upravila.
    expect(p.poznamka).toContain("Neznámy účet");
    expect(p.poznamka).toContain("account:");
    expect(p.poznamka).toContain("TABA");
  });

  it("SK storno: detail so stavom ok nie je upozornenie", () => {
    const o = rozoberBalikOdpovede(vzor("sk_Response_invoiceStorno.xml"));
    expect(o.polozky[0]).toMatchObject({
      id: "POL001",
      stav: "ok",
      cislo: "FV111114",
      poznamka: null,
    });
  });

  it("CZ cudzia mena: 602 (homeCurrency sa pri cudzej mene nepoužíva) ako upozornenie", () => {
    const o = rozoberBalikOdpovede(vzor("cz_Response_invoice_03_v2.0.xml"));
    expect(o.polozky.map((p) => [p.id, p.stav, p.cislo])).toEqual([
      ["CM001", "warning", "140100018"],
      ["CM002", "warning", "140100019"],
    ]);
    expect(o.polozky[0]!.poznamka).toContain("[602]");
  });
});

const obal = (vnutro: string, atr = 'state="ok"') =>
  `<?xml version="1.0" encoding="utf-8"?><rsp:responsePack version="2.0" id="FAKTERO" ${atr} xmlns:rsp="r" xmlns:rdc="d" xmlns:inv="i">${vnutro}</rsp:responsePack>`;

describe("responsePack — chyby", () => {
  it("odmietnutý doklad: chyba s kódom, poľom a vysvetlením po slovensky", () => {
    const o = rozoberBalikOdpovede(
      obal(`<rsp:responsePackItem version="2.0" id="a1" state="error"><inv:invoiceResponse version="2.0" state="error">
        <rdc:importDetails><rdc:detail><rdc:state>error</rdc:state><rdc:errno>108</rdc:errno>
        <rdc:note>Položka 'UDpdp' nebola nájdená.</rdc:note>
        <rdc:XPath>/dat:dataPack/dat:dataPackItem[1]/inv:invoice[1]/inv:invoiceHeader[1]/inv:classificationVAT</rdc:XPath>
        <rdc:valueRequested>UDpdp</rdc:valueRequested></rdc:detail>
        <rdc:detail><rdc:state>warning</rdc:state><rdc:errno>603</rdc:errno><rdc:note>upravené</rdc:note></rdc:detail></rdc:importDetails>
        </inv:invoiceResponse></rsp:responsePackItem>`),
    );
    const p = o.polozky[0]!;
    expect(p.stav).toBe("error");
    expect(p.poznamka).toContain("[108]");
    expect(p.poznamka).toContain("classificationVAT:");
    expect(p.poznamka).toContain("skratka");
    // Pri chybe sa upozornenia nepletú do dôvodu.
    expect(p.poznamka).not.toContain("upravené");
  });

  it("duplicita dávky (recordDuplicity): doklad už v Pohode je — nie je to chyba na opakovanie", () => {
    const o = rozoberBalikOdpovede(
      obal(`<rsp:responsePackItem version="2.0" id="a2" state="error"><rsp:errorDetail><rsp:recordDuplicity>
        <rsp:agendaType>vydaná faktúra</rsp:agendaType><rsp:id>17</rsp:id><rsp:number>FV0017</rsp:number>
        </rsp:recordDuplicity></rsp:errorDetail></rsp:responsePackItem>`),
    );
    expect(o.polozky[0]).toMatchObject({
      id: "a2",
      stav: "warning",
      duplicita: true,
      cislo: "FV0017",
    });
  });

  it("odmietnutý celý balík (prihlásenie) bez položiek sa ohlási", () => {
    const o = rozoberBalikOdpovede(obal("", 'state="error" note="Chyba prihlásenia (554)"'));
    expect(o.stav).toBe("error");
    expect(suhrnOdpovede(o).vety[0]).toContain("Chyba prihlásenia");
  });

  it("chyba bez detailov: dôvod z errorDetail", () => {
    const o = rozoberBalikOdpovede(
      obal(
        `<rsp:responsePackItem version="2.0" id="a3" state="error"><rsp:errorDetail>Neplatný formát dátumu</rsp:errorDetail></rsp:responsePackItem>`,
      ),
    );
    expect(o.polozky[0]).toMatchObject({ stav: "error", poznamka: "Neplatný formát dátumu" });
  });
});
