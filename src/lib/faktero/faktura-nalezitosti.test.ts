import { describe, expect, it } from "vitest";
import { skontrolujDatumy, vetyNaDoklad, VETA_68D } from "./faktura-nalezitosti";

describe("dátum dodania", () => {
  it("platiteľ ho musí mať, neplatiteľ nie", () => {
    expect(skontrolujDatumy({ platitel: true, datumDodania: "" }).chyba).toMatch(/dátum dodania/i);
    expect(skontrolujDatumy({ platitel: false, datumDodania: "" })).toEqual({});
  });

  it("do 15 dní je ticho, nad 15 dní sa ozve lehota", () => {
    expect(
      skontrolujDatumy({ platitel: true, datumDodania: "2026-09-10", datumVystavenia: "2026-09-25" }),
    ).toEqual({});
    expect(
      skontrolujDatumy({ platitel: true, datumDodania: "2026-09-01", datumVystavenia: "2026-09-25" })
        .upozornenie,
    ).toMatch(/24 dní/);
  });

  it("dodanie po vystavení je podozrivé", () => {
    expect(
      skontrolujDatumy({ platitel: true, datumDodania: "2026-09-30", datumVystavenia: "2026-09-25" })
        .upozornenie,
    ).toMatch(/neskorší/);
  });
});

describe("vety osobitných úprav", () => {
  it("§ 68d platí pre celú firmu", () => {
    expect(vetyNaDoklad({ danZPrijatejPlatby: true })).toEqual([VETA_68D]);
  });

  it("úprava prirážky sa pridá za ňu", () => {
    expect(vetyNaDoklad({ danZPrijatejPlatby: true, osobitnaUprava: "65" })).toEqual([
      VETA_68D,
      "Úprava zdaňovania prirážky – cestovné kancelárie",
    ]);
  });

  it("neznámy kód sa ticho zahodí, nie vypíše", () => {
    expect(vetyNaDoklad({ osobitnaUprava: "vymyslene" })).toEqual([]);
    expect(vetyNaDoklad({})).toEqual([]);
  });
});
