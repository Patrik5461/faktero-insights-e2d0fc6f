import { describe, expect, it } from "vitest";
import { bezi, cestaZalohy, velkostSlovom, zalohyNaZmazanie } from "./zalohy-firmy";

const r = (id: string, stav: string, den: number) => ({
  id,
  stav,
  cesta: `f/zalohy/${id}.zip`,
  created_at: `2026-10-${String(den).padStart(2, "0")}T10:00:00Z`,
});

describe("zálohy firmy", () => {
  it("ponechá posledných päť hotových a staršie chyby zmaže", () => {
    const riadky = [
      r("a", "hotovo", 1),
      r("b", "chyba", 2),
      r("c", "hotovo", 3),
      r("d", "hotovo", 4),
      r("e", "hotovo", 5),
      r("f", "hotovo", 6),
      r("g", "hotovo", 7),
      r("h", "chyba", 8),
      r("i", "bezi", 9),
    ];
    expect(
      zalohyNaZmazanie(riadky, 5)
        .map((x) => x.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("pri málo zálohách nemaže nič", () => {
    expect(zalohyNaZmazanie([r("a", "hotovo", 1), r("b", "chyba", 2)], 5)).toEqual([]);
  });

  it("zaseknutý beh sa za bežiaci nepovažuje", () => {
    const teraz = new Date("2026-10-09T11:00:00Z").getTime();
    expect(bezi(r("i", "bezi", 9), teraz)).toBe(true);
    expect(bezi(r("i", "bezi", 8), teraz)).toBe(false);
    expect(bezi(r("i", "hotovo", 9), teraz)).toBe(false);
  });

  it("cesta je v priečinku firmy", () => {
    expect(cestaZalohy("abc", new Date("2026-10-28T18:30:05Z"))).toBe(
      "abc/zalohy/zaloha-2026-10-28-18-30-05.zip",
    );
  });

  it("veľkosť slovom", () => {
    expect(velkostSlovom(2048)).toBe("2 kB");
    expect(velkostSlovom(5 * 1024 * 1024)).toBe("5,0 MB");
    expect(velkostSlovom(null)).toBe("—");
  });
});
