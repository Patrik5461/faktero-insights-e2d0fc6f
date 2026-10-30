import { describe, expect, it } from "vitest";
import {
  HLASKA_CAS,
  HLASKA_CHYBA,
  HLASKA_PRIVELA,
  HLASKA_RELACIA,
  HLASKA_SERVER,
  HLASKA_SIET,
  technickaChyba,
} from "./chyba-pre-ludi";
import { friendlyError } from "./plan-error";
import { prelozHlaskuChyby } from "./toast-chyby";
import { preloz } from "@/lib/i18n/jazyk";

/**
 * Pri výpadku siete videl človek „TypeError: Failed to fetch“ a pri chybe
 * servera „upstream error“ (overené Playwrightom s `page.route` 30. 10. 2026).
 */
describe("technickaChyba", () => {
  it.each([
    ["TypeError: Failed to fetch", HLASKA_SIET],
    ["NetworkError when attempting to fetch resource.", HLASKA_SIET],
    ["Load failed", HLASKA_SIET],
    ["AbortError: The operation was aborted.", HLASKA_SIET],
    ["upstream error", HLASKA_SERVER],
    ["PGRST000: Could not connect", HLASKA_SERVER],
    ["Request failed with status 500", HLASKA_SERVER],
    ["HTTP 502 Bad Gateway", HLASKA_SERVER],
    ["Unexpected token '<', \"<html>\" is not valid JSON", HLASKA_SERVER],
    ["<html><body>502 Bad Gateway nginx</body></html>", HLASKA_SERVER],
    ["<html><head><title>500 Internal Server Error</title></head></html>", HLASKA_SERVER],
    ["<html><head><title>429 Too Many Requests</title></head></html>", HLASKA_PRIVELA],
    ["status 429", HLASKA_PRIVELA],
    ["Too Many Requests", HLASKA_PRIVELA],
    ["JWT expired", HLASKA_RELACIA],
    ["PGRST301: JWSError", HLASKA_RELACIA],
    ["504 Gateway Time-out", HLASKA_CAS],
    ["TypeError: Cannot read properties of undefined (reading 'id')", HLASKA_CHYBA],
  ])("%s", (vstup, veta) => {
    expect(technickaChyba(vstup)).toBe(veta);
    expect(technickaChyba(new Error(vstup))).toBe(veta);
  });

  it("vlastné vety aplikácie nechá tak, aj s číslami", () => {
    for (const v of [
      "Vyberte odberateľa",
      "Export má najviac 500 dokladov.",
      "Faktúra s týmto číslom už existuje. Zvoľte iné číslo.",
      "Limit 429 € je prekročený",
      "",
    ])
      expect(technickaChyba(v)).toBeNull();
  });

  it("friendlyError prekladá aj technické chyby", () => {
    expect(friendlyError({ message: "TypeError: Failed to fetch" })).toBe(HLASKA_SIET);
    // Hlášky z databázy majú prednosť.
    expect(friendlyError({ message: "duplicate key value violates unique constraint" })).toBe(
      "Taký záznam už existuje.",
    );
  });

  it("každá veta má preklad do češtiny a nemčiny", () => {
    for (const v of [
      HLASKA_SIET,
      HLASKA_CAS,
      HLASKA_PRIVELA,
      HLASKA_RELACIA,
      HLASKA_SERVER,
      HLASKA_CHYBA,
    ]) {
      expect(preloz("de", v)).not.toBe(v);
      expect(preloz("cs", v)).not.toBe(v);
    }
  });

  it("toast dostane preloženú vetu podľa jazyka", () => {
    expect(prelozHlaskuChyby("TypeError: Failed to fetch", "de")).toBe(preloz("de", HLASKA_SIET));
    expect(prelozHlaskuChyby("Vyberte odberateľa", "de")).toBe("Vyberte odberateľa");
  });
});
