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

import { jeAdminRola, mozeUpravovat } from "./opravnenia";

describe("mozeUpravovat — zrkadlo firmy_s_pravom(oblast, true)", () => {
  it("owner, admin, účtovník, zamestnanec smú všade", () => {
    for (const rola of ["owner", "admin", "accountant", "employee"])
      for (const o of ["faktury", "banka", "jazdy", "zamestnanci", "uctovnictvo"] as const)
        expect(mozeUpravovat(rola, {}, o)).toBe(true);
  });
  it("custom len pri edit", () => {
    const opr = { faktury: "edit", banka: "read", jazdy: "none" };
    expect(mozeUpravovat("custom", opr, "faktury")).toBe(true);
    expect(mozeUpravovat("custom", opr, "banka")).toBe(false);
    expect(mozeUpravovat("custom", opr, "jazdy")).toBe(false);
    expect(mozeUpravovat("custom", opr, "sklad")).toBe(false);
    expect(mozeUpravovat("custom", null, "faktury")).toBe(false);
  });
  it("custom: kontakty cez edit na faktúrach, read na faktúrach nestačí", () => {
    expect(mozeUpravovat("custom", { faktury: "edit" }, "kontakty")).toBe(true);
    expect(mozeUpravovat("custom", { faktury: "read" }, "kontakty")).toBe(false);
    expect(mozeUpravovat("custom", { kontakty: "edit" }, "kontakty")).toBe(true);
  });
  it("bez roly nič", () => {
    expect(mozeUpravovat(null, {}, "faktury")).toBe(false);
    expect(mozeUpravovat(undefined, { faktury: "edit" }, "faktury")).toBe(false);
  });
  it("jeAdminRola", () => {
    expect(jeAdminRola("owner")).toBe(true);
    expect(jeAdminRola("admin")).toBe(true);
    // Od 2026-11-02 má účtovník plné práva k firme ako admin.
    expect(jeAdminRola("accountant")).toBe(true);
    for (const r of ["employee", "custom", "viewer", null, undefined]) expect(jeAdminRola(r)).toBe(false);
  });
});
