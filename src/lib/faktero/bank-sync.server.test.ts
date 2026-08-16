import { describe, it, expect } from "vitest";
import { znameReferencie } from "./bank-sync.server";

/**
 * Zoznam už uložených pohybov sa číta po tisíckach. Keby sa čítal naraz,
 * PostgREST by vrátil prvých 1000 a všetko staršie by sa pri ďalšom sťahovaní
 * vložilo druhý raz — duplicitná platba v účtovníctve, ktorú nikto nehľadá.
 */
function fakeSupabase(vsetky: string[]) {
  const volania: Array<[number, number]> = [];
  const dotaz: any = {
    select: () => dotaz,
    eq: () => dotaz,
    gte: () => dotaz,
    not: () => dotaz,
    order: () => dotaz,
    range: (od: number, po: number) => {
      volania.push([od, po]);
      return Promise.resolve({
        data: vsetky.slice(od, po + 1).map((r) => ({ transaction_reference: r })),
        error: null,
      });
    },
  };
  return { klient: { from: () => dotaz }, volania };
}

describe("znameReferencie", () => {
  it("prečíta aj to, čo je za prvou tisíckou", async () => {
    const vsetky = Array.from({ length: 2345 }, (_, i) => `ref-${i}`);
    const { klient, volania } = fakeSupabase(vsetky);

    const seen = await znameReferencie(klient, "ucet", "2026-05-01");

    expect(seen.size).toBe(2345);
    expect(seen.has("ref-0")).toBe(true);
    expect(seen.has("ref-2344")).toBe(true);
    expect(volania).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("na prázdnom účte nečíta druhýkrát", async () => {
    const { klient, volania } = fakeSupabase([]);
    const seen = await znameReferencie(klient, "ucet", "2026-05-01");
    expect(seen.size).toBe(0);
    expect(volania).toHaveLength(1);
  });

  it("presne tisíc riadkov si vyžiada ešte jeden dotaz", async () => {
    const { klient, volania } = fakeSupabase(Array.from({ length: 1000 }, (_, i) => `r${i}`));
    const seen = await znameReferencie(klient, "ucet", "2026-05-01");
    expect(seen.size).toBe(1000);
    expect(volania).toHaveLength(2);
  });
});
