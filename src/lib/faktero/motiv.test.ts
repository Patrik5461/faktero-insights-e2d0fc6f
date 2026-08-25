import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  jeMotiv,
  nacitajMotiv,
  nasadMotiv,
  ulozMotiv,
  vyslednyMotiv,
  VYCHODZI,
  KLUC_MOTIVU,
  SKRIPT_DO_HLAVICKY,
} from "./motiv";

/** Testy bežia bez prehliadača, tak si `document` podvrhneme. */
function stranka() {
  const triedy = new Set<string>();
  const koren = {
    classList: {
      toggle: (t: string, zap: boolean) => (zap ? triedy.add(t) : triedy.delete(t)),
      contains: (t: string) => triedy.has(t),
    },
    style: { colorScheme: "" },
  };
  vi.stubGlobal("document", { documentElement: koren });
  return koren;
}

function ulozisko(pociatocne: Record<string, string> = {}) {
  const pamat = new Map(Object.entries(pociatocne));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => pamat.get(k) ?? null,
    setItem: (k: string, v: string) => pamat.set(k, v),
  });
  return pamat;
}

function systemTmavy(tmavy: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: tmavy,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => vi.unstubAllGlobals());

describe("motív", () => {
  it("neznámu uloženú hodnotu ignoruje", () => {
    ulozisko({ [KLUC_MOTIVU]: "modry" });
    expect(nacitajMotiv()).toBe(VYCHODZI);
  });

  it("nedostupné úložisko nie je chyba", () => {
    const koren = stranka();
    systemTmavy(false);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("súkromné okno");
      },
      setItem: () => {
        throw new Error("súkromné okno");
      },
    });
    expect(nacitajMotiv()).toBe(VYCHODZI);
    // Voľba musí platiť aspoň do zatvorenia karty, nie spadnúť.
    expect(() => ulozMotiv("tmavy")).not.toThrow();
    expect(koren.classList.contains("dark")).toBe(true);
  });

  it('voľba „system" sa riadi systémom, pevná voľba nie', () => {
    expect(vyslednyMotiv("system", true)).toBe("tmavy");
    expect(vyslednyMotiv("system", false)).toBe("svetly");
    expect(vyslednyMotiv("svetly", true)).toBe("svetly");
    expect(vyslednyMotiv("tmavy", false)).toBe("tmavy");
  });

  it("nasadí triedu aj color-scheme na koreň stránky", () => {
    const koren = stranka();
    systemTmavy(false);

    nasadMotiv("tmavy");
    expect(koren.classList.contains("dark")).toBe(true);
    // Bez `color-scheme` ostane v tmavom režime biely kalendár a posuvníky.
    expect(koren.style.colorScheme).toBe("dark");

    nasadMotiv("svetly");
    expect(koren.classList.contains("dark")).toBe(false);
    expect(koren.style.colorScheme).toBe("light");
  });

  it('pri „system" rozhoduje systém, nie posledná pevná voľba', () => {
    const koren = stranka();
    systemTmavy(true);
    nasadMotiv("system");
    expect(koren.classList.contains("dark")).toBe(true);
    systemTmavy(false);
    nasadMotiv("system");
    expect(koren.classList.contains("dark")).toBe(false);
  });

  it("voľba prežije načítanie stránky", () => {
    stranka();
    const pamat = ulozisko();
    systemTmavy(false);
    ulozMotiv("tmavy");
    expect(pamat.get(KLUC_MOTIVU)).toBe("tmavy");
    expect(nacitajMotiv()).toBe("tmavy");
  });

  it("rozozná platnú voľbu", () => {
    expect(jeMotiv("svetly")).toBe(true);
    expect(jeMotiv("tmavy")).toBe(true);
    expect(jeMotiv("system")).toBe(true);
    expect(jeMotiv("")).toBe(false);
    expect(jeMotiv(null)).toBe(false);
  });

  it("skript do hlavičky nemá závislosti a nespadne", () => {
    // Beží pred prvým vykreslením — keby vyhodil, stránka ostane biela.
    expect(SKRIPT_DO_HLAVICKY).toContain("try");
    expect(SKRIPT_DO_HLAVICKY).toContain("catch");
    expect(SKRIPT_DO_HLAVICKY).toContain(KLUC_MOTIVU);
    expect(SKRIPT_DO_HLAVICKY).not.toMatch(/import|require/);

    const koren = stranka();
    vi.stubGlobal("localStorage", { getItem: () => "tmavy" });
    systemTmavy(false);
    new Function(SKRIPT_DO_HLAVICKY)();
    expect(koren.classList.contains("dark")).toBe(true);
  });
});
