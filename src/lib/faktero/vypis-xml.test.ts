import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { citajBankoveXml } from "./vypis-xml";
import { zostatkyVypisu, skontrolujZostatky } from "./vypis-pohyby";
import { buildCamt053 } from "./bank-statements-own.server";

/**
 * Výpis, aký chodí zo slovenskej banky: symboly zabalené v `EndToEndId`,
 * platba kartou bez protistrany (obchodník je len vo vete banky) a jedna
 * čakajúca platba, ktorá ešte neprešla.
 */
function vypis({
  pohyby = "",
  ucet = "SK0375000000004032809427",
  konecny = "1234.50",
} = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>SK-2026-07</MsgId><CreDtTm>2026-08-01T09:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>0004032809427-2026-07</Id>
   <ElctrncSeqNb>7</ElctrncSeqNb>
   <CreDtTm>2026-08-01T09:00:00</CreDtTm>
   <FrToDt><FrDtTm>2026-07-01T00:00:00</FrDtTm><ToDtTm>2026-07-31T23:59:59</ToDtTm></FrToDt>
   <Acct><Id><IBAN>${ucet}</IBAN></Id><Ccy>EUR</Ccy></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1000.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-07-01</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${konecny}</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-07-31</Dt></Dt></Bal>
   <Ntry>
    <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-05</Dt></BookgDt><ValDt><Dt>2026-07-05</Dt></ValDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>/VS0012345678/SS0000000000/KS0308</EndToEndId></Refs>
     <RltdPties>
      <Cdtr><Nm>Slovak Telekom, a.s.</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>SK9011000000002612345678</IBAN></Id></CdtrAcct>
     </RltdPties>
     <RmtInf><Ustrd>Faktura za telefon 07/2026</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-10</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RCDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>NOTPROVIDED</EndToEndId><Prtry><Tp>VS</Tp><Ref>2026041</Ref></Prtry></Refs>
     <RltdPties>
      <Dbtr><Nm>PALIERA s.r.o.</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SK3111000000002943041234</IBAN></Id></DbtrAcct>
     </RltdPties>
     <RmtInf><Ustrd>Uhrada faktury 2026041</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">165.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-20</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>CCRD</Cd><SubFmlyCd>POSD</SubFmlyCd></Fmly></Domn></BkTxCd>
    <AddtlNtryInf>Platba kartou, Miesto: BOLT.EU BUDAPEST</AddtlNtryInf>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">4000.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts>
    <BookgDt><Dt>2026-07-31</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <AddtlNtryInf>Cakajuca platba</AddtlNtryInf>
   </Ntry>
   ${pohyby}
  </Stmt>
 </BkToCstmrStmt>
</Document>`;
}

/**
 * Ukážka sa najprv overí proti oficiálnej schéme.
 *
 * Bez toho by som si mohol vymyslieť vlastný dialekt, testy by nad ním svietili
 * na zeleno — a súbor z banky by sa aj tak neprečítal.
 */
describe("čítanie výpisu z XML", () => {
  it("ukážka je naozaj camt.053 podľa schémy ISO 20022", () => {
    const xsd = XmlDocument.fromBuffer(
      readFileSync(new URL("./schemy/camt.053.001.02.xsd", import.meta.url)),
    );
    const validator = XsdValidator.fromDoc(xsd);
    const doc = XmlDocument.fromBuffer(Buffer.from(vypis(), "utf8"));
    try {
      expect(() => validator.validate(doc)).not.toThrow();
    } finally {
      doc.dispose();
      validator.dispose();
      xsd.dispose();
    }
  });

  it("prečíta pohyby aj hlavičku a čakajúcu platbu vynechá", () => {
    const { vypis: v, format } = citajBankoveXml(vypis());

    expect(format).toBe("camt.053");
    expect(v.ucet).toBe("SK0375000000004032809427");
    expect(v.mena).toBe("EUR");
    expect(v.cisloVypisu).toBe("7");
    expect(v.datumVypisu).toBe("2026-07-31");

    expect(v.pohyby.map((p) => [p.datum, p.smer, p.suma])).toEqual([
      ["2026-07-05", "vydaj", 100],
      ["2026-07-10", "prijem", 500],
      ["2026-07-20", "vydaj", 165.5],
    ]);
  });

  it("čakajúca platba je vynechaná a povie sa to po slovensky", () => {
    // Jeden riadok nie je „1 nezaúčtovaných riadkov".
    expect(citajBankoveXml(vypis()).varovanie).toContain("1 nezaúčtovaný riadok");
  });

  it("symboly vytiahne z EndToEndId aj z vlastného poľa", () => {
    const [prvy, druhy] = citajBankoveXml(vypis()).vypis.pohyby;

    // Banka VS doplní nulami na desať miest; s nimi by ho Pohoda nespárovala.
    expect(prvy.vs).toBe("12345678");
    expect(prvy.ks).toBe("0308");
    // Samé nuly nie sú symbol.
    expect(prvy.ss).toBeNull();

    expect(druhy.vs).toBe("2026041");
  });

  it("protistranu berie podľa smeru pohybu", () => {
    const [vydaj, prijem, karta] = citajBankoveXml(vypis()).vypis.pohyby;

    expect(vydaj.protistrana).toBe("Slovak Telekom, a.s.");
    expect(vydaj.protiucet).toBe("SK9011000000002612345678");
    expect(prijem.protistrana).toBe("PALIERA s.r.o.");
    expect(prijem.protiucet).toBe("SK3111000000002943041234");

    // Platba kartou protistranu ako pole nemá — obchodník je len vo vete banky.
    expect(karta.protistrana).toBe("BOLT.EU BUDAPEST");
    expect(karta.popis).toContain("Platba kartou");
  });

  it("označenie platby predvyplní z kódu banky aj z textu", () => {
    const [faktura, prijem, karta] = citajBankoveXml(vypis()).vypis.pohyby;

    expect(faktura.oznacenie).toBe("faktura");
    expect(prijem.oznacenie).toBe("faktura");
    // `PMNT/CCRD/POSD` je platba kartou — to vie banka lepšie než text.
    expect(karta.oznacenie).toBe("karta");
  });

  it("dopočíta zostatok po každom pohybe z počiatočného", () => {
    const { vypis: v } = citajBankoveXml(vypis());

    expect(v.pohyby.map((p) => p.zostatok)).toEqual([900, 1400, 1234.5]);
    expect(zostatkyVypisu(v.pohyby)).toEqual({ pociatocny: 1000, konecny: 1234.5 });
    expect(skontrolujZostatky(v.pohyby).medzier).toBe(0);
  });

  it("keď súčet pohybov nesedí so zostatkami, upozorní", () => {
    const { varovanie } = citajBankoveXml(vypis({ konecny: "1300.00" }));
    expect(varovanie).toContain("nesedí so zostatkami");
  });

  it("výpis k druhému účtu nezlieva do prvého", () => {
    const dva = vypis().replace(
      "</BkToCstmrStmt>",
      `<Stmt>
        <Id>iny-ucet</Id>
        <Acct><Id><IBAN>SK1102000000001234567890</IBAN></Id><Ccy>EUR</Ccy></Acct>
        <Ntry><Amt Ccy="EUR">9999.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
         <BookgDt><Dt>2026-07-15</Dt></BookgDt></Ntry>
       </Stmt></BkToCstmrStmt>`,
    );
    const { vypis: v, varovanie } = citajBankoveXml(dva);

    expect(v.pohyby).toHaveLength(3);
    expect(v.pohyby.some((p) => p.suma === 9999)).toBe(false);
    expect(varovanie).toContain("SK1102000000001234567890");
  });

  it("menný priestor s predponou prekáža nesmie", () => {
    const s = vypis()
      .replace(
        /<(\/?)(Document|BkToCstmrStmt|GrpHdr|MsgId|CreDtTm|Stmt|Id|ElctrncSeqNb|FrToDt|FrDtTm|ToDtTm|Acct|IBAN|Ccy|Bal|Tp|CdOrPrtry|Cd|Amt|CdtDbtInd|Dt|Ntry|Sts|BookgDt|ValDt|NtryDtls|TxDtls|Refs|EndToEndId|Prtry|Ref|RltdPties|Cdtr|CdtrAcct|Dbtr|DbtrAcct|Nm|RmtInf|Ustrd|AddtlNtryInf)([ >])/g,
        "<$1ns2:$2$3",
      )
      .replace("xmlns=", "xmlns:ns2=");

    expect(citajBankoveXml(s).vypis.pohyby).toHaveLength(3);
  });

  it("príkaz na úhradu povie, čo to je", () => {
    const pain = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
      <CstmrCdtTrfInitn><GrpHdr><MsgId>X</MsgId></GrpHdr></CstmrCdtTrfInitn></Document>`;
    expect(() => citajBankoveXml(pain)).toThrow(/príkaz na úhradu/);
  });

  it("cudzie XML nezhodí, len povie čo treba stiahnuť", () => {
    expect(() => citajBankoveXml("<faktura><suma>10</suma></faktura>")).toThrow(/camt\.053/);
  });

  it("vlastný vývoz sa načíta späť aj so symbolmi", () => {
    const xml = buildCamt053({
      company: {
        name: "Ukážková firma s.r.o.",
        ico: "12345678",
        street: null,
        zip: null,
        city: null,
        country: "SK",
      },
      account: { iban: "SK0375000000004032809427", account_name: null, currency: "EUR" },
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      opening: 1000,
      closing: 1400,
      createdAt: "2026-08-01T09:00:00.000Z",
      transactions: [
        {
          booking_date: "2026-07-05",
          amount: -100,
          currency: "EUR",
          variable_symbol: "12345678",
          counterparty: "Slovak Telekom, a.s.",
          description: "Faktura za telefon /VS12345678/KS0308",
          transaction_reference: null,
        },
        {
          booking_date: "2026-07-10",
          amount: 500,
          currency: "EUR",
          variable_symbol: null,
          counterparty: "PALIERA s.r.o.",
          description: "Uhrada faktury",
          transaction_reference: null,
        },
      ],
    });

    const { vypis: v } = citajBankoveXml(xml);
    expect(v.ucet).toBe("SK0375000000004032809427");
    expect(v.pohyby.map((p) => [p.smer, p.suma, p.vs, p.protistrana])).toEqual([
      ["vydaj", 100, "12345678", "Slovak Telekom, a.s."],
      ["prijem", 500, null, "PALIERA s.r.o."],
    ]);
    expect(v.pohyby[0].ks).toBe("0308");
    expect(zostatkyVypisu(v.pohyby)).toEqual({ pociatocny: 1000, konecny: 1400 });
  });
});
