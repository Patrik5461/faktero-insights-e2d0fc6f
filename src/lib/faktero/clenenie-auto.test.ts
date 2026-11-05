/*
  Automatické členenie DPH, KV a predkontácia vystavených dokladov
  (`resolveVatClassification`) — zadanie z 5. 11. 2026, body 1d a 6.
*/
import { describe, expect, it } from "vitest";
import {
  jeRucna,
  odhadPredkontacie,
  resolveVatClassification,
  type FakturaClenenia,
  type FirmaClenenia,
} from "./clenenie-vystavenej";
import { kvAutoVystavenej } from "./kv-auto";

const platitel: FirmaClenenia = { country: "SK", vat_payer: true, vat_scheme: "sk_4" };
const neplatitel: FirmaClenenia = { country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" };
const firma: FakturaClenenia = {
  type: "regular",
  vat_total: 23,
  customer_country: "SK",
  customer_ico: "53297474",
  customer_dic: "2121372693",
  customer_ic_dph: "SK2121372693",
};
const obcan: FakturaClenenia = { type: "regular", vat_total: 23, customer_country: "SK" };

describe("resolveVatClassification — systémový fallback (1d)", () => {
  it("tuzemsko, odberateľ platiteľ → UD, KV A.1", () => {
    const r = resolveVatClassification(platitel, firma);
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UD", "A1"]);
    expect(r.zdroj).toMatchObject({ clenenie: "system", kv: "system" });
  });

  it("tuzemsko, odberateľ občan (bez IČO, DIČ, IČ DPH) → UD, KV D.2", () => {
    const r = resolveVatClassification(platitel, obcan);
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UD", "D2"]);
  });

  it("odberateľ podnikateľ bez IČ DPH (len IČO) → A.1 podľa MP FS, nie D.2", () => {
    const r = resolveVatClassification(platitel, { ...obcan, customer_ico: "12345678" });
    expect(r.kv_clenenie).toBe("A1");
  });

  it("PDP § 69 ods. 12 → UDpdp, KV A.2", () => {
    const r = resolveVatClassification(platitel, {
      ...firma,
      vat_total: 0,
      reverse_charge: true,
      reverse_charge_type: "domestic_69",
    });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDpdp", "A2"]);
  });

  it("prenesenie bez typu k slovenskému odberateľovi je tuzemské", () => {
    const r = resolveVatClassification(platitel, { ...firma, vat_total: 0, reverse_charge: true });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDpdp", "A2"]);
  });

  it("služby do EÚ / vývoz / oslobodené → kód z číselníka, bez KV", () => {
    const ciselnik = [
      { kod: "UD", popis: "Tuzemské plnenie" },
      { kod: "UDsluzEU", popis: "Dodanie služby do iného členského štátu EÚ" },
      { kod: "UVyvoz", popis: "Vývoz tovaru § 47" },
      { kod: "UNosl", popis: "Oslobodené plnenie" },
    ];
    const eu = resolveVatClassification(
      platitel,
      {
        type: "regular",
        vat_total: 0,
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        customer_country: "CZ",
        customer_ic_dph: "CZ12345678",
      },
      { ciselnik },
    );
    expect([eu.pohoda_clenenie_dph, eu.kv_clenenie]).toEqual(["UDsluzEU", null]);
    const vyvoz = resolveVatClassification(
      platitel,
      { type: "regular", vat_total: 0, reverse_charge: true, reverse_charge_type: "export", customer_country: "US" },
      { ciselnik },
    );
    expect([vyvoz.pohoda_clenenie_dph, vyvoz.kv_clenenie]).toEqual(["UVyvoz", null]);
    const oslob = resolveVatClassification(platitel, { ...firma, vat_total: 0 }, { ciselnik });
    expect([oslob.pohoda_clenenie_dph, oslob.kv_clenenie]).toEqual(["UNosl", null]);
  });

  it("neplatiteľ DPH → nič nenastavovať (ani UN, ani predvolené UD firmy)", () => {
    const r = resolveVatClassification(
      { ...neplatitel, pohoda_clenenie_dph: "UD", kv_clenenie_faktura: "A1" },
      { ...firma, vat_total: 0 },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual([null, null]);
  });

  it("§ 7 (IČ DPH, ale nie platiteľ) sa berie ako neplatiteľ", () => {
    const r = resolveVatClassification(
      { country: "SK", vat_payer: false, vat_scheme: "sk_7", ic_dph: "SK2122358579" },
      { ...firma, vat_total: 0 },
    );
    expect(r.pohoda_clenenie_dph).toBeNull();
  });

  it("dobropis → členenie ako pôvodná faktúra, KV C.1, predkontácia dobropisu", () => {
    const r = resolveVatClassification(
      { ...platitel, pohoda_predkontacia: "311000 602000", pohoda_predkontacia_dobropis: "311000 602001" },
      { ...firma, type: "credit_note", vat_total: -0.23, opravuje_fakturu_id: "f" },
      { povodna: { pohoda_clenenie_dph: "UD", kv_clenenie: "A1", pohoda_predkontacia: "311000 604000" } },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie, r.pohoda_predkontacia]).toEqual([
      "UD",
      "C1",
      "311000 602001",
    ]);
    expect(r.zdroj).toEqual({ clenenie: "povodna", kv: "povodna", predkontacia: "firma" });
  });

  it("dobropis k faktúre bez kódov → UD z režimu, KV C.1 (občanovi D.2)", () => {
    const d = { type: "credit_note", vat_total: -23, opravuje_fakturu_id: "f" };
    expect(resolveVatClassification(platitel, { ...firma, ...d }).kv_clenenie).toBe("C1");
    expect(resolveVatClassification(platitel, { ...firma, ...d }).pohoda_clenenie_dph).toBe("UD");
    expect(resolveVatClassification(platitel, { ...obcan, ...d }).kv_clenenie).toBe("D2");
  });

  it("dobropis k PDP faktúre → UDpdp z pôvodnej, KV C.1 (nie A.2)", () => {
    const r = resolveVatClassification(
      platitel,
      { ...firma, type: "credit_note", vat_total: 0, reverse_charge: true, reverse_charge_type: "domestic_69", opravuje_fakturu_id: "f" },
      { povodna: { pohoda_clenenie_dph: "UDpdp", kv_clenenie: "A2" } },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDpdp", "C1"]);
  });

  it("ťarchopis → ako dobropis (C.1, predkontácia dobropisu, inak faktúry)", () => {
    const r = resolveVatClassification(
      { ...platitel, pohoda_predkontacia: "3Fv" },
      { ...firma, type: "debit_note", opravuje_fakturu_id: "f" },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie, r.pohoda_predkontacia]).toEqual(["UD", "C1", "3Fv"]);
  });

  it("predkontácia dobropisu bez predvolených firmy → z pôvodnej faktúry", () => {
    const r = resolveVatClassification(
      platitel,
      { ...firma, type: "credit_note", vat_total: -1, opravuje_fakturu_id: "f" },
      { povodna: { pohoda_predkontacia: "311000 602000" } },
    );
    expect(r.pohoda_predkontacia).toBe("311000 602000");
  });

  it("daňový doklad k prijatej platbe (advance_payment) → ako faktúra", () => {
    const r = resolveVatClassification(
      { ...platitel, pohoda_predkontacia: "3Fv", pohoda_predkontacia_zaloha: "3Zv" },
      { ...firma, type: "advance_payment" },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie, r.pohoda_predkontacia]).toEqual(["UD", "A1", "3Zv"]);
  });

  it("zálohová faktúra (proforma) → nič", () => {
    const r = resolveVatClassification(
      { ...platitel, pohoda_predkontacia: "3Fv", pohoda_clenenie_dph: "UD" },
      { ...firma, type: "proforma" },
      { pravidlo: { predkontacia: "X", clenenie_dph: "UD", kv_clenenie: "A1" } },
    );
    expect([r.pohoda_clenenie_dph, r.kv_clenenie, r.pohoda_predkontacia]).toEqual([null, null, null]);
  });

  it("nemecká firma: bez členenia a KV (DATEV)", () => {
    const r = resolveVatClassification({ country: "DE", vat_payer: true, vat_scheme: "de_regel" }, firma);
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual([null, null]);
  });
});

describe("resolveVatClassification — poradie zdrojov (1a–1c)", () => {
  it("ručne zadaná hodnota sa neprepisuje", () => {
    const r = resolveVatClassification(platitel, {
      ...firma,
      pohoda_clenenie_dph: "UDx",
      clenenie_zdroj: "rucne",
      kv_clenenie: "D2",
      kv_zdroj: "rucne",
    });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDx", "D2"]);
    expect(r.rucne).toMatchObject({ clenenie: true, kv: true });
    expect(r.auto).toMatchObject({ pohoda_clenenie_dph: "UD", kv_clenenie: "A1" });
  });

  it("automatická hodnota sa po zmene dokladu prepočíta", () => {
    const r = resolveVatClassification(platitel, {
      ...firma,
      vat_total: 0,
      reverse_charge: true,
      reverse_charge_type: "domestic_69",
      pohoda_clenenie_dph: "UD",
      clenenie_zdroj: "auto",
      kv_clenenie: "A1",
      kv_zdroj: "auto",
    });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDpdp", "A2"]);
  });

  it("starší doklad bez zdroja: zhoda s automatikou = automaticky, iná hodnota = ručne", () => {
    expect(jeRucna("UD", null, "UD")).toBe(false);
    expect(jeRucna("UDx", null, "UD")).toBe(true);
    expect(jeRucna("", "rucne", "UD")).toBe(false);
  });

  it("pravidlo > predvolené firmy > systém", () => {
    const f = { ...platitel, pohoda_clenenie_dph: "UD1", pohoda_predkontacia: "3Fv", kv_clenenie_faktura: "D2" };
    const sPravidlom = resolveVatClassification(f, firma, {
      pravidlo: { predkontacia: "4Fv", clenenie_dph: "UD2", kv_clenenie: "A1" },
    });
    expect([sPravidlom.pohoda_predkontacia, sPravidlom.pohoda_clenenie_dph, sPravidlom.kv_clenenie]).toEqual([
      "4Fv",
      "UD2",
      "A1",
    ]);
    const bez = resolveVatClassification(f, firma);
    expect([bez.pohoda_predkontacia, bez.pohoda_clenenie_dph, bez.kv_clenenie]).toEqual(["3Fv", "UD1", "D2"]);
    expect(bez.zdroj).toEqual({ clenenie: "firma", kv: "firma", predkontacia: "firma" });
  });

  it("predvolené PDP firmy pri prenesení", () => {
    const r = resolveVatClassification(
      { ...platitel, pohoda_clenenie_dph: "UD", pohoda_clenenie_dph_pdp: "UDpdp2" },
      { ...firma, vat_total: 0, reverse_charge: true, reverse_charge_type: "domestic_69" },
    );
    expect(r.pohoda_clenenie_dph).toBe("UDpdp2");
  });

  it("A.1 z pravidla opravný doklad nedostane (C.1)", () => {
    const r = resolveVatClassification(
      platitel,
      { ...firma, type: "credit_note", vat_total: -1, opravuje_fakturu_id: "f" },
      { pravidlo: { kv_clenenie: "A1" } },
    );
    expect(r.kv_clenenie).toBe("C1");
  });

  it("predkontácia bez pravidla a predvolených: ustálený zvyk firmy", () => {
    const odhad = odhadPredkontacie([
      { type: "regular", pohoda_predkontacia: "311000 602000" },
      { type: "regular", pohoda_predkontacia: "311000 602000" },
      { type: "regular", pohoda_predkontacia: "311000 604000" },
      { type: "advance_payment", pohoda_predkontacia: "311000 602000" },
      { type: "regular", pohoda_predkontacia: "311000 602000", predkontacia_zdroj: "auto" },
      { type: "proforma", pohoda_predkontacia: "324" },
    ]);
    expect(odhad).toEqual({ faktura: "311000 602000", dobropis: null });
    const r = resolveVatClassification(platitel, { ...firma, type: "credit_note", opravuje_fakturu_id: "f" }, { odhad });
    expect(r.pohoda_predkontacia).toBe("311000 602000");
    expect(odhadPredkontacie([{ type: "regular", pohoda_predkontacia: "A" }, { type: "regular", pohoda_predkontacia: "B" }])).toEqual({
      faktura: null,
      dobropis: null,
    });
  });
});

describe("zhoda s výkazom a exportom (kv-auto)", () => {
  const pripady: FakturaClenenia[] = [
    firma,
    obcan,
    { ...firma, type: "credit_note", vat_total: -5, opravuje_fakturu_id: "x" },
    { ...obcan, type: "credit_note", vat_total: -5, opravuje_fakturu_id: "x" },
    { ...firma, vat_total: 0, reverse_charge: true, reverse_charge_type: "domestic_69" },
    { ...firma, vat_total: 0, reverse_charge: true },
    { ...firma, vat_total: 0, reverse_charge: true, reverse_charge_type: "eu_b2b", customer_country: "AT" },
    { ...firma, type: "advance_payment" },
    { ...firma, type: "proforma" },
    { ...firma, vat_total: 0 },
  ];
  it("KV uložené automatikou = KV, ktoré by výkaz určil z prázdneho poľa", () => {
    for (const inv of pripady) {
      const r = resolveVatClassification(platitel, inv);
      expect(r.kv_clenenie ?? "").toBe(
        kvAutoVystavenej(inv, { clenenie: r.pohoda_clenenie_dph, krajinaFirmy: "SK" }),
      );
    }
  });
});

describe("návrh predvolených (Predkontácie → Predvolené)", () => {
  it("platiteľ bez predvolených: UD, UDpdp, predkontácia zo zvyku aj pre dobropis; bez KV", async () => {
    const { navrhPredvolenychVystavenych } = await import("./clenenie-vystavenej");
    expect(navrhPredvolenychVystavenych(platitel, [], { faktura: "311000 602000", dobropis: null })).toEqual({
      pohoda_clenenie_dph: "UD",
      pohoda_clenenie_dph_pdp: "UDpdp",
      pohoda_predkontacia: "311000 602000",
      pohoda_predkontacia_dobropis: "311000 602000",
    });
  });
  it("vyplnené polia firmy sa nenavrhujú; neplatiteľ nedostane nič", async () => {
    const { navrhPredvolenychVystavenych } = await import("./clenenie-vystavenej");
    expect(
      navrhPredvolenychVystavenych({ ...platitel, pohoda_clenenie_dph: "UD1", pohoda_predkontacia: "3Fv" }, [], null),
    ).toEqual({ pohoda_clenenie_dph_pdp: "UDpdp", pohoda_predkontacia_dobropis: "3Fv" });
    expect(navrhPredvolenychVystavenych(neplatitel, [], { faktura: "x" })).toEqual({});
  });
});

describe("zápis výsledku (zmenaClenenia)", () => {
  it("nová faktúra: doplní kódy so zdrojom auto; ručnú hodnotu označí ručne a nechá", async () => {
    const { zmenaClenenia } = await import("./clenenie-vystavenej.server");
    const row = { ...firma, pohoda_clenenie_dph: null, kv_clenenie: "D2", pohoda_predkontacia: null };
    const v = resolveVatClassification({ ...platitel, pohoda_predkontacia: "3Fv" }, row);
    expect(zmenaClenenia(row, v, { lenDoplnit: false })).toEqual({
      pohoda_clenenie_dph: "UD",
      clenenie_zdroj: "auto",
      kv_zdroj: "rucne",
      pohoda_predkontacia: "3Fv",
      predkontacia_zdroj: "auto",
    });
  });
  it("zaúčtovaný doklad / uzamknuté obdobie: len doplní prázdne, vyplnené nemení", async () => {
    const { zmenaClenenia } = await import("./clenenie-vystavenej.server");
    const row = {
      ...firma,
      vat_total: 0,
      reverse_charge: true,
      reverse_charge_type: "domestic_69",
      pohoda_clenenie_dph: "UD",
      clenenie_zdroj: "auto",
      kv_clenenie: null,
    };
    const v = resolveVatClassification(platitel, row);
    expect(zmenaClenenia(row, v, { lenDoplnit: true })).toEqual({ kv_clenenie: "A2", kv_zdroj: "auto" });
    expect(zmenaClenenia(row, v, { lenDoplnit: false })).toMatchObject({ pohoda_clenenie_dph: "UDpdp" });
  });
  it("proforma: automatické hodnoty sa zmažú, ručné ostanú", async () => {
    const { zmenaClenenia } = await import("./clenenie-vystavenej.server");
    const row = { ...firma, type: "proforma", pohoda_clenenie_dph: "UD", clenenie_zdroj: "auto", kv_clenenie: "A1", kv_zdroj: "rucne" };
    const v = resolveVatClassification(platitel, row);
    expect(zmenaClenenia(row, v, { lenDoplnit: false })).toEqual({ pohoda_clenenie_dph: null, clenenie_zdroj: null });
  });
});

describe("pravidlo bez podmienky na režim (demo: „Vystavené faktúry – služby“ UD/A1)", () => {
  const pravidlo = { predkontacia: "3Fv", clenenie_dph: "UD", kv_clenenie: "A1" };
  const pdp = { ...firma, vat_total: 0, reverse_charge: true, reverse_charge_type: "domestic_69" };
  it("PDP faktúra nedostane UD/A1 z pravidla, ale UDpdp/A2; predkontácia z pravidla ostáva", () => {
    const r = resolveVatClassification(platitel, pdp, { pravidlo });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie, r.pohoda_predkontacia]).toEqual(["UDpdp", "A2", "3Fv"]);
  });
  it("UD/A1, ktoré pri vložení zapísal spúšťač z pravidla, sa nepovažuje za ručné", () => {
    const r = resolveVatClassification(platitel, { ...pdp, pohoda_clenenie_dph: "UD", kv_clenenie: "A1" }, { pravidlo });
    expect([r.pohoda_clenenie_dph, r.kv_clenenie]).toEqual(["UDpdp", "A2"]);
    expect(r.rucne).toMatchObject({ clenenie: false, kv: false });
  });
  it("bežná faktúra pravidlo použije", () => {
    const r = resolveVatClassification(platitel, firma, { pravidlo });
    expect(r.zdroj).toEqual({ clenenie: "pravidlo", kv: "pravidlo", predkontacia: "pravidlo" });
  });
});
