import { describe, it, expect } from "vitest";
import { potrebujeKurz, stlpceKurzu, udajeNaKurz } from "./kurz-dokladu";
import { blocekNaUctovanie } from "./zauctovanie-export";

describe("kurz pri importe dokladu v cudzej mene", () => {
  it("česká firma s faktúrou v EUR kurz potrebuje, v CZK nie", () => {
    const f = { currency: "EUR", issue_date: "2026-09-10", delivery_date: "2026-09-08" };
    expect(potrebujeKurz("invoices", f, "CZ")).toBe(true);
    expect(potrebujeKurz("invoices", { ...f, currency: "CZK" }, "CZ")).toBe(false);
    // Doklad, ktorý kurz už má, sa neprepisuje.
    expect(potrebujeKurz("invoices", { ...f, exchange_rate: 24.3 }, "CZ")).toBe(false);
    // Bez dátumu sa kurz nedá vybrať.
    expect(potrebujeKurz("invoices", { currency: "EUR" }, "CZ")).toBe(false);
  });

  it("deň kurzu je dodanie, pri bločku deň nákupu", () => {
    expect(
      udajeNaKurz("purchase_invoices", { delivery_date: "2026-09-08", issue_date: "2026-09-10" })
        .datum,
    ).toBe("2026-09-08");
    expect(udajeNaKurz("expense_documents", { issue_date: "2026-09-10" }).datum).toBe("2026-09-10");
  });

  it("faktúra CZ firmy: kurz ČNB násobí (CZK za 1 EUR)", () => {
    const s = stlpceKurzu(
      "invoices",
      { currency: "EUR", subtotal: 100, vat_total: 21, total: 121 },
      { kurz: 24.3, den: "2026-09-08", zdroj: "cnb" },
      "CZ",
    );
    expect(s).toEqual({
      exchange_rate: 24.3,
      exchange_rate_date: "2026-09-08",
      exchange_rate_source: "cnb",
      subtotal_eur: 2430,
      vat_total_eur: 510.3,
      total_eur: 2940.3,
    });
  });

  it("prijatá SK firmy: kurz ECB delí (X za 1 EUR)", () => {
    const s = stlpceKurzu(
      "purchase_invoices",
      { currency: "CZK", amount_without_vat: 2500, vat_amount: 525, amount_total: 3025 },
      { kurz: 25, den: "2026-09-07", zdroj: "ecb" },
      "SK",
    );
    expect(s).toEqual({
      exchange_rate: 25,
      exchange_rate_source: "ecb",
      amount_without_vat_eur: 100,
      vat_amount_eur: 21,
    });
  });

  it("bloček nesie kurz a export ho prevezme", () => {
    const s = stlpceKurzu(
      "expense_documents",
      { currency: "CZK", total_amount: 121 },
      { kurz: 25, den: "2026-09-04", zdroj: "ecb" },
      "SK",
    );
    expect(s).toEqual({
      exchange_rate: 25,
      exchange_rate_date: "2026-09-04",
      exchange_rate_source: "ecb",
    });
    const d = blocekNaUctovanie(
      {
        id: "b1",
        issue_date: "2026-09-05",
        currency: "CZK",
        total_amount: 121,
        vat_breakdown: [{ sadzba: 21, zaklad: 100, dph: 21 }],
        ...s,
      },
      {} as any,
    );
    expect(d.kurz).toBe(25);
    expect(
      blocekNaUctovanie({ id: "b2", issue_date: "2026-09-05", total_amount: 1 }, {} as any).kurz,
    ).toBeNull();
  });
});
