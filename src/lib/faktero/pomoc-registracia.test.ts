import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { MANUALY, manualPre } from "@/components/faktero/nav";

/**
 * Nový manuál sa musí prihlásiť na troch miestach, inak je slepý: v rozcestníku
 * `pomoc.index`, v sitemape a v mape `MANUALY` (tlačidlo „Manuál" v hlavičke
 * agendy). Zabudnúť na niektoré z nich sa už stalo, preto tento test.
 *
 * Prvé dve sú obyčajné zoznamy vnútri stránok — kontroluje sa, či sa v nich
 * adresa vyskytuje. Na to netreba tie stránky spúšťať.
 */
const CESTY_MANUALOV = readdirSync("src/routes")
  .filter((f) => /^pomoc\..+\.tsx$/.test(f) && !f.endsWith(".test.tsx"))
  .map(
    (f) =>
      "/pomoc/" +
      f
        .replace(/^pomoc\./, "")
        .replace(/\.tsx$/, "")
        .replace(/\./g, "/"),
  )
  /* Rozcestník sám seba nelistuje a videá sú zoznam, nie manuál k agende. */
  .filter((c) => c !== "/pomoc/index");

const rozcestnik = readFileSync("src/routes/pomoc.index.tsx", "utf-8");
const sitemap = readFileSync("src/routes/sitemap[.]xml.ts", "utf-8");

describe("manuály sú prihlásené na všetkých troch miestach", () => {
  it("zoznam manuálov sa našiel", () => {
    expect(CESTY_MANUALOV.length).toBeGreaterThan(20);
    expect(CESTY_MANUALOV).toContain("/pomoc/exporty");
  });

  it("každý manuál je v rozcestníku Pomoc", () => {
    const chyba = CESTY_MANUALOV.filter((c) => !rozcestnik.includes(`"${c}"`));
    expect(chyba).toEqual([]);
  });

  it("každý manuál je v sitemape", () => {
    const chyba = CESTY_MANUALOV.filter((c) => !sitemap.includes(`"${c}"`));
    expect(chyba).toEqual([]);
  });

  it("rozcestník ani sitemap neodkazujú na manuál, ktorý neexistuje", () => {
    const z = (text: string) => [...text.matchAll(/"(\/pomoc\/[a-z0-9/-]+)"/g)].map((m) => m[1]);
    for (const [kde, text] of [
      ["rozcestník", rozcestnik],
      ["sitemap", sitemap],
    ] as const) {
      const mrtve = [...new Set(z(text))].filter((c) => !CESTY_MANUALOV.includes(c));
      expect(mrtve, kde).toEqual([]);
    }
  });
});

describe("tlačidlo Manuál v hlavičke agendy", () => {
  it("odkazuje vždy na existujúci manuál", () => {
    const mrtve = MANUALY.filter((m) => !CESTY_MANUALOV.includes(m.to));
    expect(mrtve.map((m) => `${m.prefix} → ${m.to}`)).toEqual([]);
  });

  it("predpony sa neopakujú", () => {
    const predpony = MANUALY.map((m) => m.prefix);
    expect(new Set(predpony).size).toBe(predpony.length);
  });

  /*
   * Zhoda je na presnú cestu alebo `predpona/`. Podstránka s vlastným
   * manuálom musí prebiť rodiča, inak by párovanie platieb poslalo človeka
   * na manuál k faktúram namiesto k banke.
   */
  it("vyhráva najdlhšia zhoda, nie prvá v poradí", () => {
    expect(manualPre("/faktury")).toBe("/pomoc/faktury");
    expect(manualPre("/faktury/parovanie")).toBe("/pomoc/banka");
    expect(manualPre("/sklad")).toBe("/pomoc/sklad");
    expect(manualPre("/sklad/objednavky")).toBe("/pomoc/objednavky-dodavatel");
  });

  it("cudzia cesta manuál nedostane", () => {
    expect(manualPre("/dashboard")).toBeNull();
    /* `/webhooky-logy` nie je podstránka `/webhooky`, preto má vlastný riadok. */
    expect(manualPre("/webhooky-logy")).toBe("/pomoc/api");
  });

  it("účtovné importy aj exporty vedú na svoj manuál", () => {
    expect(manualPre("/exporty")).toBe("/pomoc/exporty");
    expect(manualPre("/importy/novy")).toBe("/pomoc/exporty");
  });
});
