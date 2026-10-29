import { describe, expect, it } from "vitest";
import { POVOLENE_CESTY } from "./doklado-klient";
import {
  blocek,
  cenySDph,
  datum,
  druhDokladu,
  klucPartnera,
  prijata,
  sumy,
  vystavena,
} from "./mapovanie";

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
  });
});
