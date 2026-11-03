import { describe, expect, it } from "vitest";
import { udajeZPrijatej } from "./nespracovane";
import {
  maStranaText,
  mierkaTextovejVrstvy,
  slovaZoZvyrazneni,
  textHodnoty,
  udajeZBlocku,
} from "./textova-vrstva";
import { slovaZUseku, type SlovoNahladu } from "./vyber-z-dokladu";
import { polePopisuDetailu, zvyrazneniaUdajov } from "./zvyraznenie-vytazenych";

function strana(riadky: string[]): SlovoNahladu[] {
  return riadky.flatMap((str, i) =>
    slovaZUseku({ str, x: 0.1, y: 0.05 * i, w: 0.01 * str.length, h: 0.03 }, (s) => s.length),
  );
}

describe("mierkaTextovejVrstvy", () => {
  it("px na bod strany — A4 (595 b) v paneli 595 px je 1, pri priblížení 2× je 2", () => {
    expect(mierkaTextovejVrstvy(595, 595)).toBe(1);
    expect(mierkaTextovejVrstvy(1190, 595)).toBe(2);
    expect(mierkaTextovejVrstvy(390, 595.28)).toBeCloseTo(0.6552, 4);
  });
  it("nezmeraná strana nedá mierku (vrstva počká na ResizeObserver)", () => {
    expect(mierkaTextovejVrstvy(0, 595)).toBe(0);
    expect(mierkaTextovejVrstvy(500, 0)).toBe(0);
    expect(mierkaTextovejVrstvy(Number.NaN, 595)).toBe(0);
  });
});

describe("maStranaText", () => {
  it("sken (len medzery alebo nič) nemá text", () => {
    expect(maStranaText({ items: [] })).toBe(false);
    expect(maStranaText({ items: [{ str: " " }, { type: "beginMarkedContent" }] })).toBe(false);
    expect(maStranaText(null)).toBe(false);
    expect(maStranaText({ items: [{ str: "Faktúra" }] })).toBe(true);
  });
});

describe("textHodnoty", () => {
  it("dátum a suma v tvare z dokladu", () => {
    expect(textHodnoty("datumVystavenia", "2026-10-12")).toBe("12.10.2026");
    expect(textHodnoty("celkom", 1234.5)).toBe("1 234,50");
    expect(textHodnoty("cislo", " FA2026001 ")).toBe("FA2026001");
    expect(textHodnoty("vs", null)).toBe("");
  });
});

describe("zvýraznenie uložených dokladov", () => {
  const row = {
    supplier_name: "Dodávateľ s.r.o.",
    supplier_ico: "12345678",
    supplier_iban: "SK3112000000198742637541",
    invoice_number: "FA2026-0042",
    variable_symbol: "20260042",
    issue_date: "2026-10-12",
    due_date: "2026-10-26",
    amount_total: 1234.5,
  };
  const slova = [
    strana([
      "Faktúra č. FA2026-0042",
      "IČO: 12345678",
      "Dátum vystavenia: 12.10.2026",
      "Splatnosť: 26.10.2026",
      "VS 20260042",
      "IBAN: SK31 1200 0000 1987 4263 7541",
      "Spolu na úhradu 1 234,50 EUR",
    ]),
  ];

  it("hodnoty prijatej faktúry sa nájdu v slovách textovej vrstvy", () => {
    const z = zvyrazneniaUdajov(slova, udajeZPrijatej(row).udaje);
    const kluce = new Set(z.map((x) => x.kluc));
    for (const k of [
      "cislo",
      "dodavatel.ico",
      "datumVystavenia",
      "splatnost",
      "vs",
      "dodavatel.iban",
      "celkom",
    ])
      expect(kluce, k).toContain(k);
    const cislo = z.find((x) => x.kluc === "cislo")!;
    expect(cislo.strana).toBe(0);
    expect(cislo.r[0].y).toBeCloseTo(0, 5);
  });

  it("bloček — číslo, IČO, dátum a suma", () => {
    const u = udajeZBlocku({
      supplier_name: "Shell",
      supplier_ico: "31322832",
      document_number: "B-77812",
      issue_date: "2026-11-01",
      total_amount: 58.2,
    });
    const z = zvyrazneniaUdajov(
      [strana(["SHELL", "IČO: 31322832", "Doklad B-77812", "01.11.2026", "SPOLU 58,20"])],
      u,
    );
    expect(new Set(z.map((x) => x.kluc))).toEqual(
      new Set(["cislo", "dodavatel.ico", "datumVystavenia", "celkom"]),
    );
  });

  it("sken: hodnoty z polôh od AI sa dajú položiť nad stranu ako slová", () => {
    const u = udajeZPrijatej(row).udaje;
    const z = zvyrazneniaUdajov([[]], u, undefined, [
      { kluc: "celkom", strana: 0, r: { x: 0.7, y: 0.8, w: 0.1, h: 0.02 }, hodnota: 1234.5 },
      { kluc: "cislo", strana: 0, r: { x: 0.6, y: 0.1, w: 0.2, h: 0.02 }, hodnota: "FA2026-0042" },
      // prepísaná hodnota — poloha už neplatí
      { kluc: "vs", strana: 0, r: { x: 0.6, y: 0.2, w: 0.2, h: 0.02 }, hodnota: "999" },
    ]);
    const s = slovaZoZvyrazneni(z, u, 0);
    expect(s.map((x) => x.text)).toEqual(["FA2026-0042", "1 234,50"]);
    expect(slovaZoZvyrazneni(z, u, 1)).toEqual([]);
  });

  it("popisy rámčekov v detaile sa mapujú na polia", () => {
    expect(polePopisuDetailu("Číslo faktúry")).toBe("cislo");
    expect(polePopisuDetailu("Dátum vydania")).toBe("datumVystavenia");
    expect(polePopisuDetailu("Dátum dodania (DUZP)")).toBe("datumDodania");
    expect(polePopisuDetailu("Dátum splatnosti")).toBe("splatnost");
    expect(polePopisuDetailu("Celková suma")).toBe("celkom");
    expect(polePopisuDetailu("Variabilný symbol")).toBe("vs");
    expect(polePopisuDetailu("IČ DPH")).toBe("dodavatel.icDph");
    expect(polePopisuDetailu("Uložil")).toBe(null);
  });
});
