import { describe, expect, it } from "vitest";
import { DAVKA_IDS, poDavkach, riadkyPreIds, vsetkyRiadky, vsetkyRiadkySubezne } from "./strankovanie";

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

  it("súbežne: prvá stránka s počtom, zvyšok naraz", async () => {
    const volania: { od: number; spocitaj: boolean }[] = [];
    let bezi = 0;
    let najviacNaraz = 0;
    const r = await vsetkyRiadkySubezne(async (od, po, spocitaj) => {
      volania.push({ od, spocitaj });
      bezi++;
      najviacNaraz = Math.max(najviacNaraz, bezi);
      await new Promise((ok) => setTimeout(ok, 5));
      bezi--;
      return { data: tabulka.slice(od, Math.min(po + 1, od + 1000)), error: null, count: spocitaj ? tabulka.length : null };
    });
    expect(r).toHaveLength(2345);
    expect(r.map((x) => x.id)).toEqual(tabulka.map((x) => x.id));
    expect(volania).toEqual([
      { od: 0, spocitaj: true },
      { od: 1000, spocitaj: false },
      { od: 2000, spocitaj: false },
    ]);
    expect(najviacNaraz).toBe(2);
  });

  it("súbežne: bez počtu dočíta po starom", async () => {
    const r = await vsetkyRiadkySubezne((od, po) =>
      Promise.resolve({ data: tabulka.slice(od, Math.min(po + 1, od + 1000)), error: null, count: null }),
    );
    expect(r).toHaveLength(2345);
  });

  it("súbežne: riadky pribudli po počte — nič nechýba", async () => {
    const r = await vsetkyRiadkySubezne((od, po, spocitaj) =>
      Promise.resolve({ data: tabulka.slice(od, Math.min(po + 1, od + 1000)), error: null, count: spocitaj ? 1500 : null }),
    );
    expect(r).toHaveLength(2345);
  });

  it("súbežne: malý zoznam = jeden dotaz", async () => {
    let n = 0;
    const r = await vsetkyRiadkySubezne((od, po) => {
      n++;
      return Promise.resolve({ data: tabulka.slice(0, 10), error: null, count: 10 });
    });
    expect(r).toHaveLength(10);
    expect(n).toBe(1);
  });

  it("súbežne: chybu stránky nezamlčí", async () => {
    await expect(
      vsetkyRiadkySubezne((od, po, spocitaj) =>
        Promise.resolve(
          spocitaj
            ? { data: tabulka.slice(0, 1000), error: null, count: 2345 }
            : { data: null, error: { message: "zlé" } },
        ),
      ),
    ).rejects.toThrow("zlé");
  });
});

describe("poDavkach — .in() s tisíckami id", () => {
  const ids = Array.from({ length: 3000 }, (_, i) => `id-${i}`);

  it("žiadna dávka nepresiahne limit a nič nechýba ani sa nezopakuje", async () => {
    const velkosti: number[] = [];
    const r = await poDavkach([...ids, ...ids.slice(0, 50)], (kus) => {
      velkosti.push(kus.length);
      return Promise.resolve({ data: kus.map((id) => ({ id })), error: null });
    });
    expect(Math.max(...velkosti)).toBeLessThanOrEqual(DAVKA_IDS);
    expect(r).toHaveLength(3000);
    expect(new Set(r.map((x) => x.id)).size).toBe(3000);
  });

  it("chybu dávky nezamlčí — ani prázdnu správu", async () => {
    await expect(
      poDavkach(ids, (kus) =>
        Promise.resolve(kus[0] === "id-400" ? { data: null, error: { message: "" } } : { data: [], error: null }),
      ),
    ).rejects.toThrow("Dotaz do databázy zlyhal.");
  });

  it("prázdny zoznam = žiadny dotaz", async () => {
    let n = 0;
    expect(await poDavkach([], () => (n++, Promise.resolve({ data: [], error: null })))).toEqual([]);
    expect(n).toBe(0);
  });
});
