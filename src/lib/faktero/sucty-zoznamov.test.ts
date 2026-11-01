import { describe, expect, it } from "vitest";
import {
  celkomPrijatychPoMenach,
  suctyBlockovPoMenach,
  suctyPrijatychZaloh,
} from "./sucty-zoznamov";

const obj = (m: Map<string, number>) => Object.fromEntries(m);

describe("celkomPrijatychPoMenach (D-17)", () => {
  it("meny zvlášť, bez konceptu, storna, zálohovej a neodsúhlasenej samofaktúry", () => {
    const r = celkomPrijatychPoMenach(
      [
        { status: "received", amount_total: 100, currency: "EUR" },
        { status: "paid", amount_total: 2000, currency: "CZK" },
        { status: "booked", amount_total: 50, currency: "USD" },
        { status: "received", amount_total: -20, currency: "EUR" }, // dobropis
        { status: "draft", amount_total: 999, currency: "EUR" },
        { status: "cancelled", amount_total: 999, currency: "EUR" },
        { status: "received", type: "proforma", amount_total: 999, currency: "EUR" },
        { status: "received", amount_total: 999, currency: "EUR", samofakturacia: true },
      ],
      (r: any) => !r.samofakturacia,
    );
    expect(obj(r)).toEqual({ EUR: 80, CZK: 2000, USD: 50 });
    expect([...r.keys()][0]).toBe("EUR");
  });

  it("CZ firma má domácu menu Kč prvú", () => {
    const r = celkomPrijatychPoMenach(
      [
        { status: "received", amount_total: 10, currency: "EUR" },
        { status: "received", amount_total: 300, currency: null },
      ],
      () => true,
      "CZK",
    );
    expect([...r.entries()]).toEqual([
      ["CZK", 300],
      ["EUR", 10],
    ]);
  });
});

describe("suctyPrijatychZaloh (AB-09, AB-10)", () => {
  const riadky = [
    { id: "a", status: "received", amount_total: 100, currency: "EUR", payment_date: null },
    { id: "b", status: "received", amount_total: 1000, currency: "CZK", payment_date: null },
    { id: "c", status: "cancelled", amount_total: 500, currency: "EUR", payment_date: null },
    { id: "d", status: "paid", amount_total: 40, currency: "EUR", payment_date: "2026-10-01" },
    { id: "e", status: "received", amount_total: 70, currency: "EUR", payment_date: null },
  ];
  it("celková suma po menách a bez storna", () => {
    expect(obj(suctyPrijatychZaloh(riadky, {}).spolu)).toEqual({ EUR: 210, CZK: 1000 });
  });
  it("nezaplatené bez zaplatených, storna a zúčtovaných", () => {
    expect(obj(suctyPrijatychZaloh(riadky, { e: "FA1" }).nezaplatene)).toEqual({
      EUR: 100,
      CZK: 1000,
    });
  });
});

describe("suctyBlockovPoMenach (D-20)", () => {
  it("základ, DPH a celkom po menách", () => {
    const s = suctyBlockovPoMenach([
      { net_amount: 10, vat_amount: 2.3, total_amount: 12.3, currency: "EUR" },
      { net_amount: 100, vat_amount: 21, total_amount: 121, currency: "CZK" },
    ]);
    expect(obj(s.total)).toEqual({ EUR: 12.3, CZK: 121 });
    expect(obj(s.net)).toEqual({ EUR: 10, CZK: 100 });
    expect(obj(s.vat)).toEqual({ EUR: 2.3, CZK: 21 });
  });
});
