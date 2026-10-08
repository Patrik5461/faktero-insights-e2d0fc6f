import { afterEach, describe, expect, it } from "vitest";
import { _vycistiFrontu, jeNebezpecna, potvrd, prihlasOkno, vybavZiadost, type Ziadost } from "./potvrdenie";

describe("potvrdenie akcie", () => {
  afterEach(() => _vycistiFrontu());

  it("otázky idú po jednej a každá dostane svoju odpoveď", async () => {
    const zobrazene: (string | null)[] = [];
    const odhlas = prihlasOkno((z: Ziadost | null) => zobrazene.push(z?.sprava ?? null));
    const a = potvrd("Zmazať A?");
    const b = potvrd("Uložiť B?");
    expect(zobrazene).toEqual(["Zmazať A?"]);
    vybavZiadost(true);
    vybavZiadost(false);
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(false);
    expect(zobrazene).toEqual(["Zmazať A?", "Uložiť B?", null]);
    odhlas();
  });

  it("nebezpečnú akciu spozná podľa textu", () => {
    expect(jeNebezpecna("Naozaj zmazať objednávku?")).toBe(true);
    expect(jeNebezpecna("Presunúť doklad do koša?")).toBe(true);
    expect(jeNebezpecna("Konvertovať ponuku na faktúru?")).toBe(false);
  });
});
