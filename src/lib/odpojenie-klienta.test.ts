import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { jeOdpojenieKlienta, jeOdpojenieZoServera, stisOdpojeniaVLogu } from "./odpojenie-klienta";

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

/** Stacky presne z ~/.pm2/logs/faktero-error.log (31. 10. 2026). */
const STACK_SRVX = `AbortError: This operation was aborted
    at new DOMException (node:internal/per_context/domexception:76:18)
    at AbortController.abort (node:internal/abort_controller:504:18)
    at abort (file:///home/patrik/faktero-releases/98db02ea-1793452362/server/_libs/srvx.mjs:625:55)
    at ServerResponse.<anonymous> (file:///home/patrik/faktero-releases/98db02ea-1793452362/server/_libs/srvx.mjs:629:40)
    at emitCloseNT (node:_http_server:1066:10)
    at Socket.onServerResponseClose (node:_http_server:285:5)`;
const STACK_RESET = `Error: aborted
    at abortIncoming (node:_http_server:838:17)
    at socketOnClose (node:_http_server:832:3)`;

describe("jeOdpojenieZoServera a tichý log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pozná odpojenie zo srvx aj ECONNRESET z http servera, aj zabalené v HTTPError", () => {
    const abort = Object.assign(new DOMException("This operation was aborted", "AbortError"), {});
    Object.defineProperty(abort, "stack", { value: STACK_SRVX });
    expect(jeOdpojenieZoServera(abort)).toBe(true);
    const h3 = Object.assign(new Error("This operation was aborted"), {
      cause: abort,
      status: 500,
      unhandled: true,
    });
    expect(jeOdpojenieZoServera(h3)).toBe(true);
    const reset = Object.assign(new Error("aborted"), { code: "ECONNRESET", stack: STACK_RESET });
    expect(jeOdpojenieZoServera(reset)).toBe(true);
  });

  it("vlastný časový limit (AbortController v našom kóde) v logu ostane", () => {
    const c = new AbortController();
    c.abort();
    const e = c.signal.reason as Error;
    expect(e.name).toBe("AbortError");
    expect(jeOdpojenieZoServera(e)).toBe(false);
    expect(jeOdpojenieZoServera(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("console.error zahodí len odpojenie, ostatné pustí ďalej", () => {
    const vypisy: unknown[][] = [];
    const povodny = console.error;
    console.error = (...a: unknown[]) => void vypisy.push(a);
    try {
      stisOdpojeniaVLogu();
      const reset = Object.assign(new Error("aborted"), { code: "ECONNRESET", stack: STACK_RESET });
      console.error(reset);
      console.error(new Error("skutočná chyba"));
      console.error("[pdf] db error", reset);
      expect(vypisy.length).toBe(2);
      expect(String(vypisy[0][0])).toContain("skutočná chyba");
    } finally {
      console.error = povodny;
      delete (console as Console & { __bezOdpojeni?: boolean }).__bezOdpojeni;
    }
  });
});
