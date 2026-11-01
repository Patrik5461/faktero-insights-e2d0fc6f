import { describe, expect, it } from "vitest";
import {
  dnesBratislava,
  posunMesiac,
  posunMesiacBratislava,
  poslednyDenMesiacaBratislava,
  prvyDenMesiacaBratislava,
} from "./datum-vystavenia";

describe("prvý deň mesiaca v Bratislave", () => {
  it("polnoc 1. dňa (v UTC ešte predošlý mesiac) už patrí novému mesiacu", () => {
    // 1. 11. 2026 00:30 SEČ = 31. 10. 23:30 UTC
    const t = new Date("2026-10-31T23:30:00Z");
    expect(dnesBratislava(t)).toBe("2026-11-01");
    expect(prvyDenMesiacaBratislava(t)).toBe("2026-11-01");
  });
  it("tesne pred polnocou je ešte starý mesiac", () => {
    expect(prvyDenMesiacaBratislava(new Date("2026-10-31T22:59:00Z"))).toBe("2026-10-01");
  });
  it("letný čas: 1. 4. 00:30 SELČ = 31. 3. 22:30 UTC", () => {
    expect(prvyDenMesiacaBratislava(new Date("2026-03-31T22:30:00Z"))).toBe("2026-04-01");
  });
  it("deň zmeny času (25. 10. 2026) nič nerozbije", () => {
    expect(prvyDenMesiacaBratislava(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-01");
    expect(poslednyDenMesiacaBratislava(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-31");
  });
  it("posledný deň mesiaca vrátane februára", () => {
    expect(poslednyDenMesiacaBratislava(new Date("2028-02-10T12:00:00Z"))).toBe("2028-02-29");
    expect(poslednyDenMesiacaBratislava(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });
});

describe("posun o mesiace", () => {
  it("orezáva deň na koniec mesiaca", () => {
    expect(posunMesiac("2026-01-31", 1)).toBe("2026-02-28");
    expect(posunMesiac("2028-01-31", 1)).toBe("2028-02-29");
    expect(posunMesiac("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("cez prelom roka oboma smermi", () => {
    expect(posunMesiac("2026-11-15", 2)).toBe("2027-01-15");
    expect(posunMesiac("2026-01-01", -1)).toBe("2025-12-01");
    expect(posunMesiac("2026-01-01", -13)).toBe("2024-12-01");
    expect(posunMesiac("2026-05-10", 0)).toBe("2026-05-10");
  });
  it("neplatný vstup vráti bez zmeny", () => {
    expect(posunMesiac("", 1)).toBe("");
  });
  it("od dneška v Bratislave", () => {
    const t = new Date("2026-10-31T23:30:00Z"); // 1. 11. v Bratislave
    expect(posunMesiacBratislava(-1, t)).toBe("2026-10-01");
    expect(posunMesiacBratislava(3, new Date("2026-11-30T12:00:00Z"))).toBe("2027-02-28");
  });
});
