import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  nazovSuboruSplatok,
  polozkySplatky,
  ucinneKody,
  xmlSplatokDoPohody,
  type SplatkaPreExport,
  type ZmluvaPreExport,
} from "./financovanie-pohoda";

xmlRegisterFsInputProviders();

let validator: XsdValidator | null = null;
function chybySchemy(xml: string): string[] {
  if (!validator) {
    const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
    validator = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  }
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const prvok = m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      validator.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const leasing: ZmluvaPreExport = {
  id: "z1",
  kind: "leasing",
  name: "Škoda Octavia",
  provider_name: "ČSOB Leasing, a.s.",
  contract_number: "UZF/26/80613",
  variable_symbol: "2680613",
  currency: "EUR",
  vat_rate: 0,
  term_months: 60,
  pohoda_predkontacia: "1Lz",
  pohoda_clenenie_dph: "PN",
  kv_clenenie: "X",
};

const s1: SplatkaPreExport = {
  id: "s1",
  number: 1,
  due_date: "2026-11-15",
  amount: 512.4,
  principal_part: 430.1,
  interest_part: 62.3,
  vat_amount: 0,
  insurance_part: 20,
};

describe("splátky do Ostatných záväzkov", () => {
  it("rozpadne splátku na istinu, úrok a poistenie a dorovná zvyšok", () => {
    const { polozky, vyhrady } = polozkySplatky(leasing, { ...s1, amount: 515.4 });
    expect(vyhrady).toEqual([]);
    expect(polozky.map((p) => [p.text, p.zaklad, p.dph])).toEqual([
      ["Istina", 430.1, 0],
      ["Úrok", 62.3, 0],
      ["Poistenie", 20, 0],
      ["Ostatné (poplatky)", 3, 0],
    ]);
  });

  it("DPH v splátke rozdelí na istinu a úrok pomerom a sedí na cent", () => {
    const op = { ...leasing, vat_rate: 23 };
    const s = { ...s1, amount: 100 + 23.01 + 0, principal_part: 66.67, interest_part: 33.33, vat_amount: 23.01, insurance_part: 0 };
    const { polozky } = polozkySplatky(op, s);
    expect(polozky.map((p) => p.sadzba)).toEqual([23, 23]);
    expect(polozky.reduce((a, p) => a + p.dph, 0)).toBeCloseTo(23.01, 2);
    expect(polozky.reduce((a, p) => a + p.zaklad + p.dph, 0)).toBeCloseTo(123.01, 2);
  });

  it("splátka bez rozpadu ide ako jedna položka", () => {
    const { polozky } = polozkySplatky(leasing, { ...s1, principal_part: 0, interest_part: 0, insurance_part: 0 });
    expect(polozky).toEqual([{ text: "Splátka", zaklad: 512.4, dph: 0, sadzba: 0 }]);
  });

  it("časti nad sumu splátky → výhrada", () => {
    const { vyhrady } = polozkySplatky(leasing, { ...s1, amount: 400 });
    expect(vyhrady[0]).toMatch(/viac než splátka/);
  });

  it("kódy splátky prebíjajú kalendár", () => {
    expect(ucinneKody(leasing, s1)).toMatchObject({ predkontacia: "1Lz", clenenie: "PN", vlastne: false });
    expect(ucinneKody(leasing, { ...s1, pohoda_predkontacia: "1Lu" })).toMatchObject({
      predkontacia: "1Lu",
      clenenie: "PN",
      vlastne: true,
    });
  });

  it("XML je záväzok podľa invoice.xsd a nesie kódy", () => {
    const s2 = { ...s1, id: "s2", number: 2, due_date: "2026-12-15", pohoda_predkontacia: "1Lu", kv_clenenie: "B2" };
    const r = xmlSplatokDoPohody({ ico: "36123456", krajinaFirmy: "SK", zmluva: leasing, splatky: [s2, s1] });
    expect(r.pocet).toBe(2);
    expect(r.idSplatok).toEqual(["s1", "s2"]);
    expect(chybySchemy(r.xml)).toEqual([]);
    expect(r.xml).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    expect(r.xml).toContain("<inv:symVar>2680613</inv:symVar>");
    expect(r.xml).toContain("<inv:text>Splátka 1/60 – leasing UZF/26/80613</inv:text>");
    expect(r.xml).toContain("<typ:ids>1Lu</typ:ids>");
    // „X“ (nezahŕňať) sa do Pohody neposiela, vlastné KV splátky áno.
    expect(r.xml.match(/classificationKVDPH><typ:ids>B2/g)?.length).toBeGreaterThan(0);
    expect(r.xml).not.toContain("<typ:ids>X</typ:ids>");
  });

  it("operatívny leasing s DPH prejde schémou s priceHigh", () => {
    const op = { ...leasing, vat_rate: 23, pohoda_clenenie_dph: "PD", kv_clenenie: "B2" };
    const s = { ...s1, amount: 615, principal_part: 450, interest_part: 50, vat_amount: 115, insurance_part: 0 };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: op, splatky: [s] });
    expect(chybySchemy(r.xml)).toEqual([]);
    expect(r.xml).toContain("<typ:priceHigh>500.00</typ:priceHigh>");
    expect(r.xml).toContain("<typ:priceHighVAT>115.00</typ:priceHighVAT>");
  });

  it("kalendár bez predkontácie dá výhradu, cudzia mena sa neexportuje", () => {
    const bez = { ...leasing, pohoda_predkontacia: null };
    expect(xmlSplatokDoPohody({ zmluva: bez, splatky: [s1] }).vyhrady.join(" ")).toMatch(/Neviem/);
    const czk = xmlSplatokDoPohody({ zmluva: { ...leasing, currency: "CZK" }, splatky: [s1] });
    expect(czk.pocet).toBe(0);
    expect(czk.vyhrady[0]).toMatch(/CZK/);
  });

  it("český kalendár nemá členenie KV", () => {
    const r = xmlSplatokDoPohody({
      krajinaFirmy: "CZ",
      zmluva: { ...leasing, currency: "CZK", kv_clenenie: "B2" },
      splatky: [s1],
    });
    expect(r.xml).not.toContain("classificationKVDPH");
    expect(chybySchemy(r.xml)).toEqual([]);
  });

  it("názov súboru", () => {
    expect(nazovSuboruSplatok(leasing, [3, 1, 2])).toBe("splatky-UZF-26-80613-1-3.xml");
  });
});
