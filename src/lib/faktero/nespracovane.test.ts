import { describe, expect, it } from "vitest";
import {
  blocekZUdajov,
  chybajuce,
  navrhDruhu,
  prijataZUdajov,
  rozpisZAi,
  udajeZAi,
} from "./nespracovane";

describe("nespracované doklady", () => {
  it("návrh druhu z vyťaženia", () => {
    expect(navrhDruhu({ document_type: "ostatny" })).toBe("ostatny");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "blocek" })).toBe("blocek");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "zalohova" })).toBe("zalohova");
    expect(navrhDruhu({ document_type: "faktura", amount_total: -12.3 })).toBe("dobropis");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "ostra" })).toBe("faktura");
    expect(navrhDruhu(null)).toBe("faktura");
  });

  it("rozpis po sadzbách z položiek, inak jeden riadok", () => {
    expect(
      rozpisZAi({
        amount_without_vat: 120,
        vat_amount: 24,
        amount_total: 144,
        items: [
          { name: "A", vat_rate: 23, total: 123 },
          { name: "B", vat_rate: 5, total: 21 },
        ],
      }),
    ).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 5, zaklad: 20, dph: 1 },
    ]);
    expect(rozpisZAi({ amount_without_vat: 100, vat_amount: 23, amount_total: 123 })).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
    ]);
  });

  it("povinné polia podľa druhu", () => {
    const u = udajeZAi({ supplier_name: "Orange", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }, "2026-10-07");
    expect(chybajuce("faktura", u)).toEqual(["cislo", "splatnost"]);
    expect(chybajuce("blocek", u)).toEqual(["platba"]);
    expect(chybajuce("ostatny", u)).toEqual([]);
    expect(chybajuce(null, u)).toEqual(["druh"]);
  });

  it("dobropis má záporné sumy, zálohová sa neodpočítava, bloček s rozpisom", () => {
    const u = udajeZAi({ supplier_name: "X", invoice_number: "D1", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3 }, "2026-10-07");
    u.kody.predkontacia = "1Fp";
    const d = prijataZUdajov("dobropis", u, "2026-10-07");
    expect([d.amount_without_vat, d.vat_amount, d.amount_total]).toEqual([-10, -2.3, -12.3]);
    expect(d.pohoda_predkontacia).toBe("1Fp");
    expect(prijataZUdajov("zalohova", u, "2026-10-07")).toMatchObject({ type: "proforma", odpocet: false });
    u.platba = "hotovost";
    expect(blocekZUdajov(u)).toMatchObject({ total_amount: 12.3, vat_rate: 23, payment_method: "hotovost" });
  });
});

describe("vyťaženie adresy, popisu a dátumov", () => {
  it("adresa dodávateľa, popis plnenia a splatnosť aj v slovenskom tvare", () => {
    const u = udajeZAi(
      {
        supplier_name: "MD BUILDING, s. r. o.",
        supplier_street: "Hlavná 12",
        supplier_city: "Bratislava",
        supplier_zip: "811 01",
        description: "Stavebné práce za október",
        issue_date: "05.10.2026",
        due_date: "19. 10. 2026",
      },
      "2026-10-07",
    );
    expect(u.dodavatel).toMatchObject({ ulica: "Hlavná 12", mesto: "Bratislava", psc: "811 01" });
    expect(u.popis).toBe("Stavebné práce za október");
    expect(u.datumVystavenia).toBe("2026-10-05");
    expect(u.splatnost).toBe("2026-10-19");
    expect(prijataZUdajov("faktura", u, "2026-10-07")).toMatchObject({
      supplier_street: "Hlavná 12",
      intro_note: "Stavebné práce za október",
      due_date: "2026-10-19",
    });
  });
});
