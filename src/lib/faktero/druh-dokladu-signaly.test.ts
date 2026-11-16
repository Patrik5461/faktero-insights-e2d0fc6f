import { describe, expect, it } from "vitest";
import { opravaDruhuZoSignalov, signalyDruhu } from "./druh-dokladu-signaly";
import { navrhDruhu } from "./nespracovane";

/* Vzorky podľa skutočných dokladov z Nespracovaných (nuu s.r.o., RHJ, 16. 11. 2026). */
const ORANGE_SPLATKA = {
  document_type: "ostatny",
  other_kind: "ine",
  document_title: "Stav účtu",
  supplier_name: "Orange Slovensko, a. s.",
  supplier_ico: "35697270",
  supplier_ic_dph: "SK2020310578",
  supplier_iban: "SK29 1100 0000 0026 2800 5850",
  variable_symbol: "0405309584",
  due_date: "2026-11-19",
  amount_total: 34.73,
};
const EKASA_BLOCEK = {
  document_type: "faktura",
  document_subtype: "ostra",
  document_title: "Pokladničný doklad",
  supplier_name: "Kaufland Slovenská republika v.o.s.",
  supplier_ico: "35790164",
  ekasa_uid: "O-47D735CEC4A04FD79735CEC4A05FD7C5",
  amount_total: 23.4,
};
const ZARA_VRATENIE = {
  document_type: "faktura",
  document_subtype: "dobropis",
  document_title: "ZARA - AVION SHOPPING PARK",
  supplier_name: "Inditex Slovakia, s. r. o.",
  amount_total: -69.95,
};
const SFC_FAKTURA = {
  document_type: "faktura",
  document_subtype: "blocek",
  document_title: "FAKTÚRA č. 262100191",
  supplier_name: "SFC, s.r.o.",
  supplier_ico: "53297474",
  supplier_ic_dph: "SK2121372693",
  supplier_iban: "SK48 8330 0000 0022 0190 2333",
  invoice_number: "262100191",
  variable_symbol: "262100191",
  due_date: "2026-11-17",
  amount_total: 516.6,
};

describe("druh dokladu podľa znakov na doklade", () => {
  it("mesačná splátka / vyúčtovanie od Orange s VS, IBAN a splatnosťou je faktúra, nie iný doklad", () => {
    expect(navrhDruhu(ORANGE_SPLATKA, "Orange_doklad_CN0405309584_20261110_FX00179400261110")).toBe("faktura");
  });

  it("splátkový kalendár leasingu, predpis poisťovne či exekúcia ostanú iným dokladom", () => {
    expect(navrhDruhu({ ...ORANGE_SPLATKA, other_kind: "leasing_uver" })).toBe("ostatny");
    expect(navrhDruhu({ ...ORANGE_SPLATKA, other_kind: "poistovna" })).toBe("ostatny");
    expect(navrhDruhu({ document_type: "ostatny", other_kind: "ine", document_title: "Krycí list k poistnej udalosti", supplier_name: "Allianz" })).toBe("ostatny");
  });

  it("UID z eKasy = bloček, aj keď model povedal faktúra", () => {
    expect(signalyDruhu(EKASA_BLOCEK).ekasa).toBe(true);
    expect(navrhDruhu(EKASA_BLOCEK)).toBe("blocek");
    expect(navrhDruhu({ ...EKASA_BLOCEK, ekasa_uid: null, cash_register_code: "88820231507010077" })).toBe("blocek");
  });

  it("účtenka z e-shopu (ticket) bez údajov na úhradu je bloček aj pri vrátení tovaru", () => {
    expect(navrhDruhu(ZARA_VRATENIE, "1793294835977-ticket-0e6dce4828ed4219bedf0fbfa3e8db75")).toBe("blocek");
    expect(navrhDruhu({ ...ZARA_VRATENIE, document_subtype: "ostra", amount_total: 103.8 }, "1790937587191-ticket-d23dd764")).toBe("blocek");
  });

  it("faktúra s číslom, IČO, splatnosťou a IBAN, ktorú model nazval bločkom, je faktúra", () => {
    expect(navrhDruhu(SFC_FAKTURA, "Faktura_262100191_SFC_s.r.o.")).toBe("faktura");
  });

  it("faktúra zaplatená kartou pri pokladnici (METRO: bloček „Úhrada faktúry“ + faktúra) je faktúra", () => {
    expect(
      navrhDruhu({
        document_type: "faktura",
        document_subtype: "blocek",
        document_title: "Faktúra č. 0/0(021)0002/040110",
        invoice_number: "0/0(021)0002/040110",
        supplier_ico: "45952671",
        supplier_ic_dph: "SK2023150701",
        ekasa_uid: "O-47D735CEC4A04FD79735CEC4A05FD7C5",
        amount_total: 467.58,
      }),
    ).toBe("faktura");
  });

  it("dobropis podľa nadpisu aj podľa zápornej sumy", () => {
    expect(navrhDruhu({ ...SFC_FAKTURA, document_subtype: "ostra", document_title: "DOBROPIS č. 262100200" })).toBe("dobropis");
    expect(navrhDruhu({ ...SFC_FAKTURA, document_subtype: "ostra", document_title: "Credit note 77" })).toBe("dobropis");
    expect(navrhDruhu({ ...SFC_FAKTURA, document_subtype: "ostra", document_title: "Faktúra", amount_total: -516.6 })).toBe("dobropis");
  });

  it("zálohová faktúra ostáva zálohovou a daňový doklad k platbe daňovým", () => {
    expect(navrhDruhu({ ...SFC_FAKTURA, document_subtype: "zalohova", document_title: "Zálohová faktúra ZF2026010" })).toBe("zalohova");
    expect(navrhDruhu({ ...SFC_FAKTURA, document_subtype: "ostra", document_title: "Daňový doklad k prijatej platbe" })).toBe("danovy");
  });

  it("bez znakov sa odpoveď modelu nemení", () => {
    expect(opravaDruhuZoSignalov({ document_type: "faktura", document_subtype: "ostra" })).toEqual({});
    expect(opravaDruhuZoSignalov({ document_type: "faktura", document_subtype: "blocek" })).toEqual({});
    expect(opravaDruhuZoSignalov(null)).toEqual({});
  });
});
