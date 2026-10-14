import { describe, expect, it } from "vitest";
import {
  bezDph,
  daSaUpravit,
  orezVyber,
  prepniVyber,
  suhrnVyberu,
  sumyPoMenach,
  vsetkyVybrane,
  vybratVsetko,
  type DokladNaSucet,
} from "./vyber-dokladov";

const d = (id: string, p: Partial<DokladNaSucet> = {}): DokladNaSucet => ({
  id,
  total_amount: 12.3,
  net_amount: 10,
  vat_amount: 2.3,
  currency: "EUR",
  status: "processed",
  exported_at: null,
  ...p,
});

describe("súčty vybraných dokladov", () => {
  it("sčíta s DPH aj bez DPH a zaokrúhli na centy", () => {
    const s = sumyPoMenach([
      d("a"),
      d("b", { total_amount: "0.1", net_amount: "0.1" }),
      d("c", { total_amount: 0.2, net_amount: 0.2 }),
    ]);
    expect(s).toEqual([{ mena: "EUR", pocet: 3, sDph: 12.6, bezDph: 10.3 }]);
  });

  it("rôzne meny nesčíta — euro je prvé", () => {
    const s = sumyPoMenach([
      d("a", { currency: "CZK", total_amount: 121, net_amount: 100 }),
      d("b"),
      d("c", { currency: null }),
    ]);
    expect(s.map((r) => r.mena)).toEqual(["EUR", "CZK"]);
    expect(s[0]).toMatchObject({ pocet: 2, sDph: 24.6 });
    expect(s[1]).toMatchObject({ pocet: 1, sDph: 121, bezDph: 100 });
  });

  it("základ bez DPH sa odvodí, keď chýba", () => {
    expect(bezDph(d("a", { net_amount: null, total_amount: 12.3, vat_amount: 2.3 }))).toBeCloseTo(
      10,
    );
    expect(bezDph(d("a", { net_amount: null, vat_amount: null, total_amount: 5 }))).toBe(5);
    expect(bezDph(d("a", { net_amount: null, vat_amount: null, total_amount: null }))).toBe(0);
  });

  it("na export ide len spracovaný a neodovzdaný doklad", () => {
    const doklady = [
      d("a"),
      d("b", { exported_at: "2026-10-01T10:00:00Z" }),
      d("c", { status: "new" }),
      d("x"),
    ];
    const s = suhrnVyberu(doklady, new Set(["a", "b", "c"]));
    expect(s.pocet).toBe(3);
    expect(s.sumy[0].sDph).toBe(36.9);
    expect(s.naExport.pocet).toBe(1);
    expect(s.naExport.sumy).toEqual([{ mena: "EUR", pocet: 1, sDph: 12.3, bezDph: 10 }]);
  });

  it("odovzdaný alebo zamknutý doklad sa hromadne nemení", () => {
    expect(daSaUpravit(d("a"))).toBe(true);
    expect(daSaUpravit(d("a", { exported_at: "2026-10-01" }))).toBe(false);
    expect(daSaUpravit(d("a", { locked_at: "2026-10-01" }))).toBe(false);
  });
});

describe("výber riadkov", () => {
  it("ťuknutie zaškrtne a druhé odškrtne", () => {
    const a = prepniVyber(new Set(), "1");
    expect([...a]).toEqual(["1"]);
    expect([...prepniVyber(a, "1")]).toEqual([]);
  });

  it("vybrať všetko berie len zobrazené a druhýkrát výber zruší", () => {
    const skryty = new Set(["9"]);
    const vsetko = vybratVsetko(skryty, ["1", "2"]);
    expect([...vsetko].sort()).toEqual(["1", "2", "9"]);
    expect(vsetkyVybrane(vsetko, ["1", "2"])).toBe(true);
    expect([...vybratVsetko(vsetko, ["1", "2"])]).toEqual(["9"]);
    expect(vsetkyVybrane(new Set(), [])).toBe(false);
  });

  it("po obnovení zoznamu zmazané z výberu vypadnú", () => {
    expect([...orezVyber(new Set(["1", "2"]), ["2", "3"])]).toEqual(["2"]);
  });
});
