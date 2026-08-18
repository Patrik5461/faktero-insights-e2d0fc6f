import { describe, it, expect } from "vitest";
import { jeZapnute } from "./search-parametre";

describe("príznak z adresy", () => {
  it("prijme tvary, ktoré smerovač z adresy vyrobí", () => {
    // `?x=1` príde ako číslo, `?x=true` ako boolean, `?x` ako prázdny reťazec.
    // Porovnanie len s `"1"` preto neplatilo nikdy a odkaz ticho nefiltroval.
    expect(jeZapnute(true)).toBe(true);
    expect(jeZapnute(1)).toBe(true);
    expect(jeZapnute("true")).toBe(true);
    expect(jeZapnute("1")).toBe(true);
    expect(jeZapnute("")).toBe(true);
  });

  it("vypnuté a nezmysly neprejdú", () => {
    expect(jeZapnute(false)).toBe(false);
    expect(jeZapnute(0)).toBe(false);
    expect(jeZapnute("false")).toBe(false);
    expect(jeZapnute(undefined)).toBe(false);
    expect(jeZapnute("hocičo")).toBe(false);
  });
});
