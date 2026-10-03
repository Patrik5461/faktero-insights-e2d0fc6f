import { describe, expect, it } from "vitest";
import { prostredieGopay } from "./gopay-prostredie";

describe("prostredieGopay", () => {
  it("prázdna hodnota nie je prostredie — rozhodne ďalšia", () => {
    expect(prostredieGopay("", "production")).toBe("production");
    expect(prostredieGopay(undefined, "  ")).toBe("sandbox");
  });
  it("databáza má prednosť pred env", () => {
    expect(prostredieGopay("sandbox", "production")).toBe("sandbox");
    expect(prostredieGopay(" Production ", "")).toBe("production");
  });
});
