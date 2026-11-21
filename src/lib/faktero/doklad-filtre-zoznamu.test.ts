import { describe, expect, it } from "vitest";
import { podmienkyBlockov, pouziFiltreBlockov } from "./doklad-filtre-zoznamu";

describe("podmienkyBlockov", () => {
  it("bez filtrov len stav záložky; Spracované vždy aj s odovzdanými", () => {
    expect(podmienkyBlockov({ stav: "processed", export: "", zauct: "" })).toEqual([
      { op: "in", stlpec: "status", hodnoty: ["processed", "exported"] },
    ]);
    expect(podmienkyBlockov({ stav: "new", export: "", zauct: "" })).toEqual([
      { op: "eq", stlpec: "status", hodnota: "new" },
    ]);
    expect(podmienkyBlockov({ stav: "all", export: null, zauct: undefined })).toEqual([]);
  });

  it("Spracované s filtrom exportu zahŕňajú aj odovzdané (stav exported)", () => {
    expect(podmienkyBlockov({ stav: "processed", export: "ano", zauct: "" })).toEqual([
      { op: "in", stlpec: "status", hodnoty: ["processed", "exported"] },
      { op: "niePrazdne", stlpec: "exported_at" },
    ]);
    expect(podmienkyBlockov({ stav: "processed", export: "nie", zauct: "" })).toEqual([
      { op: "in", stlpec: "status", hodnoty: ["processed", "exported"] },
      { op: "jePrazdne", stlpec: "exported_at" },
    ]);
  });

  it("ostatné záložky stav nemenia", () => {
    expect(podmienkyBlockov({ stav: "new", export: "ano", zauct: "" })[0]).toEqual({
      op: "eq",
      stlpec: "status",
      hodnota: "new",
    });
  });

  it("zaúčtovanie", () => {
    expect(podmienkyBlockov({ stav: "all", export: "", zauct: "ano" })).toEqual([
      { op: "niePrazdne", stlpec: "zauctovane_at" },
    ]);
    expect(podmienkyBlockov({ stav: "all", export: "", zauct: "nie" })).toEqual([
      { op: "jePrazdne", stlpec: "zauctovane_at" },
    ]);
  });

  it("neznáme hodnoty z adresy ignoruje", () => {
    expect(podmienkyBlockov({ stav: "all", export: "x", zauct: "1" })).toEqual([]);
  });
});

describe("pouziFiltreBlockov", () => {
  it("volá metódy buildera", () => {
    const volania: unknown[][] = [];
    const q: any = {};
    for (const m of ["eq", "in", "is", "not"])
      q[m] = (...a: unknown[]) => {
        volania.push([m, ...a]);
        return q;
      };
    pouziFiltreBlockov(q, { stav: "processed", export: "ano", zauct: "nie" });
    expect(volania).toEqual([
      ["in", "status", ["processed", "exported"]],
      ["not", "exported_at", "is", null],
      ["is", "zauctovane_at", null],
    ]);
  });
});
