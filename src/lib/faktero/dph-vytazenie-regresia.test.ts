/*
  Regresné testy čítania DPH zo skutočných dokladov (13. 11. 2026).

  Čísla sú z PDF faktúr BÝVAJLEPŠIE (overené ručne nad PDF zo Storage) a
  z výstupov AI, ktoré nad nimi lokálne vrátil `precitajDoklad`.
*/
import { describe, expect, it } from "vitest";
import { chybajuce, kontrolaSadziebUdajov, prijataZUdajov, udajeZAi } from "./nespracovane";
import { rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { aiSOdpoctomZalohy, jePolozkaOdpoctuZalohy } from "./odpocet-zalohy-vytazenie";
import {
  dphZoZakladu,
  lenZakonneSadzby,
  napravRozpisDph,
  napravZalohuVZaklade,
} from "./napravy-dph-vytazenia";
import { stavUhradyPrijatej } from "./uhrady-prijatej";

const DNES = "2026-11-13";
const r = (sadzba: number, zaklad: number, dph: number, vat_category = "standard") => ({
  sadzba,
  zaklad,
  dph,
  vat_category,
});

/* ------------------------------------------------------------------------
   Tempus-Car 40260037: položky 23 % (63 151,22 … akciová zľava −9 229,27),
   „vozidlo bez DPH 60 894,31, DPH 14 005,69, vrátane DPH 74 900,00“,
   riadok „ZF 9180431, 14.10.2026 0 % −14 980,00“, rekapitulácia
   „Odpočítané na zálohách −14 980,00“ v stĺpci „Nie je predmetom DPH“,
   K úhrade 59 920,00.
------------------------------------------------------------------------ */
const TEMPUS_ZAKLAD = {
  document_type: "faktura",
  document_subtype: "ostra",
  supplier_name: "Tempus - Car, s.r.o.",
  supplier_ico: "31712312",
  supplier_ic_dph: "SK2020947049",
  invoice_number: "40260037",
  variable_symbol: "40260037",
  issue_date: "2026-10-15",
  delivery_date: "2026-10-15",
  due_date: "2026-10-22",
  currency: "EUR",
  items_total_with_vat: false,
  items: [
    { name: "Nové vozidlo LAND ROVER DEFENDER", quantity: 1, unit_price: 63151.22, vat_rate: 23, total: 63151.22 },
    { name: "Farba: 1AG-Santorini Black", quantity: 1, unit_price: 896.75, vat_rate: 23, total: 896.75 },
    { name: "AIR SUSPENSION PACK", quantity: 1, unit_price: 2393.5, vat_rate: 23, total: 2393.5 },
    { name: "DRIVER ASSIST PACK", quantity: 1, unit_price: 630.89, vat_rate: 23, total: 630.89 },
    { name: "Odnímateľné ťažné zariadenie", quantity: 1, unit_price: 798.37, vat_rate: 23, total: 798.37 },
    { name: "Zliatinové disky 19\"", quantity: 1, unit_price: 403.25, vat_rate: 23, total: 403.25 },
    { name: "Tmavšie tónované sklá", quantity: 1, unit_price: 517.07, vat_rate: 23, total: 517.07 },
    { name: "Bezpečnostné skrutky kolies", quantity: 1, unit_price: 38.21, vat_rate: 23, total: 38.21 },
    { name: "COLD CLIMATE PACK", quantity: 1, unit_price: 621.95, vat_rate: 23, total: 621.95 },
    { name: "Koberčeky", quantity: 1, unit_price: 88.62, vat_rate: 23, total: 88.62 },
    { name: "Čalúnenie stropu", quantity: 1, unit_price: 265.04, vat_rate: 23, total: 265.04 },
    { name: "12-smerové sedadlá", quantity: 1, unit_price: 318.7, vat_rate: 23, total: 318.7 },
    { name: "Akciová zľava 13.2%", quantity: 1, unit_price: -9229.27, vat_rate: 23, total: -9229.27 },
  ],
};

/** Pôvodná chyba: záloha ako záporný riadok „Nie je predmetom DPH“, základ po odpočte → 30,5 %. */
const TEMPUS_ZLE = {
  ...TEMPUS_ZAKLAD,
  amount_without_vat: 45914.31,
  vat_amount: 14005.69,
  amount_total: 59920,
  amount_due: 59920,
  vat_breakdown: [
    { rate: 23, base: 60894.31, vat: 14005.69, vat_category: "standard" },
    { rate: 0, base: -14980, vat: 0, vat_category: "out_of_scope" },
  ],
  items: [
    ...TEMPUS_ZAKLAD.items,
    { name: "ZF 9180431, 14.10.2026", quantity: 1, unit_price: -14980, vat_rate: 0, total: -14980 },
  ],
  advance_deduction: null,
};

/** Ako ho dnes číta model (lokálny beh 13. 11.). */
const TEMPUS_DOBRE = {
  ...TEMPUS_ZAKLAD,
  amount_without_vat: 60894.31,
  vat_amount: 14005.69,
  amount_total: 74900,
  amount_due: 59920,
  vat_breakdown: [{ rate: 23, base: 60894.31, vat: 14005.69, vat_category: "standard" }],
  advance_deduction: { amount: 14980, advance_invoice_number: "9180431", taxed: false, base: null, vat: null, rate: null },
};

function overTempus(ai: Record<string, unknown>) {
  const u = udajeZAi(ai, DNES, { krajina: "SK" });
  expect(u.rozpis).toEqual([r(23, 60894.31, 14005.69)]);
  expect(u.kontrolaDph).toBeUndefined();
  expect(u.celkom).toBe(74900);
  expect(u.zaloha).toBe(14980);
  expect(u.zalohaZdanena).toBeUndefined();
  expect(u.prenesenie).toBe(false);
  expect(kontrolaSadziebUdajov(u, "SK").ok).toBe(true);
  // Položky na doklade dávajú 60 894,30 (o cent menej ako „vozidlo bez DPH“) — to je vyrovnanie položiek, nie DPH.
  expect(chybajuce("faktura", u).filter((x) => x !== "polozky")).toEqual([]);
  // Riadok zálohy nie je položka.
  expect(u.polozky.some((p) => /ZF/.test(p.name))).toBe(false);
  const p = prijataZUdajov("faktura", u, DNES);
  expect(p).toMatchObject({ amount_without_vat: 60894.31, vat_amount: 14005.69, amount_total: 74900, advance_amount: 14980 });
  expect(p.vat_breakdown).toEqual([r(23, 60894.31, 14005.69)]);
  expect(stavUhradyPrijatej({ amount_total: p.amount_total, uhrady: [], zaloha: p.advance_amount }).naUhradu).toBe(59920);
  // DPH = základ × 23 % (14 005,6913 → 14 005,69), nie „30,5 %“.
  expect(dphZoZakladu(60894.31, 23)).toBe(14005.69);
}

describe("Tempus-Car 40260037 — odpočet nezdanenej zálohy nesmie skončiť v základe", () => {
  it("dnešné čítanie modelu (záloha v advance_deduction) prejde bez zmeny", () => {
    overTempus(TEMPUS_DOBRE);
  });

  it("záloha ako záporný riadok „Nie je predmetom DPH“ a základ po odpočte → presun do odpočtu zálohy", () => {
    const n = napravZalohuVZaklade(TEMPUS_ZLE, { krajina: "SK" });
    expect(n.naprava).toMatch(/Odpočet zálohy 14\s980,00/);
    expect(n.ai.vat_breakdown).toEqual([{ rate: 23, base: 60894.31, vat: 14005.69, vat_category: "standard" }]);
    expect(n.ai.amount_without_vat).toBe(60894.31);
    overTempus(TEMPUS_ZLE);
  });

  it("len hlavička: základ 45 914,31, DPH 14 005,69, odpočet 14 980 → základ 60 894,31", () => {
    const ai = {
      ...TEMPUS_ZAKLAD,
      items: [],
      amount_without_vat: 45914.31,
      vat_amount: 14005.69,
      amount_total: 59920,
      amount_due: null,
      vat_breakdown: [],
      advance_deduction: { amount: 14980, advance_invoice_number: "9180431", taxed: false },
    };
    const o = aiSOdpoctomZalohy(ai, { krajina: "SK" });
    expect(o.naprava).toMatch(/pri 23 %/);
    expect(o.ai.amount_without_vat).toBe(60894.31);
    expect(o.ai.amount_total).toBe(74900);
    overTempus(ai);
  });

  it("riadok „ZF 9180431“ sa spozná ako odpočet zálohy, záloha na obal nie", () => {
    expect(jePolozkaOdpoctuZalohy({ name: "ZF 9180431, 14.10.2026", total: -14980 })).toBe(true);
    expect(jePolozkaOdpoctuZalohy({ name: "Záloha na obal – prepravka", total: -3 })).toBe(false);
  });

  it("záporný riadok mimo DPH bez dôkazu zálohy (vrátenie poplatku) ostáva v rozpise", () => {
    const ai = {
      supplier_ic_dph: "SK2020000000",
      issue_date: "2026-10-01",
      amount_without_vat: 90,
      vat_amount: 23,
      amount_total: 113,
      vat_breakdown: [
        { rate: 23, base: 100, vat: 23, vat_category: "standard" },
        { rate: 0, base: -10, vat: 0, vat_category: "out_of_scope", label: "Vrátený správny poplatok" },
      ],
    };
    const n = napravZalohuVZaklade(ai, { krajina: "SK" });
    expect(n.naprava).toBeNull();
    expect(n.ai).toBe(ai);
  });
});

/* ------------------------------------------------------------------------
   Zmiešané faktúry s prenesením (BÝVAJLEPŠIE) — výstupy modelu 13. 11.
------------------------------------------------------------------------ */
describe("zmiešané faktúry 23 % + prenesenie daňovej povinnosti", () => {
  const PP_PROJEKT = {
    supplier_ic_dph: "SK2020007682",
    invoice_number: "2610018",
    issue_date: "2026-10-16",
    delivery_date: "2026-10-16",
    amount_without_vat: 447.98,
    vat_amount: 80.27,
    amount_total: 528.25,
    amount_due: 528.25,
    reverse_charge: false,
    reverse_charge_text: "Prenesenie daňovej povinnosti podľa §69 ods. 12 zákona o DPH - základ dane: 99,00 EUR",
    vat_breakdown: [
      { rate: 23, base: 348.98, vat: 80.27, vat_category: "standard" },
      { rate: 0, base: 99, vat: 0, vat_category: "reverse_charge" },
    ],
  };

  it("PP Projekt 2610018: 23 % 348,98 / 80,27 + PDP 99,00; hlavička nie je „celá v prenesení“", () => {
    const u = udajeZAi(PP_PROJEKT, DNES, { krajina: "SK" });
    expect(u.rozpis).toEqual([r(0, 99, 0, "reverse_charge"), r(23, 348.98, 80.27)]);
    expect(u.kontrolaDph).toBeUndefined();
    expect(u.prenesenie).toBe(false);
    const p = prijataZUdajov("faktura", u, DNES) as Record<string, unknown>;
    expect(p.reverse_charge).toBeUndefined();
    expect(p).toMatchObject({ amount_without_vat: 447.98, vat_amount: 80.27, amount_total: 528.25 });
  });

  it("STAVMONT FV2600692: PDP vytlačené pri 23 % (DPH 0) je zákonné, 939,70 / 216,13 + 345,56", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK2020133258",
        issue_date: "2026-10-19",
        amount_without_vat: 1285.26,
        vat_amount: 216.13,
        amount_total: 1501.39,
        reverse_charge_text: "Prenos daňovej povinnosti - základ pre základnú sadzbu DPH:",
        vat_breakdown: [
          { rate: 23, base: 939.7, vat: 216.13, vat_category: "standard" },
          { rate: 23, base: 345.56, vat: 0, vat_category: "reverse_charge" },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(23, 939.7, 216.13), r(23, 345.56, 0, "reverse_charge")]);
    expect(v.prenesenie).toBe(false);
  });

  it("Nízkoenergetické domy 26090001 aj MD BUILDING 0000020375", () => {
    for (const [z, d, t, z23, pdp] of [
      [1694.2, 132.8, 1827, 577.4, 1116.8],
      [354.3, 11.22, 365.52, 48.8, 305.5],
    ] as const) {
      const u = udajeZAi(
        {
          supplier_ic_dph: "SK2020061065",
          issue_date: "2026-09-03",
          amount_without_vat: z,
          vat_amount: d,
          amount_total: t,
          reverse_charge_text: "Prenesenie daňovej povinnosti.",
          vat_breakdown: [
            { rate: 23, base: z23, vat: d, vat_category: "standard" },
            { rate: 0, base: pdp, vat: 0, vat_category: "reverse_charge" },
          ],
        },
        DNES,
        { krajina: "SK" },
      );
      expect(u.rozpis).toEqual([r(0, pdp, 0, "reverse_charge"), r(23, z23, d)]);
      expect(u.kontrolaDph).toBeUndefined();
      expect(u.prenesenie).toBe(false);
    }
  });

  it("chýbajúci riadok PDP (AI dala len 23 %) sa doplní ako prenesenie", () => {
    const v = rozpisZVytazenia(
      { ...PP_PROJEKT, vat_breakdown: [{ rate: 23, base: 348.98, vat: 80.27, vat_category: "standard" }] },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(0, 99, 0, "reverse_charge"), r(23, 348.98, 80.27)]);
    expect(v.naprava).toMatch(/chýbal riadok bez dane so základom 99,00 \(prenesenie/);
  });

  it("PDP stavebné práce — celá faktúra v prenesení, bez DPH", () => {
    const u = udajeZAi(
      {
        supplier_ic_dph: "SK2020123456",
        issue_date: "2026-10-31",
        amount_without_vat: 12500,
        vat_amount: 0,
        amount_total: 12500,
        reverse_charge: true,
        reverse_charge_text: "Prenesenie daňovej povinnosti podľa § 69 ods. 12 písm. j) zákona o DPH",
        items: [{ name: "Stavebné práce – murovanie, október 2026", quantity: 1, unit_price: 12500, vat_rate: 0, total: 12500, reverse_charge: true }],
        items_total_with_vat: false,
      },
      DNES,
      { krajina: "SK" },
    );
    expect(u.rozpis).toEqual([r(0, 12500, 0, "reverse_charge")]);
    expect(u.kontrolaDph).toBeUndefined();
    expect(u.prenesenie).toBe(true);
    const p = prijataZUdajov("faktura", u, DNES);
    expect(p).toMatchObject({ reverse_charge: true, dph_rezim: "samozdanenie", vat_amount: 0, amount_total: 12500 });
  });
});

/* ------------------------------------------------------------------------
   Telekom (O2 1612869951): 23 % 70,81 / 16,29 + „Nie je predmetom DPH“ 8,50
   (splátka za zariadenie), spolu 95,60.
------------------------------------------------------------------------ */
describe("telekomunikačná faktúra — 23 % + nie je predmetom DPH", () => {
  const O2 = {
    supplier_ic_dph: "SK2121743437",
    invoice_number: "1612869951",
    issue_date: "2026-10-06",
    delivery_date: "2026-10-06",
    amount_without_vat: 79.31,
    vat_amount: 16.29,
    amount_total: 95.6,
    amount_due: 95.6,
    vat_breakdown: [
      { rate: 23, base: 70.81, vat: 16.29, vat_category: "standard" },
      { rate: 0, base: 8.5, vat: 0, vat_category: "out_of_scope" },
    ],
  };

  it("rozpis z dokladu: 23 % + mimo DPH, žiadne „20,54 %“", () => {
    const u = udajeZAi(O2, DNES, { krajina: "SK" });
    expect(u.rozpis).toEqual([r(0, 8.5, 0, "out_of_scope"), r(23, 70.81, 16.29)]);
    expect(u.kontrolaDph).toBeUndefined();
  });

  it("AI vynechala riadok mimo DPH — položka 0 % s kategóriou ho doplní", () => {
    const v = rozpisZVytazenia(
      {
        ...O2,
        vat_breakdown: [{ rate: 23, base: 70.81, vat: 16.29, vat_category: "standard" }],
        items: [
          { name: "Mesačné poplatky", vat_rate: 23, total: 94.813 },
          { name: "Splátka za zariadenia", vat_rate: 0, total: 8.5, vat_category: "out_of_scope" },
          { name: "Zľavy", vat_rate: 23, total: -18.5121 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(0, 8.5, 0, "out_of_scope"), r(23, 70.81, 16.29)]);
  });

  it("bez dôvodu nulovej dane ide doklad na kontrolu s konkrétnou vetou", () => {
    const u = udajeZAi(
      { ...O2, vat_breakdown: [{ rate: 23, base: 70.81, vat: 16.29, vat_category: "standard" }], items: [] },
      DNES,
      { krajina: "SK" },
    );
    expect(u.kontrolaDph?.dovod).toMatch(/^Rozpis DPH nesedí: .*Riadok 0 % so základom 8,50 nemá dôvod/);
    expect(u.rozpis.every((x) => [0, 5, 19, 23].includes(x.sadzba))).toBe(true);
  });
});

/* ------------------------------------------------------------------------
   METRO — 5 % (potraviny) + 23 %, ceny položiek s DPH.
------------------------------------------------------------------------ */
describe("METRO 5 % + 23 %", () => {
  const METRO = {
    supplier_name: "METRO Cash & Carry SR s.r.o.",
    supplier_ic_dph: "SK2020274617",
    issue_date: "2026-10-20",
    amount_without_vat: 297.06,
    vat_amount: 53.07,
    amount_total: 350.13,
  };

  it("tabuľka rozpisu z dokladu", () => {
    const v = rozpisZVytazenia(
      {
        ...METRO,
        vat_breakdown: [
          { rate: 5, base: 84.76, vat: 4.24 },
          { rate: 23, base: 212.3, vat: 48.83 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(5, 84.76, 4.24), r(23, 212.3, 48.83)]);
  });

  it("AI dala základ 5 % so DPH (89,00) — opraví sa na 84,76", () => {
    const v = rozpisZVytazenia(
      {
        ...METRO,
        vat_breakdown: [
          { rate: 5, base: 89, vat: 4.24 },
          { rate: 23, base: 212.3, vat: 48.83 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(5, 84.76, 4.24), r(23, 212.3, 48.83)]);
    expect(v.naprava).toMatch(/Základ pri 5 % bol uvedený s DPH/);
  });

  it("jedna sadzba na celý doklad (AI zlúčila) neprejde — na kontrolu, prečítaná sadzba sa nezahodí", () => {
    const u = udajeZAi({ ...METRO, vat_breakdown: [{ rate: 18, base: 297.06, vat: 53.07 }] }, DNES, { krajina: "SK" });
    expect(u.kontrolaDph?.dovod).toMatch(/Sadzba 18 % nie je povolená/);
    // Revízia 13. 11.: pôvodná sadzba ostáva (editor ju ukáže „– neplatná“), nikdy 0 % s DPH.
    expect(u.rozpis.some((x) => x.sadzba === 0 && Math.abs(x.dph) > 0.004)).toBe(false);
    expect(kontrolaSadziebUdajov(u, "SK").ok).toBe(false);
  });
});

/* ------------------------------------------------------------------------
   Bloček so zaokrúhlením (hotovosť na 5 centov).
------------------------------------------------------------------------ */
describe("bloček so zaokrúhlením", () => {
  const BLOCEK = {
    document_subtype: "blocek",
    supplier_ic_dph: "SK2020111111",
    issue_date: "2026-11-02",
    payment_method: "hotovost",
    amount_without_vat: 10.06,
    vat_amount: 2.31,
    amount_total: 12.35,
    rounding: -0.02,
    vat_breakdown: [{ rate: 23, base: 10.06, vat: 2.31 }],
  };

  it("rozpis bez zaokrúhlenia, suma po ňom", () => {
    const u = udajeZAi(BLOCEK, DNES, { krajina: "SK" });
    expect(u.rozpis).toEqual([r(23, 10.06, 2.31)]);
    expect(u.zaokruhlenie).toBe(-0.02);
    expect(u.celkom).toBe(12.35);
    expect(u.kontrolaDph).toBeUndefined();
  });

  it("len položky s DPH a suma po zaokrúhlení — brutto výklad počíta so sumou pred zaokrúhlením", () => {
    const v = rozpisZVytazenia(
      {
        ...BLOCEK,
        amount_without_vat: null,
        vat_amount: 2.31,
        vat_breakdown: [],
        items: [
          { name: "Chlieb", quantity: 1, unit_price: 2.46, vat_rate: 23, total: 2.46 },
          { name: "Káva", quantity: 1, unit_price: 9.91, vat_rate: 23, total: 9.91 },
        ],
        items_total_with_vat: true,
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(23, 10.06, 2.31)]);
  });

  it("základ hlavičky = suma s DPH (AI prečítala „Celkom“) sa opraví", () => {
    const v = rozpisZVytazenia(
      { ...BLOCEK, amount_without_vat: 12.37, rounding: null, amount_total: 12.37, vat_breakdown: [] },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis).toEqual([r(23, 10.06, 2.31)]);
  });
});

/* ------------------------------------------------------------------------
   Zákonné sadzby — nikdy sa neuloží iná.
------------------------------------------------------------------------ */
describe("zákonné sadzby", () => {
  it("20 % v roku 2026 sa neuloží; v roku 2024 platí", () => {
    const ai = { supplier_ic_dph: "SK1", amount_without_vat: 100, vat_amount: 20, amount_total: 120, vat_breakdown: [{ rate: 20, base: 100, vat: 20 }] };
    const v26 = rozpisZVytazenia({ ...ai, issue_date: "2026-05-01" }, { krajina: "SK" });
    expect(v26.kontrola.ok).toBe(false);
    // Pôvodná sadzba ostane a kontrola ju ohlási — doklad sa nevytvorí, kým ju človek neopraví.
    expect(v26.rozpis.map((x) => x.sadzba)).toEqual([20]);
    const v24 = rozpisZVytazenia({ ...ai, issue_date: "2024-05-01" }, { krajina: "SK" });
    expect(v24.kontrola.ok).toBe(true);
    expect(v24.rozpis).toEqual([r(20, 100, 20)]);
  });

  it("nezákonná sadzba, pri ktorej DPH sedí na jednu zákonnú, sa nahradí overenou", () => {
    expect(lenZakonneSadzby([r(23.5, 100, 23) as any], { krajina: "SK", den: "2026-10-01" })).toEqual([r(23, 100, 23)]);
    expect(lenZakonneSadzby([r(12, 100, 0, "exempt") as any], { krajina: "SK", den: "2026-10-01" })).toEqual([r(0, 100, 0, "exempt")]);
  });

  it("zahraničný dodávateľ (rakúsky hotel 13 %) si sadzbu svojho štátu ponechá", () => {
    expect(
      lenZakonneSadzby([r(13, 100, 13) as any], { krajina: "SK", den: "2026-10-01", krajinaDodavatela: "AT" }),
    ).toEqual([r(13, 100, 13)]);
  });

  it("záporný riadok zdanenej zálohy z roku 2024 smie mať 20 %", () => {
    expect(lenZakonneSadzby([r(20, -100, -20) as any], { krajina: "SK", den: "2026-10-01" })).toEqual([r(20, -100, -20)]);
  });

  it("česká firma — 21 % a 12 %", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "CZ12345678",
        issue_date: "2026-10-01",
        amount_without_vat: 1100,
        vat_amount: 222,
        vat_breakdown: [
          { rate: 21, base: 1000, vat: 210 },
          { rate: 12, base: 100, vat: 12 },
        ],
      },
      { krajina: "CZ" },
    );
    expect(v.kontrola.ok).toBe(true);
  });

  it("náprava nemení sadzby a nič nevymyslí, keď nie je čo opraviť", () => {
    expect(napravRozpisDph([r(23, 100, 23) as any], { bezDph: 100, dph: 23 }, {})).toBeNull();
  });
});
