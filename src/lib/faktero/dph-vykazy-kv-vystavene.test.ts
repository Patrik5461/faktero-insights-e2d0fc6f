import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, priznanie, type VystavenaFaktura, type Vstup } from "./dph-vykazy";
import { kvNaXml } from "./dph-vykazy-xml";

/*
  Ručné členenie kontrolného výkazu na vystavených faktúrach — na faktúre,
  na položke a predvolené firmy. Databázu nahrádza klient, ktorý vráti riadky
  podľa tabuľky a filtre ignoruje.
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

const obdobie = { rok: 2026, mesiac: 9 };
const firmaSK = { id: "f", country: "SK" };

function faktura(p: Record<string, any> = {}) {
  return {
    id: "i1",
    invoice_number: "2026001",
    type: "regular",
    status: "sent",
    issue_date: "2026-09-10",
    delivery_date: "2026-09-10",
    currency: "EUR",
    customer_ic_dph: "SK2021111111",
    customer_name: "Odberateľ s. r. o.",
    reverse_charge: false,
    discount_total: 0,
    invoice_items: [{ vat_rate: 23, subtotal: 1000, quantity: 1, unit_price: 1000 }],
    ...p,
  };
}

async function kv(faktury: any[], firma: Record<string, any> = firmaSK) {
  const { vstup } = await nacitajVstup(
    klient({ invoices: faktury, companies: [firma] }) as any,
    "f",
    obdobie,
  );
  return { vstup, kv: kontrolnyVykaz(vstup) };
}

const validator = () =>
  XsdValidator.fromDoc(
    XmlDocument.fromBuffer(readFileSync(new URL("./schemy/kv_dph_2025.xsd", import.meta.url))),
  );

describe("KV pri vystavených faktúrach — ručné členenie", () => {
  it("bez členenia ostáva automatika (A.1)", async () => {
    const { kv: v } = await kv([faktura()]);
    expect(v.a1).toEqual([
      expect.objectContaining({ f: "2026001", z: 1000, d: 230, s: 23, odb: "SK2021111111" }),
    ]);
    expect(v.a2).toEqual([]);
    expect(v.d2).toBeNull();
  });

  it("ručné A1 dá faktúru do A.1, aj keby ju automatika vynechala", async () => {
    const { kv: v } = await kv([faktura({ kv_clenenie: "A1" })]);
    expect(v.a1.map((r) => r.f)).toEqual(["2026001"]);
    // Dodanie do EÚ by automaticky do KV nešlo; ručné A1 sa rešpektuje.
    const eu = await kv([
      faktura({
        kv_clenenie: "A1",
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        invoice_items: [{ vat_rate: 23, subtotal: 100, quantity: 1, unit_price: 100 }],
      }),
    ]);
    expect(eu.kv.a1.map((r) => r.z)).toEqual([100]);
  });

  it("X = faktúra do KV nevstupuje, v priznaní ostáva", async () => {
    const { vstup, kv: v } = await kv([faktura({ kv_clenenie: "X" })]);
    expect(v.a1).toEqual([]);
    expect(v.a2).toEqual([]);
    expect(v.c1).toEqual([]);
    expect(priznanie(vstup).r04).toBe(230);
  });

  it("X na dobropise ho vynechá aj z C.1", async () => {
    const { kv: v } = await kv([
      faktura({
        id: "i2",
        invoice_number: "D-1",
        type: "credit_note",
        kv_clenenie: "X",
        opravuje_fakturu_id: "i0",
        invoice_items: [{ vat_rate: 23, subtotal: -100, quantity: 1, unit_price: -100 }],
      }),
    ]);
    expect(v.c1).toEqual([]);
  });

  it("pravidlá pre PDP (A.2) a dobropis (C.1) bez ručného členenia platia ďalej", async () => {
    const { kv: v } = await kv([
      faktura({
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
        invoice_items: [{ vat_rate: 0, subtotal: 400, quantity: 1, unit_price: 400 }],
      }),
      faktura({
        id: "i2",
        invoice_number: "D-1",
        type: "credit_note",
        opravuje_fakturu_id: "i1",
        invoice_items: [{ vat_rate: 23, subtotal: -100, quantity: 1, unit_price: -100 }],
      }),
    ]);
    expect(v.a2).toEqual([expect.objectContaining({ f: "2026001", z: 400 })]);
    expect(v.c1).toEqual([
      expect.objectContaining({ fo: "D-1", fp: "2026001", zr: -100, dr: -23 }),
    ]);
  });

  it("položka s vlastným členením ide podľa neho, zvyšok faktúry automaticky", async () => {
    const { vstup, kv: v } = await kv([
      faktura({
        invoice_items: [
          { vat_rate: 23, subtotal: 1000, quantity: 1, unit_price: 1000 },
          { vat_rate: 23, subtotal: 200, quantity: 1, unit_price: 200, kv_clenenie: "X" },
          { vat_rate: 0, subtotal: 300, quantity: 1, unit_price: 300, prenesenie: true },
          {
            vat_rate: 0,
            subtotal: 50,
            quantity: 1,
            unit_price: 50,
            prenesenie: true,
            kv_clenenie: "X",
          },
        ],
      }),
    ]);
    expect(v.a1).toEqual([expect.objectContaining({ z: 1000, d: 230 })]);
    expect(v.a2).toEqual([expect.objectContaining({ z: 300 })]);
    // Priznanie vidí všetky položky ako doteraz — X sa týka len KV.
    expect(priznanie(vstup).r03).toBe(1200);
  });

  it("položka s rovnakým kódom ako hlavička sa neoddelí", async () => {
    const { kv: v } = await kv([
      faktura({
        invoice_items: [
          { vat_rate: 23, subtotal: 1000, quantity: 1, unit_price: 1000 },
          { vat_rate: 23, subtotal: 200, quantity: 1, unit_price: 200, kv_clenenie: "A1" },
        ],
      }),
    ]);
    expect(v.a1).toEqual([expect.objectContaining({ z: 1200, d: 276 })]);
  });

  it("zľava na doklad sa rozdelí aj na položky s vlastným členením", async () => {
    const { kv: v } = await kv([
      faktura({
        discount_total: 100,
        invoice_items: [
          { vat_rate: 23, subtotal: 600, quantity: 1, unit_price: 600 },
          { vat_rate: 23, subtotal: 400, quantity: 1, unit_price: 400, kv_clenenie: "D2" },
        ],
      }),
    ]);
    expect(v.a1).toEqual([expect.objectContaining({ z: 540, d: 124.2 })]);
    expect(v.d2).toEqual({ z: 360, d: 82.8, zzn: 0, dzn: 0 });
  });

  it("ručné A2 a C1 na položke", async () => {
    const { kv: v } = await kv([
      faktura({
        invoice_items: [
          { vat_rate: 23, subtotal: 1000, quantity: 1, unit_price: 1000 },
          { vat_rate: 0, subtotal: 300, quantity: 1, unit_price: 300, kv_clenenie: "A2" },
        ],
      }),
    ]);
    expect(v.a1).toEqual([expect.objectContaining({ z: 1000 })]);
    expect(v.a2).toEqual([expect.objectContaining({ z: 300, odb: "SK2021111111" })]);
  });

  it("D.2 sa sčíta po základnej a zníženej sadzbe a prejde schémou", async () => {
    const { kv: v } = await kv([
      faktura({
        kv_clenenie: "D2",
        invoice_items: [
          { vat_rate: 23, subtotal: 100, quantity: 1, unit_price: 100 },
          { vat_rate: 19, subtotal: 50, quantity: 1, unit_price: 50 },
          { vat_rate: 5, subtotal: 20, quantity: 1, unit_price: 20 },
          { vat_rate: 0, subtotal: 10, quantity: 1, unit_price: 10 },
        ],
      }),
      faktura({ id: "i2", invoice_number: "2026002" }),
    ]);
    expect(v.a1.map((r) => r.f)).toEqual(["2026002"]);
    expect(v.d2).toEqual({ z: 100, d: 23, zzn: 70, dzn: 10.5 });
    const firmaXml = {
      icDph: "SK2020123456",
      dic: "2020123456",
      nazov: "Testovacia firma s. r. o.",
      ulica: "Hlavná",
      cislo: "12",
      psc: "81101",
      obec: "Bratislava",
      stat: "Slovensko",
      tel: "0900123456",
      email: "firma@test.sk",
      danovyUrad: "Bratislava",
      konatel: "Ján Novák",
    };
    const xml = kvNaXml(v, firmaXml, obdobie);
    expect(xml).toContain('<D2 Z="100.00" D="23.00" ZZn="70.00" DZn="10.50"/>');
    const doc = XmlDocument.fromString(xml);
    expect(() => validator().validate(doc)).not.toThrow();
    doc.dispose();
  });

  it("D1 sa do výkazu nepripočíta a ozve sa výtkou", async () => {
    const { kv: v } = await kv([faktura({ kv_clenenie: "D1" })]);
    expect(v.a1).toEqual([]);
    expect(v.vytky.map((x) => x.doklad)).toContain("2026001");
  });

  it("predvolené KV firmy platí len pre bežnú tuzemskú faktúru", async () => {
    const firma = { ...firmaSK, kv_clenenie_faktura: "X" };
    const { kv: v } = await kv(
      [
        faktura(),
        faktura({
          id: "i2",
          invoice_number: "2026002",
          reverse_charge: true,
          reverse_charge_type: "domestic_69",
          invoice_items: [{ vat_rate: 0, subtotal: 400, quantity: 1, unit_price: 400 }],
        }),
        faktura({ id: "i3", invoice_number: "2026003", kv_clenenie: "A1" }),
      ],
      firma,
    );
    expect(v.a1.map((r) => r.f)).toEqual(["2026003"]);
    expect(v.a2.map((r) => r.f)).toEqual(["2026002"]);
  });

  it("kód prijatého dokladu (B2) na vystavenej faktúre sa ignoruje", () => {
    const f: VystavenaFaktura = {
      cislo: "1",
      typ: "regular",
      datumDodania: "2026-09-10",
      odberatelIcDph: "SK2021111111",
      riadky: [{ sadzba: 23, zaklad: 10, dan: 2.3 }],
      kv: "B2",
    };
    const vstup: Vstup = { obdobie, vystavene: [f], prijate: [], doklady: [] };
    expect(kontrolnyVykaz(vstup).a1).toHaveLength(1);
  });
});
