import { describe, expect, it } from "vitest";
import {
  mozeSchvalit,
  mozeZrusit,
  odznak,
  poSchvaleni,
  vyberCestu,
  type Cesta,
} from "./schvalovanie";

const cesty: Cesta[] = [
  { id: "pred", nazov: "Bežná", urovne: [["u1"], ["u2"]], podmienky: {}, predvolena: true },
  { id: "velke", nazov: "Nad 1000", urovne: [["u1"], ["u2"], ["u3"]], podmienky: { suma_od: 1000 }, predvolena: false, poradie: 1 },
  { id: "orange", nazov: "Orange", urovne: [["u4"]], podmienky: { ico: "35697270", agenda: "prijata" }, predvolena: false, poradie: 0 },
];

describe("výber cesty", () => {
  it("pravidlo podľa dodávateľa a agendy má prednosť", () => {
    expect(vyberCestu(cesty, { agenda: "prijata", ico: "35697270", suma: 5000 })?.id).toBe("orange");
    // Ten istý dodávateľ na bločku pravidlu pre prijaté nesedí.
    expect(vyberCestu(cesty, { agenda: "doklad", ico: "35697270", suma: 5000 })?.id).toBe("velke");
  });
  it("podľa sumy a inak predvolená", () => {
    expect(vyberCestu(cesty, { agenda: "prijata", suma: 1000 })?.id).toBe("velke");
    expect(vyberCestu(cesty, { agenda: "prijata", suma: 999 })?.id).toBe("pred");
    expect(vyberCestu([], { agenda: "prijata", suma: 1 })).toBeNull();
  });
});

describe("schvaľovanie po úrovniach", () => {
  const s = { urovne: [["u1"], ["u2"], ["u3"]], schvalena_uroven: 0, stav: "caka" as const };

  it("nižšia úroveň posunie, najvyššia schváli aj za nižšie", () => {
    expect(poSchvaleni(s, "u1")).toEqual({ schvalena_uroven: 1, stav: "caka" });
    expect(poSchvaleni(s, "u3")).toEqual({ schvalena_uroven: 3, stav: "schvaleny" });
  });
  it("kto nie je v ceste alebo už je pod schválenou úrovňou, neschvaľuje", () => {
    expect(mozeSchvalit(s, "cudzi", "owner")).toBe(false);
    expect(mozeSchvalit({ ...s, schvalena_uroven: 2 }, "u1", "accountant")).toBe(false);
    expect(mozeSchvalit({ ...s, schvalena_uroven: 2 }, "u3", "employee")).toBe(true);
  });
  it("bez cesty schvaľuje majiteľ, správca alebo účtovník, nie zamestnanec", () => {
    const j = { urovne: [], schvalena_uroven: 0, stav: "caka" as const };
    expect(mozeSchvalit(j, "x", "accountant")).toBe(true);
    expect(mozeSchvalit(j, "x", "employee")).toBe(false);
    expect(poSchvaleni(j, "x")).toEqual({ schvalena_uroven: 1, stav: "schvaleny" });
  });
  it("zrušiť rozhodnutie smie správca alebo najvyššia úroveň", () => {
    expect(mozeZrusit(s, "u3", "employee")).toBe(true);
    expect(mozeZrusit(s, "u1", "accountant")).toBe(false);
    expect(mozeZrusit(s, "x", "admin")).toBe(true);
  });
  it("odznak ako v Doklado", () => {
    expect(odznak({ ...s, schvalena_uroven: 2 })).toBe("2/3");
    expect(odznak({ ...s, stav: "schvaleny", schvalena_uroven: 3 })).toBe("✓ 3/3");
    expect(odznak({ urovne: [], schvalena_uroven: 0, stav: "caka" })).toBe("0/1");
  });
});

describe("manažér zákazky v ceste", () => {
  it("nahradí sa skutočným manažérom, bez neho úroveň vypadne", async () => {
    const { rozvinUrovne } = await import("./schvalovanie");
    expect(rozvinUrovne([["manazer"], ["u2"]], "m1")).toEqual([["m1"], ["u2"]]);
    expect(rozvinUrovne([["manazer"], ["u2"]], null)).toEqual([["u2"]]);
    expect(rozvinUrovne([["manazer", "u1"]], "u1")).toEqual([["u1"]]);
  });
});
