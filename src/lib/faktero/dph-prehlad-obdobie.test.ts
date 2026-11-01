import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { priznanie } from "./dph-vykazy";
import {
  denDaneVystavenej,
  denOdpoctuPrijatej,
  filterDatumovObdobia,
  vObdobi,
  vstupPrehladu,
  vystupPrehladu,
} from "./dph-prehlad";
import { zapocitatelna } from "./samofakturacia";

/*
  Rozhodnutie 1. 11. 2026: DPH prehľad zaraďuje doklady do obdobia podľa
  dátumu dodania (vystavené) a dňa odpočtu (prijaté) — rovnako ako priznanie.
  Prehľad a priznanie musia za rovnaký mesiac dať rovnaké sumy.
*/

function klient(tabulky: Record<string, any[]>) {
  return {
    from(t: string) {
      const riadky = tabulky[t] ?? [];
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        gte: () => q,
        lte: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        then: (ok: any, zle: any) => Promise.resolve({ data: riadky, error: null }).then(ok, zle),
      };
      return q;
    },
  };
}

const polozka = (vat_rate: number, subtotal: number, vat_amount: number) => ({
  vat_rate,
  subtotal,
  vat_amount,
  quantity: 1,
  unit_price: subtotal,
});

const faktura = (o: Record<string, any>): any => ({
  status: "sent",
  type: "regular",
  currency: "EUR",
  customer_country: "SK",
  customer_ic_dph: "SK2020123456",
  customer_dic: "2020123456",
  reverse_charge: false,
  ...o,
});

const VYSTAVENE = [
  // Dodané v septembri, vystavené v októbri — patrí do septembra.
  faktura({
    id: "f1",
    invoice_number: "F1",
    issue_date: "2026-10-02",
    delivery_date: "2026-09-28",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    invoice_items: [polozka(23, 100, 23)],
  }),
  // Vystavené v septembri, dodané v auguste — do septembra nepatrí.
  faktura({
    id: "f2",
    invoice_number: "F2",
    issue_date: "2026-09-05",
    delivery_date: "2026-08-30",
    subtotal: 200,
    vat_total: 46,
    total: 246,
    invoice_items: [polozka(23, 200, 46)],
  }),
  // Bez dátumu dodania — rozhoduje vystavenie.
  faktura({
    id: "f3",
    invoice_number: "F3",
    issue_date: "2026-09-10",
    delivery_date: null,
    subtotal: 50,
    vat_total: 9.5,
    total: 59.5,
    invoice_items: [polozka(19, 50, 9.5)],
  }),
  // Dobropis k augustovej F2 — patrí do obdobia vyhotovenia (september).
  faktura({
    id: "f4",
    invoice_number: "D1",
    type: "credit_note",
    opravuje_fakturu_id: "f2",
    issue_date: "2026-09-15",
    delivery_date: "2026-08-30",
    subtotal: -20,
    vat_total: -4.6,
    total: -24.6,
    invoice_items: [polozka(23, -20, -4.6)],
  }),
];

const prijata = (o: Record<string, any>): any => ({
  type: "regular",
  currency: "EUR",
  supplier_ic_dph: "SK2021987654",
  supplier_dic: "2021987654",
  ...o,
});

const PRIJATE = [
  // Dodané v septembri, vystavené v októbri — odpočet v septembri.
  prijata({
    id: "p1",
    invoice_number: "DF-1",
    issue_date: "2026-10-01",
    delivery_date: "2026-09-20",
    amount_without_vat: 200,
    vat_amount: 46,
    amount_total: 246,
    items: [
      {
        name: "Materiál",
        quantity: 1,
        unit_price: 200,
        vat_rate: 23,
        subtotal: 200,
        vat_amount: 46,
        total: 246,
      },
    ],
  }),
  // Dodané v auguste — do septembra nepatrí, hoci je vystavené v septembri.
  prijata({
    id: "p2",
    invoice_number: "DF-2",
    issue_date: "2026-09-02",
    delivery_date: "2026-08-25",
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    items: [
      {
        name: "Služba",
        quantity: 1,
        unit_price: 100,
        vat_rate: 23,
        subtotal: 100,
        vat_amount: 23,
        total: 123,
      },
    ],
  }),
  // Prijatý dobropis — podľa dátumu prijatia.
  prijata({
    id: "p3",
    invoice_number: "DOB-1",
    opravuje_cislo: "DF-0",
    issue_date: "2026-08-31",
    received_date: "2026-09-03",
    delivery_date: "2026-08-01",
    amount_without_vat: -10,
    vat_amount: -2.3,
    amount_total: -12.3,
    items: [
      {
        name: "Vrátenie",
        quantity: 1,
        unit_price: -10,
        vat_rate: 23,
        subtotal: -10,
        vat_amount: -2.3,
        total: -12.3,
      },
    ],
  }),
];

const OD = "2026-09-01";
const DO = "2026-09-30";
const sucet = (b: Record<string, { vat: number }>) =>
  Math.round(Object.values(b).reduce((a, r) => a + r.vat, 0) * 100) / 100;

describe("DPH prehľad podľa dátumu dodania", () => {
  it("vystavený doklad zaradí dátum dodania, opravnú faktúru dátum vyhotovenia", () => {
    expect(denDaneVystavenej(VYSTAVENE[0])).toBe("2026-09-28");
    expect(denDaneVystavenej(VYSTAVENE[1])).toBe("2026-08-30");
    expect(denDaneVystavenej(VYSTAVENE[2])).toBe("2026-09-10");
    expect(denDaneVystavenej(VYSTAVENE[3])).toBe("2026-09-15");
    expect(denDaneVystavenej({ issue_date: null, delivery_date: null })).toBeNull();
  });

  it("prijatá faktúra podľa dodania, prijatý dobropis podľa prijatia", () => {
    expect(denOdpoctuPrijatej(PRIJATE[0])).toBe("2026-09-20");
    expect(denOdpoctuPrijatej(PRIJATE[1])).toBe("2026-08-25");
    expect(denOdpoctuPrijatej(PRIJATE[2])).toBe("2026-09-03");
    // Záporná suma bez väzby je tiež dobropis.
    expect(
      denOdpoctuPrijatej({
        amount_total: -5,
        issue_date: "2026-09-01",
        delivery_date: "2026-08-01",
      }),
    ).toBe("2026-09-01");
  });

  it("filter pre databázu zachytí doklad podľa ktoréhokoľvek dátumu", () => {
    expect(filterDatumovObdobia(["issue_date", "delivery_date"], OD, DO)).toBe(
      "and(issue_date.gte.2026-09-01,issue_date.lte.2026-09-30),and(delivery_date.gte.2026-09-01,delivery_date.lte.2026-09-30)",
    );
    expect(vObdobi("2026-09-30T10:00:00Z", OD, DO)).toBe(true);
    expect(vObdobi("2026-10-01", OD, DO)).toBe(false);
    expect(vObdobi(null, OD, DO)).toBe(false);
  });

  it("prehľad a priznanie dajú za september rovnaké sumy", async () => {
    // Prehľad — ten istý výber ako stránka /uctovnictvo/dph.
    const vyst = VYSTAVENE.filter((f) => vObdobi(denDaneVystavenej(f), OD, DO));
    const polozky = vyst.flatMap((f) =>
      f.invoice_items.map((it: any) => ({ invoice_id: f.id, ...it })),
    );
    const prij = PRIJATE.filter((p) => zapocitatelna(p) && vObdobi(denOdpoctuPrijatej(p), OD, DO));
    const vystup = vystupPrehladu(vyst, polozky, "SK");
    const vstup = vstupPrehladu(prij, "SK");
    expect(vyst.map((f) => f.id)).toEqual(["f1", "f3", "f4"]);
    expect(prij.map((p) => p.id)).toEqual(["p1", "p3"]);

    // Priznanie z tých istých dokladov (filtre databázy klient ignoruje — vyberá nacitajVstup).
    const { vstup: v } = await nacitajVstup(
      klient({
        invoices: VYSTAVENE,
        purchase_invoices: PRIJATE,
        companies: [{ country: "SK" }],
      }) as any,
      "f",
      { rok: 2026, mesiac: 9 },
    );
    const dp = priznanie(v);
    const r = (k: string) => dp[k] ?? 0;
    const danVystup = Math.round((r("r02") + r("r02a") + r("r04") + r("r25")) * 100) / 100;
    const odpocet = Math.round((r("r18") + r("r18a") + r("r19") - r("r28")) * 100) / 100;

    expect(sucet(vystup)).toBe(27.9); // 23 + 9.5 − 4.6
    expect(danVystup).toBe(sucet(vystup));
    expect(sucet(vstup)).toBe(43.7); // 46 − 2.3
    expect(odpocet).toBe(sucet(vstup));
  });
});
