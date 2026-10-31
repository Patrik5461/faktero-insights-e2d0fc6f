import { describe, expect, it } from "vitest";
import { stavSuhlasu, druhEmailuSuhlasu, datumSuhlasu, UPOZORNIT_DNI } from "./bank-suhlas";

const teraz = new Date("2026-10-31T10:00:00Z");

describe("stav súhlasu banky", () => {
  it("bez dátumu konca nevie nič — nič si nevymýšľa", () => {
    expect(stavSuhlasu(null, teraz)).toBeNull();
    expect(stavSuhlasu("nezmysel", teraz)).toBeNull();
  });

  it("ďaleko pred koncom je v poriadku (súhlas PALIERY do 3. 2. 2027)", () => {
    const s = stavSuhlasu("2027-02-03 19:35:07.006+00", teraz)!;
    expect(s.stav).toBe("ok");
    expect(s.platiDo).toBe("2027-02-03");
    expect(s.dni).toBe(95);
    expect(druhEmailuSuhlasu(s)).toBeNull();
  });

  it(`${UPOZORNIT_DNI} dní pred koncom sa začne blížiť`, () => {
    const s = stavSuhlasu("2026-11-14T12:00:00Z", teraz)!;
    expect(s.stav).toBe("blizi");
    expect(s.dni).toBe(14);
    expect(druhEmailuSuhlasu(s)).toBe("suhlas_14");
    expect(stavSuhlasu("2026-11-15T12:00:00Z", teraz)!.stav).toBe("ok");
  });

  it("tri dni pred koncom ide druhý e-mail, aj keď cron prvý deň vynechal", () => {
    expect(druhEmailuSuhlasu(stavSuhlasu("2026-11-03T12:00:00Z", teraz))).toBe("suhlas_3");
    expect(druhEmailuSuhlasu(stavSuhlasu("2026-11-01T08:00:00Z", teraz))).toBe("suhlas_3");
  });

  it("po konci je vypršaný", () => {
    const s = stavSuhlasu("2026-10-30T08:00:00Z", teraz)!;
    expect(s.stav).toBe("vyprsal");
    expect(druhEmailuSuhlasu(s)).toBe("suhlas_vyprsal");
  });

  it("deň konca sa počíta v bratislavskom čase", () => {
    // 23:30 UTC 2. 2. je už 3. 2. v Bratislave.
    expect(stavSuhlasu("2027-02-02T23:30:00Z", teraz)!.platiDo).toBe("2027-02-03");
  });

  it("dátum vypíše po slovensky", () => {
    expect(datumSuhlasu("2027-02-03")).toBe("3. 2. 2027");
  });
});
