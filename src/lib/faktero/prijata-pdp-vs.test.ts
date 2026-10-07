import { describe, expect, it } from "vitest";
import { polozkyPrijatej, rozpisPrijatej } from "./prijate-do-pohody";
import {
  VYROVNAVACIA_POLOZKA,
  doplnUdaje,
  prazdneUdaje,
  prijataZUdajov,
  rozdielPoloziek,
  udajeZAi,
  vsDokladu,
  vyrovnajPolozky,
} from "./nespracovane";

describe("prijatá faktúra s položkami v prenesení", () => {
  // Ako MD BUILDING: roxor v prenesení (0 %), zvyšok 23 %.
  const p = {
    amount_without_vat: 354.3,
    vat_amount: 11.22,
    amount_total: 365.52,
    items: [
      { name: "Roxor 8", quantity: 10, vat_rate: 0, total: 205.5, pdp: true },
      { name: "Roxor 10", quantity: 4, vat_rate: 0, total: 100, pdp: true },
      { name: "Drôt", quantity: 1, vat_rate: 23, total: 48.8 },
    ],
  };

  it("položky nesú sadzbu a príznak prenesenia", () => {
    const r = polozkyPrijatej(p)!;
    expect(r.map((x) => [x.sadzba, x.pdp, x.dph])).toEqual([
      [0, true, 0],
      [0, true, 0],
      [23, false, 11.22],
    ]);
  });

  it("rozpis delí tuzemskú a prenesenú časť", () => {
    expect(rozpisPrijatej(p)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sadzba: 23, zaklad: 48.8, dph: 11.22 }),
        expect.objectContaining({ sadzba: 0, zaklad: 305.5, dph: 0, pdp: true }),
      ]),
    );
  });

  it("celá faktúra v prenesení označí položky bez dane", () => {
    const r = polozkyPrijatej({
      amount_without_vat: 1000,
      vat_amount: 0,
      amount_total: 1000,
      reverse_charge: true,
      items: [{ name: "Stavebné práce", quantity: 1, vat_rate: 0, total: 1000 }],
    })!;
    expect(r[0].pdp).toBe(true);
  });
});

describe("variabilný symbol z čítania", () => {
  it("berie VS z dokladu bez medzier", () => {
    expect(vsDokladu("2026 0145", "FA-2026/145")).toBe("20260145");
    expect(vsDokladu("VS: 123", "")).toBe("123");
  });
  it("bez VS použije číselné číslo faktúry", () => {
    expect(vsDokladu(null, "2026000211")).toBe("2026000211");
    expect(vsDokladu("", "000211")).toBe("000211");
  });
  it("písmenové číslo faktúry ako VS nepoužije", () => {
    expect(vsDokladu(null, "FA-2026/145")).toBe("");
  });
  it("udajeZAi naplní VS", () => {
    const u = udajeZAi({ invoice_number: "FV123", variable_symbol: "123" }, "2026-10-07");
    expect(u.vs).toBe("123");
  });
});

describe("dočítanie faktúry po bločku", () => {
  it("doplní len prázdne polia", () => {
    const povodne = prazdneUdaje();
    povodne.dodavatel.nazov = "Lukacek s.r.o.";
    povodne.cislo = "000211";
    povodne.celkom = 115.6;
    const nove = udajeZAi(
      {
        supplier_name: "LUKÁČEK",
        supplier_iban: "SK31 1200 0000 1987 4263 7541",
        supplier_city: "Žilina",
        invoice_number: "000211",
        variable_symbol: "211",
        due_date: "2026-10-13",
        amount_total: 999,
      },
      "2026-10-07",
    );
    const u = doplnUdaje(povodne, nove);
    expect(u.dodavatel.nazov).toBe("Lukacek s.r.o.");
    expect(u.dodavatel.iban).toBe("SK3112000000198742637541");
    expect(u.dodavatel.mesto).toBe("Žilina");
    expect(u.vs).toBe("211");
    expect(u.splatnost).toBe("2026-10-13");
    expect(u.celkom).toBe(115.6);
  });
});

describe("prenesenie z čítania až do prijatej faktúry", () => {
  it("celá faktúra v prenesení dostane režim samozdanenia", () => {
    const u = udajeZAi(
      {
        supplier_name: "Stavby s.r.o.",
        invoice_number: "1",
        reverse_charge: true,
        amount_total: 1000,
        amount_without_vat: 1000,
        vat_amount: 0,
        items: [{ name: "Práce", total: 1000, vat_rate: 0 }],
      },
      "2026-10-07",
    );
    const r: any = prijataZUdajov("faktura", u, "2026-10-07");
    expect(r.reverse_charge).toBe(true);
    expect(r.dph_rezim).toBe("samozdanenie");
  });
  it("prenesená položka si príznak nesie", () => {
    const u = udajeZAi(
      { items: [{ name: "Roxor", total: 100, vat_rate: 0, reverse_charge: true }, { name: "Drôt", total: 10, vat_rate: 23 }] },
      "2026-10-07",
    );
    expect(u.polozky.map((x) => x.pdp ?? false)).toEqual([true, false]);
    expect((prijataZUdajov("faktura", u, "2026-10-07") as any).dph_rezim).toBeUndefined();
  });
});

describe("centový rozdiel položiek", () => {
  const zaklad = () => {
    const u = prazdneUdaje();
    u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    u.celkom = 123;
    return u;
  };
  it("sedí s DPH aj bez DPH", () => {
    const u = zaklad();
    u.polozky = [{ name: "A", quantity: 1, unit: null, unit_price: 123, vat_rate: 23, total: 123 }];
    expect(rozdielPoloziek(u)).toBeNull();
    u.polozky[0].total = 100;
    expect(rozdielPoloziek(u)).toBeNull();
  });
  it("nájde rozdiel a vyrovnávacia položka ho zrovná", () => {
    const u = zaklad();
    u.polozky = [{ name: "A", quantity: 1, unit: null, unit_price: 122.98, vat_rate: 23, total: 122.98 }];
    expect(rozdielPoloziek(u)).toEqual({ sucet: 122.98, rozdiel: 0.02, netto: false });
    const v = vyrovnajPolozky(u);
    expect(v.polozky.at(-1)).toMatchObject({ name: VYROVNAVACIA_POLOZKA, total: 0.02 });
    expect(rozdielPoloziek(v)).toBeNull();
  });
});
