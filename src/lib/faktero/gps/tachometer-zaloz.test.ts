import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../payment-crypto.server", () => ({
  decryptSecret: () => "{}",
  isDecryptError: () => false,
}));

const { tachometerZoZoznamu } = await import("./gps-sync.server");

describe("tachometer pre „Založiť vozidlo“", () => {
  const zoznam = [
    { externeId: "1", tachometerKm: 541_358.4 },
    { externeId: "2", tachometerKm: null },
    { externeId: "3", tachometerKm: 0 },
    { externeId: "4", tachometerKm: 541_358_000 },
  ];
  it("prevezme stav z GPS a zaokrúhli ho na km", () => {
    expect(tachometerZoZoznamu(zoznam, "1")).toBe(541_358);
  });
  it("bez stavu, s nulou alebo nezmyslom vráti null", () => {
    expect(tachometerZoZoznamu(zoznam, "2")).toBeNull();
    expect(tachometerZoZoznamu(zoznam, "3")).toBeNull();
    expect(tachometerZoZoznamu(zoznam, "4")).toBeNull();
    expect(tachometerZoZoznamu(zoznam, "9")).toBeNull();
    expect(tachometerZoZoznamu(null, "1")).toBeNull();
  });
});
