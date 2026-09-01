import { describe, it, expect } from "vitest";
import {
  jeOtvorena,
  jePoTermine,
  maRezervovat,
  novoVybavene,
  percentoVybavenia,
  polozkyNaFakturu,
  saDaZmazat,
  stavPodlaVybavenia,
  suctyObjednavky,
  zostavaVybavit,
} from "./objednavky-odberatel";

describe("zostavaVybavit", () => {
  it("odpočíta vyfakturované", () => {
    expect(zostavaVybavit({ quantity: 10, invoiced_quantity: 4 })).toBe(6);
  });

  // Vyfakturovať sa dá aj viac, než bolo objednané (doobjednanie na tú istú
  // faktúru). Objednávke tým nevzniká záporný dlh.
  it("nadmerná fakturácia nedá záporný zostatok", () => {
    expect(zostavaVybavit({ quantity: 5, invoiced_quantity: 8 })).toBe(0);
  });

  it("chýbajúce hodnoty sa berú ako nula", () => {
    expect(zostavaVybavit({})).toBe(0);
    expect(zostavaVybavit({ quantity: 3 })).toBe(3);
  });

  it("množstvá ako reťazce z PostgREST", () => {
    expect(zostavaVybavit({ quantity: "2.5", invoiced_quantity: "0.5" })).toBe(2);
  });

  it("desatinné množstvá sa nerozsypú na plávajúcej čiarke", () => {
    expect(zostavaVybavit({ quantity: 0.3, invoiced_quantity: 0.1 })).toBe(0.2);
  });
});

describe("stavPodlaVybavenia", () => {
  it("nič vyfakturované — ostáva potvrdená", () => {
    expect(stavPodlaVybavenia([{ quantity: 5, invoiced_quantity: 0 }], "confirmed")).toBe(
      "confirmed",
    );
  });

  it("časť vyfakturovaná", () => {
    expect(stavPodlaVybavenia([{ quantity: 5, invoiced_quantity: 2 }], "confirmed")).toBe(
      "partially_invoiced",
    );
  });

  it("všetko vyfakturované", () => {
    expect(
      stavPodlaVybavenia(
        [
          { quantity: 5, invoiced_quantity: 5 },
          { quantity: 2, invoiced_quantity: 2 },
        ],
        "partially_invoiced",
      ),
    ).toBe("completed");
  });

  // Zrušená objednávka sa faktúrou nevzkriesi a rozpracovaná sa nepotvrdí sama.
  it("zrušená a rozpracovaná ostávajú, kde sú", () => {
    expect(stavPodlaVybavenia([{ quantity: 5, invoiced_quantity: 5 }], "cancelled")).toBe(
      "cancelled",
    );
    expect(stavPodlaVybavenia([{ quantity: 5, invoiced_quantity: 5 }], "draft")).toBe("draft");
  });

  it("objednávka bez položiek stav nemení", () => {
    expect(stavPodlaVybavenia([], "confirmed")).toBe("confirmed");
  });

  it("jedna položka vybavená, druhá nie — čiastočne", () => {
    expect(
      stavPodlaVybavenia(
        [
          { quantity: 5, invoiced_quantity: 5 },
          { quantity: 3, invoiced_quantity: 0 },
        ],
        "confirmed",
      ),
    ).toBe("partially_invoiced");
  });
});

describe("jeOtvorena, saDaZmazat, maRezervovat", () => {
  it("otvorená je všetko okrem vybavenej a zrušenej", () => {
    expect(jeOtvorena("draft")).toBe(true);
    expect(jeOtvorena("confirmed")).toBe(true);
    expect(jeOtvorena("partially_invoiced")).toBe(true);
    expect(jeOtvorena("completed")).toBe(false);
    expect(jeOtvorena("cancelled")).toBe(false);
  });

  // Potvrdená objednávka je záväzok voči odberateľovi — tá sa najprv ruší.
  // Zrušená už je len riadok v zozname, ten sa upratať dá.
  it("mazať sa dá rozpracovaná a zrušená", () => {
    expect(saDaZmazat("draft")).toBe(true);
    expect(saDaZmazat("cancelled")).toBe(true);
    expect(saDaZmazat("confirmed")).toBe(false);
    expect(saDaZmazat("partially_invoiced")).toBe(false);
    expect(saDaZmazat("completed")).toBe(false);
  });

  it("rezervuje sa len potvrdená a čiastočne vybavená", () => {
    expect(maRezervovat("draft")).toBe(false);
    expect(maRezervovat("confirmed")).toBe(true);
    expect(maRezervovat("partially_invoiced")).toBe(true);
    expect(maRezervovat("completed")).toBe(false);
    expect(maRezervovat("cancelled")).toBe(false);
  });
});

describe("suctyObjednavky", () => {
  const polozky = [
    { quantity: 2, unit_price: 100, vat_rate: 23, invoiced_quantity: 0 },
    { quantity: 1, unit_price: 50, vat_rate: 19, invoiced_quantity: 1 },
  ];

  it("spočíta základ, DPH a celkom", () => {
    const s = suctyObjednavky(polozky);
    expect(s.subtotal).toBe(250);
    expect(s.vat_total).toBe(55.5);
    expect(s.total).toBe(305.5);
  });

  it("zostáva vybaviť len nevyfakturovanú časť", () => {
    expect(suctyObjednavky(polozky).zostava).toBe(200);
  });

  it("prázdna objednávka je nula, nie NaN", () => {
    const s = suctyObjednavky([]);
    expect(s.total).toBe(0);
    expect(s.zostava).toBe(0);
  });

  it("sumy ako reťazce sa sčítajú ako čísla", () => {
    const s = suctyObjednavky([{ quantity: "3", unit_price: "0.10", vat_rate: "0" }]);
    expect(s.subtotal).toBe(0.3);
  });
});

describe("polozkyNaFakturu", () => {
  it("berie len to, čo zostáva", () => {
    const r = polozkyNaFakturu([
      { quantity: 10, invoiced_quantity: 4 },
      { quantity: 2, invoiced_quantity: 2 },
      { quantity: 5, invoiced_quantity: 0 },
    ]);
    expect(r.map((p) => p.quantity)).toEqual([6, 5]);
  });

  // Bez tohto by sa pri druhej faktúre z tej istej objednávky vyfakturovalo
  // druhýkrát to isté.
  it("úplne vybavená objednávka nedá žiadnu položku", () => {
    expect(polozkyNaFakturu([{ quantity: 3, invoiced_quantity: 3 }])).toHaveLength(0);
  });

  it("ostatné polia položky ostávajú", () => {
    const r = polozkyNaFakturu([
      { quantity: 4, invoiced_quantity: 1, unit_price: 12, vat_rate: 23 } as any,
    ]);
    expect(r[0]).toMatchObject({ quantity: 3, unit_price: 12, vat_rate: 23 });
  });
});

describe("novoVybavene", () => {
  it("pripočíta vyfakturované množstvo", () => {
    expect(novoVybavene({ quantity: 10, invoiced_quantity: 2 }, 3)).toBe(5);
  });

  // Faktúra na väčšie množstvo, než objednávka mala, nesmie stav prehnať
  // cez sto percent — inak by „vybavená" objednávka vyzerala ako chyba.
  it("viac než zostáva sa nezapočíta", () => {
    expect(novoVybavene({ quantity: 10, invoiced_quantity: 8 }, 5)).toBe(10);
  });

  it("záporné množstvo nič neuberie", () => {
    expect(novoVybavene({ quantity: 10, invoiced_quantity: 4 }, -3)).toBe(4);
  });
});

describe("percentoVybavenia", () => {
  it("počíta z množstiev, nie z počtu položiek", () => {
    expect(
      percentoVybavenia([
        { quantity: 90, invoiced_quantity: 90 },
        { quantity: 10, invoiced_quantity: 0 },
      ]),
    ).toBe(90);
  });

  it("prázdna objednávka je nula, nie NaN", () => {
    expect(percentoVybavenia([])).toBe(0);
    expect(percentoVybavenia([{ quantity: 0, invoiced_quantity: 0 }])).toBe(0);
  });

  it("nadmerná fakturácia nedá viac ako sto", () => {
    expect(percentoVybavenia([{ quantity: 5, invoiced_quantity: 20 }])).toBe(100);
  });
});

describe("jePoTermine", () => {
  it("otvorená objednávka s termínom v minulosti", () => {
    expect(jePoTermine("2026-08-01", "confirmed", "2026-08-10")).toBe(true);
  });

  it("termín dnes ešte po termíne nie je", () => {
    expect(jePoTermine("2026-08-10", "confirmed", "2026-08-10")).toBe(false);
  });

  it("vybavená ani zrušená po termíne nie je", () => {
    expect(jePoTermine("2026-08-01", "completed", "2026-08-10")).toBe(false);
    expect(jePoTermine("2026-08-01", "cancelled", "2026-08-10")).toBe(false);
  });

  it("rozpracovaná objednávka termín nestráži", () => {
    expect(jePoTermine("2026-08-01", "draft", "2026-08-10")).toBe(false);
  });

  it("bez termínu sa nič nestráži", () => {
    expect(jePoTermine(null, "confirmed", "2026-08-10")).toBe(false);
    expect(jePoTermine("", "confirmed", "2026-08-10")).toBe(false);
  });
});
