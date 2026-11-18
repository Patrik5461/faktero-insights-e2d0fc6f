import { describe, expect, it } from "vitest";
import { chybajuce, prazdneUdaje, prijataZUdajov } from "./nespracovane";

/*
  Faktúra bez čísla (Patrik 18. 11.): v Nespracovaných číslo nie je povinné;
  pri vytvorení ho doplní variabilný symbol, bez oboch ostane prázdne.
*/
const DNES = "2026-11-18";
const udaje = (z: Partial<ReturnType<typeof prazdneUdaje>> = {}) => ({
  ...prazdneUdaje(),
  dodavatel: { ...prazdneUdaje().dodavatel, nazov: "Dodávateľ s.r.o." },
  datumVystavenia: "2026-11-02",
  splatnost: "2026-11-16",
  celkom: 123,
  ...z,
});

describe("Nespracované — faktúra bez čísla", () => {
  it("chýbajúce číslo nebráni vytvoreniu (ani pri zálohovej, dobropise, daňovom doklade)", () => {
    for (const druh of ["faktura", "zalohova", "danovy", "dobropis"] as const)
      expect(chybajuce(druh, udaje({ cislo: "" }))).not.toContain("cislo");
  });

  it("číslo z VS, bez oboch prázdne (nie „bez čísla“)", () => {
    expect(prijataZUdajov("faktura", udaje({ cislo: "", vs: "2026777" }), DNES).invoice_number).toBe("2026777");
    expect(prijataZUdajov("faktura", udaje({ cislo: "", vs: "" }), DNES).invoice_number).toBe("");
    expect(prijataZUdajov("faktura", udaje({ cislo: "FA-1", vs: "9" }), DNES).invoice_number).toBe("FA-1");
  });
});
