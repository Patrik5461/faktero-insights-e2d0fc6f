import { describe, expect, it } from "vitest";
import {
  extractAccountIban,
  parseStatementObjectName,
} from "./bank-statements-restore.server";

describe("parseStatementObjectName", () => {
  it("rozozná vlastný výpis a dopočíta hranice mesiaca", () => {
    expect(parseStatementObjectName("2026-07-faktero.xml")).toEqual({
      period: "2026-07",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      exportType: "XML",
      source: "faktero",
    });
  });

  it("výpis bez prípony -faktero je od banky", () => {
    const r = parseStatementObjectName("2026-07.pdf");
    expect(r?.source).toBe("tatrabanka");
    expect(r?.exportType).toBe("PDF");
  });

  it("správne uzavrie február v priestupnom roku", () => {
    expect(parseStatementObjectName("2024-02.xml")?.periodEnd).toBe("2024-02-29");
  });

  it("správne uzavrie február v nepriestupnom roku", () => {
    expect(parseStatementObjectName("2026-02.xml")?.periodEnd).toBe("2026-02-28");
  });

  it("uzavrie aj mesiace s 30 dňami", () => {
    expect(parseStatementObjectName("2025-11.xml")?.periodEnd).toBe("2025-11-30");
  });

  it("odmietne cudzie súbory", () => {
    expect(parseStatementObjectName("poznamky.txt")).toBeNull();
    expect(parseStatementObjectName("2026-13.xml")).toBeNull();
    expect(parseStatementObjectName("2026-07-faktero.json")).toBeNull();
  });
});

describe("extractAccountIban", () => {
  // Skrátené, ale doslovné začiatky reálnych súborov z produkcie.
  const vlastny =
    '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">' +
    "<BkToCstmrStmt><GrpHdr><MsgId>FAKTERO-SK9102000000007196323355-202607</MsgId></GrpHdr>" +
    "<Stmt><Id>x</Id><Acct><Id><IBAN>SK9102000000007196323355</IBAN></Id><Ccy>EUR</Ccy></Acct>";

  const odBanky =
    '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">' +
    "<BkToCstmrStmt><GrpHdr><MsgId>TATRSKBXXXX</MsgId></GrpHdr><Stmt><Id>y</Id>" +
    "<Acct><Id><IBAN>SK2211000000002947128022</IBAN></Id><Tp><Prtry>BU</Prtry></Tp></Acct>";

  it("prečíta IBAN z vlastného výpisu", () => {
    expect(extractAccountIban(vlastny)).toBe("SK9102000000007196323355");
  });

  it("prečíta IBAN z výpisu od banky", () => {
    expect(extractAccountIban(odBanky)).toBe("SK2211000000002947128022");
  });

  it("nenechá sa zmiasť IBAN-om protistrany v pohybe", () => {
    const s =
      vlastny +
      "<Ntry><NtryDtls><TxDtls><RltdPties><CdtrAcct><Id><IBAN>SK3112000000001111111111</IBAN></Id>" +
      "</CdtrAcct></RltdPties></TxDtls></NtryDtls></Ntry>";
    expect(extractAccountIban(s)).toBe("SK9102000000007196323355");
  });

  it("vráti null, keď účet v súbore nie je", () => {
    expect(extractAccountIban("<Document><BkToCstmrStmt/></Document>")).toBeNull();
  });
});
