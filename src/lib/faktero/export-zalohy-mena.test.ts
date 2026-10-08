import { describe, expect, it } from "vitest";
import { buildMoneyS3Xml, buildOmegaTxt } from "./export.server";
import { buildFlexiXml } from "./export-dalsie";
import { buildIsdoc } from "./isdoc-export";
import { buildOmegaUctovanie } from "./export-omega-uctovanie";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import { vystavenaNaUctovanie } from "./zauctovanie-export";
import { riadkyOdpoctu, type OdpocetZalohy } from "./zalohy-odpocty";

/*
  Odpočet zdanenej zálohy a cudzia mena v exportoch mimo Pohody (október
  2026). Predtým tieto formáty vyúčtovaciu faktúru aj doklad v cudzej mene
  vynechávali.
*/

const firma = { name: "Test s.r.o.", ico: "12345678", ic_dph: "SK2020123456", country: "SK" };
const odpocet: OdpocetZalohy = {
  zaloha: "ZF001",
  doklad: "DDP001",
  vs: "26100",
  suma: 492,
  riadky: [{ sadzba: 23, zaklad: 400, dph: 92 }],
};
const vyuctovanie = {
  id: "0a0e0000-0000-4000-8000-000000000008",
  invoice_number: "2026004",
  variable_symbol: "2026004",
  type: "regular",
  issue_date: "2026-09-30",
  delivery_date: "2026-09-30",
  due_date: "2026-10-14",
  currency: "EUR",
  customer_name: "Delta s.r.o.",
  customer_ico: "55667788",
  subtotal: 1000,
  vat_total: 230,
  total: 1230,
  advance_amount: 492,
  _odpocty: [odpocet],
};
const polozky = [{ name: "Dielo", quantity: 1, unit: "ks", unit_price: 1000, vat_rate: 23, subtotal: 1000, vat_amount: 230, total: 1230 }];

describe("odpočet zdanenej zálohy", () => {
  it("čiastočný odpočet rozdelí doklad k platbe pomerne", () => {
    expect(riadkyOdpoctu(246, [{ sadzba: 23, zaklad: 400, dph: 92 }])).toEqual([{ sadzba: 23, zaklad: 200, dph: 46 }]);
  });

  it("Omega TXT: záporná položka, súčty a na úhradu po odpočte", () => {
    const preskocene: string[] = [];
    const txt = buildOmegaTxt({ company: firma, invoices: [{ invoice: vyuctovanie, items: polozky }] as any, preskocene });
    expect(preskocene).toEqual([]);
    const r = txt.split("\r\n");
    const r01 = r.find((x) => x.startsWith("R01\t"))!.split("\t");
    expect([r01[8], r01[14], r01[42]]).toEqual(["600,00", "138,00", "738,00"]);
    expect(r.some((x) => x.startsWith("R02\tOdpočet zálohy DDP001") && x.includes("-400,00"))).toBe(true);
  });

  it("Money S3: záporná položka s príznakom zdanenej zálohy a Celkem po odpočte", () => {
    const { xml, preskocene } = buildMoneyS3Xml({ company: firma, invoices: [{ invoice: vyuctovanie, items: polozky }] as any });
    expect(preskocene).toEqual([]);
    expect(xml).toContain("<Zaklad22>600.00</Zaklad22>");
    expect(xml).toContain("<Celkem>738.00</Celkem>");
    expect(xml).toContain("<ZdanZaloha>1</ZdanZaloha>");
  });

  it("Flexi: záporná položka a súčty po odpočte", () => {
    const { xml, preskocene } = buildFlexiXml({ invoices: [{ invoice: vyuctovanie, items: polozky }] as any });
    expect(preskocene).toEqual([]);
    expect(xml).toContain("<sumCelkem>738.00</sumCelkem>");
    expect(xml).toContain("<sumZkl>-400.00</sumZkl>");
  });

  it("ISDOC: TaxedDeposits a rozdiel dane", () => {
    const xml = buildIsdoc({ invoice: vyuctovanie, items: polozky, company: firma });
    expect(xml).toContain("<TaxedDeposits>");
    expect(xml).toContain("<AlreadyClaimedTaxAmount>92.00</AlreadyClaimedTaxAmount>");
    expect(xml).toContain("<DifferenceTaxAmount>138.00</DifferenceTaxAmount>");
    expect(xml).toContain("<PayableAmount>738.00</PayableAmount>");
  });

  it("nezdanená záloha (bez dokladu k platbe) ostáva na ručné zúčtovanie", () => {
    const nezdanena = { ...vyuctovanie, _odpocty: [{ ...odpocet, doklad: null, riadky: [] }] };
    const preskocene: string[] = [];
    buildOmegaTxt({ company: firma, invoices: [{ invoice: nezdanena, items: polozky }] as any, preskocene });
    expect(preskocene[0]).toMatch(/nezdanenej zálohy/);
  });

  it("účtovanie: záporný riadok so zálohovou predkontáciou, Omega 311/324", () => {
    const d = vystavenaNaUctovanie(vyuctovanie, polozky, { predkontacia: "3FV", predkontaciaZaloha: "3ZAL" });
    expect(d.odpocetVRiadkoch).toBe(true);
    expect(d.celkom).toBe(738);
    expect(d.riadky.find((r) => r.predkontacia === "3ZAL")).toMatchObject({ zaklad: -400, dph: -92 });
    const { obsah, preskocene } = buildOmegaUctovanie({
      firma,
      doklady: [d],
      kody: {
        "3FV": { kod: "3FV", popis: null, ucetMd: "311000", ucetD: "602000" },
        "3ZAL": { kod: "3ZAL", popis: null, ucetMd: "311000", ucetD: "324000" },
      },
      nastavenia: { evidencie: { OF: { evidencia: "OF", rad: "OF" } } },
    });
    expect(preskocene).toEqual([]);
    expect(obsah).toMatch(/R02\t0\t311\t000\t324\t000\t-400,00/);
  });
});

describe("cudzia mena", () => {
  const czk = {
    ...vyuctovanie,
    invoice_number: "2026002",
    currency: "CZK",
    exchange_rate: 25.2,
    subtotal: 12600,
    vat_total: 0,
    total: 12600,
    advance_amount: null,
    _odpocty: null,
  };
  const pol = [{ name: "Vývoj", quantity: 10, unit: "hod", unit_price: 1260, vat_rate: 0, subtotal: 12600, vat_amount: 0, total: 12600 }];

  it("Omega EUD: zápis v eurách aj v korunách a kurz v hlavičke", () => {
    const d = vystavenaNaUctovanie(czk, pol, { predkontacia: "3FV" });
    const { obsah, preskocene } = buildOmegaUctovanie({
      firma,
      doklady: [d],
      kody: { "3FV": { kod: "3FV", popis: null, ucetMd: "311000", ucetD: "602000" } },
      nastavenia: { evidencie: { OF: { evidencia: "OF", rad: "OF" } } },
    });
    expect(preskocene).toEqual([]);
    const r01 = obsah.split("\r\n").find((x) => x.startsWith("R01\t"))!.split("\t");
    expect([r01[14], r01[15], r01[16], r01[18], r01[19]]).toEqual(["CZK", "1", "25,2", "12600,00", "500,00"]);
    expect(obsah).toMatch(/R02\t0\t311\t000\t602\t000\t500,00\t12600,00/);
  });

  it("Flexi účtovanie: sumy v eurách, *Men v korunách", () => {
    const d = vystavenaNaUctovanie(czk, pol, {});
    const { xml, preskocene } = buildFlexiUctovanie({ firma: {}, doklady: [d], kody: {} });
    expect(preskocene).toEqual([]);
    expect(xml).toContain("<sumCelkem>500.00</sumCelkem>");
    expect(xml).toContain("<sumCelkemMen>12600.00</sumCelkemMen>");
    expect(xml).toContain("<kurzMnozstvi>100</kurzMnozstvi>");
  });
});
