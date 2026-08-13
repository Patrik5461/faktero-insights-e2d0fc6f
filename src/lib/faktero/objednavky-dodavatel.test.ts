import { describe, it, expect } from "vitest";
import {
  jeOtvorena,
  objednaneNaCeste,
  stavPodlaPrijatia,
  suctyObjednavky,
  zostavaPrijat,
} from "./objednavky-dodavatel";

describe("zostavaPrijat", () => {
  it("počíta, koľko ešte neprišlo", () => {
    expect(zostavaPrijat({ quantity: 10, received_quantity: 4 })).toBe(6);
    expect(zostavaPrijat({ quantity: 10, received_quantity: 0 })).toBe(10);
  });

  it("nadmerný príjem nerobí záporný zvyšok", () => {
    expect(zostavaPrijat({ quantity: 10, received_quantity: 12 })).toBe(0);
  });

  it("desatinné množstvá nezanechajú chvost v pohyblivej čiarke", () => {
    expect(zostavaPrijat({ quantity: 0.3, received_quantity: 0.1 })).toBe(0.2);
  });
});

describe("stavPodlaPrijatia", () => {
  it("nič neprišlo — ostáva odoslaná", () => {
    expect(stavPodlaPrijatia([{ quantity: 10, received_quantity: 0 }], "sent")).toBe("sent");
  });

  it("časť prišla — čiastočne prijatá", () => {
    expect(stavPodlaPrijatia([{ quantity: 10, received_quantity: 4 }], "sent")).toBe(
      "partially_received",
    );
  });

  it("všetko prišlo — prijatá", () => {
    expect(
      stavPodlaPrijatia(
        [
          { quantity: 10, received_quantity: 10 },
          { quantity: 5, received_quantity: 5 },
        ],
        "partially_received",
      ),
    ).toBe("received");
  });

  it("jedna položka chýba — ešte nie je vybavená", () => {
    expect(
      stavPodlaPrijatia(
        [
          { quantity: 10, received_quantity: 10 },
          { quantity: 5, received_quantity: 4 },
        ],
        "sent",
      ),
    ).toBe("partially_received");
  });

  it("nadmerný príjem uzavrie objednávku", () => {
    expect(stavPodlaPrijatia([{ quantity: 10, received_quantity: 11 }], "sent")).toBe("received");
  });

  // Zrušená objednávka sa nesmie dostať späť do hry len preto, že niečo prišlo.
  it("zrušenú objednávku príjem nevzkriesi", () => {
    expect(stavPodlaPrijatia([{ quantity: 10, received_quantity: 10 }], "cancelled")).toBe(
      "cancelled",
    );
  });

  it("rozpracovanú objednávku prepočet stavu nemení", () => {
    expect(stavPodlaPrijatia([{ quantity: 10, received_quantity: 0 }], "draft")).toBe("draft");
  });

  it("objednávka bez položiek si stav ponechá", () => {
    expect(stavPodlaPrijatia([], "sent")).toBe("sent");
  });
});

describe("jeOtvorena", () => {
  it("v hre sú len odoslané a čiastočne prijaté", () => {
    expect(jeOtvorena("sent")).toBe(true);
    expect(jeOtvorena("partially_received")).toBe(true);
    expect(jeOtvorena("draft")).toBe(false);
    expect(jeOtvorena("received")).toBe(false);
    expect(jeOtvorena("cancelled")).toBe(false);
  });
});

describe("objednaneNaCeste", () => {
  it("spočíta zvyšky naprieč objednávkami", () => {
    const m = objednaneNaCeste([
      { stock_item_id: "a", quantity: 10, received_quantity: 4, stav: "partially_received" },
      { stock_item_id: "a", quantity: 5, received_quantity: 0, stav: "sent" },
      { stock_item_id: "b", quantity: 3, received_quantity: 0, stav: "sent" },
    ]);
    expect(m.get("a")).toBe(11);
    expect(m.get("b")).toBe(3);
  });

  // Toto je jadro veci: rozpracovanú objednávku nikto neodoslal, takže tovar
  // nikto neposiela a do „na ceste" nepatrí.
  it("rozpracované a zrušené objednávky sa nerátajú", () => {
    const m = objednaneNaCeste([
      { stock_item_id: "a", quantity: 10, received_quantity: 0, stav: "draft" },
      { stock_item_id: "a", quantity: 10, received_quantity: 0, stav: "cancelled" },
    ]);
    expect(m.has("a")).toBe(false);
  });

  it("úplne prijatá položka už na ceste nie je", () => {
    const m = objednaneNaCeste([
      { stock_item_id: "a", quantity: 10, received_quantity: 10, stav: "partially_received" },
    ]);
    expect(m.has("a")).toBe(false);
  });

  it("položka bez väzby na skladovú kartu sa preskočí", () => {
    const m = objednaneNaCeste([
      { stock_item_id: null, quantity: 10, received_quantity: 0, stav: "sent" },
    ]);
    expect(m.size).toBe(0);
  });
});

describe("suctyObjednavky", () => {
  it("spočíta základ, daň a celkovú sumu", () => {
    const s = suctyObjednavky([
      { quantity: 10, received_quantity: 0, unit_price: 2.5, vat_rate: 23 },
      { quantity: 4, received_quantity: 0, unit_price: 10, vat_rate: 19 },
    ]);
    expect(s.subtotal).toBe(65);
    expect(s.vat_total).toBe(13.35);
    expect(s.total).toBe(78.35);
  });

  it("prázdna objednávka má nuly", () => {
    expect(suctyObjednavky([])).toEqual({ subtotal: 0, vat_total: 0, total: 0 });
  });

  it("chýbajúca cena alebo sadzba nezhodí súčet", () => {
    const s = suctyObjednavky([{ quantity: 3, received_quantity: 0 }]);
    expect(s.total).toBe(0);
  });
});
