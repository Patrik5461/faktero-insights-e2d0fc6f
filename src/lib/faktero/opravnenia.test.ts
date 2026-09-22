import { describe, expect, it } from "vitest";
import { suhrnOpravneni, vidiOblast, vycistiOpravnenia } from "./opravnenia";

describe("vlastný prístup", () => {
  it("iné roly vidia všetko", () => {
    expect(vidiOblast("accountant", {}, "banka")).toBe(true);
  });
  it("custom len vybrané, kontakty aj cez faktúry", () => {
    expect(vidiOblast("custom", { faktury: "read" }, "faktury")).toBe(true);
    expect(vidiOblast("custom", { faktury: "read" }, "kontakty")).toBe(true);
    expect(vidiOblast("custom", { faktury: "read" }, "banka")).toBe(false);
  });
  it("čistenie vstupu a súhrn", () => {
    expect(vycistiOpravnenia({ faktury: "edit", banka: "none", zlo: "edit", sklad: "admin" })).toEqual({ faktury: "edit" });
    expect(suhrnOpravneni({ faktury: "edit", banka: "read" })).toBe("Faktúry a ponuky (upravovať), Banka (čítať)");
    expect(suhrnOpravneni({})).toBe("žiadna oblasť");
  });
});

import { oblastPodlaCesty } from "./opravnenia";
describe("oblasť stránky", () => {
  it("najdlhšia zhoda", () => {
    expect(oblastPodlaCesty("/efaktura/prijate")).toBe("doklady");
    expect(oblastPodlaCesty("/efaktura/odoslane")).toBe("faktury");
    expect(oblastPodlaCesty("/faktury/nova")).toBe("faktury");
    expect(oblastPodlaCesty("/fakturyx")).toBeNull();
    expect(oblastPodlaCesty("/firma")).toBeNull();
  });
});
