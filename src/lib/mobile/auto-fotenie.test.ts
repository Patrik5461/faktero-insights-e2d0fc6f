import { describe, expect, it } from "vitest";
import { maFotit, ustalenych, POTREBNYCH_VZORIEK, type Vzorka } from "./auto-fotenie";

const doklad = (posun = 0, mierka = 1): Vzorka => ({
  sirka: 1080,
  vyska: 1920,
  rohy: [
    { x: 200 + posun, y: 300 },
    { x: 200 + 600 * mierka + posun, y: 320 },
    { x: 200 + 600 * mierka + posun, y: 300 + 1100 * mierka },
    { x: 200 + posun, y: 320 + 1100 * mierka },
  ],
});

describe("automatické odfotenie", () => {
  it("ustálený doklad sa odfotí", () => {
    const v = Array.from({ length: POTREBNYCH_VZORIEK }, (_, i) => doklad(i * 3));
    expect(maFotit(v)).toBe(true);
  });

  it("kým sa ruka hýbe, nefotí sa", () => {
    const v = [doklad(0), doklad(120), doklad(240), doklad(360)];
    expect(maFotit(v)).toBe(false);
    expect(ustalenych(v)).toBe(1);
  });

  it("výpadok obrysu počítanie vynuluje", () => {
    expect(maFotit([doklad(), doklad(), null, doklad(), doklad()])).toBe(false);
    expect(ustalenych([doklad(), null, doklad(), doklad()])).toBe(2);
  });

  it("doklad ďaleko (malý v zábere) sa nefotí", () => {
    const v = Array.from({ length: POTREBNYCH_VZORIEK }, () => doklad(0, 0.3));
    expect(maFotit(v)).toBe(false);
  });

  it("málo vzoriek nestačí", () => {
    expect(maFotit([doklad(), doklad()])).toBe(false);
    expect(maFotit([])).toBe(false);
  });
});
