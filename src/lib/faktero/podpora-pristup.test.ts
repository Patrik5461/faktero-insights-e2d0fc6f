import { describe, expect, it } from "vitest";
import {
  oznamUdeleniaPodpore,
  opravneniaPodpory,
  platnostDo,
  stavPristupu,
} from "./podpora-pristup";
import { OBLASTI } from "./opravnenia";

describe("prístup technickej podpory", () => {
  it("len čítanie dá všade len čítať, plný upravovať — zamestnancov nikdy", () => {
    const citanie = opravneniaPodpory("citanie");
    const plny = opravneniaPodpory("plny");
    expect(citanie.zamestnanci).toBeUndefined();
    expect(plny.zamestnanci).toBeUndefined();
    expect(Object.values(citanie).every((u) => u === "read")).toBe(true);
    expect(Object.values(plny).every((u) => u === "edit")).toBe(true);
    expect(Object.keys(plny)).toHaveLength(OBLASTI.length - 1);
  });

  it("platnosť je 1 až 30 dní", () => {
    const teraz = new Date("2026-10-28T10:00:00Z");
    expect(platnostDo(7, teraz).toISOString()).toBe("2026-11-04T10:00:00.000Z");
    expect(platnostDo(0, teraz).toISOString()).toBe("2026-10-29T10:00:00.000Z");
    expect(platnostDo(365, teraz).toISOString()).toBe("2026-11-27T10:00:00.000Z");
  });

  it("po čase sa ukazuje ako vypršaný, aj keď ho server ešte nezrušil", () => {
    const teraz = Date.parse("2026-10-28T10:00:00Z");
    expect(stavPristupu({ stav: "aktivny", platne_do: "2026-10-29T00:00:00Z" }, teraz)).toBe(
      "aktivny",
    );
    expect(stavPristupu({ stav: "aktivny", platne_do: "2026-10-28T09:00:00Z" }, teraz)).toBe(
      "vyprsal",
    );
    expect(stavPristupu({ stav: "odobraty", platne_do: "2026-10-29T00:00:00Z" }, teraz)).toBe(
      "odobraty",
    );
  });
});

describe("oznam podpore o udelení prístupu", () => {
  it("názov firmy, rozsah a platnosť v čase Bratislavy, bez dôvodu", () => {
    const o = oznamUdeleniaPodpore({
      firma: "  Tobify\n s.r.o. ",
      rozsah: "citanie",
      dni: 3,
      platneDo: "2026-10-31T13:05:00Z",
    });
    expect(o.predmet).toBe(
      "Tobify s.r.o. udelila prístup technickej podpore do 31. 10. 2026 14:05",
    );
    expect(o.text).toContain("(3 dni), rozsah: len čítanie.");
  });
  it("jeden deň a plný prístup", () => {
    const o = oznamUdeleniaPodpore({
      firma: "",
      rozsah: "plny",
      dni: 1,
      platneDo: new Date("2026-07-01T10:00:00Z"),
    });
    expect(o.predmet).toMatch(/^Firma udelila prístup technickej podpore do 1\. 7\. 2026 12:00$/);
    expect(o.text).toContain("(1 deň), rozsah: plný prístup k dokladom.");
  });
});
