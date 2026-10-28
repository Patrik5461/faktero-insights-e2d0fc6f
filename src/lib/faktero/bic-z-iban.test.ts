import { describe, expect, it } from "vitest";
import { bicZIban, kodBankyZIban } from "./bic-z-iban";

describe("kód banky a BIC z IBAN-u", () => {
  it("slovenský a český IBAN", () => {
    expect(kodBankyZIban("SK31 1100 0000 0029 8765 4321")).toBe("1100");
    expect(bicZIban("SK31 1100 0000 0029 8765 4321")).toBe("TATRSKBX");
    expect(bicZIban("CZ6508000000192000145399")).toBe("GIBACZPX");
  });
  it("neznáma banka, iná krajina, neplatný tvar", () => {
    expect(kodBankyZIban("SK3199990000002987654321")).toBe("9999");
    expect(bicZIban("SK3199990000002987654321")).toBeNull();
    expect(kodBankyZIban("DE89370400440532013000")).toBeNull();
    expect(kodBankyZIban("")).toBeNull();
    expect(bicZIban(null)).toBeNull();
  });
});
