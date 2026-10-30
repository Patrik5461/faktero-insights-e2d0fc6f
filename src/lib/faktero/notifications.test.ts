import { describe, it, expect } from "vitest";
import {
  buildNotifications,
  applyReadState,
  daysBetween,
  dniText,
  notifikaciaNespracovanych,
  textNotifikacie,
  type AppNotification,
} from "./notifications";
import { preloz } from "@/lib/i18n/jazyk";

/** Text tak, ako ho ukáže zvonček (šablóna + params) v danom jazyku. */
const text = (
  n: AppNotification,
  pole: "title" | "detail" = "title",
  j: "sk" | "cs" | "de" = "sk",
) => preloz(j, n[pole], n.params);

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
    expect(text(n)).toContain("FV2026001");
    expect(text(n)).toContain("6 dní");
    expect(text(n, "detail")).toContain("ACME s.r.o.");
    expect(text(n, "detail")).toMatch(/120,50/);
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
    expect(text(n, "detail")).toContain("Neznámy odberateľ");
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
    expect(text(n)).toContain("12,30");
    expect(text(n)).toContain("XYZ!");
  });

  it("zvonček sa dá preložiť — číslo, dni a suma sú v params, nie v šablóne", () => {
    const out = buildNotifications({
      ...PRAZDNE,
      overdueInvoices: [
        {
          id: "a",
          invoice_number: "FV1",
          customer_name: "ACME",
          total: 10,
          currency: "EUR",
          due_date: "2026-08-06",
        },
        {
          id: "b",
          invoice_number: "FV2",
          customer_name: "ACME",
          total: 10,
          currency: "EUR",
          due_date: "2026-08-04",
        },
        {
          id: "c",
          invoice_number: "FV3",
          customer_name: "ACME",
          total: 10,
          currency: "EUR",
          due_date: "2026-07-01",
        },
      ],
      overduePurchases: [
        {
          id: "p",
          invoice_number: "D1",
          supplier_name: null,
          amount_total: 5,
          currency: "EUR",
          due_date: "2026-08-05",
        },
      ],
    });
    const nadpis = (id: string, j: "sk" | "cs" | "de") =>
      text(
        out.find((n) => n.to.endsWith(`/${id}`))!,
        "title",
        j,
      );
    expect(nadpis("a", "sk")).toBe("Faktúra FV1 je 1 deň po splatnosti");
    expect(nadpis("b", "sk")).toBe("Faktúra FV2 je 3 dni po splatnosti");
    expect(nadpis("c", "sk")).toBe("Faktúra FV3 je 37 dní po splatnosti");
    expect(nadpis("a", "cs")).toBe("Faktura FV1 je 1 den po splatnosti");
    expect(nadpis("b", "cs")).toBe("Faktura FV2 je 3 dny po splatnosti");
    expect(nadpis("c", "de")).toBe("Rechnung FV3 ist seit 37 Tagen überfällig");
    const prijata = out.find((n) => n.key === "purchase_overdue:p")!;
    expect(text(prijata, "title", "de")).toBe("Unbezahlte Eingangsrechnung D1");
    expect(text(prijata, "detail", "cs")).toMatch(
      /^Neznámý dodavatel · 5,00\s€ · 2 dny po splatnosti$/,
    );
    // Žiadna šablóna z buildNotifications neostane bez prekladu.
    for (const n of out)
      for (const j of ["cs", "de"] as const) {
        expect(text(n, "title", j)).not.toBe(text(n, "title", "sk"));
      }
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

describe("termíny vozového parku", () => {
  it("prepadnutá STK je nebezpečná, PZP o 10 dní varovanie, vzdialené nič", () => {
    const n = buildNotifications({
      today: "2026-10-24",
      overdueInvoices: [],
      overduePurchases: [],
      unmatchedIncoming: [],
      failedPayments: [],
      vehicleDeadlines: [
        {
          id: "v1",
          name: "Octavia",
          license_plate: "BA123XY",
          stk_do: "2026-10-20",
          pzp_do: "2026-11-03",
          havarijne_do: "2027-05-01",
        },
      ],
    });
    expect(n.map((x) => [x.key, x.severity])).toEqual([
      ["vehicle_deadline:v1:stk_do:2026-10-20", "danger"],
      ["vehicle_deadline:v1:pzp_do:2026-11-03", "warning"],
    ]);
    expect(n[1].title).toBe("PZP BA123XY: platnosť končí o 10 dní");
    expect(n[0].to).toBe("/vozovy-park/v1");
  });
});

describe("bankový účet bez pohybov", () => {
  it("vypršaný súhlas po dvoch dňoch vo zvončeku, krátky výpadok nie", () => {
    const zaklad = {
      today: "2026-10-25",
      overdueInvoices: [],
      overduePurchases: [],
      unmatchedIncoming: [],
      failedPayments: [],
    };
    const n = buildNotifications({
      ...zaklad,
      bankAccountsStale: [
        {
          id: "a1",
          iban: "SK2909000000005220542779",
          account_name: null,
          pohyby_ok_at: "2026-10-01T09:00:00Z",
          pohyby_chyba: "Súhlas banky na čítanie pohybov vypršal",
        },
        {
          id: "a2",
          iban: "SK77",
          account_name: "Bežný",
          pohyby_ok_at: "2026-10-25T05:00:00Z",
          pohyby_chyba: "401",
        },
      ],
    });
    expect(n.map((x) => x.key)).toEqual(["bank_pohyby:a1:2026-10-01"]);
    expect(n[0].severity).toBe("danger");
    expect(n[0].to).toBe("/bankove-ucty");
  });
});

describe("notifikaciaNespracovanych", () => {
  const blocek = { id: "b1", created_at: "2026-10-29T10:00:00Z" };
  const doklad = { id: "d1", created_at: "2026-10-30T08:00:00Z" };

  it("sčíta doklady z e-mailu aj bločky a vedie do Nespracovaných", () => {
    const [n] = notifikaciaNespracovanych([
      { pocet: 4, najnovsi: blocek },
      { pocet: 3, najnovsi: doklad },
    ]);
    expect(n.title).toBe("{n} nespracovaných dokladov");
    expect(n.params).toEqual({ n: 7 });
    expect(n.to).toBe("/nespracovane");
    // Kľúč podľa najnovšieho — po prečítaní sa ozve až pri ďalšom doklade.
    expect(n.key).toBe("doklady-nespracovane:d1");
    expect(n.date).toBe("2026-10-30");
  });

  it("len doklady z e-mailu (bez bločkov) sa tiež ohlásia", () => {
    const out = notifikaciaNespracovanych([
      { pocet: 0, najnovsi: null },
      { pocet: 1, najnovsi: doklad },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("1 nespracovaný doklad");
  });

  it("nedostupný zdroj sa preskočí, nič nečaká = nič", () => {
    expect(notifikaciaNespracovanych([{ pocet: 2, najnovsi: blocek }, null])[0].title).toBe(
      "{n} nespracované doklady",
    );
    expect(notifikaciaNespracovanych([{ pocet: 0, najnovsi: null }, null])).toEqual([]);
  });

  it("popis má rovnaké číslo ako nadpis (jeden čaká, viac čakajú)", () => {
    const jeden = notifikaciaNespracovanych([{ pocet: 1, najnovsi: blocek }])[0];
    expect(jeden.detail).toBe("Čaká na kontrolu a označenie ako spracovaný.");
    for (const pocet of [2, 5]) {
      const n = notifikaciaNespracovanych([{ pocet, najnovsi: blocek }])[0];
      expect(n.detail).toBe("Čakajú na kontrolu a označenie ako spracované.");
    }
  });
});

describe("textNotifikacie", () => {
  it("preloží aj textové hodnoty v params (režim DPH), mená nechá tak", () => {
    const n = {
      title: "Nastavenie DPH firmy nesedí s registrom",
      detail: "Podľa registra: {rezim}. Vo Faktere: {nastavene}.",
      params: { rezim: "Neplatiteľ DPH", nastavene: "Platiteľ DPH podľa § 4" },
    };
    const cs = (x: string, p?: Record<string, string | number>) => preloz("cs", x, p);
    expect(textNotifikacie(n, "detail", cs)).toContain("Neplátce DPH");
    expect(textNotifikacie(n, "detail", cs)).toContain("Plátce DPH podle § 4");
    const meno = {
      title: "Neuhradená prijatá faktúra {cislo}",
      detail: "",
      params: { cislo: "NK1" },
    };
    expect(textNotifikacie(meno, "title", cs)).toBe("Neuhrazená přijatá faktura NK1");
  });
});
