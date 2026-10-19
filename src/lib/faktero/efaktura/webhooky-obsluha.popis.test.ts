import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

describe("popisChybyOperacie", () => {
  it("vysvetlí chýbajúcu registráciu v SMP", async () => {
    const { popisChybyOperacie } = await import("./webhooky-obsluha.server");
    expect(popisChybyOperacie({ code: "SMP_REGISTRATION_NOT_FOUND", message: "x" })).toMatch(
      /znova vybrať Faktero/,
    );
  });
  it("iné chyby zloží z kódu a správy, prázdne vráti null", async () => {
    const { popisChybyOperacie } = await import("./webhooky-obsluha.server");
    expect(popisChybyOperacie({ code: "X", message: "zlé" })).toBe("X — zlé");
    expect(popisChybyOperacie(null)).toBeNull();
  });
});
