/**
 * Prevod odpovede Fio API (transactions.json) na účet a pohyby Faktera.
 * Ukážka je z dokumentácie Fio „API Bankovnictví“ (verzia 16. 10. 2025).
 */
import { describe, it, expect } from "vitest";
import {
  chybaFio,
  datumFio,
  jeTokenFio,
  oknoFio,
  pohybZFio,
  vypisZFio,
  type FioOdpoved,
} from "./fio";

const odpoved: FioOdpoved = {
  accountStatement: {
    info: {
      accountId: "2400222222",
      bankId: "2010",
      currency: "CZK",
      iban: "CZ7920100000002400222222",
      bic: "FIOBCZPPXXX",
      openingBalance: 195.0,
      closingBalance: 195.01,
    },
    transactionList: {
      transaction: [
        {
          column22: { value: 1148734530, name: "ID pohybu", id: 22 },
          column0: { value: 1340661600000, name: "Datum", id: 0 },
          column1: { value: 1.0, name: "Objem", id: 1 },
          column14: { value: "CZK", name: "Měna", id: 14 },
          column2: { value: "2900233333", name: "Protiúčet", id: 2 },
          column10: { value: "Pavel, Novák", name: "Název protiúčtu", id: 10 },
          column3: { value: "2010", name: "Kód banky", id: 3 },
          column4: { value: "0558", name: "KS", id: 4 },
          column5: null,
          column8: { value: "Příjem převodem uvnitř banky", name: "Typ", id: 8 },
        },
        {
          column22: { value: 1148734781, name: "ID pohybu", id: 22 },
          column0: { value: 1340661600000, name: "Datum", id: 0 },
          column1: { value: -1.0, name: "Objem", id: 1 },
          column14: { value: "CZK", name: "Měna", id: 14 },
          column2: { value: "2900233333", name: "Protiúčet", id: 2 },
          column10: null,
          column3: { value: "2010", name: "Kód banky", id: 3 },
          column5: { value: "0020261001", name: "VS", id: 5 },
          column7: { value: " ", name: "Uživatelská identifikace", id: 7 },
          column16: { value: "Faktura 20261001", name: "Zpráva pro příjemce", id: 16 },
          column8: { value: "Platba převodem uvnitř banky", name: "Typ", id: 8 },
        },
        {
          column22: { value: 1149190193, name: "ID pohybu", id: 22 },
          column0: { value: 1341007200000, name: "Datum", id: 0 },
          column1: { value: 0.01, name: "Objem", id: 1 },
          column14: { value: "CZK", name: "Měna", id: 14 },
          column8: { value: "Připsaný úrok", name: "Typ", id: 8 },
        },
        // Bez ID pohybu sa zapísať nedá.
        { column0: { value: 1341007200000 }, column1: { value: 5 } },
      ],
    },
  },
};

describe("Fio — účet a pohyby", () => {
  const { ucet, pohyby } = vypisZFio(odpoved);

  it("účet z hlavičky výpisu", () => {
    expect(ucet).toEqual({
      external_account_id: "2400222222",
      iban: "CZ7920100000002400222222",
      account_name: "Fio 2400222222/2010",
      currency: "CZK",
      balance: 195.01,
    });
  });

  it("dátum v pražskom čase, nie o deň skôr", () => {
    // 1340661600000 = 25. 6. 2012 22:00 UTC = 26. 6. 2012 0:00 v Prahe.
    expect(pohyby[0].booking_date).toBe("2012-06-26");
    expect(datumFio("2012-07-27+02:00")).toBe("2012-07-27");
    expect(datumFio(null)).toBeNull();
  });

  it("príjem, platba so VS a úrok; riadok bez ID vynechaný", () => {
    expect(pohyby).toHaveLength(3);
    expect(pohyby[0]).toMatchObject({
      external_id: "fio:2400222222:1148734530",
      amount: 1,
      counterparty: "Pavel, Novák",
      description: "Příjem převodem uvnitř banky",
      variable_symbol: null,
    });
    expect(pohyby[1]).toMatchObject({
      amount: -1,
      counterparty: "2900233333/2010",
      variable_symbol: "20261001",
      description: "Faktura 20261001",
    });
    expect(pohyby[2]).toMatchObject({
      amount: 0.01,
      counterparty: null,
      description: "Připsaný úrok",
    });
  });

  it("pohyb bez sumy alebo dátumu sa nezapíše", () => {
    expect(pohybZFio({ column22: { value: 1 }, column1: { value: 5 } }, "1")).toBeNull();
  });
});

describe("Fio — pomocné", () => {
  it("token", () => {
    expect(jeTokenFio("a".repeat(64))).toBe(true);
    expect(jeTokenFio("kratky")).toBe(false);
    expect(jeTokenFio("abc def ghi jkl mno pqr stu")).toBe(false);
  });

  it("okno 89 dní (Fio bez autorizácie dá 90)", () => {
    expect(oknoFio(new Date("2026-10-11T12:00:00Z"))).toEqual({
      od: "2026-07-14",
      do: "2026-10-11",
    });
  });

  it("hlášky chýb", () => {
    expect(chybaFio(409)).toContain("30 sekúnd");
    expect(chybaFio(422)).toContain("90 dní");
    expect(chybaFio(500)).toContain("token");
  });
});
