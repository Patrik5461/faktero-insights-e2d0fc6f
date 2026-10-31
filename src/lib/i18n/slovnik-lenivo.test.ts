import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Slovníky DE/CS (~3,6 MB) nesmú byť v hlavnom skripte webu — sťahoval by si
  ich každý slovenský návštevník. `jazyk.ts` ich preto načíta až na požiadanie.
*/
describe("slovníky na požiadanie", () => {
  it("jazyk.ts slovníky priamo neimportuje", () => {
    const zdroj = readFileSync(new URL("./jazyk.ts", import.meta.url), "utf8");
    expect(zdroj).not.toMatch(/import\.meta\.glob[<(]/);
    expect(zdroj).toMatch(/import\("\.\/slovnik-de"\)/);
    expect(zdroj).toMatch(/import\("\.\/slovnik-cs"\)/);
  });

  it("pred načítaním ostane slovenčina, po načítaní preklad", async () => {
    vi.resetModules();
    const m = await import("./jazyk");
    expect(m.preloz("de", "Uložiť")).toBe("Uložiť");
    expect(m.pocetPrekladov("cs")).toBe(0);
    await m.nacitajSlovnik("de");
    expect(m.preloz("de", "Uložiť")).toBe("Speichern");
    // Druhý jazyk sa nenačítal spolu s prvým.
    expect(m.pocetPrekladov("cs")).toBe(0);
    await m.nacitajSlovnik("sk");
    await m.nacitajSlovnik("xx");
    await m.nacitajVsetkySlovniky();
    expect(m.pocetPrekladov("cs")).toBeGreaterThan(1000);
  });
});
