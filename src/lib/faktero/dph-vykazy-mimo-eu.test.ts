import { describe, expect, it } from "vitest";
import { priznanie, type Vstup, type VystavenaFaktura } from "./dph-vykazy";
import { priznaniCz } from "./cz-dph";

function faktura(p: Partial<VystavenaFaktura>): VystavenaFaktura {
  return {
    cislo: "2026001",
    typ: "regular",
    datumDodania: "2026-09-10",
    odberatelIcDph: null as any,
    riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }],
    ...p,
  };
}
const vstup = (vystavene: VystavenaFaktura[]): Vstup => ({
  obdobie: { rok: 2026, mesiac: 9 },
  vystavene,
  prijate: [],
  doklady: [],
});

describe("priznanie — odberateľ mimo EÚ", () => {
  it("vývoz tovaru ide do r. 13 a 15", () => {
    const r = priznanie(
      vstup([faktura({ prenosDane: true, prenosTyp: "export", euPlnenie: "tovar" })]),
    );
    expect(r.r13).toBe(1000);
    expect(r.r15).toBe(1000);
  });

  it("služba s miestom dodania mimo EÚ do priznania nepatrí", () => {
    const r = priznanie(
      vstup([faktura({ prenosDane: true, prenosTyp: "export", euPlnenie: "sluzba" })]),
    );
    expect(r.r13 ?? 0).toBe(0);
    expect(r.r15 ?? 0).toBe(0);
  });
});

describe("české přiznání — služba mimo EU", () => {
  it("vývoz zboží ř. 22, služba mimo EU ř. 26", () => {
    const zbozi = priznaniCz(
      vstup([faktura({ prenosDane: true, prenosTyp: "export", euPlnenie: "tovar" })]) as any,
    );
    expect(zbozi.riadky.pln_vyvoz).toBe(1000);
    const sluzba = priznaniCz(
      vstup([faktura({ prenosDane: true, prenosTyp: "export", euPlnenie: "sluzba" })]) as any,
    );
    expect(sluzba.riadky.pln_ost).toBe(1000);
    expect(sluzba.riadky.pln_vyvoz ?? 0).toBe(0);
  });
});
