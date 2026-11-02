import { describe, expect, it } from "vitest";
import { vyberKonektora } from "./konektor-pohody-vyber";

describe("balíček konektora Pohody (E-08, E-09)", () => {
  it("zamestnanec bez admin firmy — nesmie, nič nie je vybrané", () => {
    const v = vyberKonektora([{ id: "a", role: "employee" }], "a");
    expect(v.nesmie).toBe(true);
    expect(v.vybrane).toEqual([]);
  });
  it("účtovník smie ako admin", () => {
    const v = vyberKonektora([{ id: "a", role: "accountant" }], "a");
    expect(v.nesmie).toBe(false);
    expect(v.vybrane).toEqual(["a"]);
  });
  it("jediná admin firma iná než otvorená — zoznam sa ukáže", () => {
    const v = vyberKonektora(
      [
        { id: "a", role: "employee" },
        { id: "b", role: "owner", name: "B" },
      ],
      "a",
    );
    expect(v.vybrane).toEqual(["b"]);
    expect(v.ukazZoznam).toBe(true);
  });
  it("jediná admin firma = otvorená — bez zoznamu", () => {
    expect(vyberKonektora([{ id: "a", role: "admin" }], "a").ukazZoznam).toBe(false);
  });
});
