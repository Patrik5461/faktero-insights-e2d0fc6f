import { describe, expect, it } from "vitest";
import {
  hodnotaZKliku,
  normalizuj,
  poleVyberu,
  polePodlaPopisu,
  precitajDatum,
  precitajIban,
  precitajSumu,
  zapisDoUdajov,
  slovaZUseku,
  slovoNaBode,
  slovaVObdlzniku,
  textZoSlov,
  obdlznikZBodov,
  poliaPreDruh,
} from "./vyber-z-dokladu";
import { prazdneUdaje } from "./nespracovane";

describe("sumy", () => {
  it.each([
    ["1 234,50", 1234.5],
    ["1 234,50 €", 1234.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["1234.5", 1234.5],
    ["12,30 EUR", 12.3],
    ["EUR 1'234.50", 1234.5],
    ["1 234 567,89", 1234567.89],
    ["1.234", 1234],
    ["0,500", 0.5],
    ["-12,30", -12.3],
    ["Spolu k úhrade: 99,90 €", 99.9],
    ["120", 120],
  ])("%s → %s", (vstup, vystup) => {
    expect(precitajSumu(vstup)).toBe(vystup);
  });

  it("text bez čísla nie je suma", () => {
    expect(precitajSumu("Spolu")).toBeNull();
  });
});

describe("dátumy", () => {
  it.each([
    ["12.10.2026", "2026-10-12"],
    ["12. 10. 2026", "2026-10-12"],
    ["1.2.2026", "2026-02-01"],
    ["12/10/2026", "2026-10-12"],
    ["12-10-2026", "2026-10-12"],
    ["12.10.26", "2026-10-12"],
    ["2026-10-12", "2026-10-12"],
    ["Dátum vystavenia: 05.01.2026", "2026-01-05"],
    ["12. októbra 2026", "2026-10-12"],
    ["3. června 2026", "2026-06-03"],
    ["3. července 2026", "2026-07-03"],
    ["12 Oct 2026", "2026-10-12"],
    ["October 12, 2026", "2026-10-12"],
  ])("%s → %s", (vstup, vystup) => {
    expect(precitajDatum(vstup)).toBe(vystup);
  });

  it("neexistujúci dátum sa nevezme", () => {
    expect(precitajDatum("31.02.2026")).toBeNull();
    expect(precitajDatum("faktúra")).toBeNull();
  });
});

describe("IBAN, IČO, DIČ, IČ DPH, symboly", () => {
  it("IBAN bez medzier a bez BIC za ním", () => {
    expect(precitajIban("SK31 1200 0000 1987 4263 7541")).toBe("SK3112000000198742637541");
    expect(precitajIban("IBAN: sk31 1200 0000 1987 4263 7541 TATRSKBX")).toBe(
      "SK3112000000198742637541",
    );
  });

  it("IČO len číslice, doplnené na osem", () => {
    expect(normalizuj("ico", "IČO: 123 45 678")).toBe("12345678");
    expect(normalizuj("ico", "654321")).toBe("00654321");
    expect(normalizuj("ico", "IČO")).toBeNull();
  });

  it("DIČ — slovenské desať číslic, české s CZ", () => {
    expect(normalizuj("dic", "DIČ: 2020123456")).toBe("2020123456");
    expect(normalizuj("dic", "DIČ: CZ12345678")).toBe("CZ12345678");
  });

  it("IČ DPH s predponou krajiny, bez medzier", () => {
    expect(normalizuj("icdph", "IČ DPH: SK 2020123456")).toBe("SK2020123456");
    expect(normalizuj("icdph", "sk2020123456")).toBe("SK2020123456");
  });

  it("VS len číslice", () => {
    expect(normalizuj("symbol", "VS: 2026001")).toBe("2026001");
    expect(normalizuj("symbol", "0308")).toBe("0308");
  });

  it("PSČ a mena", () => {
    expect(normalizuj("psc", "83104 Bratislava")).toBe("831 04");
    expect(normalizuj("mena", "Spolu 12 €")).toBe("EUR");
    expect(normalizuj("mena", "Sum CZK")).toBe("CZK");
  });

  it("číslo dokladu bez popisu", () => {
    expect(normalizuj("cislo", "Faktúra č.: FA2026-001")).toBe("FA2026-001");
    expect(normalizuj("cislo", "Faktúra č. 2026001")).toBe("2026001");
    expect(normalizuj("cislo", "2026001")).toBe("2026001");
  });
});

describe("kliknutie do úseku textu", () => {
  const usek = "Spolu k úhrade: 1 234,50 EUR";
  it("klik na časť sumy vezme celú sumu", () => {
    const od = usek.indexOf("234,50");
    expect(hodnotaZKliku(poleVyberu("celkom"), usek, od, od + 6)).toBe(1234.5);
  });

  it("klik na popis pri dátume nájde dátum v tom istom úseku", () => {
    const u = "Dátum vystavenia: 12. 10. 2026";
    expect(hodnotaZKliku(poleVyberu("datumVystavenia"), u, 0, 5)).toBe("2026-10-12");
  });

  it("klik na kus IBAN-u vezme celý IBAN", () => {
    const u = "IBAN: SK31 1200 0000 1987 4263 7541";
    const od = u.indexOf("0000");
    expect(hodnotaZKliku(poleVyberu("dodavatel.iban"), u, od, od + 4)).toBe(
      "SK3112000000198742637541",
    );
  });

  it("číslo dokladu je jedno slovo", () => {
    const u = "Faktúra číslo 2026001";
    const od = u.indexOf("2026001");
    expect(hodnotaZKliku(poleVyberu("cislo"), u, od, od + 7)).toBe("2026001");
  });

  it("názov firmy berie celý úsek", () => {
    expect(hodnotaZKliku(poleVyberu("dodavatel.nazov"), "Tobify s.r.o.", 0, 6)).toBe(
      "Tobify s.r.o.",
    );
  });
});

describe("pole podľa popisu vo formulári", () => {
  it.each([
    ["Číslo dokladu", "cislo"],
    ["Číslo dokladu naučené", "cislo"],
    ["Číslo dodacieho listu", "dodaciList"],
    ["IČO", "dodavatel.ico"],
    ["IČ DPH", "dodavatel.icDph"],
    ["Dátum dodania (DUZP)", "datumDodania"],
    ["Popis plnenia (text faktúry v Pohode)", "popis"],
    ["Suma spolu", "celkom"],
    ["Konštantný symbol", "ks"],
  ])("%s → %s", (popis, kluc) => {
    expect(polePodlaPopisu(popis)).toBe(kluc);
  });

  it("neznáme pole nič nezapne", () => {
    expect(polePodlaPopisu("Druh dokladu")).toBeNull();
    expect(polePodlaPopisu("Menovka")).toBeNull();
  });
});

describe("zápis do údajov", () => {
  it("vnorené aj ploché polia, pôvodné ostanú nedotknuté", () => {
    const u = prazdneUdaje();
    const a = zapisDoUdajov(u, "dodavatel.ico", "12345678");
    expect(a.dodavatel.ico).toBe("12345678");
    expect(u.dodavatel.ico).toBe("");
    expect(zapisDoUdajov(u, "celkom", 99.9).celkom).toBe(99.9);
    expect(zapisDoUdajov(u, "ostatny.lehota", "2026-10-12").ostatny.lehota).toBe("2026-10-12");
    expect(zapisDoUdajov(u, "vs", "2026001").vs).toBe("2026001");
  });
});

describe("slová v náhľade", () => {
  const zmeraj = (s: string) => s.length;
  const slova = slovaZUseku({ str: "VS: 2026001", x: 0.1, y: 0.2, w: 0.22, h: 0.02 }, zmeraj);

  it("úsek sa rozloží na slová s polohou", () => {
    expect(slova.map((s) => s.text)).toEqual(["VS:", "2026001"]);
    expect(slova[1].x).toBeCloseTo(0.1 + (4 / 11) * 0.22);
    expect(slova[1].w).toBeCloseTo((7 / 11) * 0.22);
  });

  it("bod nájde slovo, mimo neho nič", () => {
    expect(slovoNaBode(slova, 0.25, 0.21)).toBe(1);
    expect(slovoNaBode(slova, 0.9, 0.9)).toBe(-1);
  });

  it("obdĺžnik vyberie slová a poskladá ich po riadkoch", () => {
    const druhy = slovaZUseku({ str: "1 234,50 EUR", x: 0.1, y: 0.3, w: 0.24, h: 0.02 }, zmeraj);
    const vsetky = [...druhy, ...slova];
    const r = obdlznikZBodov(0.5, 0.35, 0.05, 0.15);
    expect(textZoSlov(slovaVObdlzniku(vsetky, r))).toBe("VS: 2026001\n1 234,50 EUR");
    expect(normalizuj("suma", textZoSlov(slovaVObdlzniku(druhy, r)))).toBe(1234.5);
  });
});

describe("polia podľa druhu", () => {
  it("bloček nemá IBAN, iný doklad má predmet", () => {
    expect(poliaPreDruh("blocek")).not.toContain("dodavatel.iban");
    expect(poliaPreDruh("ostatny")).toContain("ostatny.predmet");
    expect(poliaPreDruh("faktura")).toContain("dodavatel.iban");
    expect(poliaPreDruh("faktura")).not.toContain("opravuje");
    expect(poliaPreDruh("dobropis")).toContain("opravuje");
  });
});
