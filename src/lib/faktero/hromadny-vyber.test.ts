import { describe, expect, it } from "vitest";
import { prepniRiadok, prepniVsetky, stavHlavicky, zoznamKodov, zuzNaViditelne } from "./hromadny-vyber";

const riadky = ["a", "b", "c", "d", "e"];

describe("hromadný výber", () => {
  it("hlavička: nič / časť (indeterminate) / všetko", () => {
    expect(stavHlavicky(riadky, new Set())).toBe("nic");
    expect(stavHlavicky(riadky, new Set(["b"]))).toBe("cast");
    expect(stavHlavicky(riadky, new Set(riadky))).toBe("vsetko");
    expect(stavHlavicky([], new Set(["a"]))).toBe("nic");
    // Označené mimo viditeľných sa nerátajú.
    expect(stavHlavicky(["a", "b"], new Set(["a", "b", "x"]))).toBe("vsetko");
  });

  it("označiť všetko berie len viditeľné; druhý klik zruší", () => {
    const s = prepniVsetky(["b", "d"], new Set());
    expect([...s]).toEqual(["b", "d"]);
    expect(prepniVsetky(["b", "d"], s).size).toBe(0);
    // Pri čiastočnom výbere označí všetko viditeľné.
    expect([...prepniVsetky(riadky, new Set(["c"]))].sort()).toEqual(riadky);
  });

  it("Shift+klik označí rozsah od posledného kliknutého", () => {
    let s = prepniRiadok(riadky, new Set(), "b");
    s = prepniRiadok(riadky, s, "e", { shift: true, posledny: "b" });
    expect([...s].sort()).toEqual(["b", "c", "d", "e"]);
    // Rozsah smerom hore a odznačenie rozsahu.
    s = prepniRiadok(riadky, s, "c", { shift: true, posledny: "e" });
    expect([...s]).toEqual(["b"]);
    // Bez Shiftu len jeden riadok.
    s = prepniRiadok(riadky, new Set(), "d", { shift: false, posledny: "a" });
    expect([...s]).toEqual(["d"]);
    // Posledný už nie je viditeľný → len jeden riadok.
    s = prepniRiadok(riadky, new Set(), "d", { shift: true, posledny: "zmizol" });
    expect([...s]).toEqual(["d"]);
  });

  it("zmena filtra zruší označenie neviditeľných", () => {
    const s = new Set(["a", "c", "e"]);
    expect([...zuzNaViditelne(["a", "b"], s)]).toEqual(["a"]);
    // Bez zmeny vráti ten istý objekt (žiadne zbytočné prekreslenie).
    expect(zuzNaViditelne(riadky, s)).toBe(s);
  });

  it("zoznam kódov v potvrdení: najviac 10, zvyšok ako „+ N ďalších“", () => {
    const kody = Array.from({ length: 13 }, (_, i) => `K${i + 1}`);
    const txt = zoznamKodov(kody, (n) => `+ ${n} ďalších`);
    expect(txt).toBe("K1, K2, K3, K4, K5, K6, K7, K8, K9, K10 + 3 ďalších");
    expect(zoznamKodov(["A", "B"], () => "x")).toBe("A, B");
  });
});
