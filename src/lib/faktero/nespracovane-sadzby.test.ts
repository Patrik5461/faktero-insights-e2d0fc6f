import { describe, expect, it } from "vitest";
import { sadzbyNespracovaneho } from "./nespracovane-sadzby";

describe("sadzby DPH v nespracovanom doklade (H-01)", () => {
  it("česká firma dostane české sadzby", () => {
    expect(sadzbyNespracovaneho("CZ", "2026-10-01")).toEqual([21, 12, 0]);
  });

  it("slovenská firma slovenské", () => {
    expect(sadzbyNespracovaneho("SK", "2026-10-01")).toEqual([23, 19, 5, 0]);
  });

  it("bez krajiny ostáva SK ako doteraz", () => {
    expect(sadzbyNespracovaneho(null, null)).toEqual(sadzbyNespracovaneho("SK", null));
    expect(sadzbyNespracovaneho(undefined, "")).toEqual(sadzbyNespracovaneho("SK", null));
  });
});
