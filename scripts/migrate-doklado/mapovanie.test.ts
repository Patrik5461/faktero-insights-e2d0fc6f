import { describe, expect, it } from "vitest";
import { POVOLENE_CESTY } from "./doklado-klient";
import {
  blocek,
  cenySDph,
  datum,
  druhDokladu,
  klucPartnera,
  krajinaFirmy,
  prijata,
  rozpisDph,
  sumy,
  vystavena,
  zakonneSadzby,
} from "./mapovanie";
import { sadzbyKrajiny } from "../../src/lib/faktero/vat-rates";
import { skontrolujDphDokladu } from "../../src/lib/faktero/dph-pravidlo";
import { jeDovodRozpisu, jeRozpisNaKontrole } from "../../src/lib/faktero/rozpis-na-kontrole";

const o = { teraz: "2026-10-27T10:00:00.000Z", dnes: "2026-10-27" };

const faktura = (x: Record<string, unknown> = {}) =>
  ({
    documentId: "d1",
    type: "invoice",
    subType: "domestic_exposed",
    invoiceNumber: "2026001",
    issuedAt: "2026-03-31T22:30:00Z",
    dueDate: "2026-04-14T00:00:00Z",
    organizationName: "Odberateľ s.r.o.",
    organizationId: "12 345 678",
    totalPrice: 123,
    vatSummary: [{ taxBase: 100, vatAmount: 23, vatRate: 23 }],
    items: [{ name: "Práca", price: 100, quantity: 1, vatRate: 23 }],
    ...x,
  }) as any;

describe("migrácia z Doklada", () => {
  it("z Doklada len číta", () => {
    for (const c of POVOLENE_CESTY)
      expect(c).not.toMatch(/setExported|create|update|upsert|issue|send|import|sync/i);
  });

  it("rozlíši vystavenú, prijatú faktúru a bloček", () => {
    expect(druhDokladu(faktura())).toBe("vystavena");
    expect(druhDokladu(faktura({ subType: "domestic_credit" }))).toBe("prijata");
    expect(druhDokladu({ type: "receipt" } as any)).toBe("blocek");
    expect(druhDokladu(faktura({ subType: "nieco" }))).toBe("nezname");
  });

  it("dátum berie v slovenskom čase", () => {
    expect(datum("2026-03-31T22:30:00Z")).toBe("2026-04-01");
    expect(datum("2026-07-15")).toBe("2026-07-15");
    expect(datum("")).toBeNull();
  });

  it("cenu položky s DPH prepočíta na základ", () => {
    const f = faktura({ items: [{ name: "x", price: 123, quantity: 1, vatRate: 23 }] });
    expect(cenySDph(f, sumy(f))).toBe(true);
    const m = vystavena(f, o);
    expect(m.polozky[0]).toMatchObject({
      unit_price: 100,
      subtotal: 100,
      vat_amount: 23,
      total: 123,
    });
  });

  it("cenu za celý riadok rozpočíta na jednotkovú (tvar z Doklada)", () => {
    const f = faktura({
      totalPrice: 1281,
      vatSummary: [{ taxBase: 1281, vatAmount: 0, vatRate: 0 }],
      items: [
        { name: "a", price: 175, quantity: 5, vatRate: 0 },
        { name: "b", price: 300, quantity: 10, vatRate: 0 },
        { name: "c", price: 350, quantity: 10, vatRate: 0 },
        { name: "d", price: 456, quantity: 240, vatRate: 0 },
      ],
    });
    const m = vystavena(f, o);
    expect(m.polozky.reduce((a, p) => a + p.subtotal, 0)).toBe(1281);
    expect(m.polozky[0]).toMatchObject({ quantity: 5, unit_price: 35, subtotal: 175 });
    expect(m.polozky[3]!.unit_price).toBe(1.9);
  });

  it("krajinu menom prevedie na kód", () => {
    const m = vystavena(faktura({ address: { country: "Slovenská republika" } }), o);
    expect(m.hlavicka.customer_country).toBe("SK");
    expect(
      vystavena(faktura({ address: { country: "Česká republika" } }), o).hlavicka.customer_country,
    ).toBe("CZ");
  });

  it("poradie čísla berie zo šablóny, nie z posledných číslic", () => {
    expect(vystavena(faktura({ invoiceNumber: "FA-2026001" }), o).hlavicka.sequence_number).toBe(1);
  });

  it("zachová pôvodné číslo a zaplatenú faktúru zapíše rovno ako zaplatenú", () => {
    const m = vystavena(faktura({ paymentStatus: "paid" }), o);
    expect(m.hlavicka).toMatchObject({
      invoice_number: "2026001",
      status: "paid",
      issue_date: "2026-04-01",
      customer_ico: "12345678",
      subtotal: 100,
      vat_total: 23,
      total: 123,
      import_source: "doklado",
    });
    expect(m.hlavicka.auto_uctovanie_at).toBe(o.teraz);
  });

  it("dobropis uloží záporne, ako ho ukladá Faktero", () => {
    const m = vystavena(faktura({ subType: "domestic_credit_issued" }), o);
    expect(m.hlavicka.type).toBe("credit_note");
    expect(m.hlavicka.total).toBe(-123);
    expect(m.polozky[0]!.quantity).toBe(-1);
    const p = prijata(faktura({ subType: "domestic_credit", originalNumber: "F1" }), o);
    expect(p.hlavicka).toMatchObject({ amount_total: -123, opravuje_cislo: "F1" });
  });

  it("prenesenie daňovej povinnosti nesie bez DPH na položkách", () => {
    const m = vystavena(
      faktura({
        vatCategory: "reverse_charge",
        vatSummary: [{ taxBase: 100, vatAmount: 0, vatRate: 0 }],
        totalPrice: 100,
      }),
      o,
    );
    expect(m.hlavicka).toMatchObject({
      reverse_charge: true,
      reverse_charge_type: "domestic_69",
      vat_total: 0,
    });
    expect(m.polozky.every((p) => p.vat_amount === 0 && p.prenesenie)).toBe(true);
  });

  it("riadok odpočtu zálohy nie je položka", () => {
    const m = vystavena(
      faktura({
        items: [
          { name: "Práca", price: 100, quantity: 1, vatRate: 23 },
          { name: "Záloha", price: -50, quantity: 1, vatRate: 23, itemType: "advance_payment" },
        ],
      }),
      o,
    );
    expect(m.polozky).toHaveLength(1);
    expect(m.hlavicka.advance_amount).toBeGreaterThan(0);
  });

  it("predkontácia je skratka z Doklada, nie názov účtovnej položky", () => {
    const f = faktura({
      subType: "domestic_received",
      accountingSettings: { accountingItem: { value: "Nákup PHM - platba kartou", code: "501200 325100" } },
    });
    expect(prijata(f, o).hlavicka.pohoda_predkontacia).toBe("501200 325100");
  });

  it("predkontácia bez exportu zaúčtovanie neznamená", () => {
    const f = faktura({
      subType: "domestic_received",
      accountingSettings: {
        accountingItem: { value: "Služba" },
        classificationVat: { code: "PD" },
      },
    });
    const h = prijata(f, o).hlavicka;
    expect(h).toMatchObject({
      status: "received",
      // Bez skratky ostane aspoň názov.
      pohoda_predkontacia: "Služba",
      exported_at: null,
    });
    expect(h).not.toHaveProperty("zauctovane_at");
  });

  it("doklad exportovaný z Doklada príde zaúčtovaný aj bez predkontácie", () => {
    const bez = faktura({ subType: "domestic_received" });
    expect(prijata(bez, o).hlavicka).toMatchObject({ status: "received", exported_at: null });
    expect(prijata(bez, o).hlavicka).not.toHaveProperty("zauctovane_at");
    const exp = prijata(bez, { ...o, exportovany: true }).hlavicka;
    expect(exp).toMatchObject({ status: "booked", zauctovane_at: o.teraz, exported_at: o.teraz });
    expect(vystavena(faktura(), { ...o, exportovany: true }).hlavicka).toMatchObject({
      zauctovane_at: o.teraz,
      exported_at: o.teraz,
    });
    const b = blocek({ type: "receipt", documentId: "b2", totalPrice: 5 } as any, {
      ...o,
      exportovany: true,
    });
    expect(b).toMatchObject({ status: "exported", zauctovane_at: o.teraz, exported_at: o.teraz });
  });

  it("hotovostný bloček nepohne pokladňou", () => {
    const b = blocek(
      {
        type: "receipt",
        documentId: "b1",
        paymentType: "cash",
        totalPrice: 10,
        issuedAt: "2026-01-02",
      } as any,
      o,
    );
    expect(b).toMatchObject({
      payment_method: "hotovost",
      mimo_pokladne: true,
      status: "processed",
      source: "import",
    });
  });

  it("partnera páruje podľa IČO, bez IČO podľa mena bez diakritiky", () => {
    expect(klucPartnera({ ico: "12 345 678", name: "A" })).toBe("ico:12345678");
    expect(klucPartnera({ ico: null, name: "Žltá Ľalia, s.r.o." })).toBe(
      klucPartnera({ ico: "", name: "zlta lalia s r o" }),
    );
  });
});

describe("sumy dokladu bez rozpisu DPH", () => {
  it("bez vatSummary a taxBase je celá suma základom (nie 0)", async () => {
    const { sumy } = await import("./mapovanie");
    const s = sumy({ totalPrice: 260, vatSummary: [], items: [] } as any);
    expect(s.zaklad).toBe(260);
    expect(s.dph).toBe(0);
    expect(s.spolu).toBe(260);
    expect(s.sadzby).toEqual([{ sadzba: 0, zaklad: 260, dph: 0 }]);
    expect(s.zRozpisu).toBe(false);
  });
});

describe("rozpis DPH z Doklada", () => {
  const prijataF = (x: Record<string, unknown> = {}) =>
    faktura({ subType: "domestic_received", issuedAt: "2026-03-10", ...x });

  it("zákonné sadzby sa zhodujú s vat-rates.ts", () => {
    for (const k of ["SK", "CZ", "DE"] as const)
      for (const den of ["2019-06-01", "2020-08-01", "2023-12-31", "2024-01-01", "2024-12-31", "2025-01-01", "2026-11-13"])
        expect([...zakonneSadzby(k, den)].sort()).toEqual([...sadzbyKrajiny(k, den)].sort());
  });

  it("prijatá faktúra nesie rozpis po sadzbách a hlavičku zo súčtov", () => {
    const h = prijata(
      prijataF({
        totalPrice: 184.5,
        vatSummary: [
          { taxBase: 100, vatAmount: 23, vatRate: 23 },
          { taxBase: 50, vatAmount: 9.5, vatRate: 19 },
          { taxBase: 2, vatAmount: 0, vatRate: 0 },
        ],
        items: [],
      }),
      o,
    ).hlavicka;
    expect(h.vat_breakdown).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23, vat_category: "standard" },
      { sadzba: 19, zaklad: 50, dph: 9.5, vat_category: "standard" },
      { sadzba: 0, zaklad: 2, dph: 0 },
    ]);
    expect(h).toMatchObject({ amount_without_vat: 152, vat_amount: 32.5, amount_total: 184.5 });
    expect(h.int_poznamka).toBeNull();
  });

  it("rovnaké sadzby zlúči", () => {
    const r = rozpisDph(
      prijataF({
        totalPrice: 184.5,
        vatSummary: [
          { taxBase: 100, vatAmount: 23, vatRate: 23 },
          { taxBase: 50, vatAmount: 11.5, vatRate: 23 },
        ],
      }),
      { den: "2026-03-10" },
    );
    expect(r.stav).toBe("ok");
    expect(r.rozpis).toEqual([{ sadzba: 23, zaklad: 150, dph: 34.5, vat_category: "standard" }]);
  });

  it("sadzbu mimo zákonných neuloží (13 %, a 20 % po roku 2024)", () => {
    const zla = prijataF({ totalPrice: 113, vatSummary: [{ taxBase: 100, vatAmount: 13, vatRate: 13 }] });
    expect(rozpisDph(zla, { den: "2026-03-10" }).stav).toBe("sadzba");
    const h = prijata(zla, o).hlavicka;
    expect(h.vat_breakdown).toBeNull();
    expect(h.int_poznamka).toMatch(/Rozpis DPH z Doklada sa neprevzal: sadzba 13 %/);
    const stara = prijataF({ totalPrice: 120, vatSummary: [{ taxBase: 100, vatAmount: 20, vatRate: 20 }] });
    expect(rozpisDph(stara, { den: "2026-03-10" }).stav).toBe("sadzba");
    expect(rozpisDph(stara, { den: "2024-12-31" }).stav).toBe("ok");
    // Rozhoduje deň dodania, nie vystavenia.
    expect(prijata({ ...stara, deliveryDate: "2024-12-20" }, o).hlavicka.vat_breakdown).toHaveLength(1);
    // Česká firma: 21 % platí, 23 % nie.
    expect(rozpisDph(prijataF(), { krajina: "CZ", den: "2026-03-10" }).stav).toBe("sadzba");
  });

  it("DPH, ktorá nesedí so základom × sadzbou, neprejde", () => {
    // Tempus-Car: DPH z plnej sumy, základ po odpočte zálohy.
    const f = prijataF({ totalPrice: 130.5, vatSummary: [{ taxBase: 100, vatAmount: 30.5, vatRate: 23 }] });
    expect(rozpisDph(f, { den: "2026-03-10" }).stav).toBe("dph");
    expect(prijata(f, o).hlavicka.vat_breakdown).toBeNull();
    // Zaokrúhlenie po položkách v tolerancii prejde.
    const g = prijataF({ totalPrice: 123.03, vatSummary: [{ taxBase: 100, vatAmount: 23.03, vatRate: 23 }], items: [1, 2, 3].map(() => ({ name: "x", price: 1, vatRate: 23 })) });
    expect(rozpisDph(g, { den: "2026-03-10" }).stav).toBe("ok");
  });

  it("rozpis, ktorý nedá sumu dokladu, neprejde", () => {
    const f = prijataF({ totalPrice: 150, vatSummary: [{ taxBase: 100, vatAmount: 23, vatRate: 23 }] });
    expect(rozpisDph(f, { den: "2026-03-10" }).stav).toBe("sucet");
  });

  it("bez rozpisu v Doklade nič nevymyslí", () => {
    const f = prijataF({ totalPrice: 260, vatSummary: [], items: [] });
    expect(rozpisDph(f, { den: "2026-03-10" }).stav).toBe("nema");
    const h = prijata(f, o).hlavicka;
    expect(h.vat_breakdown).toBeNull();
    expect(h.int_poznamka).toBeNull();
  });

  it("dobropis má rozpis záporný ako hlavičku", () => {
    const h = prijata(prijataF({ subType: "domestic_credit" }), o).hlavicka;
    expect(h.vat_breakdown).toEqual([{ sadzba: 23, zaklad: -100, dph: -23, vat_category: "standard" }]);
    expect(h).toMatchObject({ amount_without_vat: -100, vat_amount: -23, amount_total: -123 });
  });

  it("prenesenie daňovej povinnosti nesie DPH 0 a príznak pdp", () => {
    const h = prijata(
      prijataF({ vatCategory: "reverse_charge", totalPrice: 100, vatSummary: [{ taxBase: 100, vatAmount: 23, vatRate: 23 }] }),
      o,
    ).hlavicka;
    expect(h.vat_breakdown).toEqual([{ sadzba: 23, zaklad: 100, dph: 0, vat_category: "reverse_charge", pdp: true }]);
    expect(h.vat_amount).toBe(0);
  });

  it("bloček: rozpis z polí sadzieb, bez rozpisu 0 %, zlá sadzba nič", () => {
    const zaklad = { type: "receipt", documentId: "b", issuedAt: "2026-02-01" };
    const b = blocek({ ...zaklad, totalPrice: 12.3, taxBaseBasic: 10, vatAmountBasic: 2.3, vatRateBasic: 23 } as any, o);
    expect(b).toMatchObject({ net_amount: 10, vat_amount: 2.3, vat_rate: 23 });
    expect(b.vat_breakdown).toEqual([{ sadzba: 23, zaklad: 10, dph: 2.3, vat_category: "standard" }]);
    // Zaokrúhlenie hotovosti na 5 centov.
    expect(blocek({ ...zaklad, totalPrice: 12.35, vatSummary: [{ taxBase: 10, vatAmount: 2.3, vatRate: 23 }] } as any, o).vat_breakdown).toHaveLength(1);
    expect(blocek({ ...zaklad, totalPrice: 5 } as any, o).vat_breakdown).toEqual([{ sadzba: 0, zaklad: 5, dph: 0 }]);
    const zly = blocek({ ...zaklad, totalPrice: 12.2, vatSummary: [{ taxBase: 10, vatAmount: 2.2, vatRate: 22 }] } as any, o);
    expect(zly.vat_breakdown).toBeNull();
    expect(zly.vat_rate).toBeNull();
    expect(zly.int_poznamka).toMatch(/sadzba 22 %/);
  });

  it("krajinu firmy číta ako vat-rates", () => {
    expect(krajinaFirmy("CZ")).toBe("CZ");
    expect(krajinaFirmy("Česká republika")).toBe("CZ");
    expect(krajinaFirmy("Denmark")).toBe("SK");
    expect(krajinaFirmy(null)).toBe("SK");
  });
});

describe("doklad, ktorého rozpis neprejde, sa prenesie na kontrolu (spúšťač ho pustí)", () => {
  const prijataF = (x: Record<string, unknown> = {}) =>
    faktura({ subType: "domestic_received", issuedAt: "2026-03-10", ...x });
  /** Čo by spravil spúšťač pri INSERT — rovnaké pravidlo ako dph-pravidlo.ts. */
  const insertPrijatej = (h: Record<string, unknown>) => skontrolujDphDokladu("purchase_invoices", h, "SK");

  it("Tempus-Car (DPH z plnej sumy, 30,5 %): hlavička z Doklada, bez rozpisu, na kontrole", () => {
    const h = prijata(
      prijataF({ totalPrice: 130.5, vatSummary: [{ taxBase: 100, vatAmount: 30.5, vatRate: 23 }] }),
      o,
    ).hlavicka;
    expect(h.vat_breakdown).toBeNull();
    expect(h).toMatchObject({ amount_without_vat: 100, vat_amount: 30.5, na_kontrolu_at: o.teraz });
    expect(jeDovodRozpisu(h.na_kontrolu_dovod)).toBe(true);
    expect(jeRozpisNaKontrole(h)).toBe(true);
    expect(h.na_kontrolu_dovod).toMatch(/30\.5 %/);
    // INSERT prejde (doklad z Doklada na kontrole) …
    expect(insertPrijatej(h)).toEqual([]);
    // … ale zrušiť príznak bez opravy rozpisu nejde.
    expect(
      skontrolujDphDokladu("purchase_invoices", { na_kontrolu_at: null, na_kontrolu_dovod: null }, "SK", h),
    ).not.toEqual([]);
    // Bez príznaku by ho spúšťač odmietol — preto sa doklad predtým vôbec nepreniesol.
    expect(insertPrijatej({ ...h, na_kontrolu_at: null })).not.toEqual([]);
  });

  it("zmiešané sadzby bez rozpisu v Doklade (22,46 %) → na kontrolu, nič si nevymyslí", () => {
    const h = prijata(
      prijataF({ totalPrice: 122.46, vatSummary: [{ taxBase: 100, vatAmount: 22.46, vatRate: 22.46 }], items: [] }),
      o,
    ).hlavicka;
    expect(h).toMatchObject({ amount_without_vat: 100, vat_amount: 22.46, vat_breakdown: null, na_kontrolu_at: o.teraz });
    expect(insertPrijatej(h)).toEqual([]);
  });

  it("hlavička s jednou zákonnou sadzbou dostane jednoriadkový rozpis a nejde na kontrolu", () => {
    // Rozpis z Doklada nedá sumu (súčet), ale hlavička 100 + 23 je čistých 23 %.
    const f = prijataF({ totalPrice: 150, vatSummary: [{ taxBase: 100, vatAmount: 23, vatRate: 23 }] });
    const h = prijata(f, o).hlavicka;
    expect(h.vat_breakdown).toEqual([{ sadzba: 23, zaklad: 100, dph: 23, vat_category: "standard" }]);
    expect(h.na_kontrolu_at).toBeNull();
    expect(insertPrijatej(h)).toEqual([]);
  });

  it("zálohová faktúra na kontrolu nejde (spúšťač ju nekontroluje)", () => {
    const h = prijata(
      prijataF({ subType: "domestic_advance", totalPrice: 130.5, vatSummary: [{ taxBase: 100, vatAmount: 30.5, vatRate: 23 }] }),
      o,
    ).hlavicka;
    expect(h.type).toBe("proforma");
    expect(h.na_kontrolu_at).toBeNull();
  });

  it("v poriadku rozpis: bez príznaku a prejde pravidlom", () => {
    const h = prijata(prijataF(), o).hlavicka;
    expect(h.na_kontrolu_at).toBeNull();
    expect(h.na_kontrolu_dovod).toBeNull();
    expect(insertPrijatej(h)).toEqual([]);
  });

  it("bloček so zlou sadzbou ide na kontrolu, zahraničný (HU 27 %) prejde bez príznaku", () => {
    const zaklad = { type: "receipt", documentId: "b", issuedAt: "2026-02-01" };
    const zly = blocek({ ...zaklad, totalPrice: 12.2, vatSummary: [{ taxBase: 10, vatAmount: 2.2, vatRate: 22 }] } as any, o);
    expect(zly.vat_breakdown).toBeNull();
    expect(zly.na_kontrolu_at).toBe(o.teraz);
    expect(skontrolujDphDokladu("expense_documents", zly, "SK")).toEqual([]);
    const hu = blocek(
      {
        ...zaklad,
        organizationVatId: "HU12345678",
        totalPrice: 12.7,
        vatSummary: [{ taxBase: 10, vatAmount: 2.7, vatRate: 27 }],
      } as any,
      o,
    );
    expect(hu.supplier_country).toBe("HU");
    // Rozpis zahraničného dodávateľa sa prevezme so sadzbou jeho štátu.
    expect(hu.vat_breakdown).toEqual([{ sadzba: 27, zaklad: 10, dph: 2.7, vat_category: "standard" }]);
    expect(hu.na_kontrolu_at).toBeNull();
    expect(skontrolujDphDokladu("expense_documents", hu, "SK")).toEqual([]);
    // Bloček bez DPH ostane v 0 % a bez príznaku.
    const nula = blocek({ ...zaklad, totalPrice: 5 } as any, o);
    expect(nula.na_kontrolu_at).toBeNull();
    expect(skontrolujDphDokladu("expense_documents", nula, "SK")).toEqual([]);
  });
});
