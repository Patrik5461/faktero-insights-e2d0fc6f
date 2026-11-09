import { describe, expect, it } from "vitest";
import {
  aiSOdpoctomZalohy,
  dodavatelZalohySedi,
  jePolozkaOdpoctuZalohy,
  najdiZalohovuPodlaCisla,
  naUhraduSOdpoctom,
  odpocetZalohyZAi,
} from "./odpocet-zalohy-vytazenie";
import {
  chybajuce,
  kontrolaSadziebUdajov,
  naUhraduZNespracovaneho,
  prijataZUdajov,
  udajeZAi,
  udajeZPrijatej,
} from "./nespracovane";
import { stavUhradyPrijatej } from "./uhrady-prijatej";

/** JŠ servis 202651982 pre BÝVAJLEPŠIE (sken): 755,85 + 173,85 = 929,70, predplatba −900, k úhrade 29,70. */
const JS_SERVIS = {
  document_type: "faktura",
  document_subtype: "ostra",
  supplier_name: "JŠ servis, s.r.o.",
  supplier_ico: "34152181",
  supplier_ic_dph: "SK2020203196",
  invoice_number: "202651982",
  variable_symbol: "202651982",
  issue_date: "2026-10-28",
  due_date: "2026-11-04",
  delivery_date: "2026-10-27",
  amount_without_vat: 755.85,
  vat_amount: 173.85,
  amount_total: 929.7,
  amount_due: 29.7,
  currency: "EUR",
  vat_breakdown: [
    { rate: 0, base: 0, vat: 0 },
    { rate: 23, base: 755.85, vat: 173.85 },
  ],
  items: [
    { name: "Betón C20/25", quantity: 5, unit: "m3", unit_price: 67.9, vat_rate: 23, total: 339.5 },
    { name: "Palivový príplatok", quantity: 5, unit: "m3", unit_price: 1.5, vat_rate: 23, total: 7.5 },
    { name: "Doprava", quantity: 1, unit: null, unit_price: 43, vat_rate: 23, total: 43 },
    { name: "Betónpumpa", quantity: 1, unit: null, unit_price: 365.85, vat_rate: 23, total: 365.85 },
  ],
  items_total_with_vat: false,
  advance_deduction: { amount: 900, advance_invoice_number: "20260037", taxed: false, base: null, vat: null, rate: null },
};

/** Zdanená záloha: 1 000 + 230 = 1 230, odpočet daňového dokladu k platbe 500 + 115, k úhrade 615. */
const ZDANENA = {
  document_type: "faktura",
  supplier_name: "Dodávateľ, s.r.o.",
  supplier_ic_dph: "SK2020000000",
  invoice_number: "2026100",
  issue_date: "2026-10-28",
  due_date: "2026-11-11",
  delivery_date: "2026-10-28",
  amount_without_vat: 1000,
  vat_amount: 230,
  amount_total: 1230,
  amount_due: 615,
  currency: "EUR",
  vat_breakdown: [{ rate: 23, base: 1000, vat: 230 }],
  items: [{ name: "Práca", quantity: 1, unit: null, unit_price: 1000, vat_rate: 23, total: 1000 }],
  items_total_with_vat: false,
  advance_deduction: { amount: 615, advance_invoice_number: "DP2026007", taxed: true, base: 500, vat: 115, rate: 23 },
};

describe("odpočet zálohy z vyťaženia", () => {
  it("číta odpočet z AI — nezdanený aj zdanený", () => {
    expect(odpocetZalohyZAi(JS_SERVIS)).toEqual({
      suma: 900,
      cislo: "20260037",
      zdanena: false,
      zaklad: 0,
      dph: 0,
      sadzba: null,
    });
    expect(odpocetZalohyZAi(ZDANENA)).toEqual({
      suma: 615,
      cislo: "DP2026007",
      zdanena: true,
      zaklad: 500,
      dph: 115,
      sadzba: 23,
    });
    expect(odpocetZalohyZAi({ advance_deduction: null })).toBeNull();
    // Viac záloh na jednej faktúre sa spojí.
    expect(
      odpocetZalohyZAi({
        advance_deduction: [
          { amount: -300, advance_invoice_number: "Z1", taxed: false },
          { amount: 200, advance_invoice_number: "Z2", taxed: false },
        ],
      }),
    ).toMatchObject({ suma: 500, cislo: "Z1, Z2", zdanena: false });
  });

  it("JŠ servis: nezdanená záloha nemení rozpis, k úhrade 29,70", () => {
    const u = udajeZAi(JS_SERVIS, "2026-11-09");
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 755.85, dph: 173.85, vat_category: "standard" }]);
    expect(u.celkom).toBe(929.7);
    expect(u.zaloha).toBe(900);
    expect(u.zalohaCislo).toBe("20260037");
    expect(u.zalohaZdanena).toBeUndefined();
    expect(u.kontrolaDph).toBeUndefined();
    expect(u.polozky).toHaveLength(4);
    // Rozpis sedí s dokladom — odpočet nie je nesúlad a nič nechýba.
    expect(kontrolaSadziebUdajov(u, "SK").ok).toBe(true);
    expect(chybajuce("faktura", u)).toEqual([]);

    const p = prijataZUdajov("faktura", u, "2026-11-09");
    expect(p).toMatchObject({
      amount_without_vat: 755.85,
      vat_amount: 173.85,
      amount_total: 929.7,
      advance_amount: 900,
      type: "regular",
    });
    expect(p.vat_breakdown).toEqual([{ sadzba: 23, zaklad: 755.85, dph: 173.85, vat_category: "standard" }]);
    // Na úhradu (a teda párovanie s platbou −29,70).
    expect(stavUhradyPrijatej({ amount_total: p.amount_total, uhrady: [], zaloha: p.advance_amount }).naUhradu).toBe(29.7);
    expect(naUhraduSOdpoctom(929.7, 900)).toBe(29.7);
    // Hromadný príkaz z Nespracovaných platí tiež len zvyšok.
    expect(naUhraduZNespracovaneho({ id: "x", druh: "faktura", udaje: u }, "2026-11-09").amount_total).toBe(29.7);
    // Späť do Nespracovaných sa odpočet zachová.
    expect(udajeZPrijatej(p).udaje.zaloha).toBe(900);
  });

  it("JŠ servis: AI dala do amount_total sumu na úhradu a odpočet medzi položky", () => {
    const ai = {
      ...JS_SERVIS,
      amount_total: 29.7,
      advance_deduction: undefined,
      items: [
        ...JS_SERVIS.items,
        { name: "Predplatba: (Záloh. fak. č. 20260037)", quantity: 1, unit: null, unit_price: -900, vat_rate: null, total: -900 },
      ],
    };
    const u = udajeZAi(ai, "2026-11-09");
    expect(u.celkom).toBe(929.7);
    expect(u.zaloha).toBe(900);
    expect(u.polozky.map((p) => p.name)).not.toContain("Predplatba: (Záloh. fak. č. 20260037)");
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 755.85, dph: 173.85, vat_category: "standard" }]);
  });

  it("staršie čítanie s prepaid_amount sa berie ako nezdanená záloha", () => {
    const { advance_deduction, ...bez } = JS_SERVIS;
    void advance_deduction;
    const u = udajeZAi({ ...bez, prepaid_amount: 900 }, "2026-11-09");
    expect(u.zaloha).toBe(900);
    expect(u.celkom).toBe(929.7);
  });

  it("zdanená záloha zníži rozpis aj sumu a pribudne záporná položka", () => {
    const u = udajeZAi(ZDANENA, "2026-11-09");
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 500, dph: 115, vat_category: "standard" }]);
    expect(u.celkom).toBe(615);
    expect(u.zaloha).toBeUndefined();
    expect(u.zalohaZdanena).toMatchObject({ zaklad: 500, dph: 115, sadzba: 23, cislo: "DP2026007" });
    expect(u.polozky.at(-1)).toMatchObject({ name: "Odpočet zálohy č. DP2026007", total: -500, vat_rate: 23 });
    expect(kontrolaSadziebUdajov(u, "SK").ok).toBe(true);
    expect(chybajuce("faktura", u)).toEqual([]);
    const p = prijataZUdajov("faktura", u, "2026-11-09");
    expect(p).toMatchObject({ amount_without_vat: 500, vat_amount: 115, amount_total: 615, advance_amount: null });
    expect(stavUhradyPrijatej({ amount_total: p.amount_total, uhrady: [], zaloha: p.advance_amount }).naUhradu).toBe(615);
  });

  it("zdanená záloha: rozpis už po odpočte sa druhýkrát neznižuje", () => {
    const u = udajeZAi(
      { ...ZDANENA, vat_breakdown: [{ rate: 23, base: 500, vat: 115 }], amount_without_vat: 500, vat_amount: 115 },
      "2026-11-09",
    );
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 500, dph: 115, vat_category: "standard" }]);
    expect(u.celkom).toBe(615);
  });

  it("zdanená záloha vytlačená ako záporný riadok rozpisu", () => {
    const u = udajeZAi(
      {
        ...ZDANENA,
        vat_breakdown: [
          { rate: 23, base: 1000, vat: 230 },
          { rate: 23, base: -500, vat: -115 },
        ],
        amount_without_vat: 500,
        vat_amount: 115,
      },
      "2026-11-09",
    );
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 500, dph: 115, vat_category: "standard" }]);
    expect(u.celkom).toBe(615);
  });

  it("ostatné záporné položky ostanú položkami a odpočítajú sa", () => {
    const ai = {
      document_type: "faktura",
      supplier_name: "Obchod",
      supplier_ic_dph: "SK2020000001",
      invoice_number: "77",
      issue_date: "2026-10-01",
      due_date: "2026-10-15",
      amount_without_vat: 90,
      vat_amount: 20.7,
      amount_total: 110.7,
      items: [
        { name: "Tovar", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 },
        { name: "Zľava 10 %", quantity: 1, unit_price: -10, vat_rate: 23, total: -10 },
      ],
      items_total_with_vat: false,
    };
    const u = udajeZAi(ai, "2026-11-09");
    expect(u.zaloha).toBeUndefined();
    expect(u.polozky.map((p) => p.total)).toEqual([100, -10]);
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 90, dph: 20.7, vat_category: "standard" }]);
    expect(jePolozkaOdpoctuZalohy({ name: "Vrátenie zálohy na obaly", total: -5 })).toBe(false);
    expect(jePolozkaOdpoctuZalohy({ name: "Odpočet zálohy", total: -5 })).toBe(true);
    expect(jePolozkaOdpoctuZalohy({ name: "Zálohová platba", total: 5 })).toBe(false);
  });

  it("aiSOdpoctomZalohy bez odpočtu nič nemení", () => {
    const ai = { amount_total: 10, items: [] };
    expect(aiSOdpoctomZalohy(ai)).toEqual({ ai, odpocet: null });
  });

  it("dohľadá zálohovú faktúru podľa čísla a dodávateľa", () => {
    const kandidati = [
      { id: "a", invoice_number: "20260035", variable_symbol: "20260035", supplier_ico: null, supplier_ic_dph: "SK2020203196", supplier_name: "JŠ servis, s.r.o." },
      { id: "b", invoice_number: "20260037", variable_symbol: "20260037", supplier_ico: null, supplier_ic_dph: "SK2020203196", supplier_name: "JŠ servis, s.r.o." },
      { id: "c", invoice_number: "20260037", variable_symbol: "20260037", supplier_ico: "11111111", supplier_ic_dph: null, supplier_name: "Iný" },
    ];
    const dod = { ico: "34152181", icDph: "SK2020203196", nazov: "JŠ servis, s.r.o." };
    const odDod = kandidati.filter((k) => dodavatelZalohySedi(k, dod));
    expect(odDod.map((k) => k.id)).toEqual(["a", "b"]);
    expect(najdiZalohovuPodlaCisla("20260037", odDod)?.id).toBe("b");
    expect(najdiZalohovuPodlaCisla("2026 0035", odDod)?.id).toBe("a");
    expect(najdiZalohovuPodlaCisla("99999", odDod)).toBeNull();
    // Bez IČO aj IČ DPH rozhodne názov (bez diakritiky a právnej formy).
    expect(dodavatelZalohySedi({ supplier_name: "JS servis s. r. o." }, { nazov: "JŠ servis, s.r.o." })).toBe(true);
  });
});
