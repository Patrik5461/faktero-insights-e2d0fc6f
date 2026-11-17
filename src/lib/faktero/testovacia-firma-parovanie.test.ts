import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { bezTestovacich, presunMedziFirmamiPovoleny } from "./testovacia-firma-parovanie";
import { vyberFirmuPodlaOdberatela, type FirmaNaRozdelenie } from "./mail-rozdelovac";
import { chybajuceUdajeFirmy } from "./udaje-firmy-na-fakture";
import { buildIsdoc } from "./isdoc-export";

/** Skutočná firma a jej testovacia kópia: IČO NULL, ostatné údaje rovnaké. */
const skutocna: FirmaNaRozdelenie = {
  id: "real-1",
  name: "Alfa s.r.o.",
  ico: "12345678",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  ibany: ["SK3112000000198742637541"],
  testovacia_pre: null,
};
const testovacia: FirmaNaRozdelenie = {
  ...skutocna,
  id: "test-1",
  name: "Test – Alfa s.r.o.",
  ico: null,
  testovacia_pre: "real-1",
};
const ina: FirmaNaRozdelenie = {
  id: "real-2",
  name: "Beta a.s.",
  ico: "87654321",
  dic: "2021111111",
  ic_dph: "SK2021111111",
  ibany: [],
  testovacia_pre: null,
};

describe("bezTestovacich", () => {
  it("vynechá testovacie, poradie ostatných nechá", () => {
    expect(bezTestovacich([testovacia, ina, skutocna]).map((f) => f.id)).toEqual([
      "real-2",
      "real-1",
    ]);
  });
  it("firma bez stĺpca testovacia_pre je skutočná", () => {
    expect(bezTestovacich([{ id: "x" } as { id: string; testovacia_pre?: string | null }])).toHaveLength(1);
  });
});

describe("rozdeľovač — vlastná firma podľa odberateľa", () => {
  const firmy = [skutocna, testovacia, ina];

  it("podľa IČ DPH vyberie skutočnú, nie testovaciu (inak by to bolo nejednoznačné)", () => {
    const v = vyberFirmuPodlaOdberatela({ buyer_ic_dph: "SK 2020123456" }, firmy);
    expect(v.vysledok).toBe("zhoda");
    expect(v.firma?.id).toBe("real-1");
    expect(v.kandidati).toEqual(["real-1"]);
  });

  it("podľa DIČ vyberie skutočnú", () => {
    const v = vyberFirmuPodlaOdberatela({ buyer_dic: "2020123456" }, firmy);
    expect(v.firma?.id).toBe("real-1");
    expect(v.podla).toBe("dic");
  });

  it("podľa IBAN a názvu (slabé údaje) tiež len skutočnú", () => {
    expect(
      vyberFirmuPodlaOdberatela({ buyer_iban: "SK31 1200 0000 1987 4263 7541" }, firmy).firma?.id,
    ).toBe("real-1");
    expect(vyberFirmuPodlaOdberatela({ buyer_name: "ALFA, s. r. o." }, firmy).firma?.id).toBe(
      "real-1",
    );
  });

  it("keď používateľ má len testovaciu, automatika nezaradí nič", () => {
    const v = vyberFirmuPodlaOdberatela({ buyer_ic_dph: "SK2020123456" }, [testovacia, ina]);
    expect(v.firma).toBeNull();
    expect(v.vysledok).toBe("cudzi");
  });

  it("skutočné firmy sa správajú ako predtým (dve s rovnakým DIČ = nejednoznačné)", () => {
    const dvojca = { ...skutocna, id: "real-3", ico: "11111111", testovacia_pre: null };
    const v = vyberFirmuPodlaOdberatela({ buyer_dic: "2020123456" }, [skutocna, dvojca]);
    expect(v.vysledok).toBe("nejednoznacne");
  });
});

describe("presun skladu medzi firmami", () => {
  const r = { testovacia_pre: null };
  const t = { testovacia_pre: "real-1" };
  it("skutočná ↔ testovacia nie", () => {
    expect(presunMedziFirmamiPovoleny(r, t)).toBe(false);
    expect(presunMedziFirmamiPovoleny(t, r)).toBe(false);
  });
  it("skutočná ↔ skutočná a testovacia ↔ testovacia áno", () => {
    expect(presunMedziFirmamiPovoleny(r, { testovacia_pre: undefined })).toBe(true);
    expect(presunMedziFirmamiPovoleny(t, { testovacia_pre: "real-9" })).toBe(true);
  });
});

describe("vystavenie v testovacej firme bez IČO", () => {
  const firma = {
    name: "Alfa s.r.o.",
    ico: "12345678",
    dic: "2020123456",
    ic_dph: "SK2020123456",
    street: "Hlavná 1",
    city: "Bratislava",
    country: "SK",
    iban: "SK3112000000198742637541",
  };

  it("chýbajúce údaje: testovacej IČO nevyčíta, skutočnej áno", () => {
    expect(chybajuceUdajeFirmy({ ...firma, ico: null, testovacia_pre: "real-1" }, {})).toEqual([]);
    expect(chybajuceUdajeFirmy({ ...firma, ico: null }, {})).toEqual(["IČO"]);
    expect(chybajuceUdajeFirmy({ ...firma, ico: null, testovacia_pre: null }, {})).toEqual(["IČO"]);
  });

  const isdocFirma = {
    id: "test-1",
    name: "Test – Alfa s.r.o.",
    ico: null as string | null,
    dic: "CZ25097563",
    ic_dph: "CZ25097563",
    street: "Dlouhá 12",
    city: "Praha",
    zip: "11000",
    country: "CZ",
    iban: "CZ1234567890123456789012",
    default_currency: "CZK",
  };
  const faktura = {
    id: "3f2a5c10-1b2c-4d3e-8f90-1234567890ab",
    invoice_number: "2026001",
    type: "regular",
    issue_date: "2026-03-04",
    delivery_date: "2026-03-04",
    due_date: "2026-03-18",
    currency: "CZK",
    variable_symbol: "2026001",
    customer_name: "Odběratel a.s.",
    customer_ico: "12345678",
    customer_ic_dph: "CZ12345678",
    customer_street: "Krátká 1",
    customer_city: "Brno",
    customer_zip: "60200",
    customer_country: "CZ",
  };
  const polozky = [
    {
      name: "Práce",
      quantity: 1,
      unit: "h",
      unit_price: 100,
      vat_rate: 21,
      subtotal: 100,
      vat_amount: 21,
    },
  ];

  it("ISDOC: testovacia firma bez IČO vyjde a prejde schémou", () => {
    const x = buildIsdoc({
      invoice: faktura,
      items: polozky,
      company: { ...isdocFirma, testovacia_pre: "real-1" } as any,
    });
    expect(x).toContain("<UserID>test-1</UserID>");
    const xsd = XmlDocument.fromBuffer(
      readFileSync(new URL("./schemy/isdoc-invoice-6.0.2.xsd", import.meta.url)),
    );
    const validator = XsdValidator.fromDoc(xsd);
    const doc = XmlDocument.fromString(x);
    expect(() => validator.validate(doc)).not.toThrow();
    doc.dispose();
  });

  it("ISDOC: skutočná firma bez IČO ďalej skončí chybou", () => {
    expect(() =>
      buildIsdoc({ invoice: faktura, items: polozky, company: isdocFirma as any }),
    ).toThrow(/IČO/);
  });
});
