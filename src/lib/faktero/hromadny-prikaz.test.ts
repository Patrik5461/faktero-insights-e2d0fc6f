/**
 * Hromadný príkaz na úhradu. Banka súbor, ktorý nesedí so schémou, odmietne
 * celý a väčšinou bez vysvetlenia — preto sa overuje proti dvom schémam:
 * plnej ISO 20022 a prísnejšej SEPA (EPC), ktorú banky v skutočnosti uplatňujú.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import {
  datumUhrady,
  endToEndId,
  pripravPlatby,
  sepaText,
  zostavPain001,
  type FakturaNaUhradu,
} from "./hromadny-prikaz";

function overSchemou(xml: string, subor: string): string | null {
  const xsd = XmlDocument.fromBuffer(readFileSync(new URL(`./schemy/${subor}`, import.meta.url)));
  const validator = XsdValidator.fromDoc(xsd);
  const doc = XmlDocument.fromBuffer(Buffer.from(xml, "utf8"));
  try {
    validator.validate(doc);
    return null;
  } catch (e) {
    return String((e as Error)?.message ?? e);
  } finally {
    doc.dispose();
    validator.dispose();
    xsd.dispose();
  }
}

const f = (zmeny: Partial<FakturaNaUhradu> = {}): FakturaNaUhradu => ({
  id: crypto.randomUUID(),
  invoice_number: "FA2026/0042",
  supplier_name: "Žltá Ďateľ s.r.o. & synovia",
  supplier_iban: "SK31 1200 0000 1987 4263 7541",
  amount_total: "123.40",
  currency: "EUR",
  due_date: "2026-10-20",
  status: "received",
  payment_method: "prevod",
  variable_symbol: "2026042",
  specific_symbol: null,
  constant_symbol: "0308",
  ...zmeny,
});

const nastavenie = {
  platitel: { meno: "Faktero Demo s.r.o.", iban: "SK0375000000004032809427", bic: "CEKOSKBX" },
  datum: "2026-10-05",
  podlaSplatnosti: false,
  vytvorene: new Date("2026-10-04T10:00:00Z"),
};

describe("pripravPlatby", () => {
  it("vynechá, čo sa platiť nemá, a povie prečo", () => {
    const { platby, preskocene } = pripravPlatby([
      f(),
      f({ invoice_number: "A", status: "paid" }),
      f({ invoice_number: "B", payment_method: "hotovost" }),
      f({ invoice_number: "C", supplier_iban: null }),
      f({ invoice_number: "D", supplier_iban: "SK00 1111" }),
      f({ invoice_number: "E", currency: "CZK" }),
      f({ invoice_number: "F", amount_total: 0 }),
      f({ invoice_number: "G", status: "cancelled" }),
    ]);
    expect(platby).toHaveLength(1);
    expect(platby[0]).toMatchObject({
      iban: "SK3112000000198742637541",
      suma: 123.4,
      vs: "2026042",
    });
    expect(preskocene.map((p) => `${p.cisloFaktury}: ${p.dovod}`)).toEqual([
      "A: už je zaplatená",
      "B: bola zaplatená hotovosťou alebo kartou",
      "C: chýba IBAN dodávateľa",
      "D: IBAN dodávateľa nie je platný",
      "E: je v mene CZK — SEPA príkaz platí len v eurách",
      "F: suma na úhradu nie je kladná",
      "G: je stornovaná",
    ]);
  });

  it("bez variabilného symbolu ho vezme z čísel v čísle faktúry", () => {
    expect(pripravPlatby([f({ variable_symbol: null })]).platby[0].vs).toBe("20260042");
  });
});

describe("pomocné", () => {
  it("text bez diakritiky a znakov mimo SEPA", () => {
    expect(sepaText("Žltá Ďateľ s.r.o. & synovia", 70)).toBe("Zlta Datel s.r.o. synovia");
    expect(sepaText("x".repeat(80), 70)).toHaveLength(70);
  });
  it("symboly po slovensky v EndToEndId", () => {
    expect(endToEndId({ vs: "123", ss: "", ks: "0308" })).toBe("/VS123/KS0308");
    expect(endToEndId({ vs: "", ss: "", ks: "" })).toBe("NOTPROVIDED");
  });
  it("podľa splatnosti, ale nikdy nie do minulosti", () => {
    const p = pripravPlatby([f()]).platby[0];
    expect(datumUhrady(p, { datum: "2026-10-05", podlaSplatnosti: true })).toBe("2026-10-20");
    expect(datumUhrady(p, { datum: "2026-10-25", podlaSplatnosti: true })).toBe("2026-10-25");
    expect(datumUhrady(p, { datum: "2026-10-05", podlaSplatnosti: false })).toBe("2026-10-05");
  });
});

describe("zostavPain001", () => {
  const { platby } = pripravPlatby([
    f(),
    f({ invoice_number: "FA-2", amount_total: 0.1, due_date: "2026-10-30", variable_symbol: null }),
    f({ invoice_number: "FA-3", amount_total: 0.2, supplier_iban: "CZ6508000000192000145399" }),
  ]);

  it("sedí s ISO 20022 aj so SEPA schémou", () => {
    const xml = zostavPain001(platby, nastavenie);
    expect(overSchemou(xml, "pain.001.001.03.xsd")).toBeNull();
    expect(overSchemou(xml, "pain.001.001.03-sepa.xsd")).toBeNull();
  });

  it("sedí aj bez BIC platiteľa a s blokmi podľa splatnosti", () => {
    const xml = zostavPain001(platby, {
      ...nastavenie,
      platitel: { ...nastavenie.platitel, bic: null },
      podlaSplatnosti: true,
    });
    expect(overSchemou(xml, "pain.001.001.03.xsd")).toBeNull();
    expect(overSchemou(xml, "pain.001.001.03-sepa.xsd")).toBeNull();
    // splatnosti 20. 10. (dve faktúry) a 30. 10.
    expect(xml.match(/<PmtInf>/g)).toHaveLength(2);
  });

  it("kontrolné súčty bez chyby zaokrúhlenia", () => {
    const xml = zostavPain001(platby, nastavenie);
    expect(xml).toContain("<NbOfTxs>3</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>123.70</CtrlSum>");
    expect(xml).toContain("<EndToEndId>/VS2026042/KS0308</EndToEndId>");
    expect(xml).toContain("<Nm>Zlta Datel s.r.o. synovia</Nm>");
  });

  it("odmietne prázdny príkaz aj zlý IBAN platiteľa", () => {
    expect(() => zostavPain001([], nastavenie)).toThrow(/Žiadna/);
    expect(() =>
      zostavPain001(platby, { ...nastavenie, platitel: { meno: "X", iban: "SK12" } }),
    ).toThrow(/IBAN/);
  });
});
