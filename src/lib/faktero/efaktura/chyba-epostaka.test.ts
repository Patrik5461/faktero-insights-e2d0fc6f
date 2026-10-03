import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const { chybaEPostaka } = await import("./epostak.server");

describe("chybaEPostaka", () => {
  it("číta správu zo zabaleného `error`, slovenskú prednostne", () => {
    expect(
      chybaEPostaka(
        { error: { code: "CONFLICT", message: "busy", message_sk: "Spracováva sa." } },
        409,
      ),
    ).toBe("Spracováva sa. (CONFLICT)");
    expect(
      chybaEPostaka(
        { error: { code: "UBL_VALIDATION_ERROR", message: "Buyer name (BT-44) is required" } },
        422,
      ),
    ).toContain("BT-44");
  });

  it("zopakované číslo faktúry vysvetlí po slovensky", () => {
    expect(
      chybaEPostaka({ error: { code: "DUPLICATE_INVOICE_NUMBER", message: "x" } }, 409),
    ).toMatch(/s týmto číslom/);
  });

  it("starý tvar aj prázdne telo", () => {
    expect(chybaEPostaka({ message: "zlé" }, 400)).toBe("zlé");
    expect(chybaEPostaka(null, 502)).toBe("HTTP 502");
  });
});
