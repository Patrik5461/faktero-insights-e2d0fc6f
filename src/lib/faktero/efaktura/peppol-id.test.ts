import { describe, it, expect } from "vitest";
import { dicZUdajov, peppolId, peppolIdZDph, schemaZId, SCHEMA_SK } from "./peppol-id";

describe("Peppol id slovenskej firmy", () => {
  it("schéma je 0245, nie 9944", () => {
    // Overené proti ePoštákovi: 9944 nenájde nikoho, 0245 je „sendable".
    expect(SCHEMA_SK).toBe("0245");
    expect(peppolId({ dic: "5843291067" })).toBe("0245:5843291067");
  });

  it("z IČ DPH odreže predponu SK", () => {
    expect(dicZUdajov(null, "SK5843291067")).toBe("5843291067");
    expect(peppolId({ icDph: "SK5843291067" })).toBe("0245:5843291067");
  });

  it("DIČ má prednosť pred IČ DPH", () => {
    expect(dicZUdajov("1111111111", "SK2222222222")).toBe("1111111111");
  });

  it("zadané id sa neprepisuje", () => {
    expect(peppolId({ zadane: "0088:1234567890123", dic: "5843291067" })).toBe(
      "0088:1234567890123",
    );
  });

  it("zadané bez schémy sa doplní slovenskou", () => {
    expect(peppolId({ zadane: "5843291067" })).toBe("0245:5843291067");
  });

  it("bez údajov nevymýšľa id", () => {
    expect(peppolId({})).toBeNull();
    expect(peppolId({ dic: "   ", icDph: "" })).toBeNull();
  });

  it("medzery v DIČ neprekážajú", () => {
    expect(peppolId({ dic: " 5843 291067 " })).toBe("0245:5843291067");
  });

  it("schéma sa dá prečítať späť", () => {
    expect(schemaZId("0245:5843291067")).toBe("0245");
    expect(schemaZId(null)).toBeNull();
  });
});

describe("Peppol id zahraničného odberateľa", () => {
  it("schéma podľa krajiny IČ DPH, hodnota s predponou", () => {
    expect(peppolId({ icDph: "DE123456789" })).toBe("9930:DE123456789");
    expect(peppolId({ icDph: "cz 12345678" })).toBe("9929:CZ12345678");
    expect(peppolId({ icDph: "ATU12345678" })).toBe("9914:ATU12345678");
    expect(peppolId({ icDph: "IT01234567890" })).toBe("0211:IT01234567890");
  });

  it("zahraničné IČ DPH nikdy nejde do slovenskej schémy 0245", () => {
    expect(dicZUdajov(null, "DE123456789")).toBeNull();
    expect(dicZUdajov("CZ12345678", null)).toBeNull();
    expect(peppolId({ dic: "CZ12345678" })).toBe("9929:CZ12345678");
  });

  it("neznáma krajina alebo nezmysel → žiadne id (nie e-mail)", () => {
    expect(peppolId({ icDph: "XX123" })).toBeNull();
    expect(peppolId({ dic: "abc" })).toBeNull();
    expect(peppolIdZDph("SK2021234567")).toBeNull();
  });
});

describe("párovanie firmy u ePoštáka", () => {
  it("nájde firmu podľa IČO aj s medzerami", async () => {
    const { najdiFirmuPodlaIco } = await import("./epostak.server");
    const firmy = [
      { id: "a", name: "Prvá", ico: "86179504", peppolId: null, peppolStatus: null },
      { id: "b", name: "Druhá", ico: "43291067", peppolId: null, peppolStatus: null },
    ];
    expect(najdiFirmuPodlaIco(firmy, "43 291 067")?.id).toBe("b");
    expect(najdiFirmuPodlaIco(firmy, "86179504")?.id).toBe("a");
  });

  it("bez IČO ani s neznámym nevráti nič — inak by sa odosielalo za cudziu firmu", async () => {
    const { najdiFirmuPodlaIco } = await import("./epostak.server");
    const firmy = [{ id: "a", name: "Prvá", ico: "86179504", peppolId: null, peppolStatus: null }];
    expect(najdiFirmuPodlaIco(firmy, null)).toBeNull();
    expect(najdiFirmuPodlaIco(firmy, "")).toBeNull();
    expect(najdiFirmuPodlaIco(firmy, "99999999")).toBeNull();
  });
});
