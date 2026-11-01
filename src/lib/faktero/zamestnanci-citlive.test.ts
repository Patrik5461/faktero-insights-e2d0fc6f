import { describe, it, expect } from "vitest";
import { citliveNaUlozenie, zalozZamestnanca } from "./zamestnanci-citlive";

describe("citliveNaUlozenie (Z-01)", () => {
  it("bez „Zobraziť“ doplnenie RČ nezmaže číslo OP", () => {
    expect(citliveNaUlozenie({ rodne_cislo: "900101/1234", op_cislo: "" }, null)).toEqual({
      rodne_cislo: "900101/1234",
    });
  });

  it("bez načítania prázdne polia nič nemenia", () => {
    expect(citliveNaUlozenie({ rodne_cislo: "", op_cislo: "  " }, null)).toEqual({});
  });

  it("po načítaní ide len zmenené pole", () => {
    const nacitane = { rodne_cislo: "900101/1234", op_cislo: "EA123456" };
    expect(
      citliveNaUlozenie({ rodne_cislo: "900101/1234", op_cislo: "EB999999" }, nacitane),
    ).toEqual({
      op_cislo: "EB999999",
    });
  });

  it("po načítaní vedomé vymazanie pošle prázdny reťazec", () => {
    const nacitane = { rodne_cislo: "900101/1234", op_cislo: "EA123456" };
    expect(citliveNaUlozenie({ rodne_cislo: "900101/1234", op_cislo: "" }, nacitane)).toEqual({
      op_cislo: "",
    });
  });

  it("načítaný prázdny údaj a prázdne pole – žiadna zmena", () => {
    expect(
      citliveNaUlozenie({ rodne_cislo: "", op_cislo: "" }, { rodne_cislo: null, op_cislo: null }),
    ).toEqual({});
  });
});

describe("zalozZamestnanca (Z-02)", () => {
  it("chyba citlivých údajov nevyhodí výnimku – zamestnanec sa nezaloží druhýkrát", async () => {
    let zalozenych = 0;
    const zaloz = async () => ({ id: `z${++zalozenych}` });
    const zle = async () => {
      throw new Error("vault");
    };
    const r = await zalozZamestnanca(zaloz, zle, { rodne_cislo: "900101/1234", op_cislo: "" });
    expect(r).toEqual({ id: "z1", citliveUlozene: false });
    expect(zalozenych).toBe(1);
  });

  it("bez citlivých údajov ich ani neposiela", async () => {
    let volane = false;
    const r = await zalozZamestnanca(
      async () => ({ id: "a" }),
      async () => {
        volane = true;
      },
      { rodne_cislo: " ", op_cislo: "" },
    );
    expect(r).toEqual({ id: "a", citliveUlozene: true });
    expect(volane).toBe(false);
  });

  it("chyba založenia ide ďalej", async () => {
    await expect(
      zalozZamestnanca(
        async () => {
          throw new Error("x");
        },
        async () => {},
        { rodne_cislo: "", op_cislo: "" },
      ),
    ).rejects.toThrow("x");
  });
});
