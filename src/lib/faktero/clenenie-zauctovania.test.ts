import { describe, expect, it } from "vitest";
import {
  chybaClenenie,
  clenenieFaktur,
  potrebujeNavrh,
  ucinneClenenie,
} from "./clenenie-zauctovania";

describe("ucinneClenenie", () => {
  it("poradie: zvolené > faktúra > návrh > kategória > predvolené", () => {
    const vsetko = {
      zvolene: "A",
      naDoklade: "B",
      navrh: "C",
      kategoria: "D",
      predvolene: "E",
    };
    expect(ucinneClenenie(vsetko)).toEqual({ kod: "A", zdroj: "zvolene", doplnit: null });
    expect(ucinneClenenie({ ...vsetko, zvolene: " " }).zdroj).toBe("doklad");
    expect(ucinneClenenie({ ...vsetko, zvolene: "", naDoklade: null })).toEqual({
      kod: "C",
      zdroj: "navrh",
      doplnit: "C",
    });
    expect(ucinneClenenie({ kategoria: "D", predvolene: "E" }).zdroj).toBe("kategoria");
    expect(ucinneClenenie({ predvolene: "E" })).toEqual({
      kod: "E",
      zdroj: "predvolene",
      doplnit: null,
    });
  });

  it("rozúčtovanie stačí, len keď má členenie každý riadok", () => {
    expect(ucinneClenenie({ rozuctovanie: [{ clenenie: "PD" }, { clenenie: "PN" }] }).zdroj).toBe(
      "rozuctovanie",
    );
    expect(ucinneClenenie({ rozuctovanie: [{ clenenie: "PD" }, { clenenie: "" }] }).kod).toBeNull();
    expect(ucinneClenenie({}).kod).toBeNull();
  });

  it("bez členenia blokuje len platiteľa", () => {
    const nic = ucinneClenenie({});
    expect(chybaClenenie(true, nic)).toBe(true);
    expect(chybaClenenie(false, nic)).toBe(false);
    expect(chybaClenenie(true, ucinneClenenie({ predvolene: "PD" }))).toBe(false);
  });
});

describe("potrebujeNavrh", () => {
  it("len keď okno ani faktúra členenie nemajú a nič sa nemaže", () => {
    expect(potrebujeNavrh({ clenenie: null }, {})).toBe(true);
    expect(potrebujeNavrh({ clenenie: "PD" }, {})).toBe(false);
    expect(potrebujeNavrh({ clenenie: null }, { zvolene: "PD" })).toBe(false);
    expect(potrebujeNavrh({ clenenie: null }, { vymazat: true })).toBe(false);
  });
});

describe("clenenieFaktur — hromadné zaúčtovanie", () => {
  const faktury = [
    { id: "a", clenenie: "PD" },
    { id: "b", clenenie: null, navrh: "PN" },
    { id: "c", clenenie: null, kategoria: "palivo" },
    { id: "d", clenenie: null },
  ];

  it("predkontácia bez členenia: návrh sa doplní, bez členenia sa nezaúčtuje", () => {
    const r = clenenieFaktur(faktury, {
      podlaKategorie: { palivo: { clenenie: "PD" } },
      platitel: true,
    });
    expect(r.doplnit).toEqual({ b: "PN" });
    expect(r.bez).toEqual(["d"]);
  });

  it("predvolené firmy pokryje všetky", () => {
    expect(clenenieFaktur(faktury, { predvolene: "PD", platitel: true }).bez).toEqual([]);
  });

  it("zvolené členenie prebije návrh a nič sa nedopĺňa", () => {
    expect(clenenieFaktur(faktury, { zvolene: "PD", platitel: true })).toEqual({
      doplnit: {},
      bez: [],
    });
  });

  it("neplatiteľ zaúčtuje aj bez členenia", () => {
    expect(clenenieFaktur(faktury, { platitel: false }).bez).toEqual([]);
  });

  it("vymazanie na detaile: hodnota z faktúry ani návrh neplatia", () => {
    const r = clenenieFaktur([{ id: "a", clenenie: "PD", navrh: "PN" }], {
      vymazat: true,
      platitel: true,
    });
    expect(r).toEqual({ doplnit: {}, bez: ["a"] });
  });
});
