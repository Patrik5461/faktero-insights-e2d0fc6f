import { describe, expect, it } from "vitest";
import { druhZFaktury, teloOdoslania, zlavaNaPercento, type DokladNaOdoslanie } from "./epostak-telo";

const zaklad: DokladNaOdoslanie = {
  druh: "invoice",
  cislo: "20260004",
  vystavena: "2026-10-05",
  splatnost: "2026-10-19",
  dodanie: "2026-10-04",
  mena: "EUR",
  vs: "20260004",
  iban: "SK3112000000198742637541",
  poznamka: null,
  buyerReference: "20260004",
  protistranaPeppolId: "0245:2022334455",
  protistranaNazov: "Odberateľ s.r.o.",
  polozky: [{ name: "Montáž", quantity: 10, unit_price: 25, vat_rate: 23, discount_percent: 10 }],
};

describe("telo pre ePoštáka", () => {
  it("faktúra: dodanie, VS, zľava riadku", () => {
    const b = teloOdoslania(zaklad);
    expect(b).toMatchObject({
      documentType: "invoice",
      receiverPeppolId: "0245:2022334455",
      deliveryDate: "2026-10-04",
      variableSymbol: "20260004",
      items: [{ description: "Montáž", quantity: 10, unitPrice: 25, vatRate: 23, discount: 10 }],
    });
    expect(b).not.toHaveProperty("precedingInvoiceRef");
  });

  it("dobropis: typ, číslo pôvodnej faktúry (BT-25) a kladné sumy", () => {
    const b = teloOdoslania({
      ...zaklad,
      druh: "credit_note",
      cislo: "D20260001",
      povodneCislo: "20260004",
      polozky: [{ name: "Vrátenie", quantity: -1, unit_price: 10, vat_rate: 23 }],
    });
    expect(b).toMatchObject({
      documentType: "credit_note",
      precedingInvoiceRef: "20260004",
      items: [{ quantity: 1, unitPrice: 10, vatRate: 23 }],
    });
    expect(() =>
      teloOdoslania({ ...zaklad, druh: "credit_note", povodneCislo: null, polozky: [] }),
    ).toThrow(/pôvodnej faktúry/);
    expect(() =>
      teloOdoslania({ ...zaklad, druh: "credit_note", povodneCislo: "1", polozky: zaklad.polozky }),
    ).toThrow(/zvyšuje/);
  });

  it("faktúra so záporným riadkom sa neodošle — patrí na dobropis", () => {
    expect(() =>
      teloOdoslania({ ...zaklad, polozky: [{ name: "x", quantity: -1, unit_price: 5, vat_rate: 23 }] }),
    ).toThrow(/dobropis/);
  });

  it("prenesenie daňovej povinnosti, záloha, zľava na doklad", () => {
    const b = teloOdoslania({
      ...zaklad,
      prenesenie: "domestic_69",
      zaplatenaZaloha: 100.004,
      zlavaDokladuPercent: 5,
    });
    expect(b.items).toEqual([
      expect.objectContaining({ vatRate: 0, taxTreatment: "reverse_charge_domestic" }),
    ]);
    expect(b).toMatchObject({ prepaidAmount: 100, documentDiscountPercent: 5 });
  });

  it("samofaktúra adresuje dodávateľa", () => {
    const b = teloOdoslania({ ...zaklad, druh: "self_billing" });
    expect(b).toMatchObject({ supplierPeppolId: "0245:2022334455", supplierName: "Odberateľ s.r.o." });
    expect(b).not.toHaveProperty("receiverPeppolId");
    const d = teloOdoslania({
      ...zaklad,
      druh: "self_billing_credit_note",
      povodneCislo: "SF20260001",
      polozky: [{ name: "x", quantity: -2, unit_price: 5, vat_rate: 23 }],
    });
    expect(d).toMatchObject({ precedingInvoiceRef: "SF20260001", items: [{ quantity: 2 }] });
  });

  it("doklad k prijatej platbe a druh z typu faktúry", () => {
    expect(teloOdoslania({ ...zaklad, druh: "advance_payment" }).taxPointDate).toBe("2026-10-04");
    expect(druhZFaktury("credit_note")).toBe("credit_note");
    expect(druhZFaktury("regular")).toBe("invoice");
    expect(() => druhZFaktury("proforma")).toThrow(/nie je daňový doklad/);
  });

  it("zľava sumou sa prepočíta na percento", () => {
    expect(zlavaNaPercento("amount", 25, 250)).toBe(10);
    expect(zlavaNaPercento("percent", 7, 999)).toBe(7);
    expect(zlavaNaPercento(null, 7, 100)).toBeNull();
  });
});
