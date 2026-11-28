import { describe, expect, it } from "vitest";
import { dniPracovnehoPokoja, icsKalendara, pracovnyDen, terminyFirmy, type FaktyFirmy } from "./danovy-kalendar";

const zaklad: FaktyFirmy = {
  krajina: "SK",
  platitelDph: true,
  schemaDph: "sk_4",
  maZamestnancov: false,
  maVozidla: false,
  maOss: false,
  mesiaceEu: [],
  mesiace7: [],
};
const druhy = (t: { druh: string; datum: string }[]) => t.map((x) => `${x.druh}@${x.datum}`);

describe("sviatky a posun lehoty", () => {
  it("SK 2026: 8. 5. a 15. 9. sú pracovné, 1. 9. / 28. 10. / 17. 11. nie sú dni pokoja", () => {
    const s = dniPracovnehoPokoja("SK", 2026);
    expect(s.has("2026-05-08")).toBe(false);
    expect(s.has("2026-09-15")).toBe(false);
    expect(s.has("2026-09-01")).toBe(false);
    expect(s.has("2026-04-03")).toBe(true); // Veľký piatok
    expect(s.has("2026-04-06")).toBe(true); // Veľkonočný pondelok
    expect(dniPracovnehoPokoja("SK", 2027).has("2027-09-15")).toBe(true);
    expect(dniPracovnehoPokoja("SK", 2027).has("2027-03-26")).toBe(true);
  });
  it("posun cez víkend a sviatky", () => {
    expect(pracovnyDen("SK", "2026-04-25")).toBe("2026-04-27"); // sobota
    expect(pracovnyDen("SK", "2026-12-25")).toBe("2026-12-28"); // 25.–26. sviatky, 27. nedeľa
    expect(pracovnyDen("CZ", "2026-05-01")).toBe("2026-05-04");
    expect(pracovnyDen("SK", "2026-11-25")).toBe("2026-11-25");
  });
});

describe("termíny SK", () => {
  it("mesačný platiteľ: DPH a KV 25., posun z víkendu", () => {
    const t = terminyFirmy(zaklad, {}, "2026-04-01", "2026-04-30");
    expect(druhy(t)).toEqual(["dph@2026-04-27", "kv@2026-04-27"]);
    expect(t[0].povodny).toBe("2026-04-25");
    expect(t[0].obdobie).toBe("marec 2026");
  });
  it("štvrťročný platiteľ len po štvrťroku", () => {
    expect(terminyFirmy(zaklad, { dph_obdobie: "stvrtrocne" }, "2026-05-01", "2026-06-30")).toEqual([]);
    const t = terminyFirmy(zaklad, { dph_obdobie: "stvrtrocne" }, "2026-07-01", "2026-07-31");
    expect(druhy(t)).toEqual(["dph@2026-07-27", "kv@2026-07-27"]);
    expect(t[0].obdobie).toBe("Q2 2026");
  });
  it("§ 7: len za mesiac s povinnosťou, žiadny KV", () => {
    const f = { ...zaklad, platitelDph: false, schemaDph: "sk_7", mesiace7: ["2026-09"] };
    expect(druhy(terminyFirmy(f, {}, "2026-10-01", "2026-11-30"))).toEqual(["dph7@2026-10-26"]);
  });
  it("súhrnný výkaz len pri dodaní do EÚ", () => {
    const f = { ...zaklad, mesiaceEu: ["2026-10"] };
    expect(druhy(terminyFirmy(f, {}, "2026-11-01", "2026-11-30"))).toContain("sv@2026-11-25");
    expect(druhy(terminyFirmy(f, {}, "2026-12-01", "2026-12-31"))).not.toContain("sv@2026-12-28");
  });
  it("OSS koniec mesiaca po štvrťroku, bez posunu", () => {
    const t = terminyFirmy({ ...zaklad, maOss: true }, {}, "2026-10-01", "2026-10-31");
    expect(t.find((x) => x.druh === "oss")).toMatchObject({ datum: "2026-10-31", povodny: null });
  });
  it("daň z príjmov 31. 3., odklad, preddavky, DMV, zamestnanci", () => {
    expect(druhy(terminyFirmy(zaklad, {}, "2027-03-01", "2027-03-31"))).toContain("dp@2027-03-31");
    expect(druhy(terminyFirmy(zaklad, { odklad_dp: 3 }, "2027-06-01", "2027-06-30"))).toContain("dp@2027-06-30");
    expect(druhy(terminyFirmy(zaklad, { preddavky_dzp: "stvrtrocne" }, "2026-09-01", "2026-09-30"))).toContain("preddavok_dzp@2026-09-30");
    expect(druhy(terminyFirmy({ ...zaklad, maVozidla: true }, {}, "2027-01-01", "2027-02-05"))).toContain("dmv@2027-02-01");
    const z = terminyFirmy({ ...zaklad, maZamestnancov: true }, { vyplatny_den: 10 }, "2026-12-01", "2026-12-31");
    expect(druhy(z)).toEqual(expect.arrayContaining(["poistne@2026-12-10", "vykaz_zp@2026-12-14", "mesacny_prehlad@2026-12-31"]));
  });
});

describe("termíny CZ a .ics", () => {
  it("CZ DPH, KH, DPPO elektronicky 4. 5. 2026", () => {
    const f: FaktyFirmy = { ...zaklad, krajina: "CZ", schemaDph: "cz_platce" };
    expect(druhy(terminyFirmy(f, {}, "2026-05-01", "2026-05-31"))).toEqual(["cz_dppo@2026-05-04", "cz_dph@2026-05-25", "cz_kh@2026-05-25"]);
  });
  it("ics má celodenné udalosti s pripomienkou", () => {
    const x = icsKalendara(terminyFirmy(zaklad, {}, "2026-11-01", "2026-11-30"), "Test, s.r.o.");
    expect(x).toContain("DTSTART;VALUE=DATE:20261125");
    expect(x).toContain("TRIGGER:-P3D");
    expect(x).toContain("Test\\, s.r.o.");
  });
});
