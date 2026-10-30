import { describe, expect, it } from "vitest";
import { akciePripojenia } from "./akcie-pripojenia";

describe("akciePripojenia", () => {
  it("nahratý výpis nemá Načítať účty ani Obnoviť súhlas", () => {
    expect(akciePripojenia("import")).toEqual({
      nacitatUcty: false,
      obnovitSuhlas: false,
      nahratVypis: true,
    });
  });

  it("Tatra banka ich má", () => {
    expect(akciePripojenia("tatrabanka")).toEqual({
      nacitatUcty: true,
      obnovitSuhlas: true,
      nahratVypis: false,
    });
  });
});
