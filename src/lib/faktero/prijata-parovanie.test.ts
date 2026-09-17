import { describe, expect, it } from "vitest";
import { ohodnotPrijatu, sparujPrijate, symbolFaktury } from "./prijata-parovanie";
import type { Pohyb, PrijataFaktura } from "./prijata-parovanie";

const pohyb = (z: Partial<Pohyb> = {}): Pohyb => ({
  id: "t1",
  booking_date: "2026-09-10",
  amount: -120,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  description: null,
  ...z,
});

const faktura = (z: Partial<PrijataFaktura> = {}): PrijataFaktura => ({
  id: "f1",
  supplier_name: "Alfa s.r.o.",
  invoice_number: "2026123",
  variable_symbol: null,
  issue_date: "2026-09-01",
  due_date: "2026-09-15",
  amount_total: 120,
  currency: "EUR",
  payment_method: null,
  status: "received",
  ...z,
});

describe("čo sa spárovať nemôže", () => {
  it("prichádzajúca platba záväzok neuhrádza", () => {
    expect(ohodnotPrijatu(pohyb({ amount: 120 }), faktura())).toBeNull();
  });

  it("faktúra platená hotovosťou na účte nikdy nebude", () => {
    expect(ohodnotPrijatu(pohyb(), faktura({ payment_method: "hotovost" }))).toBeNull();
  });

  it("zrušená faktúra sa neponúka", () => {
    expect(ohodnotPrijatu(pohyb(), faktura({ status: "cancelled" }))).toBeNull();
  });

  it("iná suma znamená inú faktúru — čiastočná úhrada sa neeviduje", () => {
    expect(ohodnotPrijatu(pohyb({ amount: -60 }), faktura({ amount_total: 120 }))).toBeNull();
  });

  it("iná mena sa nepáruje", () => {
    expect(ohodnotPrijatu(pohyb({ currency: "CZK" }), faktura({ currency: "EUR" }))).toBeNull();
  });

  it("platba pred vystavením faktúry to byť nemôže", () => {
    expect(
      ohodnotPrijatu(pohyb({ booking_date: "2026-08-30" }), faktura({ issue_date: "2026-09-01" })),
    ).toBeNull();
  });

  it("platba spred roka sa už nespája", () => {
    expect(
      ohodnotPrijatu(pohyb({ booking_date: "2027-09-10" }), faktura({ issue_date: "2026-09-01" })),
    ).toBeNull();
  });
});

describe("sila zhody", () => {
  it("variabilný symbol je najsilnejší údaj a stačí na istotu", () => {
    const z = ohodnotPrijatu(pohyb({ variable_symbol: "2026123" }), faktura());
    expect(z?.istota).toBe("auto");
    expect(z?.dovody.join(" ")).toContain("variabilný symbol");
  });

  it("samotná zhoda sumy na istotu nestačí", () => {
    // Paušály a nájmy chodia na rovnakú sumu — vybrať za človeka tú nesprávnu
    // je horšie než sa spýtať.
    const z = ohodnotPrijatu(pohyb(), faktura());
    expect(z?.istota).toBe("navrh");
  });

  it("meno dodávateľa v protistrane pomôže, ale samo nestačí na istotu", () => {
    const z = ohodnotPrijatu(pohyb({ counterparty: "ALFA S.R.O." }), faktura());
    expect(z?.dovody.join(" ")).toContain("Alfa s.r.o.");
    expect(z?.istota).toBe("navrh");
  });

  it("meno sa nájde aj v popise pohybu", () => {
    const z = ohodnotPrijatu(pohyb({ description: "Úhrada faktúry Alfa s.r.o." }), faktura());
    expect(z?.dovody.join(" ")).toContain("Alfa s.r.o.");
  });

  it("platba po splatnosti sa spáruje, len je slabšia", () => {
    const neskoro = ohodnotPrijatu(
      pohyb({ booking_date: "2026-11-20", variable_symbol: "2026123" }),
      faktura(),
    );
    const vcas = ohodnotPrijatu(pohyb({ variable_symbol: "2026123" }), faktura());
    expect(neskoro).not.toBeNull();
    expect(neskoro!.skore).toBeLessThan(vcas!.skore);
    expect(neskoro!.dovody.join(" ")).toContain("po splatnosti");
  });

  it("bez splatnosti sa rozhoduje len podľa sumy a symbolu", () => {
    const z = ohodnotPrijatu(pohyb({ variable_symbol: "2026123" }), faktura({ due_date: null }));
    expect(z?.istota).toBe("auto");
  });
});

describe("symbolFaktury", () => {
  it("uprednostní variabilný symbol", () => {
    expect(symbolFaktury(faktura({ variable_symbol: "555", invoice_number: "2026123" }))).toBe(
      "555",
    );
  });

  it("keď symbol chýba, platí sa číslom faktúry", () => {
    expect(symbolFaktury(faktura({ variable_symbol: null }))).toBe("2026123");
  });

  it("príliš krátky symbol sa neberie — spárovalo by sa hocičo", () => {
    expect(symbolFaktury(faktura({ variable_symbol: "7", invoice_number: "2026123" }))).toBe(
      "2026123",
    );
  });
});

describe("spárovanie viacerých naraz", () => {
  it("každý pohyb aj faktúra vystupuje najviac raz", () => {
    const pohyby = [
      pohyb({ id: "t1", variable_symbol: "111", amount: -100 }),
      pohyb({ id: "t2", variable_symbol: "222", amount: -200 }),
    ];
    const faktury = [
      faktura({ id: "fa", variable_symbol: "111", amount_total: 100 }),
      faktura({ id: "fb", variable_symbol: "222", amount_total: 200 }),
    ];

    const v = sparujPrijate(pohyby, faktury);

    expect(v).toHaveLength(2);
    expect(v.every((z) => z.istota === "auto")).toBe(true);
    expect(new Set(v.map((z) => z.transactionId)).size).toBe(2);
    expect(new Set(v.map((z) => z.purchaseInvoiceId)).size).toBe(2);
  });

  it("dve rovnako sediace faktúry nechá na človeka", () => {
    // Ten istý dodávateľ, tá istá suma, žiadny symbol — presne prípad, keď sa
    // nesmie hádať.
    const pohyby = [pohyb({ id: "t1", counterparty: "Alfa s.r.o." })];
    const faktury = [
      faktura({ id: "fa", invoice_number: "A1" }),
      faktura({ id: "fb", invoice_number: "A2" }),
    ];

    const v = sparujPrijate(pohyby, faktury);

    expect(v).toHaveLength(1);
    expect(v[0].istota).toBe("navrh");
    expect(v[0].dovody.join(" ")).toContain("rovnako dobre sedí aj iná faktúra");
  });

  it("silnejšia dvojica má prednosť pred slabšou o ten istý pohyb", () => {
    const pohyby = [pohyb({ id: "t1", variable_symbol: "999" })];
    const faktury = [
      faktura({ id: "slaba", variable_symbol: "111" }),
      faktura({ id: "silna", variable_symbol: "999" }),
    ];

    const v = sparujPrijate(pohyby, faktury);

    expect(v).toHaveLength(1);
    expect(v[0].purchaseInvoiceId).toBe("silna");
    expect(v[0].istota).toBe("auto");
  });
});
