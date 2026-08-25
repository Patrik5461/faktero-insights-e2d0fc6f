import { describe, it, expect } from "vitest";
import { buildNotifications, applyReadState, daysBetween, dniText } from "./notifications";

const PRAZDNE = {
  today: "2026-08-07",
  overdueInvoices: [],
  overduePurchases: [],
  unmatchedIncoming: [],
  failedPayments: [],
};

describe("daysBetween", () => {
  it("počíta celé dni", () => {
    expect(daysBetween("2026-08-01", "2026-08-07")).toBe(6);
    expect(daysBetween("2026-08-07", "2026-08-07")).toBe(0);
  });

  it("prejde cez zmenu času aj cez prestupný rok", () => {
    // Koniec marca: v tomto pásme sa mení čas, rozdiel musí ostať celé dni.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("nezmyselný dátum nezhodí výpočet", () => {
    expect(daysBetween("nedatum", "2026-08-07")).toBe(0);
  });
});

describe("dniText", () => {
  it("skloňuje", () => {
    expect(dniText(1)).toBe("1 deň");
    expect(dniText(3)).toBe("3 dni");
    expect(dniText(12)).toBe("12 dní");
  });
});

describe("buildNotifications", () => {
  it("bez podkladov nevráti nič", () => {
    expect(buildNotifications(PRAZDNE)).toEqual([]);
  });

  it("faktúra po splatnosti: kľúč, cieľ a suma", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "abc",
          invoice_number: "FV2026001",
          customer_name: "ACME s.r.o.",
          total: 120.5,
          currency: "EUR",
          due_date: "2026-08-01",
        },
      ],
    });
    expect(n.key).toBe("invoice_overdue:abc");
    expect(n.to).toBe("/faktury/abc");
    expect(n.title).toContain("FV2026001");
    expect(n.title).toContain("6 dní");
    expect(n.detail).toContain("ACME s.r.o.");
    expect(n.detail).toMatch(/120,50/);
    expect(n.severity).toBe("warning");
  });

  it("mesiac po splatnosti je už vážne", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "x",
          invoice_number: "F1",
          customer_name: null,
          total: 10,
          currency: "EUR",
          due_date: "2026-06-01",
        },
      ],
    });
    expect(n.severity).toBe("danger");
    expect(n.detail).toContain("Neznámy odberateľ");
  });

  it("faktúra, ktorej splatnosť ešte nenastala, sa nehlási", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "x",
          invoice_number: "F1",
          customer_name: null,
          total: 10,
          currency: "EUR",
          due_date: "2026-08-20",
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("faktúra splatná dnes sa ešte nehlási", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "x",
          invoice_number: "F1",
          customer_name: null,
          total: 10,
          currency: "EUR",
          due_date: "2026-08-07",
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("faktúra bez dátumu splatnosti sa preskočí", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "x",
          invoice_number: "F1",
          customer_name: null,
          total: 10,
          currency: "EUR",
          due_date: null,
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("nepriradená platba vedie na transakcie", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      unmatchedIncoming: [
        {
          id: "t1",
          booking_date: "2026-08-05",
          amount: 55,
          currency: "EUR",
          counterparty: "Jozef Mrkva",
          variable_symbol: "123",
        },
      ],
    });
    expect(n.key).toBe("bank_unmatched:t1");
    expect(n.to).toBe("/bankove-ucty/transakcie");
    expect(n.detail).toBe("Jozef Mrkva · VS 123");
    expect(n.severity).toBe("info");
  });

  it("zamietnutá platba vedie na svoju faktúru", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      failedPayments: [
        {
          id: "p1",
          purchase_invoice_id: "pf1",
          creditor_name: "Dodávateľ",
          amount: 20,
          currency: "EUR",
          status: "rejected",
          error_message: null,
          updated_at: "2026-08-06T10:00:00Z",
        },
      ],
    });
    expect(n.to).toBe("/prijate-faktury/pf1");
    expect(n.detail).toContain("banka platbu zamietla");
    expect(n.severity).toBe("danger");
  });

  it("platba bez faktúry vedie aspoň na bankové účty", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      failedPayments: [
        {
          id: "p1",
          purchase_invoice_id: null,
          creditor_name: null,
          amount: 20,
          currency: "EUR",
          status: "failed",
          error_message: "timeout",
          updated_at: null,
        },
      ],
    });
    expect(n.to).toBe("/bankove-ucty");
    expect(n.detail).toContain("timeout");
  });

  it("radí najprv najzávažnejšie, potom najstaršie", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "novsia",
          invoice_number: "B",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-08-05",
        },
        {
          id: "starsia",
          invoice_number: "A",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-08-02",
        },
      ],
      unmatchedIncoming: [
        {
          id: "t",
          booking_date: "2026-08-06",
          amount: 1,
          currency: "EUR",
          counterparty: null,
          variable_symbol: null,
        },
      ],
      failedPayments: [
        {
          id: "p",
          purchase_invoice_id: null,
          creditor_name: null,
          amount: 1,
          currency: "EUR",
          status: "rejected",
          error_message: null,
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
    expect(out.map((n) => n.key)).toEqual([
      "payment_failed:p",
      "invoice_overdue:starsia",
      "invoice_overdue:novsia",
      "bank_unmatched:t",
    ]);
  });

  it("oznamy idú od najnovšieho, dlhy od najstaršieho", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      unmatchedIncoming: [
        {
          id: "stara",
          booking_date: "2026-08-01",
          amount: 1,
          currency: "EUR",
          counterparty: null,
          variable_symbol: null,
        },
        {
          id: "nova",
          booking_date: "2026-08-06",
          amount: 1,
          currency: "EUR",
          counterparty: null,
          variable_symbol: null,
        },
      ],
      overdueInvoices: [
        {
          id: "nedavna",
          invoice_number: "B",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-08-05",
        },
        {
          id: "davna",
          invoice_number: "A",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-07-01",
        },
      ],
    });
    expect(out.map((n) => n.key)).toEqual([
      "invoice_overdue:davna",
      "invoice_overdue:nedavna",
      "bank_unmatched:nova",
      "bank_unmatched:stara",
    ]);
  });

  it("neznáma mena nezhodí formátovanie sumy", () => {
    const [n] = buildNotifications({
      ...PRAZDNE,
      unmatchedIncoming: [
        {
          id: "t",
          booking_date: "2026-08-06",
          amount: 12.3,
          currency: "XYZ!",
          counterparty: null,
          variable_symbol: null,
        },
      ],
    });
    // Slovenské formátovanie používa desatinnú čiarku; podstatné je, že sa
    // suma vypíše aj s nezmyselným kódom a nič sa nezhodí.
    expect(n.title).toContain("12,30");
    expect(n.title).toContain("XYZ!");
  });
});

describe("applyReadState", () => {
  it("označí prečítané a spočíta zvyšok", () => {
    const items = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "a",
          invoice_number: "A",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-08-01",
        },
        {
          id: "b",
          invoice_number: "B",
          customer_name: null,
          total: 1,
          currency: "EUR",
          due_date: "2026-08-02",
        },
      ],
    });
    const r = applyReadState(items, ["invoice_overdue:a"]);
    expect(r.unread).toBe(1);
    expect(r.items.find((n) => n.key === "invoice_overdue:a")?.read).toBe(true);
    expect(r.items.find((n) => n.key === "invoice_overdue:b")?.read).toBe(false);
  });

  it("prečítaný kľúč, ktorý už nie je aktuálny, nič nepokazí", () => {
    const r = applyReadState([], ["invoice_overdue:davno-zaplatena"]);
    expect(r.unread).toBe(0);
    expect(r.items).toEqual([]);
  });
});
