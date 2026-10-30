import { describe, expect, it } from "vitest";
import {
  kontrolnyVykaz,
  priznanie,
  VYTKA_DOKLAD_B2_BEZ_UDAJOV,
  VYTKA_ODPOCET_BEZ_IC_DPH,
  type PrijataFaktura,
  type Vstup,
} from "./dph-vykazy";

/*
  Priznanie a KV musia sedieť: faktúra bez IČ DPH dodávateľa nejde do B.2
  ani do odpočtu (r. 19/21), bločky v B.3 a prenesenie v B.1 IČ DPH
  dodávateľa nepotrebujú.
*/

const obdobie = { rok: 2026, mesiac: 9 };

function prijata(p: Partial<PrijataFaktura> = {}): PrijataFaktura {
  return {
    cislo: "D2026-5",
    dodavatelIcDph: "SK9876543210",
    datumDodania: "2026-09-05",
    rezim: "tuzemsko",
    odpocet: true,
    riadky: [{ sadzba: 23, zaklad: 500, dan: 115 }],
    ...p,
  };
}

function vstup(p: Partial<Vstup> = {}): Vstup {
  return { obdobie, vystavene: [], prijate: [], doklady: [], ...p };
}

describe("odpočet bez IČ DPH dodávateľa", () => {
  it("prijatá faktúra bez IČ DPH nie je ani v B.2, ani v r. 19/21 — jedna výtka", () => {
    const v = vstup({
      prijate: [
        prijata(),
        prijata({
          cislo: "BEZ-IC",
          dodavatelIcDph: "  ",
          riadky: [
            { sadzba: 23, zaklad: 100, dan: 23 },
            { sadzba: 5, zaklad: 100, dan: 5 },
          ],
        }),
      ],
    });
    const kv = kontrolnyVykaz(v);
    expect(kv.b2).toHaveLength(1);
    expect(kv.b2[0].f).toBe("D2026-5");
    expect(kv.vytky).toEqual([{ doklad: "BEZ-IC", text: VYTKA_ODPOCET_BEZ_IC_DPH }]);

    const r = priznanie(v);
    expect(r.r19).toBe(115);
    expect(r.r21).toBe(115);
    expect(r.r20a ?? 0).toBe(0);
    // Odpočet v priznaní = súčet stĺpca „odpočítaná daň“ v B.2.
    expect(kv.b2.reduce((a, x) => a + x.o, 0)).toBe(r.r19);
  });

  it("po doplnení IČ DPH je faktúra späť v odpočte aj v B.2", () => {
    const v = vstup({ prijate: [prijata({ cislo: "BEZ-IC", dodavatelIcDph: "SK1111111111" })] });
    expect(kontrolnyVykaz(v).b2).toHaveLength(1);
    expect(priznanie(v).r19).toBe(115);
  });

  it("prenesenie (B.1) a dovoz IČ DPH dodávateľa nepotrebujú", () => {
    const v = vstup({
      prijate: [
        prijata({ cislo: "PDP", rezim: "samozdanenie", dodavatelIcDph: null }),
        prijata({ cislo: "DOV", rezim: "dovoz", dodavatelIcDph: null }),
      ],
    });
    const kv = kontrolnyVykaz(v);
    expect(kv.b1.map((x) => x.f)).toEqual(["PDP"]);
    expect(kv.vytky).toHaveLength(0);
    const r = priznanie(v);
    expect(r.r09b).toBe(500);
    // Samozdanenie aj dovoz sa odpočítajú (r. 19), do r. 21 (tuzemsko) nejdú.
    expect(r.r19).toBe(230);
    expect(r.r21 ?? 0).toBe(0);
    expect(r.r23).toBe(115);
  });

  it("prijatá faktúra ručne v B.3 ide do B.3.1 aj bez IČ DPH a ostáva v odpočte", () => {
    const v = vstup({ prijate: [prijata({ dodavatelIcDph: null, kv: "B3" })] });
    const kv = kontrolnyVykaz(v);
    expect(kv.b31).toEqual({ z: 500, d: 115, o: 115 });
    expect(kv.vytky).toHaveLength(0);
    expect(priznanie(v).r21).toBe(115);
  });

  it("bloček bez IČ DPH ide do B.3.1 aj do odpočtu", () => {
    const v = vstup({
      doklady: [{ odpocet: true, riadky: [{ sadzba: 23, zaklad: 10, dan: 2.3 }] }],
    });
    expect(kontrolnyVykaz(v).b31).toEqual({ z: 10, d: 2.3, o: 2.3 });
    expect(priznanie(v).r21).toBe(2.3);
  });

  it("doklad označený B2 bez IČ DPH alebo čísla vypadne z KV aj z odpočtu", () => {
    const v = vstup({
      doklady: [
        { odpocet: true, kv: "B2", cislo: "1", riadky: [{ sadzba: 23, zaklad: 10, dan: 2.3 }] },
        {
          odpocet: true,
          kv: "B2",
          dodavatelIcDph: "SK2222222222",
          dodavatelNazov: "Bez čísla s. r. o.",
          riadky: [{ sadzba: 23, zaklad: 20, dan: 4.6 }],
        },
        {
          odpocet: true,
          kv: "B2",
          cislo: "F7",
          dodavatelIcDph: "SK2222222222",
          riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }],
        },
      ],
    });
    const kv = kontrolnyVykaz(v);
    expect(kv.b2.map((x) => x.f)).toEqual(["F7"]);
    expect(kv.b31).toBeNull();
    expect(kv.vytky).toEqual([
      { doklad: "1", text: VYTKA_DOKLAD_B2_BEZ_UDAJOV },
      { doklad: "Bez čísla s. r. o.", text: VYTKA_DOKLAD_B2_BEZ_UDAJOV },
    ]);
    expect(priznanie(v).r21).toBe(23);
  });
});
