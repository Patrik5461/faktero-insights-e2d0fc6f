import { describe, expect, it } from "vitest";
import { jeOdpojenieKlienta } from "./odpojenie-klienta";

/** Tvary chýb presne z ~/.pm2/logs/faktero-error.log (29.–30. 10. 2026). */
describe("jeOdpojenieKlienta", () => {
  it("AbortError zo srvx pri zatvorenom spojení", () => {
    const e = new DOMException("This operation was aborted", "AbortError");
    expect(jeOdpojenieKlienta(e)).toBe(true);
  });

  it("HTTPError s príčinou ECONNRESET", () => {
    const pricina = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
    const e = Object.assign(new Error("HTTPError"), { cause: pricina, status: 500 });
    expect(jeOdpojenieKlienta(e)).toBe(true);
  });

  it("zrušená požiadavka", () => {
    const c = new AbortController();
    c.abort();
    expect(jeOdpojenieKlienta(undefined, new Request("http://x/", { signal: c.signal }))).toBe(
      true,
    );
  });

  it("skutočná chyba sa loguje ďalej", () => {
    expect(jeOdpojenieKlienta(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(jeOdpojenieKlienta(undefined, new Request("http://x/"))).toBe(false);
    expect(jeOdpojenieKlienta(undefined)).toBe(false);
  });
});
