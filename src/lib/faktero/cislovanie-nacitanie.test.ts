import { describe, it, expect } from "vitest";
import { nacitajPouziteCisla } from "./cislovanie-nacitanie";
import { dalsieCisloDokladu } from "./cislovanie";

/** Napodobenina PostgREST: vracia najviac toľko riadkov, koľko pýta `range`. */
function klient(vsetky: string[], stlpec = "quote_number") {
  const volania: string[] = [];
  const dopyt = {
    select: () => dopyt,
    eq: () => dopyt,
    like: () => dopyt,
    order: () => dopyt,
    range: (od: number, po: number) => {
      volania.push(`${od}-${po}`);
      return Promise.resolve({
        data: vsetky.slice(od, po + 1).map((c) => ({ [stlpec]: c })),
        error: null,
      });
    },
  };
  return { klient: { from: () => dopyt }, volania };
}

describe("nacitajPouziteCisla", () => {
  it("prečíta aj to, čo sa do jednej dávky nezmestí", async () => {
    const vsetky = Array.from({ length: 2500 }, (_, i) => `Q2026${String(i + 1).padStart(4, "0")}`);
    const { klient: k, volania } = klient(vsetky);
    const out = await nacitajPouziteCisla(k, "quotes", "quote_number", "c", "Q2026");
    expect(out).toHaveLength(2500);
    expect(volania).toEqual(["0-999", "1000-1999", "2000-2999"]);
  });

  it("pri neúplnej dávke sa ďalej nepýta", async () => {
    const { klient: k, volania } = klient(["Q20260001", "Q20260002"]);
    await nacitajPouziteCisla(k, "quotes", "quote_number", "c", "Q2026");
    expect(volania).toEqual(["0-999"]);
  });

  it("prázdna rada vráti prázdno", async () => {
    const { klient: k } = klient([]);
    expect(await nacitajPouziteCisla(k, "quotes", "quote_number", "c", "Q2026")).toEqual([]);
  });

  it("najvyššie číslo sa nájde aj keď je za prvou dávkou", async () => {
    // Presne to bola tá chyba: strop 5000 bez zoradenia mohol maximum minúť.
    const vsetky = Array.from({ length: 1200 }, (_, i) => `Q2026${String(i + 1).padStart(4, "0")}`);
    const { klient: k } = klient(vsetky);
    const out = await nacitajPouziteCisla(k, "quotes", "quote_number", "c", "Q2026");
    expect(dalsieCisloDokladu("Q2026", out)).toBe("Q20261201");
  });

  it("chybu z databázy nezhltne", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dopyt: any = {
      select: () => dopyt,
      eq: () => dopyt,
      like: () => dopyt,
      order: () => dopyt,
      range: () => Promise.resolve({ data: null, error: { message: "spadlo to" } }),
    };
    await expect(
      nacitajPouziteCisla({ from: () => dopyt }, "quotes", "quote_number", "c", "Q2026"),
    ).rejects.toThrow("spadlo to");
  });
});
