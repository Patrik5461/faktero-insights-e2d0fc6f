import { describe, expect, it } from "vitest";
import { opravneniaSkladu } from "./sklad-opravnenia";

describe("opravneniaSkladu (SA-11b, SA-17)", () => {
  it("rola custom s právom upravovať sklad smie Príjem/Výdaj", () => {
    expect(opravneniaSkladu("custom", { sklad: "edit" }, true).canMutate).toBe(true);
  });
  it("custom len na čítanie alebo bez skladu nesmie", () => {
    expect(opravneniaSkladu("custom", { sklad: "read" }, true).canMutate).toBe(false);
    expect(opravneniaSkladu("custom", { faktury: "edit" }, true).canMutate).toBe(false);
  });
  it("používateľ zapisuje, správa skladov len majiteľ, admin a účtovník", () => {
    const o = opravneniaSkladu("employee", {}, true);
    expect(o.canMutate).toBe(true);
    expect(o.canManage).toBe(false);
    for (const r of ["owner", "admin", "accountant"]) {
      expect(opravneniaSkladu(r, {}, true)).toMatchObject({ canMutate: true, canManage: true });
    }
  });
  it("kým sa rola načítava, nič nesmie a hlási loading", () => {
    const o = opravneniaSkladu("owner", {}, false);
    expect(o).toMatchObject({ loading: true, canMutate: false, canManage: false });
  });
});
