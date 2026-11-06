import { describe, expect, it } from "vitest";
import { cestaPatriFirme, overCestuFirmy } from "./cesta-firmy";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("cestaPatriFirme", () => {
  it("prepustí cestu v priečinku firmy", () => {
    expect(cestaPatriFirme(`${A}/quotes/x.pdf`, A)).toBe(true);
    expect(cestaPatriFirme(`${A}/logo-123.png`, A)).toBe(true);
    expect(cestaPatriFirme(`${A}/faktura..pdf`, A)).toBe(true);
    expect(cestaPatriFirme(`${A}/zľava 50%.pdf`, A)).toBe(true);
  });

  it("odmietne cudziu firmu a podobnú predponu", () => {
    expect(cestaPatriFirme(`${B}/quotes/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}x/quotes/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`/${A}/x.pdf`, A)).toBe(false);
  });

  it("odmietne prázdne a chýbajúce hodnoty", () => {
    expect(cestaPatriFirme("", A)).toBe(false);
    expect(cestaPatriFirme(null, A)).toBe(false);
    expect(cestaPatriFirme(undefined, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/x.pdf`, "")).toBe(false);
    expect(cestaPatriFirme(`${A}/x.pdf`, null)).toBe(false);
    expect(cestaPatriFirme(`${A}/`, A)).toBe(false);
    expect(cestaPatriFirme(A, A)).toBe(false);
    expect(cestaPatriFirme("/x.pdf", "")).toBe(false);
  });

  it("odmietne `..` a `.` aj zakódované", () => {
    expect(cestaPatriFirme(`${A}/../${B}/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/quotes/../../${B}/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/./x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/..`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/%2e%2e/${B}/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/%2E./${B}/x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/a%2f..%2f${B}/x.pdf`, A)).toBe(false);
  });

  it("odmietne spätné lomítko, prázdny segment a znaky meniace URL", () => {
    expect(cestaPatriFirme(`${A}/..\\${B}\\x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}//x.pdf`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/x.pdf?download`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/x.pdf#a`, A)).toBe(false);
    expect(cestaPatriFirme(`${A}/x\u0000.pdf`, A)).toBe(false);
  });

  it("URL by `..` naozaj zložila do cudzieho priečinka", () => {
    // Dôvod kontroly: storage-js cestu nekóduje, fetch ju normalizuje.
    const u = new URL(`https://x.supabase.co/storage/v1/object/kos/${A}/%2e%2e/${B}/x.pdf`);
    expect(u.pathname).toBe(`/storage/v1/object/kos/${B}/x.pdf`);
    expect(cestaPatriFirme(`${A}/%2e%2e/${B}/x.pdf`, A)).toBe(false);
  });
});

describe("overCestuFirmy", () => {
  it("vráti cestu alebo vyhodí chybu", () => {
    expect(overCestuFirmy(`${A}/x.pdf`, A)).toBe(`${A}/x.pdf`);
    expect(() => overCestuFirmy(`${B}/x.pdf`, A)).toThrow("Súbor nepatrí k tejto firme.");
    expect(() => overCestuFirmy(`${A}/../${B}/x.pdf`, A)).toThrow();
  });
});
