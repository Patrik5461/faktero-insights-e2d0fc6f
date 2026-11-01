import { describe, expect, it } from "vitest";
import {
  pocetZoStropu,
  prazdnyStavPravidiel,
  pravidloVZalozke,
  stropNahladu,
} from "./pravidla-zobrazenie";

describe("prázdna záložka pravidiel (E-27)", () => {
  const pravidla = [{ druh: "prijata" as const }, { druh: null }];
  it("bez pravidiel návod, s pravidlami v inej záložke text o záložke", () => {
    expect(prazdnyStavPravidiel([], "vsetky")).toBe("ziadne");
    expect(prazdnyStavPravidiel(pravidla, "vystavena")).toBe("zalozka");
    expect(prazdnyStavPravidiel(pravidla, "banka")).toBe("zalozka");
    expect(prazdnyStavPravidiel(pravidla, "blocek")).toBeNull();
    expect(prazdnyStavPravidiel(pravidla, "vsetky")).toBeNull();
  });
  it("pravidlo bez druhu patrí do bločkov aj prijatých", () => {
    expect(pravidloVZalozke({ druh: null }, "blocek")).toBe(true);
    expect(pravidloVZalozke({ druh: null }, "prijata")).toBe(true);
    expect(pravidloVZalozke({ druh: null }, "vystavena")).toBe(false);
  });
});

describe("Sedí na z posledných 1 000 (E-30)", () => {
  const strop = stropNahladu({ blocek: 1000, prijata: 400, vystavena: 12 });
  it("strop podľa druhu", () => {
    expect(strop).toEqual({ blocek: true, prijata: false, vystavena: false });
    expect(pocetZoStropu({ druh: "blocek" }, strop)).toBe(true);
    expect(pocetZoStropu({ druh: "prijata" }, strop)).toBe(false);
    expect(pocetZoStropu({ druh: null }, strop)).toBe(true);
    expect(pocetZoStropu({ druh: "banka" }, strop)).toBe(false);
  });
});
