import { describe, expect, it } from "vitest";
import {
  csvDochadzky,
  hodinyZaznamu,
  hodnotyTokenov,
  mesacnySuhrn,
  pracovneDniVMesiaci,
  PREDVOLENE_SABLONY,
  pripomienkyZamestnancov,
  vyplnSablonu,
  type Zamestnanec,
  type Zmluva,
} from "./zamestnanci";

const jan: Zamestnanec = {
  id: "z1",
  first_name: "Ján",
  last_name: "Novák",
  status: "active",
  start_date: "2026-10-01",
};

describe("pripomienky zamestnancov", () => {
  it("Sociálna poisťovňa: prihláška deň pred nástupom, týždeň vopred", () => {
    const p = pripomienkyZamestnancov("2026-09-24", [jan], []);
    const sp = p.find((x) => x.druh === "sp_prihlaska");
    expect(sp?.termin).toBe("2026-09-30");
    expect(sp?.zavaznost).toBe("info");
    // Skôr než týždeň pred termínom ešte nič.
    expect(pripomienkyZamestnancov("2026-09-20", [jan], []).some((x) => x.druh === "sp_prihlaska")).toBe(false);
  });

  it("po termíne je pripomienka červená a nezmizne, kým sa nevybaví", () => {
    const p = pripomienkyZamestnancov("2026-10-02", [jan], []);
    expect(p.find((x) => x.druh === "sp_prihlaska")?.zavaznost).toBe("danger");
    const vybavene = pripomienkyZamestnancov("2026-10-02", [{ ...jan, sp_registered_at: "2026-09-29" }], []);
    expect(vybavene.some((x) => x.druh === "sp_prihlaska")).toBe(false);
  });

  it("zdravotná poisťovňa: do 8 dní od nástupu", () => {
    const zp = pripomienkyZamestnancov("2026-10-05", [jan], []).find((x) => x.druh === "zp_prihlaska");
    expect(zp?.termin).toBe("2026-10-09");
  });

  it("skúšobná doba a koniec zmluvy na dobu určitú z aktívnej zmluvy", () => {
    const zmluva: Zmluva = {
      id: "k1",
      employee_id: "z1",
      kind: "pracovna_zmluva",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      probation_end: "2026-04-01",
      status: "active",
    };
    const dnes = "2026-12-10";
    const z = { ...jan, start_date: "2026-01-01", sp_registered_at: "2025-12-30", zp_registered_at: "2026-01-02" };
    const p = pripomienkyZamestnancov(dnes, [z], [zmluva]);
    expect(p.map((x) => x.druh)).toEqual(["koniec_zmluvy"]);
    expect(p[0].kluc).toBe("zam:koniec_zmluvy:k1:2026-12-31");
    // Ukončená zmluva sa nepripomína.
    expect(pripomienkyZamestnancov(dnes, [z], [{ ...zmluva, status: "ended" }])).toEqual([]);
  });

  it("lekárska prehliadka a BOZP 30 dní vopred; neaktívny zamestnanec nič", () => {
    const z = { ...jan, sp_registered_at: "x", zp_registered_at: "x", medical_check_due: "2026-11-01", bozp_training_due: "2027-06-01" };
    const p = pripomienkyZamestnancov("2026-10-10", [z], []);
    expect(p.map((x) => x.druh)).toEqual(["lekarska_prehliadka"]);
    expect(pripomienkyZamestnancov("2026-10-10", [{ ...z, status: "ended" }], [])).toEqual([]);
  });
});

describe("dochádzka", () => {
  it("hodiny z príchodu a odchodu mínus prestávka, aj cez polnoc", () => {
    expect(hodinyZaznamu({ time_from: "08:00", time_to: "16:30", break_minutes: 30 })).toBe(8);
    expect(hodinyZaznamu({ time_from: "22:00", time_to: "06:00", break_minutes: 0 })).toBe(8);
    expect(hodinyZaznamu({ hours: 4.5, time_from: "08:00", time_to: "16:00" })).toBe(4.5);
    expect(hodinyZaznamu({})).toBe(0);
  });

  it("pracovné dni neprítomnosti sa zrežú na mesiac a vynechajú víkend", () => {
    // 28. 9. – 3. 10. 2026: v októbri piatok 1. a sobota 3. → 2 pracovné dni (1., 2.)
    expect(pracovneDniVMesiaci("2026-09-28", "2026-10-03", "2026-10")).toBe(2);
    expect(pracovneDniVMesiaci("2026-10-01", "2026-10-31", "2026-10")).toBe(22);
  });

  it("mesačný súhrn a CSV pre slovenský Excel", () => {
    const s = mesacnySuhrn(
      "2026-10",
      [jan],
      [
        { employee_id: "z1", work_date: "2026-10-01", time_from: "08:00", time_to: "16:30", break_minutes: 30, kind: "praca" },
        { employee_id: "z1", work_date: "2026-10-02", hours: 6.5, kind: "home_office" },
        { employee_id: "z1", work_date: "2026-11-02", hours: 8, kind: "praca" },
      ],
      [{ employee_id: "z1", kind: "dovolenka", date_from: "2026-10-05", date_to: "2026-10-09" }],
    );
    expect(s[0]).toMatchObject({ odpracovaneDni: 2, hodiny: 14.5 });
    expect(s[0].nepritomnosti.dovolenka).toBe(5);
    const csv = csvDochadzky("2026-10", s);
    expect(csv.startsWith("﻿Mesiac;Zamestnanec")).toBe(true);
    expect(csv).toContain("2026-10;Ján Novák;2;14,5;5");
  });
});

describe("šablóny dokumentov", () => {
  it("vyplní tokeny a chýbajúce nahradí trojbodkou", () => {
    expect(vyplnSablonu("{{a}} a {{ b }} a {{c}}", { a: "1", b: "2" })).toBe("1 a 2 a …");
  });

  it("pracovná zmluva dostane údaje firmy, zamestnanca aj zmluvy", () => {
    const hodnoty = hodnotyTokenov({
      firma: { name: "Tobify s. r. o.", ico: "56607016", street: "Hlavná 1", zip: "811 01", city: "Bratislava" },
      zamestnanec: { ...jan, title_before: "Ing.", birth_date: "1990-05-04", street: "Dlhá 2", zip: "900 01", city: "Senec" },
      zmluva: {
        id: "k1",
        employee_id: "z1",
        kind: "pracovna_zmluva",
        start_date: "2026-10-01",
        probation_end: "2026-12-31",
        position: "účtovník",
        weekly_hours: 40,
        salary: 1800,
        salary_period: "mesacne",
        currency: "EUR",
        status: "active",
      },
      rodneCislo: "900504/1234",
      dnes: "2026-09-21",
    });
    const text = vyplnSablonu(PREDVOLENE_SABLONY.pracovna_zmluva, hodnoty);
    expect(text).toContain("Tobify s. r. o., IČO 56607016, so sídlom Hlavná 1, 811 01 Bratislava");
    expect(text).toContain("Ing. Ján Novák, nar. 4. 5. 1990, r. č. 900504/1234, bytom Dlhá 2, 900 01 Senec");
    expect(text).toContain("na dobu neurčitú");
    expect(text).toContain("40 hodín týždenne");
    expect(text).toMatch(/1\s800,00\s€ mesačne/);
    expect(text).toContain("V Bratislava dňa 21. 9. 2026");
  });
});
