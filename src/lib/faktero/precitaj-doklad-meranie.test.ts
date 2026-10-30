import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Čítanie dokladu z appky a z nahratia na webe sa v prehľade využitia AI
  zapisovalo ako „Doklady z e-mailu“ bez firmy (test 30. 10. 2026). Účel a firma
  musia prejsť až do `aiVision`, ktorý ich zapíše do `ai_pouzitie`.
*/
const aiVision = vi.fn(async () => '{"supplier_name":"Dodávateľ"}');
vi.mock("./ai.server", () => ({ aiVision }));
vi.mock("./pdf-prilohy.server", () => ({ dokladZPrilohy: async () => null }));

describe("precitajDoklad — účel a firma pre meranie AI", () => {
  beforeEach(() => aiVision.mockClear());

  it("bez kontextu ostáva e-mail (pôvodné správanie)", async () => {
    const { precitajDoklad } = await import("./mail-prijem.server");
    await precitajDoklad("AAAA", "image/jpeg");
    const nastavenie = (aiVision.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(nastavenie.ucel).toBe("doklad-z-posty");
    expect(nastavenie.firma).toBeNull();
  });

  it("nahratý doklad nesie účel aj firmu", async () => {
    const { precitajDoklad } = await import("./mail-prijem.server");
    const ai = await precitajDoklad("AAAA", "image/jpeg", null, {
      ucel: "nespracovane",
      firma: "f-1",
    });
    expect(ai).toEqual({ supplier_name: "Dodávateľ" });
    const nastavenie = (aiVision.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(nastavenie.ucel).toBe("nespracovane");
    expect(nastavenie.firma).toBe("f-1");
  });

  it("účel má v admine názov", async () => {
    const { nazovUcelu } = await import("./ai-cennik");
    expect(nazovUcelu("nespracovane")).not.toBe("nespracovane");
  });
});
