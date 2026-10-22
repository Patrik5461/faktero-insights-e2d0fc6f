import { describe, expect, it } from "vitest";
import { menoSpracovatela, nahralDokladu, spracovanieDokladu } from "./spracoval";

const mena = { u1: "Jana Nováková", u2: "peter@firma.sk" };

describe("spracovanieDokladu", () => {
  it("prijatá faktúra: spracoval / spracovane_at, nie created_by", () => {
    const s = spracovanieDokladu(
      { created_by: "u2", spracoval: "u1", spracovane_at: "2026-10-22T10:00:00Z" },
      "prijata",
    );
    expect(s).toEqual({ kto: "u1", kedy: "2026-10-22T10:00:00Z" });
    expect(menoSpracovatela(s, mena)).toBe("Jana Nováková");
  });
  it("bloček: processed_by / processed_at", () => {
    expect(
      spracovanieDokladu({ processed_by: "u2", processed_at: "2026-10-01T08:00:00Z" }, "doklad"),
    ).toEqual({
      kto: "u2",
      kedy: "2026-10-01T08:00:00Z",
    });
  });
  it("bez údaja (ručne zapísaná či staršia faktúra) null", () => {
    expect(spracovanieDokladu({ created_by: "u1" }, "prijata")).toBeNull();
    expect(spracovanieDokladu(null, "doklad")).toBeNull();
    // Člen, ktorý z firmy odišiel — meno nepoznáme.
    expect(menoSpracovatela({ kto: "u9", kedy: null }, mena)).toBeNull();
  });
});

describe("nahralDokladu", () => {
  it("pri nahratí meno kolegu, pri maile a API nie (created_by je majiteľ adresy)", () => {
    expect(nahralDokladu("nahratie", "u1", mena)).toBe("Jana Nováková");
    expect(nahralDokladu("apka", "u2", mena)).toBe("peter@firma.sk");
    expect(nahralDokladu("mail", "u1", mena)).toBeNull();
    expect(nahralDokladu("api", "u1", mena)).toBeNull();
    expect(nahralDokladu("nahratie", null, mena)).toBeNull();
    expect(nahralDokladu("nahratie", "u9", mena)).toBeNull();
  });
});
