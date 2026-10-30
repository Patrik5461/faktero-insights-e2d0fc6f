import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hlaskaRucnychStorien, rozdelStorna, stornoLenRucne } from "./storno-dokladu-k-platbe";
import { polozkyStorna } from "./export.server";

describe("storno daňového dokladu k platbe", () => {
  it("len doklad k platbe odovzdaný ako interný doklad sa stornuje ručne", () => {
    expect(stornoLenRucne("advance_payment", "interne")).toBe(true);
    // Predvolené nastavenie exportu je „interný doklad“.
    expect(stornoLenRucne("advance_payment", undefined)).toBe(true);
    expect(stornoLenRucne("advance_payment", "vydane")).toBe(false);
    expect(stornoLenRucne("regular", "interne")).toBe(false);
    expect(stornoLenRucne("proforma", "interne")).toBe(false);
    expect(stornoLenRucne(null, "interne")).toBe(false);
  });

  it("dávka: faktúry idú do XML, doklady k platbe do ručných", () => {
    const storna = [
      { id: "1", cislo: "2026001", typ: "regular" },
      { id: "2", cislo: "DP2026005", typ: "advance_payment" },
      { id: "3", cislo: "ZF2026002", typ: "proforma" },
    ];
    const { doXml, rucne } = rozdelStorna(storna, "interne");
    expect(doXml.map((s) => s.id)).toEqual(["1", "3"]);
    expect(rucne.map((s) => s.id)).toEqual(["2"]);
    // XML storien už neobsahuje cancelDocument na interný doklad.
    expect(polozkyStorna({ storna: doXml })).not.toContain("DP2026005");

    const vydane = rozdelStorna(storna, "vydane");
    expect(vydane.rucne).toHaveLength(0);
  });

  it("súhrn povie koľko, ktoré a ako ich zrušiť v Pohode", () => {
    expect(hlaskaRucnychStorien([])).toBeNull();
    const jedna = hlaskaRucnychStorien([{ cislo: "DP2026005" }])!;
    expect(jedna).toContain("DP2026005");
    expect(jedna).toContain("Interné doklady");
    expect(jedna).toContain("Záznam → Storno");
    const dve = hlaskaRucnychStorien([{ cislo: "DP1" }, { cislo: "DP2" }])!;
    expect(dve).toContain("(2)");
    expect(dve).toContain("DP1, DP2");
    // Súhrn páruje preskočené faktúry podľa textu pred „ — “ — nesmie to byť číslo dokladu.
    expect(dve.split(" — ")[0]).not.toBe("DP1");
  });

  it("schéma interných dokladov naozaj nemá cancelDocument (preto ručne)", () => {
    const intDoc = readFileSync(new URL("./schemy/pohoda/intDoc.xsd", import.meta.url), "utf8");
    expect(intDoc).not.toContain("cancelDocument");
  });
});
