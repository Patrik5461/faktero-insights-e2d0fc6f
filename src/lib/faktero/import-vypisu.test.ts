import { describe, it, expect } from "vitest";
import { rozberVypis, rovnakyUcet, odtlacok } from "./import-vypisu";

/** Výpis, aký chodí z banky: príjem, výdaj a dva rovnaké poplatky v ten istý deň. */
function vypis(ucet = "SK0375000000004032809427"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>M1</MsgId><CreDtTm>2026-08-01T09:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>S1</Id><ElctrncSeqNb>7</ElctrncSeqNb><CreDtTm>2026-08-01T09:00:00</CreDtTm>
   <Acct><Id><IBAN>${ucet}</IBAN></Id><Ccy>EUR</Ccy></Acct>
   <Ntry>
    <Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-10</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RCDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><Prtry><Tp>VS</Tp><Ref>2026041</Ref></Prtry></Refs>
     <RltdPties><Dbtr><Nm>PALIERA s.r.o.</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SK3111000000002943041234</IBAN></Id></DbtrAcct></RltdPties>
     <RmtInf><Ustrd>Uhrada faktury 2026041</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-05</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>/VS0012345678/SS0000000000/KS0308</EndToEndId></Refs>
     <RltdPties><Cdtr><Nm>Slovak Telekom, a.s.</Nm></Cdtr></RltdPties>
     <RmtInf><Ustrd>Faktura za telefon</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-31</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <AddtlNtryInf>Poplatok za polozku</AddtlNtryInf>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-31</Dt></BookgDt>
    <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>ICDT</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd>
    <AddtlNtryInf>Poplatok za polozku</AddtlNtryInf>
   </Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;
}

describe("import bankového výpisu", () => {
  it("prečíta pohyby so správnym znamienkom, symbolom aj protistranou", () => {
    const r = rozberVypis(vypis());
    expect(r.ucet).toBe("SK0375000000004032809427");
    expect(r.mena).toBe("EUR");
    expect(r.pohyby).toHaveLength(4);

    const prijem = r.pohyby.find((p) => p.amount > 0)!;
    expect(prijem.amount).toBe(500);
    expect(prijem.variable_symbol).toBe("2026041");
    expect(prijem.counterparty).toBe("PALIERA s.r.o.");

    const telekom = r.pohyby.find((p) => p.counterparty === "Slovak Telekom, a.s.")!;
    // Výdaj musí ísť do evidencie záporne — inak by sa zostatok počítal naopak.
    expect(telekom.amount).toBe(-100);
    // SEPA dopĺňa VS zľava nulami na desať miest; na faktúre je 12345678 a
    // párovanie musí dostať to isté číslo.
    expect(telekom.variable_symbol).toBe("12345678");
  });

  it("obdobie berie z pohybov, nie z hlavičky", () => {
    const r = rozberVypis(vypis());
    expect(r.odDna).toBe("2026-07-05");
    expect(r.doDna).toBe("2026-07-31");
  });

  /*
    Toto je vlastný dôvod, prečo odtlačok vôbec existuje: bez neho by sa dal
    ten istý výpis nahrať dvakrát a pohyby by v účtovníctve pribudli druhýkrát.
  */
  it("ten istý výpis dá tie isté odtlačky — druhé nahranie nič nepridá", () => {
    const a = rozberVypis(vypis()).pohyby.map((p) => p.transaction_reference);
    const b = rozberVypis(vypis()).pohyby.map((p) => p.transaction_reference);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });

  it("dva rovnaké poplatky v ten istý deň ostanú dva", () => {
    const poplatky = rozberVypis(vypis()).pohyby.filter((p) => p.amount === -5);
    expect(poplatky).toHaveLength(2);
    expect(poplatky[0].transaction_reference).not.toBe(poplatky[1].transaction_reference);
  });

  it("odtlačok rozlíši pohyby, ktoré sa líšia len sumou alebo dňom", () => {
    const zaklad = { datum: "2026-07-01", suma: 10, smer: "vydaj" as const, vs: "1" };
    expect(odtlacok(zaklad, 1)).not.toBe(odtlacok({ ...zaklad, suma: 11 }, 1));
    expect(odtlacok(zaklad, 1)).not.toBe(odtlacok({ ...zaklad, datum: "2026-07-02" }, 1));
  });

  it("nezrozumiteľný súbor zhodí čítanie, nevráti prázdno", () => {
    expect(() => rozberVypis("toto nie je XML")).toThrow();
  });

  it("účty porovnáva bez medzier a v oboch tvaroch zápisu", () => {
    expect(rovnakyUcet("SK03 7500 0000 0040 3280 9427", "SK0375000000004032809427")).toBe(true);
    expect(rovnakyUcet("SK0375000000004032809427", "SK9011000000002612345678")).toBe(false);
    expect(rovnakyUcet(null, "SK0375000000004032809427")).toBe(false);
  });
});
