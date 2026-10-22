import { describe, expect, it } from "vitest";
import {
  kodyPrijatejUrcene,
  nastaveniaNespracovanych,
  PREDVOLENE_NESPRACOVANE,
  upravVytazeneUdaje,
} from "./nespracovane-nastavenia";

describe("nastaveniaNespracovanych", () => {
  it("bez nastavení vráti predvolené (správanie ako doteraz, okrem zaúčtovania pri vytvorení)", () => {
    expect(nastaveniaNespracovanych(null)).toEqual(PREDVOLENE_NESPRACOVANE);
    expect(nastaveniaNespracovanych({ datev: { x: 1 } })).toEqual(PREDVOLENE_NESPRACOVANE);
    expect(PREDVOLENE_NESPRACOVANE.zauctovat).toBe(true);
    expect(PREDVOLENE_NESPRACOVANE.toleranciaCenty).toBe(0);
  });

  it("číta uložené hodnoty a toleranciu oreže na 0–100 centov", () => {
    const n = nastaveniaNespracovanych({
      nespracovane: { zauctovat: false, dalsi: false, toleranciaCenty: 250, polozkyFaktur: false },
    });
    expect(n.zauctovat).toBe(false);
    expect(n.dalsi).toBe(false);
    expect(n.toleranciaCenty).toBe(100);
    expect(n.polozkyFaktur).toBe(false);
    expect(n.polozkyBlockov).toBe(true);
    expect(
      nastaveniaNespracovanych({ nespracovane: { toleranciaCenty: -5 } }).toleranciaCenty,
    ).toBe(0);
    expect(
      nastaveniaNespracovanych({ nespracovane: { toleranciaCenty: "x" } }).toleranciaCenty,
    ).toBe(0);
  });
});

describe("upravVytazeneUdaje", () => {
  const u = { polozky: [{ name: "A" }], dodaciList: "DL-1" } as {
    polozky: unknown[];
    polozkyVypnute?: boolean;
    dodaciList?: string;
  };

  it("vypnuté vyťažovanie položiek faktúr nechá položky vypnuté, bločky nie", () => {
    const n = { ...PREDVOLENE_NESPRACOVANE, polozkyFaktur: false };
    expect(upravVytazeneUdaje(u, "faktura", n).polozkyVypnute).toBe(true);
    expect(upravVytazeneUdaje(u, "blocek", n).polozkyVypnute).toBeUndefined();
  });

  it("rozhodnutie človeka (zapnuté položky) neprepíše", () => {
    const n = { ...PREDVOLENE_NESPRACOVANE, polozkyFaktur: false };
    expect(upravVytazeneUdaje({ ...u, polozkyVypnute: false }, "faktura", n).polozkyVypnute).toBe(
      false,
    );
  });

  it("číslo dodacieho listu sa nepreberie, keď to firma vypla", () => {
    expect(
      upravVytazeneUdaje(u, "faktura", { ...PREDVOLENE_NESPRACOVANE, dodaciList: false })
        .dodaciList,
    ).toBe("");
    expect(upravVytazeneUdaje(u, "faktura", PREDVOLENE_NESPRACOVANE).dodaciList).toBe("DL-1");
  });
});

describe("kodyPrijatejUrcene", () => {
  it("vlastné kódy, kategória aj predvolené firmy", () => {
    expect(kodyPrijatejUrcene({ pohoda_predkontacia: "1Fp", pohoda_clenenie_dph: "PD" }, {})).toBe(
      true,
    );
    expect(
      kodyPrijatejUrcene(
        { category: "palivo" },
        {},
        { palivo: { predkontacia: "5Fp", clenenie: "PD" } },
      ),
    ).toBe(true);
    expect(
      kodyPrijatejUrcene(
        {},
        { pohoda_predkontacia_prijata: "1Fp", pohoda_clenenie_dph_prijata: "PD" },
      ),
    ).toBe(true);
  });

  it("bez predkontácie alebo členenia nie je zaúčtovateľná", () => {
    expect(kodyPrijatejUrcene({ pohoda_predkontacia: "1Fp" }, {})).toBe(false);
    expect(kodyPrijatejUrcene({}, { pohoda_clenenie_dph_prijata: "PD" })).toBe(false);
  });

  it("prenesenie berie členenie pre samozdanenie", () => {
    const firma = { pohoda_predkontacia_prijata: "1Fp", pohoda_clenenie_dph_prijata_pdp: "PDpdp" };
    expect(kodyPrijatejUrcene({ reverse_charge: true }, firma)).toBe(true);
    expect(kodyPrijatejUrcene({ reverse_charge: false }, firma)).toBe(false);
  });
});
