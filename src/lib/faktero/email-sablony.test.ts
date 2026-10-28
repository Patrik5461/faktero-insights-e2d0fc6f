import { describe, expect, it } from "vitest";
import {
  doplnPremenne,
  hodnotyPremennych,
  nazovDruhuDokladu,
  sablonyPreDoklad,
  vyberSablonu,
} from "./email-sablony";

const s = (id: string, typ_dokladu: string, jazyk: string) => ({
  id,
  nazov: id,
  typ_dokladu,
  jazyk,
  predmet: "p",
  text: "t",
});

describe("výber e-mailovej šablóny", () => {
  const sablony = [
    s("vsetko", "vsetky", "vsetky"),
    s("de", "vsetky", "de"),
    s("dobropis", "credit_note", "vsetky"),
    s("dobropis-de", "credit_note", "de"),
    s("ponuka", "ponuka", "vsetky"),
  ];

  it("presný typ a jazyk vyhráva", () => {
    expect(vyberSablonu(sablony, "credit_note", "de")?.id).toBe("dobropis-de");
    expect(vyberSablonu(sablony, "credit_note", "sk")?.id).toBe("dobropis");
    expect(vyberSablonu(sablony, "regular", "de")?.id).toBe("de");
    expect(vyberSablonu(sablony, "proforma", "hu")?.id).toBe("vsetko");
  });

  it("typ váži viac než jazyk", () => {
    expect(sablonyPreDoklad(sablony, "credit_note", "de").map((x) => x.id)).toEqual([
      "dobropis-de",
      "dobropis",
      "de",
      "vsetko",
    ]);
  });

  it("„všetky faktúry“ sa na ponuku ani upomienku nevzťahujú", () => {
    expect(vyberSablonu(sablony, "ponuka", "sk")?.id).toBe("ponuka");
    expect(vyberSablonu(sablony, "upomienka", "sk")).toBeNull();
  });

  it("šablóna v inom jazyku sa neponúkne", () => {
    expect(vyberSablonu([s("cz", "regular", "cs")], "regular", "sk")).toBeNull();
  });
});

describe("premenné", () => {
  it("doplní hodnoty v jazyku dokladu a dobropis bez mínusu", () => {
    const h = hodnotyPremennych({
      doklad: {
        type: "credit_note",
        invoice_number: "D-1",
        total: -120,
        currency: "EUR",
        due_date: "2026-10-29",
        customer_name: "ABC",
      },
      jazyk: "sk",
      firma: "Moja",
      iban: "SK12",
    });
    expect(
      doplnPremenne(
        "[TYP_FAKTURY] [cislo_faktury] na [SUMA] do [SPLATNOST], [ODBERATEL]/[FIRMA] [NEZNAMA]",
        h,
      ),
    ).toBe(`Dobropis D-1 na ${h.SUMA} do ${h.SPLATNOST}, ABC/Moja [NEZNAMA]`);
    expect(h.SUMA).not.toContain("-");
    expect(h.SUMA).toMatch(/^120,00\s€$/);
    expect(h.VS).toBe("1");
  });

  it("nemecká firma píše Rechnungskorrektur", () => {
    expect(nazovDruhuDokladu("credit_note", "de", "DE")).toBe("Rechnungskorrektur");
    expect(nazovDruhuDokladu("credit_note", "de", "SK")).toBe("Gutschrift");
    expect(nazovDruhuDokladu("debit_note", "en")).toBe("Debit note");
  });
});
