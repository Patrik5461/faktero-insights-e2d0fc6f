import { describe, it, expect } from "vitest";
import { druhPrijatehoDokladu, jeZalohovaFaktura } from "./zalohova-rozpoznanie";

describe("rozpoznanie prijatej zálohovej faktúry", () => {
  it("verí odpovedi modelu", () => {
    expect(jeZalohovaFaktura({ druhOdAi: "zalohova" })).toBe(true);
    expect(jeZalohovaFaktura({ druhOdAi: "proforma" })).toBe(true);
    expect(jeZalohovaFaktura({ druhOdAi: "ostra" })).toBe(false);
    expect(jeZalohovaFaktura({ druhOdAi: "danovy doklad" })).toBe(false);
  });

  it("nájde zálohu v nadpise aj bez diakritiky", () => {
    expect(jeZalohovaFaktura({ nazovDokladu: "ZÁLOHOVÁ FAKTÚRA č. 5/2026" })).toBe(true);
    expect(jeZalohovaFaktura({ nazovDokladu: "Zalohova faktura" })).toBe(true);
    expect(jeZalohovaFaktura({ nazovDokladu: "Preddavková faktúra" })).toBe(true);
    expect(jeZalohovaFaktura({ nazovDokladu: "Proforma Invoice" })).toBe(true);
  });

  it("pozná zálohu z názvu súboru aj z predmetu mailu", () => {
    expect(jeZalohovaFaktura({ nazovSuboru: "zalohova-faktura-2026-14.pdf" })).toBe(true);
    expect(jeZalohovaFaktura({ predmetMailu: "Proforma na zálohu za montáž" })).toBe(true);
  });

  it("pozná ju aj z čísla dokladu", () => {
    expect(jeZalohovaFaktura({ cisloDokladu: "ZF2026001" })).toBe(true);
    expect(jeZalohovaFaktura({ cisloDokladu: "PF-14" })).toBe(true);
    expect(jeZalohovaFaktura({ cisloDokladu: "2026014" })).toBe(false);
    expect(jeZalohovaFaktura({ cisloDokladu: "FA-2026-100" })).toBe(false);
  });

  it("ostrú faktúru, ktorá zálohu len odpočítava, za zálohu nepovažuje", () => {
    expect(
      jeZalohovaFaktura({
        nazovDokladu: "Faktúra — daňový doklad",
        poznamka: "Odpočet zálohy 500 €",
      }),
    ).toBe(false);
    expect(jeZalohovaFaktura({ poznamka: "Zúčtovanie zálohovej platby" })).toBe(false);
  });

  it("odpoveď modelu prebíja text", () => {
    expect(
      jeZalohovaFaktura({ druhOdAi: "ostra", nazovDokladu: "Zálohová faktúra" }),
    ).toBe(false);
  });

  it("bez podkladov nehádže, len povie nie", () => {
    expect(jeZalohovaFaktura({})).toBe(false);
    expect(jeZalohovaFaktura({ nazovDokladu: null, cisloDokladu: undefined })).toBe(false);
  });

  it("druh dokladu vracia hodnotu pre databázu", () => {
    expect(druhPrijatehoDokladu({ nazovDokladu: "Zálohová faktúra" })).toBe("proforma");
    expect(druhPrijatehoDokladu({ nazovDokladu: "Faktúra" })).toBe("regular");
  });
});
