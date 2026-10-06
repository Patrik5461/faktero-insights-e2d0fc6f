import { describe, expect, it } from "vitest";
import { buildOmegaUctovanie, typySumy } from "./export-omega-uctovanie";
import {
  blocekNaUctovanie,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type DokladUctovania,
} from "./zauctovanie-export";

const firma = { name: "Test s.r.o.", ico: "12345678", street: "Hlavná 1", zip: "81101", city: "Bratislava" };
const kody = {
  "1Fp": { kod: "1Fp", popis: "Materiál", ucetMd: "501", ucetD: "321" },
  "2Fp": { kod: "2Fp", popis: "Služby", ucetMd: "518100", ucetD: "321" },
  "3Fv": { kod: "3Fv", popis: "Tržby", ucetMd: "311", ucetD: "602" },
  "1Pv": { kod: "1Pv", popis: "Pokladňa", ucetMd: "501", ucetD: "211" },
  AUTO1: { kod: "AUTO1", popis: "auto s odpočtom", ucetMd: "512", ucetD: "321" },
  AUTO2: { kod: "AUTO2", popis: "auto bez odpočtu", ucetMd: "513", ucetD: "321" },
};
const vsetkyEvidencie = Object.fromEntries(
  ["OF", "OD", "OPF", "DF", "DD", "DPF", "PD", "ID"].map((k) => [k, { evidencia: k, rad: k }]),
);
const nastavenia = { evidencie: vsetkyEvidencie };
const nast = {
  predkontacia: "3Fv",
  predkontaciaPrijata: "1Fp",
  predkontaciaDoklady: "1Pv",
  blockyPodlaPlatby: true,
  pomeryPredkontacii: {
    AUTO: { typ: "dph5050", zaklad: 100, zdanitelna: "AUTO1", lenZaklad: "AUTO2", nezdanitelna: "AUTO3" },
  },
};

const vetvy = (obsah: string) => obsah.trimEnd().split("\r\n").map((r) => r.split("\t"));
const zapisy = (obsah: string) => vetvy(obsah).filter((r) => r[0] === "R02");
const cislo = (s: string) => Number(String(s).replace(",", "."));

/** Súčet zápisov sa musí rovnať sume dokladu — MD = Dal = celkom. */
function sucet(obsah: string): number {
  return Math.round(zapisy(obsah).reduce((a, r) => a + cislo(r[6]!), 0) * 100) / 100;
}

function vystavena(extra: Record<string, unknown> = {}, items?: any[]): DokladUctovania {
  return vystavenaNaUctovanie(
    { id: "v1", type: "regular", invoice_number: "2026001", issue_date: "2026-10-01", due_date: "2026-10-15", total: 128.25, customer_name: "Odberateľ a.s.", customer_ic_dph: "SK2020123456", ...extra },
    items ?? [
      { name: "Tovar", subtotal: 100, vat_amount: 23, vat_rate: 23 },
      { name: "Kniha", subtotal: 5, vat_amount: 0.25, vat_rate: 5 },
    ],
    nast,
  );
}

describe("Omega EUD", () => {
  it("vystavená faktúra: OF, typy súm 03/04 a Y01/Y02, sedí na halier", () => {
    const { obsah, preskocene } = buildOmegaUctovanie({ firma, doklady: [vystavena()], kody, nastavenia });
    expect(preskocene).toEqual([]);
    const r = vetvy(obsah);
    expect(r[0]!.slice(0, 2)).toEqual(["R00", "T00"]);
    const h = r[1]!;
    expect(h.slice(0, 5)).toEqual(["R01", "100", "OF", "OF", "2026001"]);
    expect(h[19]).toBe("128,25");
    expect(h[23]).toBe("100,00"); // základ vyššia (23 %)
    expect(h[27]).toBe("23,00");
    expect(h[68]).toBe("5");
    expect(h[69]).toBe("5,00");
    expect(h[44]).toBe("SK2020123456");
    const z = zapisy(obsah).map((x) => [x[2], x[4], x[6], x[9], x[25] ?? ""]);
    expect(z).toEqual([
      ["311", "602", "100,00", "03", "A1"],
      ["311", "343", "23,00", "04", "A1"],
      ["311", "602", "5,00", "Y01", "A1"],
      ["311", "343", "0,25", "Y02", "A1"],
    ]);
    expect(sucet(obsah)).toBe(128.25);
  });

  it("typy súm podľa sadzby a smeru", () => {
    const o = { oprava: false, odpocet: true, prenesenie: false };
    expect(typySumy("vstup", "vyssia", o)).toEqual({ zaklad: "A", dan: "19A" });
    expect(typySumy("vstup", "nizsia", o)).toEqual({ zaklad: "XA", dan: "18A" });
    expect(typySumy("vstup", "znizena2", o)).toEqual({ zaklad: "YA", dan: "18YA" });
    expect(typySumy("vystup", "nizsia", o)).toEqual({ zaklad: "01", dan: "02" });
    expect(typySumy("vstup", "vyssia", { ...o, odpocet: false })).toEqual({ zaklad: "KV", dan: "KV23" });
    expect(typySumy("vstup", "vyssia", { ...o, oprava: true })).toEqual({ zaklad: "Ao", dan: "28Ao" });
    expect(typySumy("vystup", "vyssia", { ...o, oprava: true })).toEqual({ zaklad: "2403", dan: "2504" });
    expect(typySumy("vystup", "vyssia", { ...o, prenesenie: true })).toEqual({ zaklad: "OA2", dan: null });
  });

  it("prijatá faktúra: DF, 501/321 a 343/321, číslo dodávateľa do KV", () => {
    const d = prijataNaUctovanie(
      { id: "p1", invoice_number: "FA-77", issue_date: "2026-09-10", amount_without_vat: 100, vat_amount: 23, amount_total: 123, supplier_name: "Dodávateľ" },
      nast,
    );
    const { obsah, preskocene } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    expect(preskocene).toEqual([]);
    const h = vetvy(obsah)[1]!;
    expect(h.slice(1, 6)).toEqual(["130", "DF", "DF", "", "FA-77"]);
    expect(h[53]).toBe("FA-77");
    expect(zapisy(obsah).map((x) => [x[2], x[4], x[6], x[9], x[25]])).toEqual([
      ["501", "321", "100,00", "A", "B2"],
      ["343", "321", "23,00", "19A", "B2"],
    ]);
  });

  it("bloček v hotovosti: PD so znamienkom mínus a pokladňou, oddiel B3", () => {
    const d = blocekNaUctovanie(
      { id: "b1", document_number: "123", payment_method: "hotovost", issue_date: "2026-09-02", total_amount: 23.8, vat_breakdown: [{ sadzba: 19, zaklad: 20, dph: 3.8 }] },
      nast,
    );
    const { obsah } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    const h = vetvy(obsah)[1]!;
    expect(h[1]).toBe("160");
    expect(h[34]).toBe("-");
    expect(zapisy(obsah).map((x) => [x[2], x[4], x[9], x[25]])).toEqual([
      ["501", "211", "XA", "B3"],
      ["343", "211", "18A", "B3"],
    ]);
    expect(sucet(obsah)).toBe(23.8);
  });

  it("bloček kartou ide ako interný doklad ID", () => {
    const d = blocekNaUctovanie(
      { id: "b2", payment_method: "karta", issue_date: "2026-09-02", total_amount: 12.3, vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }] },
      nast,
    );
    const { obsah } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia: { ...nastavenia, ucetInterne: "261" } });
    expect(vetvy(obsah)[1]![1]).toBe("180");
    expect(zapisy(obsah)[0]![4]).toBe("261");
  });

  it("dobropis: záporné sumy a typy opravy, pôvodný doklad", () => {
    const d = vystavena(
      { type: "credit_note", invoice_number: "D2026001", total: 12.3, _opravujeCislo: "2026001" },
      [{ name: "Vrátenie", subtotal: -10, vat_amount: -2.3, vat_rate: 23 }],
    );
    const { obsah, preskocene } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    expect(preskocene).toEqual([]);
    const h = vetvy(obsah)[1]!;
    expect(h[1]).toBe("120");
    expect(h[19]).toBe("-12,30");
    expect(h[54]).toBe("2026001");
    expect(zapisy(obsah).map((x) => [x[6], x[9], x[25]])).toEqual([
      ["-10,00", "2403", "C1"],
      ["-2,30", "2504", "C1"],
    ]);
    expect(sucet(obsah)).toBe(-12.3);
  });

  it("účtovanie pomerom: časť bez odpočtu nesie DPH v náklade a typ KV23", () => {
    const d = prijataNaUctovanie(
      { id: "p2", invoice_number: "PHM-1", issue_date: "2026-09-10", pohoda_predkontacia: "AUTO", amount_without_vat: 100, vat_amount: 23, amount_total: 123 },
      nast,
    );
    const { obsah, preskocene } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    expect(preskocene).toEqual([]);
    expect(zapisy(obsah).map((x) => [x[2], x[4], x[6], x[9]])).toEqual([
      ["512", "321", "50,00", "A"],
      ["343", "321", "11,50", "19A"],
      ["513", "321", "50,00", "KV"],
      ["513", "321", "11,50", "KV23"],
    ]);
    expect(sucet(obsah)).toBe(123);
  });

  it("rozúčtovanie na dve predkontácie a stredisko, zákazka, činnosť", () => {
    const d = prijataNaUctovanie(
      {
        id: "p3",
        invoice_number: "R-1",
        issue_date: "2026-09-10",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        stredisko: "BA",
        cinnost: "SERV",
        job_id: "j1",
        rozuctovanie: [
          { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 80, dph: 18.4 },
          { predkontacia: "2Fp", clenenie: "PD", sadzba: 23, zaklad: 20, dph: 4.6 },
        ],
      },
      { ...nast, zakazkyDokladov: { j1: "ZAK2026001" } },
    );
    const { obsah } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    const z = zapisy(obsah);
    expect(z.map((x) => [x[2], x[3], x[6]])).toEqual([
      ["501", "", "80,00"],
      ["343", "", "18,40"],
      ["518", "100", "20,00"],
      ["343", "", "4,60"],
    ]);
    expect(z[0]![12]).toBe("BA");
    expect(z[0]![16]).toBe("SERV");
    expect(z[0]![22]).toBe("ZAK2026001");
  });

  it("zaokrúhlenie ide do halierového vyrovnania a zápisom Vk/Vz", () => {
    const d = blocekNaUctovanie(
      { id: "b3", payment_method: "prevod", issue_date: "2026-09-02", total_amount: 12.3, vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.29 }] },
      nast,
    );
    const { obsah } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia });
    expect(vetvy(obsah)[1]![28]).toBe("0,01");
    expect(zapisy(obsah).at(-1)!.slice(2, 10)).toEqual(["548", "", "321", "", "0,01", "", "Zaokrúhlenie", "Vk"]);
    expect(sucet(obsah)).toBe(12.3);
  });

  it("vynechá doklad bez evidencie, bez účtov, v cudzej mene a spred 2025", () => {
    const p = (extra: Record<string, unknown>) =>
      prijataNaUctovanie(
        { id: "x", invoice_number: "X1", issue_date: "2026-09-10", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3, ...extra },
        nast,
      );
    const bezEvidencie = buildOmegaUctovanie({ firma, doklady: [p({})], kody, nastavenia: {} });
    expect(bezEvidencie.preskocene[0]).toMatch(/evidencie/);
    const bezUctov = buildOmegaUctovanie({ firma, doklady: [p({ pohoda_predkontacia: "NEZNAMA" })], kody, nastavenia });
    expect(bezUctov.preskocene[0]).toMatch(/NEZNAMA/);
    const naklady = buildOmegaUctovanie({
      firma,
      doklady: [p({ pohoda_predkontacia: "NEZNAMA" })],
      kody,
      nastavenia: { ...nastavenia, ucetNaklady: "501" },
    });
    expect(naklady.preskocene).toEqual([]);
    expect(buildOmegaUctovanie({ firma, doklady: [p({ currency: "CZK" })], kody, nastavenia }).preskocene[0]).toMatch(/CZK/);
    expect(buildOmegaUctovanie({ firma, doklady: [p({ issue_date: "2024-12-10" })], kody, nastavenia }).preskocene[0]).toMatch(/2025/);
    expect(bezEvidencie.obsah.trimEnd().split("\r\n")).toHaveLength(1);
  });
});
