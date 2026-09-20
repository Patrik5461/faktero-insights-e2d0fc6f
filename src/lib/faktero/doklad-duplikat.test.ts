import { describe, expect, it } from "vitest";
import { daSaPorovnat, jeTenIstyDoklad } from "./doklad-duplikat";

const blocek = {
  qr_raw: "O-12345678-ABCD",
  supplier_ico: "12345678",
  supplier_name: "Shell Slovakia",
  document_number: "0123",
  issue_date: "2026-09-20",
  total_amount: 70,
};

describe("rozpoznanie už naskenovaného dokladu", () => {
  it("rovnaký QR kód je ten istý doklad", () => {
    expect(jeTenIstyDoklad(blocek, { qr_raw: "o-12345678-abcd" })).toBe(true);
  });

  it("iný QR kód je iný doklad, aj keď sedí všetko ostatné", () => {
    expect(jeTenIstyDoklad(blocek, { ...blocek, qr_raw: "O-99999999-XXXX" })).toBe(false);
  });

  it("bez QR rozhoduje dodávateľ, číslo, dátum a suma naraz", () => {
    const bezQr = { ...blocek, qr_raw: null };
    expect(jeTenIstyDoklad(bezQr, { ...bezQr })).toBe(true);
    expect(jeTenIstyDoklad(bezQr, { ...bezQr, total_amount: 71 })).toBe(false);
    expect(jeTenIstyDoklad(bezQr, { ...bezQr, issue_date: "2026-09-19" })).toBe(false);
    expect(jeTenIstyDoklad(bezQr, { ...bezQr, document_number: "0124" })).toBe(false);
    expect(jeTenIstyDoklad(bezQr, { ...bezQr, supplier_ico: "87654321" })).toBe(false);
  });

  it("suma sa porovnáva na cent, nie na zápis", () => {
    const bezQr = { ...blocek, qr_raw: null, total_amount: 12.3 };
    expect(jeTenIstyDoklad(bezQr, { ...bezQr, total_amount: 12.3 })).toBe(true);
  });

  it("dve tankovania za rovnakú sumu bez čísla dokladu duplicita nie je", () => {
    const holy = { supplier_name: "Shell", issue_date: "2026-09-20", total_amount: 70 };
    expect(daSaPorovnat(holy)).toBe(false);
    expect(jeTenIstyDoklad(holy, holy)).toBe(false);
  });

  it("keď jeden z dokladov nemá QR, porovnáva sa hlavičkou", () => {
    expect(jeTenIstyDoklad(blocek, { ...blocek, qr_raw: null })).toBe(true);
  });
});
