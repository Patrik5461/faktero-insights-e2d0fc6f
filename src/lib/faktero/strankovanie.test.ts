import { describe, expect, it } from "vitest";
import { riadkyPreIds, vsetkyRiadky } from "./strankovanie";

/*
  Supabase vráti najviac 1 000 riadkov na dotaz aj pri `.limit(5000)` — overené
  na ostrej databáze (október 2026). Pomôcky musia načítať naozaj všetko.
*/

const tabulka = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
const stranka = (od: number, po: number) =>
  Promise.resolve({ data: tabulka.slice(od, Math.min(po + 1, od + 1000)), error: null });

describe("stránkovanie", () => {
  it("načíta všetky riadky, nie len prvých 1 000", async () => {
    const r = await vsetkyRiadky(stranka);
    expect(r).toHaveLength(2345);
    expect(r.at(-1)).toEqual({ id: 2344 });
  });

  it("chybu dotazu nezamlčí", async () => {
    await expect(vsetkyRiadky(() => Promise.resolve({ data: null, error: { message: "zlé" } }))).rejects.toThrow("zlé");
  });

  it("veľký zoznam id rozdelí na dávky a každú prestránkuje", async () => {
    const dotazy: number[] = [];
    const r = await riadkyPreIds(
      Array.from({ length: 450 }, (_, i) => `f${i}`).concat("f1"),
      (kus, od, po) => {
        dotazy.push(kus.length);
        // každá faktúra má 5 položiek — dávka 200 faktúr = 1 000 položiek, teda 2 stránky
        const pol = kus.flatMap((k) => Array.from({ length: 5 }, (_, j) => `${k}-${j}`));
        return Promise.resolve({ data: pol.slice(od, po + 1), error: null });
      },
    );
    expect(r).toHaveLength(450 * 5);
    expect(new Set(r).size).toBe(450 * 5);
    expect(dotazy[0]).toBe(200);
  });
});
