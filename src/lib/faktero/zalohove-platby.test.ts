import { describe, expect, it } from "vitest";
import { sparuj, type Doklad, type Pohyb as PohybVydanej } from "./parovanie";
import { ohodnotPrijatu, sparujPrijate, type Pohyb, type PrijataFaktura } from "./prijata-parovanie";
import {
  jeFilterPlatby,
  navrhPodlaDokladu,
  navrhyZPrijatych,
  navrhyZVydanych,
  sediFiltruPlatby,
  stavPlatbyZalohy,
  type NavrhPlatbyZalohy,
} from "./zalohove-platby";

/* Prijatá zálohová: odchádzajúca platba podľa VS / účtu dodávateľa a sumy. */

const JS_IBAN = "SK0211000000002620400178";

const zalohaPrijata = (cislo: string, datum: string, z: Partial<PrijataFaktura> = {}): PrijataFaktura => ({
  id: `f${cislo}`,
  supplier_name: "JŠ servis, s.r.o.",
  supplier_iban: JS_IBAN,
  invoice_number: cislo,
  variable_symbol: cislo,
  issue_date: datum,
  due_date: datum,
  amount_total: 900,
  currency: "EUR",
  payment_method: "prevod",
  status: "received",
  ...z,
});

const odchadzajuca = (id: string, datum: string, vs: string | null, z: Partial<Pohyb> = {}): Pohyb => ({
  id,
  booking_date: datum,
  amount: -900,
  currency: "EUR",
  variable_symbol: vs,
  counterparty: "JŠ servis, s.r.o.",
  description: null,
  ...z,
});

describe("prijatá zálohová — výber návrhu", () => {
  it("tri zálohy po 900 € od toho istého dodávateľa idú každá na svoj VS", () => {
    const zalohy = [
      zalohaPrijata("20260035", "2026-10-22"),
      zalohaPrijata("20260037", "2026-10-26"),
      zalohaPrijata("20260039", "2026-10-29"),
    ];
    const pohyby = [
      odchadzajuca("t22", "2026-10-22", "20260035"),
      odchadzajuca("t27", "2026-10-27", "20260037"),
      odchadzajuca("t29", "2026-10-29", "20260039", { counterparty_iban: JS_IBAN }),
    ];
    const zhody = sparujPrijate(pohyby, zalohy);
    const par = Object.fromEntries(zhody.map((z) => [z.purchaseInvoiceId, z.transactionId]));
    expect(par).toEqual({ f20260035: "t22", f20260037: "t27", f20260039: "t29" });
    expect(zhody.every((z) => z.istota === "auto")).toBe(true);
  });

  it("bez VS stačí účet dodávateľa — aj s medzerami v IBAN", () => {
    const h = ohodnotPrijatu(
      odchadzajuca("t", "2026-10-22", null, {
        counterparty: null,
        counterparty_iban: "SK02 1100 0000 0026 2040 0178",
      }),
      zalohaPrijata("20260035", "2026-10-22"),
    );
    expect(h?.dovody).toContain("platba na účet dodávateľa");
    expect(h?.istota).toBe("auto");
  });

  it("VS má prednosť pred účtom dodávateľa", () => {
    const h = ohodnotPrijatu(
      odchadzajuca("t", "2026-10-22", "20260035", { counterparty_iban: JS_IBAN }),
      zalohaPrijata("20260035", "2026-10-22"),
    );
    expect(h?.dovody.some((d) => d.startsWith("variabilný symbol"))).toBe(true);
    expect(h?.dovody).not.toContain("platba na účet dodávateľa");
  });

  it("iná suma ani prichádzajúca platba zálohu neuhrádza", () => {
    const f = zalohaPrijata("20260035", "2026-10-22");
    expect(ohodnotPrijatu(odchadzajuca("t", "2026-10-22", "20260035", { amount: -899 }), f)).toBeNull();
    expect(ohodnotPrijatu(odchadzajuca("t", "2026-10-22", "20260035", { amount: 900 }), f)).toBeNull();
  });

  it("číslo zálohy bez VS slúži ako symbol (26VZ00020 → 2600020)", () => {
    const h = ohodnotPrijatu(
      odchadzajuca("t", "2026-10-07", "2600020", { amount: -1500.6, counterparty: null }),
      zalohaPrijata("26VZ00020", "2026-10-07", { variable_symbol: null, amount_total: 1500.6, supplier_iban: null }),
    );
    expect(h?.istota).toBe("auto");
  });

  it("dve rovnaké zálohy (duplicita) na jeden pohyb — rozhodne človek", () => {
    const a = zalohaPrijata("9180431", "2026-10-14", { id: "a", amount_total: 14980 });
    const b = zalohaPrijata("9180431", "2026-10-14", { id: "b", amount_total: 14980 });
    const zhody = sparujPrijate([odchadzajuca("t", "2026-10-14", "9180431", { amount: -14980 })], [a, b]);
    expect(zhody).toHaveLength(1);
    expect(zhody[0]!.istota).toBe("navrh");
  });
});

/* Vydaná zálohová: prichádzajúca platba podľa VS = číslo/VS zálohovky a sumy. */

const zalohaVydana = (z: Partial<Doklad> = {}): Doklad => ({
  id: "zf1",
  invoice_number: "ZF20260002",
  variable_symbol: "20260002",
  total: 1200,
  uhradene: 0,
  currency: "EUR",
  status: "issued",
  issue_date: "2026-11-01",
  customer_name: "Odberateľ s.r.o.",
  ...z,
});

const prichadzajuca = (z: Partial<PohybVydanej> = {}): PohybVydanej => ({
  id: "p1",
  booking_date: "2026-11-05",
  amount: 1200,
  currency: "EUR",
  variable_symbol: "20260002",
  counterparty: "Odberateľ s.r.o.",
  description: null,
  ...z,
});

describe("vydaná zálohová — výber návrhu", () => {
  it("VS a suma sedia → istý návrh", () => {
    const { auto } = sparuj([prichadzajuca()], [zalohaVydana()]);
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({ invoiceId: "zf1", transactionId: "p1", suma: 1200, ciastocna: false });
  });

  it("odchádzajúca platba vydanú zálohovú neuhrádza", () => {
    const { auto, navrhy } = sparuj([prichadzajuca({ amount: -1200 })], [zalohaVydana()]);
    expect(auto.length + navrhy.length).toBe(0);
  });

  it("uhradená zálohová sa už neponúka", () => {
    const { auto, navrhy } = sparuj([prichadzajuca()], [zalohaVydana({ status: "paid" })]);
    expect(auto.length + navrhy.length).toBe(0);
  });
});

describe("zjednotenie návrhov", () => {
  it("z vydaných berie len zálohové", () => {
    const r = {
      auto: [
        {
          invoiceId: "zf1",
          transactionId: "p1",
          suma: 1200,
          istota: "auto",
          dovody: ["suma sedí presne"],
          transakcia: { booking_date: "2026-11-05", amount: 1200, currency: "EUR", variable_symbol: "20260002", counterparty: "X" },
          faktura: { type: "proforma" },
        },
        { invoiceId: "f9", transactionId: "p2", suma: 50, istota: "auto", dovody: [], faktura: { type: "regular" } },
      ],
      navrhy: [],
    };
    const n = navrhyZVydanych(r);
    expect(n.map((x) => x.dokladId)).toEqual(["zf1"]);
    expect(n[0]!.pohyb?.variable_symbol).toBe("20260002");
    // Zoznam id má prednosť pred druhom.
    expect(navrhyZVydanych(r, new Set(["f9"])).map((x) => x.dokladId)).toEqual(["f9"]);
  });

  it("z prijatých berie sumu z pohybu (kladne)", () => {
    const n = navrhyZPrijatych([
      {
        purchaseInvoiceId: "f1",
        transactionId: "t1",
        istota: "navrh",
        dovody: [],
        pohyb: { booking_date: "2026-10-22", amount: -900, currency: "EUR", variable_symbol: null, counterparty: null },
      },
    ]);
    expect(n[0]).toMatchObject({ dokladId: "f1", suma: 900, istota: "navrh" });
  });

  it("pri viacerých návrhoch k jednej zálohe vyhráva istý", () => {
    const n = (t: string, istota: "auto" | "navrh"): NavrhPlatbyZalohy => ({
      dokladId: "z",
      transactionId: t,
      suma: 1,
      istota,
      dovody: [],
      pohyb: null,
    });
    expect(navrhPodlaDokladu([n("a", "navrh"), n("b", "auto"), n("c", "navrh")]).get("z")?.transactionId).toBe("b");
  });
});

describe("stav a filter Platba", () => {
  const otvorena = { status: "received", payment_method: "prevod", payment_date: null };

  it("nájdená / nenájdená / spárovaná", () => {
    expect(stavPlatbyZalohy(otvorena, "prijata", { sparovana: false, maNavrh: true })).toBe("navrh");
    expect(stavPlatbyZalohy(otvorena, "prijata", { sparovana: false, maNavrh: false })).toBe("nenajdena");
    expect(stavPlatbyZalohy({ ...otvorena, status: "paid" }, "prijata", { sparovana: true, maNavrh: false })).toBe(
      "sparovana",
    );
  });

  it("ručne uhradená, hotovosť a koncept nemajú ikonku", () => {
    expect(stavPlatbyZalohy({ ...otvorena, payment_date: "2026-10-01" }, "prijata", { sparovana: false, maNavrh: false })).toBeNull();
    expect(stavPlatbyZalohy({ status: "issued", payment_method: "cash" }, "vydana", { sparovana: false, maNavrh: false })).toBeNull();
    expect(stavPlatbyZalohy({ status: "draft", payment_method: "bank_transfer" }, "vydana", { sparovana: false, maNavrh: false })).toBeNull();
    expect(stavPlatbyZalohy({ status: "issued", payment_method: "bank_transfer" }, "vydana", { sparovana: false, maNavrh: false })).toBe(
      "nenajdena",
    );
  });

  it("filter", () => {
    expect(sediFiltruPlatby("uhradene", true, null)).toBe(true);
    expect(sediFiltruPlatby("uhradene", false, "nenajdena")).toBe(false);
    expect(sediFiltruPlatby("navrh", false, "navrh")).toBe(true);
    expect(sediFiltruPlatby("bez", false, "nenajdena")).toBe(true);
    expect(sediFiltruPlatby("bez", false, null)).toBe(false);
    expect(sediFiltruPlatby("", false, null)).toBe(true);
    expect(jeFilterPlatby("navrh")).toBe(true);
    expect(jeFilterPlatby("sparovana")).toBe(false);
  });
});
