import { describe, expect, it } from "vitest";
import {
  cisloObjednavkyPodlaPredpon,
  kodyPrijatejUrcene,
  blocekZauctovanyPriVytvoreni,
  zdrojZauctovaniaPriVytvoreni,
  maPredponu,
  textyPreObjednavku,
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

describe("predpony čísla objednávky", () => {
  it("nastavenie predpôn orezané, bez duplicít", () => {
    const n = nastaveniaNespracovanych({
      nespracovane: { predponyObjednavky: [" OBJ- ", "obj-", "", "PO", 5] },
    });
    expect(n.predponyObjednavky).toEqual(["OBJ-", "PO", "5"]);
    expect(PREDVOLENE_NESPRACOVANE.predponyObjednavky).toEqual([]);
    // Typ podľa IBAN-u je predvolene zapnutý, firma ho môže vypnúť.
    expect(PREDVOLENE_NESPRACOVANE.typPodlaIban).toBe(true);
    expect(nastaveniaNespracovanych({}).typPodlaIban).toBe(true);
    expect(nastaveniaNespracovanych({ nespracovane: { typPodlaIban: false } }).typPodlaIban).toBe(
      false,
    );
  });

  it("nájde číslo objednávky podľa predpony", () => {
    const p = ["OBJ-", "PO"];
    expect(cisloObjednavkyPodlaPredpon(["Fakturujeme podľa OBJ-2026-015."], p)).toBe(
      "OBJ-2026-015",
    );
    expect(cisloObjednavkyPodlaPredpon(["Vaša objednávka PO: 4500123"], p)).toBe("PO4500123");
    expect(cisloObjednavkyPodlaPredpon(["obj-77 a PO 1"], p)).toBe("obj-77");
    // bez číslice, vnútri slova, dátum za „Po" — nie
    expect(cisloObjednavkyPodlaPredpon(["PO BOX", "SPO123", "Po 12.10.2026"], p)).toBeNull();
    expect(cisloObjednavkyPodlaPredpon(["OBJ-15"], [])).toBeNull();
    // prvý text má prednosť
    expect(cisloObjednavkyPodlaPredpon(["PO 9", "OBJ-1"], p)).toBe("PO9");
  });

  it("upravVytazeneUdaje doplní objednávku z textov AI, s predponou ju nemení", () => {
    const n = { ...PREDVOLENE_NESPRACOVANE, predponyObjednavky: ["OBJ-"] };
    const ai = { order_number: null, description: "Tovar podľa OBJ-42", items: [{ name: "x" }] };
    const zaklad: { polozky: unknown[]; objednavka?: string } = { polozky: [] };
    expect(upravVytazeneUdaje(zaklad, "faktura", n, textyPreObjednavku(ai)).objednavka).toBe(
      "OBJ-42",
    );
    // AI vrátilo číslo bez predpony, predpona je inde v texte → vezme sa číslo s predponou
    expect(
      upravVytazeneUdaje({ ...zaklad, objednavka: "12345" }, "faktura", n, ["OBJ-7"]).objednavka,
    ).toBe("OBJ-7");
    expect(
      upravVytazeneUdaje({ ...zaklad, objednavka: "OBJ-1" }, "faktura", n, ["OBJ-7"]).objednavka,
    ).toBe("OBJ-1");
    // bez predpôn sa nemení nič
    expect(
      upravVytazeneUdaje({ ...zaklad, objednavka: "12345" }, "faktura", PREDVOLENE_NESPRACOVANE, [
        "OBJ-7",
      ]).objednavka,
    ).toBe("12345");
    expect(maPredponu("obj-1", ["OBJ-"])).toBe(true);
  });
});

describe("blocekZauctovanyPriVytvoreni", () => {
  const z = {
    odCloveka: false,
    predkontaciaPoZapise: null,
    zauctovat: true,
    nepotvrdenychNavrhov: 0,
  };
  it("predkontácia od človeka bloček zaúčtuje vždy", () => {
    expect(
      blocekZauctovanyPriVytvoreni({ ...z, odCloveka: true, predkontaciaPoZapise: "4V" }),
    ).toBe(true);
    expect(blocekZauctovanyPriVytvoreni({ ...z, odCloveka: true, zauctovat: false })).toBe(true);
  });
  it("predkontácia od pravidla len pri zapnutom nastavení a bez nepotvrdeného návrhu AI", () => {
    expect(blocekZauctovanyPriVytvoreni({ ...z, predkontaciaPoZapise: "4V" })).toBe(true);
    expect(
      blocekZauctovanyPriVytvoreni({ ...z, predkontaciaPoZapise: "4V", zauctovat: false }),
    ).toBe(false);
    expect(
      blocekZauctovanyPriVytvoreni({ ...z, predkontaciaPoZapise: "4V", nepotvrdenychNavrhov: 1 }),
    ).toBe(false);
  });
  it("bez predkontácie ostane nezaúčtovaný", () => {
    expect(blocekZauctovanyPriVytvoreni({ ...z, predkontaciaPoZapise: "  " })).toBe(false);
  });
});

describe("zdrojZauctovaniaPriVytvoreni", () => {
  it("zaúčtovaný doklad z Nespracovaných je ručné zaúčtovanie", () => {
    expect(zdrojZauctovaniaPriVytvoreni(true)).toEqual({
      zauctovanie_zdroj: "manual",
      zauctovanie_istota: null,
    });
  });
  it("nezaúčtovaný doklad zdroj nedostane", () => {
    expect(zdrojZauctovaniaPriVytvoreni(false)).toEqual({});
  });
});
