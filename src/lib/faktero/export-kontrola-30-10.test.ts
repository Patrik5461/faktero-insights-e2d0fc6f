/**
 * Celkový test exportov 30. 10. 2026 — chyby nájdené na skutočných dokladoch
 * (generované len v pamäti):
 * - prijatá faktúra z čítania (ceny s DPH) mala základ o pár centov iný než
 *   faktúra a k tomu vymyslené zaokrúhlenie (PALIERA 4226035034);
 * - ABRA Flexi neposielala dátum odpočtu DPH (`duzpUcto`), súpiska CSV ho nemala;
 * - prijatá zálohová faktúra bez DPH sa vynechala s hláškou o rozpise DPH;
 * - krajina „Slovensko" dala neplatné Money S3 (`KodStatu` má 2 znaky) a
 *   v účtovnom exporte skrátené „SL"; ulica nad 50 znakov Money neprijme.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { polozkyPrijatej, rozpisPrijatej } from "./prijate-do-pohody";
import {
  prekazkaZaokruhlenia,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type NastaveniaUctovania,
} from "./zauctovanie-export";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import { buildCsvUctovanie, STLPCE_CSV_UCTOVANIA } from "./export-csv-uctovanie";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import { buildMrpUctovanie } from "./export-mrp-uctovanie";
import { EXPORT_STRATEGIES } from "./export.server";
import { kodStatu } from "./company-autofill";

xmlRegisterFsInputProviders();
const SCHEMA = new URL("./__fixtures__/money-s3-uct-schemas/_Document.xsd", import.meta.url);
const money = XsdValidator.fromDoc(
  XmlDocument.fromBuffer(readFileSync(SCHEMA), { url: fileURLToPath(SCHEMA) }),
);
function chybaMoney(xml: string): string | null {
  const doc = XmlDocument.fromString(xml);
  try {
    money.validate(doc);
    return null;
  } catch (e) {
    const det = (e as { details?: { message?: string }[] }).details ?? [];
    return [String((e as Error)?.message ?? e), ...det.map((d) => d.message)].join(" | ");
  } finally {
    doc.dispose();
  }
}

const nast: NastaveniaUctovania = {
  predkontacia: "FV",
  clenenieDph: "UD",
  predkontaciaPrijata: "PF",
  clenenieDphPrijata: "PD",
};
const firma = { name: "Ukážka s.r.o.", ico: "12345678", country: "SK" };
const prijata = (o: Record<string, unknown>) => ({
  id: "11111111-1111-1111-1111-111111111111",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "87654321",
  invoice_number: "PF-1",
  issue_date: "2026-09-30",
  delivery_date: "2026-09-28",
  received_date: "2026-10-03",
  due_date: "2026-10-14",
  currency: "EUR",
  type: "regular",
  ...o,
});

describe("prijatá faktúra z čítania — základ podľa faktúry", () => {
  // Položky s cenou s DPH, ich súčet je o 2 centy vyšší než faktúra.
  const p = prijata({
    amount_without_vat: 395.18,
    vat_amount: 90.9,
    amount_total: 486.08,
    items: [
      { name: "Nafta", total: 300.05, vat_rate: 23 },
      { name: "Benzín", total: 190.0, vat_rate: 23 },
      { name: "Zľava", total: -3.95, vat_rate: 23 },
    ],
  });

  it("položky dorovnajú základ aj daň na sumy faktúry", () => {
    const pol = polozkyPrijatej(p)!;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    expect(r2(pol.reduce((a, x) => a + x.zaklad, 0))).toBe(395.18);
    expect(r2(pol.reduce((a, x) => a + x.dph, 0))).toBe(90.9);
    // Zľava ostáva záporná, dorovná sa najväčšia položka.
    expect(pol[2].zaklad).toBeLessThan(0);
    expect(rozpisPrijatej(p)).toEqual([{ sadzba: 23, zaklad: 395.18, dph: 90.9 }]);
  });

  it("model účtovania nemá vymyslené zaokrúhlenie", () => {
    const d = prijataNaUctovanie(p, nast);
    expect(d.zaklad).toBe(395.18);
    expect(d.dph).toBe(90.9);
    expect(Math.abs(d.zaokruhlenie)).toBe(0);
  });

  it("hlavička, ktorá sama nesedí, sa nedorovnáva", () => {
    // základ + DPH ≠ spolu — neistá hlavička, ostane rozpis z položiek
    const pol = polozkyPrijatej({ ...p, amount_without_vat: 395.1 })!;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    expect(r2(pol.reduce((a, x) => a + x.zaklad, 0))).toBe(395.2);
  });
});

describe("dátum odpočtu DPH vo Flexi a v súpiske CSV", () => {
  const d = prijataNaUctovanie(
    prijata({ amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
    {
      ...nast,
      datumOdpoctu: "dorucenie",
    },
  );

  it("Flexi: duzpUcto = dátum odpočtu, duzpPuv = dodanie", () => {
    const { xml } = buildFlexiUctovanie({ firma, doklady: [d], kody: {} });
    expect(xml).toContain("<duzpUcto>2026-10-03</duzpUcto>");
    expect(xml).toContain("<duzpPuv>2026-09-28</duzpPuv>");
  });

  it("Flexi: z uzamknutého obdobia deň po uzávierke", () => {
    const z = prijataNaUctovanie(
      prijata({ amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
      {
        ...nast,
        zamknuteDo: "2026-09-30",
      },
    );
    const { xml } = buildFlexiUctovanie({ firma, doklady: [z], kody: {} });
    expect(xml).toContain("<duzpUcto>2026-10-01</duzpUcto>");
  });

  it("CSV: stĺpce dátum prijatia a odpočtu na konci", () => {
    const csv = buildCsvUctovanie({ doklady: [d], kody: {} })
      .trim()
      .split("\r\n");
    expect(STLPCE_CSV_UCTOVANIA.slice(-2)).toEqual(["datum_prijatia", "datum_odpoctu"]);
    const riadok = csv[1].split(";");
    expect(riadok.slice(-2)).toEqual(["2026-10-03", "2026-10-03"]);
    expect(riadok.length).toBe(STLPCE_CSV_UCTOVANIA.length);
  });
});

describe("prijatá zálohová faktúra bez DPH", () => {
  it("vynechá sa s dôvodom, že nie je daňový doklad", () => {
    const d = prijataNaUctovanie(
      prijata({
        type: "proforma",
        amount_without_vat: 0,
        vat_amount: 0,
        amount_total: 900,
        items: [{ name: "záloha na betón", total: 900, vat_rate: null }],
      }),
      nast,
    );
    expect(prekazkaZaokruhlenia(d)).toMatch(/zálohová faktúra bez DPH nie je daňový doklad/);
  });

  it("bežná faktúra s nesediacim rozpisom ostáva pri hláške o rozpise", () => {
    const d = prijataNaUctovanie(
      prijata({ amount_without_vat: 100, vat_amount: 23, amount_total: 130 }),
      nast,
    );
    expect(prekazkaZaokruhlenia(d)).toMatch(/nesedí s celkovou sumou/);
  });
});

describe("krajina partnera ako kód", () => {
  it("kodStatu", () => {
    expect(kodStatu("Slovensko")).toBe("SK");
    expect(kodStatu("Česká republika")).toBe("CZ");
    expect(kodStatu("at")).toBe("AT");
    expect(kodStatu("Rakúsko")).toBeNull();
    expect(kodStatu(null)).toBeNull();
  });

  const inv = {
    id: "22222222-2222-2222-2222-222222222222",
    type: "regular",
    status: "issued",
    invoice_number: "2026001",
    variable_symbol: "2026001",
    issue_date: "2026-10-01",
    delivery_date: "2026-10-01",
    due_date: "2026-10-15",
    currency: "EUR",
    subtotal: 450,
    vat_total: 0,
    total: 450,
    customer_name: "mima production s.r.o.",
    customer_ico: "46540113",
    customer_street: "Martinčekova 18 82109 Bratislava - mestská časť Ružinov",
    customer_country: "Slovensko",
  };
  const items = [
    { name: "Služba", quantity: 1, unit_price: 450, subtotal: 450, vat_amount: 0, vat_rate: 0 },
  ];

  it("Money S3 účtovný export: platné XML, SK a skrátená ulica", () => {
    const d = vystavenaNaUctovanie(inv, items, nast);
    const { xml } = buildMoneyS3Uctovanie({ firma, doklady: [d], kody: {} });
    expect(chybaMoney(xml)).toBeNull();
    expect(xml).toContain("<KodStatu>SK</KodStatu>");
  });

  it("Money S3 export faktúr: platné XML", async () => {
    const r = await EXPORT_STRATEGIES.money_s3_xml.build({
      company: { ...firma, vat_payer: false } as any,
      invoices: [{ invoice: inv as any, items: items as any }],
    });
    expect(chybaMoney(r.content)).toBeNull();
    expect(r.content).toContain("<KodStatu>SK</KodStatu>");
  });

  it("MRP a Pohoda dostanú kód, nie názov", async () => {
    const d = vystavenaNaUctovanie(inv, items, nast);
    expect(buildMrpUctovanie({ firma, doklady: [d] }).xml).toContain(
      "<CountryCode>SK</CountryCode>",
    );
    const p = await EXPORT_STRATEGIES.pohoda_xml.build({
      company: { ...firma, vat_payer: true } as any,
      invoices: [{ invoice: inv as any, items: items as any }],
      nastavenia: { clenenieDph: "UN" } as any,
    });
    expect(p.content).not.toContain("<typ:ids>Slovensko</typ:ids>");
  });
});
