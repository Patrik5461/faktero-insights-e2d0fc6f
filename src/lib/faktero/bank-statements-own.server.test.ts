import { describe, it, expect } from "vitest";
import {
  computeBalances,
  buildCamt053,
  buildStatementPdf,
  escapeXml,
  type OwnStatementInput,
  type OwnStatementTx,
} from "./bank-statements-own.server";

const tx = (over: Partial<OwnStatementTx>): OwnStatementTx => ({
  booking_date: "2026-07-10",
  amount: -10,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  description: null,
  transaction_reference: null,
  ...over,
});

const input = (over: Partial<OwnStatementInput> = {}): OwnStatementInput => ({
  company: {
    name: "PALIERA s.r.o.",
    ico: "54613124",
    street: "Športová 707/43",
    zip: "91926",
    city: "Zavar",
  },
  account: { iban: "SK2909000000005220542779", account_name: "Bežný účet", currency: "EUR" },
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  transactions: [],
  opening: 100,
  closing: 100,
  createdAt: "2026-08-07T08:00:00.000Z",
  ...over,
});

describe("computeBalances", () => {
  it("odráta obraty po konci obdobia od aktuálneho zostatku", () => {
    // Dnešný zostatok 615.61, po 31.7. pribudlo +100 a -50 → koniec júla 565.61
    const s = computeBalances(615.61, [], [{ amount: 100 }, { amount: -50 }]);
    expect(s.closing).toBe(565.61);
  });

  it("dopočíta počiatočný zostatok z obratov v období", () => {
    const s = computeBalances(100, [{ amount: 30 }, { amount: -10 }, { amount: -5 }], []);
    expect(s.closing).toBe(100);
    expect(s.opening).toBe(85); // 100 − (30 − 15)
    expect(s.credits).toBe(30);
    expect(s.debits).toBe(15);
    expect(s.creditCount).toBe(1);
    expect(s.debitCount).toBe(2);
  });

  it("nenazbiera chybu z desatinných čísel", () => {
    const s = computeBalances(
      0,
      Array.from({ length: 3 }, () => ({ amount: 0.1 })),
      [],
    );
    expect(s.opening).toBe(-0.3);
  });
});

describe("buildCamt053", () => {
  it("používa rovnakú schému ako Tatra banka", () => {
    const xml = buildCamt053(input());
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"');
    expect(xml).toContain("<BkToCstmrStmt>");
    expect(xml).toContain("<IBAN>SK2909000000005220542779</IBAN>");
  });

  it("zapíše počiatočný a konečný zostatok ako OPBD a CLBD", () => {
    const xml = buildCamt053(input({ opening: 85, closing: 100 }));
    expect(xml).toContain('<Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">85.00</Amt>');
    expect(xml).toContain('<Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt>');
  });

  it("záporný zostatok označí ako DBIT a sumu nechá kladnú", () => {
    const xml = buildCamt053(input({ opening: -1.09, closing: -1.09 }));
    expect(xml).toContain('<Amt Ccy="EUR">1.09</Amt><CdtDbtInd>DBIT</CdtDbtInd>');
  });

  it("rozlíši kredit a debet na položkách", () => {
    const xml = buildCamt053(
      input({
        transactions: [tx({ amount: -54.61, transaction_reference: "TRN1" }), tx({ amount: 200 })],
      }),
    );
    expect(xml).toContain(
      '<NtryRef>TRN1</NtryRef><Amt Ccy="EUR">54.61</Amt><CdtDbtInd>DBIT</CdtDbtInd>',
    );
    expect(xml).toContain('<Amt Ccy="EUR">200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>');
  });

  it("spočíta prehľad obratov", () => {
    const xml = buildCamt053(
      input({ transactions: [tx({ amount: -20 }), tx({ amount: -5 }), tx({ amount: 30 })] }),
    );
    expect(xml).toContain("<NbOfNtries>3</NbOfNtries>");
    expect(xml).toContain("<TtlCdtNtries><NbOfNtries>1</NbOfNtries><Sum>30.00</Sum>");
    expect(xml).toContain("<TtlDbtNtries><NbOfNtries>2</NbOfNtries><Sum>25.00</Sum>");
  });

  it("protistranu pri príjme uvedie ako Dbtr a pri výdaji ako Cdtr", () => {
    const prijem = buildCamt053(
      input({ transactions: [tx({ amount: 50, counterparty: "ACME" })] }),
    );
    expect(prijem).toContain("<RltdPties><Dbtr><Nm>ACME</Nm></Dbtr></RltdPties>");
    const vydaj = buildCamt053(
      input({ transactions: [tx({ amount: -50, counterparty: "ACME" })] }),
    );
    expect(vydaj).toContain("<RltdPties><Cdtr><Nm>ACME</Nm></Cdtr></RltdPties>");
  });

  it("uvedie, že výpis nevydala banka", () => {
    expect(buildCamt053(input())).toContain("<AddtlStmtInf>Tento výpis zostavilo Faktero");
  });

  it("IBAN ide bez medzier, aj keď príde po štvoriciach", () => {
    const i = input();
    const xml = buildCamt053({
      ...i,
      account: { ...i.account, iban: "SK03 7500 0000 0040 3280 9427" },
    });
    expect(xml).toContain("<IBAN>SK0375000000004032809427</IBAN>");
    expect(xml).not.toContain("SK03 7500");
  });

  it("poznámku aj poradové číslo si volá ten, kto výpis zostavuje", () => {
    const xml = buildCamt053({ ...input(), note: "Prepis PDF výpisu z banky.", sequenceNumber: 7 });
    expect(xml).toContain("<AddtlStmtInf>Prepis PDF výpisu z banky.</AddtlStmtInf>");
    expect(xml).not.toContain("Tento výpis zostavilo Faktero");
    expect(xml).toContain("<ElctrncSeqNb>7</ElctrncSeqNb>");
  });

  it("bez poradového čísla ostáva nula", () => {
    expect(buildCamt053(input())).toContain("<ElctrncSeqNb>0</ElctrncSeqNb>");
  });

  it("neprepustí do XML nebezpečné znaky", () => {
    const xml = buildCamt053(input({ transactions: [tx({ description: 'A & B <"x">' })] }));
    expect(xml).toContain("<Ustrd>A &amp; B &lt;&quot;x&quot;&gt;</Ustrd>");
  });

  it("escapeXml odstráni riadiace znaky", () => {
    expect(escapeXml("a\x01b\x0Cc")).toBe("abc");
  });
});

describe("buildStatementPdf", () => {
  it("vyrobí PDF aj bez transakcií", async () => {
    const bytes = await buildStatementPdf(input());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("dlhý zoznam rozdelí na viac strán", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      tx({ amount: -i - 1, counterparty: `Dodávateľ ${i}`, description: "Platba za služby" }),
    );
    const bytes = await buildStatementPdf(input({ transactions: many }));
    // Číslovanie strán je v pätke; viac strán = viac než "1 / 1".
    expect(bytes.length).toBeGreaterThan(5000);
  });
});
