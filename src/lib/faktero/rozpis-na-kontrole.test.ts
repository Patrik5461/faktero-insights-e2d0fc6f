/*
  Doklad „na kontrolu“ kvôli rozpisu DPH (audit 6. 11. 2026) do Pohody nejde
  a autopilot ho nezaúčtuje; eFaktúra zaradená do firmy (príznak bez dôvodu)
  ide ďalej. Čísla podľa BÝVAJLEPŠIE (Tempus-Car 40260037, STAVMONT FV2600692).
*/
import { describe, expect, it } from "vitest";
import { buildPohodaExpensesXml } from "./export.server";
import { prekazkaDokladu } from "./pohoda-kontrola";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { DOVOD_ROZPIS_NA_KONTROLE, jeRozpisNaKontrole } from "./rozpis-na-kontrole";
import { aktualnyNavrh, blokatory, smieAutopilot, type NavrhZauctovania } from "./auto-uctovanie";

const firma = { ico: "12345678", country: "SK" };
const FLAG = "2026-11-05T14:49:20.218Z";

const tempus = {
  id: "p-tempus",
  company_id: "c",
  invoice_number: "40260037",
  supplier_name: "Autopredajca s.r.o.",
  issue_date: "2026-10-15",
  delivery_date: "2026-10-15",
  type: "regular",
  status: "booked",
  currency: "EUR",
  amount_without_vat: 45914.31,
  vat_amount: 14005.69,
  amount_total: 59920,
  vat_breakdown: null,
  na_kontrolu_at: FLAG,
  na_kontrolu_dovod:
    "Rozpis DPH treba skontrolovať (rozpis z nového vyťaženia nedáva celkovú sumu dokladu).",
};

describe("jeRozpisNaKontrole", () => {
  it("príznak s dôvodom „Rozpis DPH“ drží, kým ho človek nepotvrdí", () => {
    expect(jeRozpisNaKontrole(tempus)).toBe(true);
    expect(jeRozpisNaKontrole({ ...tempus, na_kontrolu_at: null })).toBe(false);
    // potvrdenie novšie než príznak
    expect(
      jeRozpisNaKontrole({ ...tempus, rozpis_dph_potvrdeny: { podpis: "x", at: "2026-11-06T08:00:00Z" } }),
    ).toBe(false);
    // staršie potvrdenie (pred novým príznakom) neplatí
    expect(
      jeRozpisNaKontrole({ ...tempus, rozpis_dph_potvrdeny: { podpis: "x", at: "2026-11-01T08:00:00Z" } }),
    ).toBe(true);
  });
  it("eFaktúra zaradená do firmy (príznak bez dôvodu) sa netýka DPH", () => {
    expect(jeRozpisNaKontrole({ ...tempus, na_kontrolu_dovod: null })).toBe(false);
    expect(jeRozpisNaKontrole({ ...tempus, na_kontrolu_dovod: "" })).toBe(false);
  });
});

describe("export do Pohody", () => {
  it("prijatá faktúra na kontrolu je prekážka a do XML nejde", () => {
    const d = prijataAkoDoklad(tempus);
    expect(prekazkaDokladu(d, firma)).toBe(`40260037 — ${DOVOD_ROZPIS_NA_KONTROLE}`);
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [d as any] });
    expect(xml).not.toContain("dataPackItem");
  });
  it("po kontrole (príznak zrušený) prejde — bez príznaku je doklad ako predtým", () => {
    const ok = { ...tempus, amount_without_vat: 100, vat_amount: 23, amount_total: 123, na_kontrolu_at: null, na_kontrolu_dovod: null };
    expect(prekazkaDokladu(prijataAkoDoklad(ok), firma)).toBeNull();
    const potvrdena = {
      ...ok,
      na_kontrolu_at: FLAG,
      na_kontrolu_dovod: tempus.na_kontrolu_dovod,
      rozpis_dph_potvrdeny: { podpis: "x", at: "2026-11-06T08:00:00Z" },
    };
    expect(prekazkaDokladu(prijataAkoDoklad(potvrdena), firma)).toBeNull();
  });
  it("eFaktúra zaradená automaticky nie je prekážka", () => {
    const ef = { ...tempus, amount_without_vat: 100, vat_amount: 23, amount_total: 123, na_kontrolu_dovod: null };
    expect(prekazkaDokladu(prijataAkoDoklad(ef), firma)).toBeNull();
  });
  it("bloček na kontrolu je prekážka", () => {
    const blocek = {
      id: "b1",
      document_number: "B-1",
      issue_date: "2026-10-20",
      net_amount: 100,
      vat_amount: 23,
      vat_rate: 23,
      total_amount: 123,
      currency: "EUR",
      payment_method: "karta",
      na_kontrolu_at: FLAG,
      na_kontrolu_dovod: "Rozpis DPH treba skontrolovať (bloček).",
    };
    expect(prekazkaDokladu(blocek, firma)).toBe(`B-1 — ${DOVOD_ROZPIS_NA_KONTROLE}`);
    expect(prekazkaDokladu({ ...blocek, na_kontrolu_at: null }, firma)).toBeNull();
  });
  it("neplatná efektívna sadzba bez rozpisu (STAVMONT 16,82 %) je prekážka s tým istým textom", () => {
    const stavmont = {
      ...tempus,
      invoice_number: "FV2600692",
      amount_without_vat: 1285.26,
      vat_amount: 216.13,
      amount_total: 1501.39,
      na_kontrolu_at: null,
      na_kontrolu_dovod: null,
    };
    expect(prekazkaDokladu(prijataAkoDoklad(stavmont), firma)).toMatch(
      /^FV2600692 — Rozpis DPH je na kontrole — skontrolujte ho a potvrďte \(DPH sa nedá priradiť k sadzbe, vychádza 16.82 %\)/,
    );
  });
  it("zálohová faktúra (nie je daňový doklad) príznak rozpisu nezastaví", () => {
    const z = { ...tempus, type: "proforma", amount_without_vat: 0, vat_amount: 0, amount_total: 500 };
    expect(prekazkaDokladu(prijataAkoDoklad(z), firma)).toBeNull();
  });
});

describe("autopilot", () => {
  const navrh = (o: Partial<NavrhZauctovania> = {}): NavrhZauctovania => ({
    predkontacia: "518",
    clenenieDph: "PD",
    kvClenenie: "B2",
    stredisko: null,
    cinnost: null,
    zdroj: "pravidlo",
    istota: 100,
    zdovodnenie: "",
    blokatory: [],
    ...o,
  });
  it("rozpis na kontrole je blokátor — doklad nejde sám, návrh ostane", () => {
    const bl = blokatory({ rozpisNaKontrole: true, predkontacia: "518", clenenieDph: "PD" });
    expect(bl).toEqual(["rozpis_dph"]);
    expect(smieAutopilot("plny", navrh({ blokatory: bl }))).toBe(false);
  });
  it("po kontrole blokátor z uloženého návrhu zmizne", () => {
    const n = navrh({ blokatory: ["rozpis_dph"] });
    expect(aktualnyNavrh(n, { ...tempus, pohoda_predkontacia: "518", pohoda_clenenie_dph: "PD" }).blokatory).toEqual([
      "rozpis_dph",
    ]);
    expect(
      aktualnyNavrh(n, { ...tempus, na_kontrolu_at: null, pohoda_predkontacia: "518", pohoda_clenenie_dph: "PD" })
        .blokatory,
    ).toEqual([]);
    // riadok bez stĺpca príznaku (iný výber) blokátor nemení
    expect(aktualnyNavrh(n, { pohoda_predkontacia: "518", pohoda_clenenie_dph: "PD" }).blokatory).toEqual([
      "rozpis_dph",
    ]);
  });
});
