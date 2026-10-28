import { describe, expect, it } from "vitest";
import { prazdneUdaje } from "./nespracovane";
import { slovaZUseku, type SlovoNahladu } from "./vyber-z-dokladu";
import {
  hodnotaPola,
  najdiVSlovach,
  variantyHladania,
  zvyrazneniaUdajov,
} from "./zvyraznenie-vytazenych";

/** Riadky textu ako by ich dala textová vrstva PDF — každý riadok jeden úsek. */
function strana(riadky: string[]): SlovoNahladu[] {
  return riadky.flatMap((str, i) =>
    slovaZUseku({ str, x: 0.1, y: 0.05 * i, w: 0.01 * str.length, h: 0.03 }, (s) => s.length),
  );
}

describe("variantyHladania", () => {
  it("dátum v bežných tvaroch", () => {
    const v = variantyHladania("datum", "2026-03-05");
    expect(v).toContain("05.03.2026");
    expect(v).toContain("5.3.2026");
    expect(v).toContain("5/3/2026");
    expect(v).toContain("05.03.26");
    expect(v).toContain("2026-03-05");
  });

  it("suma s oddeľovačmi tisícov a desatinnou čiarkou aj bodkou", () => {
    const v = variantyHladania("suma", 1234.5);
    expect(v).toEqual(
      expect.arrayContaining(["1234,50", "1234.50", "1.234,50", "1,234.50", "1'234.50"]),
    );
    expect(variantyHladania("suma", 0)).toEqual([]);
    expect(variantyHladania("suma", -12.3)).toContain("12,30");
  });

  it("IBAN bez medzier, krátke hodnoty sa nehľadajú", () => {
    expect(variantyHladania("iban", "SK31 1200 0000 1987 4263 7541")).toEqual([
      "SK3112000000198742637541",
    ]);
    expect(variantyHladania("symbol", "12")).toEqual([]);
    expect(variantyHladania("ico", "00123456")).toEqual(["00123456", "123456"]);
  });
});

describe("najdiVSlovach a zvyrazneniaUdajov", () => {
  const slova = strana([
    "Faktúra č. 2026015",
    "IČO: 36 123 456 DIČ: 2020123456",
    "IČ DPH: SK 2020123456",
    "IBAN: SK31 1200 0000 1987 4263 7541",
    "Dátum vystavenia: 12. 10. 2026",
    "Dátum splatnosti: 26.10.2026 14:30",
    "Spolu na úhradu: 1 234,50 €",
    "Medzisúčet 11 234,50 a 2 234,50",
  ]);

  it("nájde IBAN s medzerami, IČO rozdelené do skupín a dátum s medzerami", () => {
    const iban = najdiVSlovach(slova, variantyHladania("iban", "SK3112000000198742637541"), "iban");
    expect(iban).toHaveLength(1);
    expect(iban[0]).toHaveLength(1);
    expect(iban[0][0].y).toBeCloseTo(0.15);
    expect(najdiVSlovach(slova, variantyHladania("ico", "36123456"), "ico")).toHaveLength(1);
    expect(
      najdiVSlovach(slova, variantyHladania("datum", "2026-10-12"), "datum")[0][0].y,
    ).toBeCloseTo(0.2);
  });

  it("hodnota sa nenalepí na susedné číslice", () => {
    // 234,50 nesmie zobrať „1 234,50" ani „11 234,50"
    expect(najdiVSlovach(slova, variantyHladania("suma", 234.5), "suma")).toHaveLength(0);
    // 1 234,50 sa nájde raz, nie v „11 234,50"
    const s = najdiVSlovach(slova, variantyHladania("suma", 1234.5), "suma");
    expect(s).toHaveLength(1);
    expect(s[0][0].y).toBeCloseTo(0.3);
    // dátum 2.10.2026 nie je v 12.10.2026
    expect(najdiVSlovach(slova, variantyHladania("datum", "2026-10-02"), "datum")).toHaveLength(0);
  });

  it("zvýraznenia pre vyplnené polia dokladu", () => {
    const u = prazdneUdaje();
    u.cislo = "2026015";
    u.vs = "2026015";
    u.dodavatel.icDph = "SK2020123456";
    u.dodavatel.dic = "2020123456";
    u.dodavatel.iban = "SK3112000000198742637541";
    u.datumVystavenia = "2026-10-12";
    u.splatnost = "2026-10-26";
    u.celkom = 1234.5;
    const z = zvyrazneniaUdajov([slova], u);
    const kluce = new Set(z.map((x) => x.kluc));
    for (const k of [
      "cislo",
      "vs",
      "dodavatel.icDph",
      "dodavatel.dic",
      "dodavatel.iban",
      "datumVystavenia",
      "splatnost",
      "celkom",
    ])
      expect(kluce.has(k as any)).toBe(true);
    // DIČ samostatne aj vnútri IČ DPH? „SK 2020123456" — pred číslicami je písmeno K
    // len bez medzery; s medzerou sa nájde aj tam. Stačí, že sa nájde.
    expect(z.every((x) => x.strana === 0)).toBe(true);
  });

  it("obrázok bez textovej vrstvy nič nezvýrazní", () => {
    const u = prazdneUdaje();
    u.cislo = "2026015";
    expect(zvyrazneniaUdajov([[]], u)).toEqual([]);
  });

  it("hodnotaPola", () => {
    const u = prazdneUdaje();
    expect(hodnotaPola(u, "cislo")).toBeNull();
    u.dodavatel.ico = " 123 ";
    expect(hodnotaPola(u, "dodavatel.ico")).toBe("123");
    u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    expect(hodnotaPola(u, "celkom")).toBe(123);
  });
});
