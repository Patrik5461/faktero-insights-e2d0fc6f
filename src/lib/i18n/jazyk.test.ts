import { describe, expect, it } from "vitest";
import { preloz, pocetPrekladov } from "./jazyk";

describe("preklad webu", () => {
  it("slovenčina vráti text, nemčina preklad, chýbajúci preklad ostane po slovensky", () => {
    expect(preloz("sk", "Uložiť")).toBe("Uložiť");
    expect(preloz("de", "Uložiť")).toBe("Speichern");
    expect(preloz("de", "Text, ktorý nikto nepreložil")).toBe("Text, ktorý nikto nepreložil");
  });
  it("kľúč s kontextom: slovensky časť za ::, bez kontextového prekladu holé slovo", () => {
    expect(preloz("sk", "pozvanka::Uložiť")).toBe("Uložiť");
    expect(preloz("de", "pozvanka::Uložiť")).toBe("Speichern");
  });
  it("dosadí parametre", () => {
    expect(preloz("sk", "Spolu {n} faktúr", { n: 5 })).toBe("Spolu 5 faktúr");
  });
  it("slovníky sa načítajú zo všetkých súborov", () => {
    expect(pocetPrekladov()).toBeGreaterThan(5);
  });
});
