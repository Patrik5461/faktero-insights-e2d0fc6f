import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { prelozChybuKodu, upravKod } from "./dvojfaktor";

describe("dvojfaktorové overenie", () => {
  it("kód: 6 číslic, medzery a pomlčky nevadia", () => {
    expect(upravKod("123 456")).toBe("123456");
    expect(upravKod("123-456")).toBe("123456");
    expect(upravKod("12345")).toBeNull();
    expect(upravKod("12a456")).toBeNull();
  });
  it("chyby po slovensky", () => {
    expect(prelozChybuKodu("Invalid TOTP code entered")).toContain("nesedí");
  });
});
