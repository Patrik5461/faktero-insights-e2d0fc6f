import { describe, expect, it } from "vitest";
import { upomienkaNaRade, type VstupUpomienky } from "./upomienky-poradie";

const zaklad: VstupUpomienky = {
  splatnost: "2026-10-01",
  zalozena: "2026-09-15T10:00:00Z",
  dnes: "2026-10-29",
  prahy: [3, 7, 14],
  odoslane: [],
};

describe("ktorá upomienka je na rade", () => {
  it("faktúra dlho po splatnosti dostane najprv prvú, nie hneď tretiu", () => {
    expect(upomienkaNaRade(zaklad)).toEqual({ stupen: 1 });
  });

  it("importovaná faktúra (vznikla po splatnosti) sa automaticky neupomína", () => {
    expect(upomienkaNaRade({ ...zaklad, zalozena: "2026-10-28T12:00:00Z" })).toEqual({
      stupen: null,
      dovod: "importovana",
    });
  });

  it("faktúra zapísaná v deň splatnosti sa upomína normálne", () => {
    expect(upomienkaNaRade({ ...zaklad, zalozena: "2026-10-01T15:00:00Z" }).stupen).toBe(1);
  });

  it("pred prvým prahom nič", () => {
    expect(upomienkaNaRade({ ...zaklad, dnes: "2026-10-03" })).toEqual({
      stupen: null,
      dovod: "este_nie",
    });
    expect(upomienkaNaRade({ ...zaklad, dnes: "2026-10-04" }).stupen).toBe(1);
  });

  it("druhá až po prvej, s rozostupom aspoň 7 dní", () => {
    const po1 = { ...zaklad, odoslane: [{ stupen: 1, kedy: "2026-10-25T08:00:00Z" }] };
    expect(upomienkaNaRade(po1)).toEqual({ stupen: null, dovod: "rozostup" });
    expect(upomienkaNaRade({ ...po1, dnes: "2026-11-01" })).toEqual({ stupen: 2 });
  });

  it("druhá nepríde pred svojím prahom ani po skorej prvej", () => {
    const v = {
      ...zaklad,
      dnes: "2026-10-06",
      odoslane: [{ stupen: 1, kedy: "2026-09-20T08:00:00Z" }],
    };
    expect(upomienkaNaRade(v)).toEqual({ stupen: null, dovod: "este_nie" });
  });

  it("po tretej už nič", () => {
    const v = {
      ...zaklad,
      dnes: "2026-12-31",
      odoslane: [
        { stupen: 1, kedy: "2026-10-04T08:00:00Z" },
        { stupen: 2, kedy: "2026-10-11T08:00:00Z" },
        { stupen: 3, kedy: "2026-10-18T08:00:00Z" },
      ],
    };
    expect(upomienkaNaRade(v)).toEqual({ stupen: null, dovod: "vsetky_odoslane" });
  });
});
