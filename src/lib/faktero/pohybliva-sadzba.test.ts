import { describe, expect, it } from "vitest";
import {
  datumFixingu,
  hodnotaIndexu,
  historiaSadzby,
  odhadUrokov,
  porovnajSoSkutocnymi,
  pracovnyDenPred,
  sadzbaObdobia,
  sadzbaZoSkutocnosti,
  urokZaDni,
  zaciatokObdobia,
  zostatkyPoDnoch,
  type NastavenieSadzby,
  type ReferencnaSadzba,
} from "./pohybliva-sadzba";
import { citajCnbPriborRok, citajEcbCsv } from "./referencne-sadzby";

const mesacny = (mesiac: string, hodnota: number, index = "EURIBOR_1M"): ReferencnaSadzba => ({
  index,
  druh: "mesacny_priemer",
  datum: `${mesiac}-01`,
  hodnota,
});

/** Kontokorent ako v zmluve ČSOB: 1M EURIBOR 2 prac. dni pred obdobím + 4,3 %, ACT/360. */
const CSOB: NastavenieSadzby = {
  rate_type: "pohybliva",
  interest_rate: 4.3,
  reference_index: "EURIBOR_1M",
  rate_margin: 4.3,
  index_floor: null,
  fixing_rule: "pred_zaciatkom_obdobia",
  fixing_offset_days: 2,
  rate_reset: "mesacne",
  day_count: "ACT/360",
};

describe("úrok za dni", () => {
  it("100 000 € pri 6,2 % za 30 dní ACT/360 = 516,67 €", () => {
    expect(urokZaDni(100_000, 6.2, 30, "ACT/360")).toBe(516.67);
  });
  it("ACT/365 dá menej než ACT/360", () => {
    expect(urokZaDni(100_000, 6.2, 30, "ACT/365")).toBe(509.59);
  });
});

describe("pracovné dni a fixing", () => {
  it("dva pracovné dni pred 1. 10. 2026 (štvrtok) je utorok 29. 9.", () => {
    expect(pracovnyDenPred("2026-10-01", 2)).toBe("2026-09-29");
  });
  it("preskočí víkend aj Veľkú noc (TARGET)", () => {
    // 6. 4. 2026 Veľkonočný pondelok, 3. 4. Veľký piatok
    expect(pracovnyDenPred("2026-04-07", 2)).toBe("2026-04-01");
  });
  it("mesačný priemer berie predchádzajúci mesiac", () => {
    expect(datumFixingu("2026-11-01", "mesacny_priemer", null)).toBe("2026-10-31");
  });
  it("začiatok štvrťroka a polroka", () => {
    expect(zaciatokObdobia("2026-11-17", "stvrtrocne")).toBe("2026-10-01");
    expect(zaciatokObdobia("2026-05-17", "polrocne")).toBe("2026-01-01");
    expect(zaciatokObdobia("2026-05-17", "mesacne")).toBe("2026-05-01");
  });
});

describe("sadzba za obdobie", () => {
  it("1M EURIBOR 1,9 % + marža 4,3 % = 6,2 %, z mesačného priemeru je to odhad", () => {
    const s = sadzbaObdobia(CSOB, "2026-10-01", [mesacny("2026-09", 1.9)]);
    expect(s.sadzba).toBe(6.2);
    expect(s.fixing).toBe("2026-09-29");
    expect(s.indexHodnota).toBe(1.9);
    expect(s.odhad).toBe(true);
    expect(s.predbezna).toBe(false);
  });

  it("záporný EURIBOR s dolnou hranicou 0 % → platí len marža", () => {
    const s = sadzbaObdobia({ ...CSOB, index_floor: 0 }, "2021-03-01", [mesacny("2021-02", -0.55)]);
    expect(s.sadzba).toBe(4.3);
    expect(s.floorPouzity).toBe(true);
  });

  it("záporný EURIBOR bez hranice sadzbu zníži", () => {
    const s = sadzbaObdobia(CSOB, "2021-03-01", [mesacny("2021-02", -0.55)]);
    expect(s.sadzba).toBe(3.75);
    expect(s.floorPouzity).toBe(false);
  });

  it("keď index k fixingu ešte nie je, použije sa posledný známy a výsledok je predbežný", () => {
    const s = sadzbaObdobia(CSOB, "2026-11-01", [
      mesacny("2026-08", 2.2),
      mesacny("2026-09", 2.41),
    ]);
    expect(s.indexHodnota).toBe(2.41);
    expect(s.indexK).toBe("2026-09-01");
    expect(s.predbezna).toBe(true);
    expect(s.sadzba).toBe(6.71);
  });

  it("bez akejkoľvek hodnoty indexu sadzba nie je", () => {
    expect(sadzbaObdobia(CSOB, "2026-11-01", []).sadzba).toBeNull();
  });

  it("denný index (€STR) sa berie k dňu fixingu", () => {
    const denne: ReferencnaSadzba[] = [
      { index: "ESTR", druh: "denna", datum: "2026-09-28", hodnota: 2.4 },
      { index: "ESTR", druh: "denna", datum: "2026-09-29", hodnota: 2.44 },
      { index: "ESTR", druh: "denna", datum: "2026-09-30", hodnota: 2.5 },
    ];
    const h = hodnotaIndexu("ESTR", "2026-10-01", "pred_zaciatkom_obdobia", 2, denne);
    expect(h).toMatchObject({ hodnota: 2.44, k: "2026-09-29", odhad: false, predbezna: false });
  });

  it("ručne zadaná sadzba prebije výpočet", () => {
    const s = sadzbaObdobia(
      CSOB,
      "2026-10-01",
      [mesacny("2026-09", 1.9)],
      [{ period_start: "2026-10-01", rate: 6.233, note: "oznámenie banky" }],
    );
    expect(s.zdroj).toBe("rucne");
    expect(s.sadzba).toBe(6.233);
    expect(s.indexHodnota).toBe(1.9);
  });

  it("pevná sadzba je pevná", () => {
    const s = sadzbaObdobia({ rate_type: "pevna", interest_rate: 7.5 }, "2026-10-01", []);
    expect(s).toMatchObject({ zdroj: "pevna", sadzba: 7.5 });
  });

  it("história po štvrťrokoch", () => {
    const h = historiaSadzby(
      { ...CSOB, reference_index: "EURIBOR_3M", rate_reset: "stvrtrocne" },
      "2026-02-15",
      "2026-09-30",
      [
        mesacny("2025-12", 2.0, "EURIBOR_3M"),
        mesacny("2026-03", 2.1, "EURIBOR_3M"),
        mesacny("2026-06", 2.2, "EURIBOR_3M"),
      ],
    );
    expect(h.map((x) => [x.od, x.do, x.sadzba])).toEqual([
      ["2026-01-01", "2026-03-31", 6.3],
      ["2026-04-01", "2026-06-30", 6.4],
      ["2026-07-01", "2026-09-30", 6.5],
    ]);
  });
});

describe("odhad úrokov z kontokorentu", () => {
  const sadzby = [mesacny("2026-09", 1.9), mesacny("2026-10", 1.9), mesacny("2026-11", 2.1)];

  it("100 000 € celý november pri 6,2 % ACT/360 = 516,67 €", () => {
    const r = odhadUrokov({
      nast: CSOB,
      obdobieUrocenia: "mesacne",
      od: "2026-11-01",
      do: "2026-11-30",
      cerpanie: () => 100_000,
      sadzby,
      dnes: "2027-01-10",
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ od: "2026-11-01", do: "2026-11-30", dni: 30, urok: 516.67 });
    expect(r[0]!.predbezny).toBe(false);
    expect(r[0]!.odhad).toBe(true);
  });

  it("prechod medzi mesiacmi pri štvrťročnom strhávaní rozdelí obdobie na úseky", () => {
    const r = odhadUrokov({
      nast: CSOB,
      obdobieUrocenia: "stvrtrocne",
      od: "2026-10-01",
      do: "2026-12-31",
      cerpanie: (d) => (d >= "2026-11-16" && d <= "2026-12-15" ? 100_000 : 0),
      sadzby,
      dnes: "2027-01-10",
    });
    expect(r).toHaveLength(1);
    // 15 dní × 6,2 % + 15 dní × 6,4 % z 100 000 € / 360
    expect(r[0]!.urok).toBe(525);
    const useky = r[0]!.useky;
    expect(useky.map((u) => u.sadzba)).toEqual([6.2, 6.4]);
    expect(useky[1]).toMatchObject({ od: "2026-12-01", do: "2026-12-31", urok: 266.67 });
  });

  it("bežiaci mesiac je predbežný", () => {
    const r = odhadUrokov({
      nast: CSOB,
      obdobieUrocenia: "mesacne",
      od: "2026-10-15",
      do: "2026-10-19",
      cerpanie: () => 24_000,
      sadzby,
      dnes: "2026-10-19",
    });
    expect(r[0]).toMatchObject({
      od: "2026-10-15",
      do: "2026-10-19",
      koniecObdobia: "2026-10-31",
      dni: 5,
    });
    expect(r[0]!.predbezny).toBe(true);
    expect(r[0]!.urok).toBe(20.67);
  });

  it("čerpanie z dnešného zostatku a pohybov", () => {
    const zostatok = zostatkyPoDnoch(-23_973.12, [
      { booking_date: "2026-10-16", amount: -30_000 },
      { booking_date: "2026-10-17", amount: 5_000 },
      { booking_date: "2026-10-17", amount: 1_026.88 },
    ]);
    expect(zostatok("2026-10-17")).toBe(-23_973.12);
    expect(zostatok("2026-10-16")).toBe(-30_000);
    expect(zostatok("2026-10-15")).toBe(0);
    expect(zostatok("2026-01-01")).toBe(0);
  });

  it("porovnanie so strhnutým úrokom ukáže rozdiel a sadzbu, ktorá z neho vyplýva", () => {
    const r = odhadUrokov({
      nast: CSOB,
      obdobieUrocenia: "mesacne",
      od: "2026-11-01",
      do: "2026-12-31",
      cerpanie: () => 100_000,
      sadzby,
      dnes: "2027-01-10",
    });
    const p = porovnajSoSkutocnymi(r, [
      { charged_on: "2026-11-30", amount: 519.17 },
      { charged_on: "2027-01-02", amount: 551.11 },
    ]);
    expect(p[0]).toMatchObject({ urok: 516.67, skutocny: 519.17, rozdiel: 2.5 });
    expect(p[1]).toMatchObject({ urok: 551.11, skutocny: 551.11, rozdiel: 0 });
    expect(sadzbaZoSkutocnosti(p[0]!)).toBe(6.23);
  });
});

describe("čítanie zdrojov", () => {
  it("CSV z ECB", () => {
    const csv = [
      "KEY,FREQ,REF_AREA,CURRENCY,PROVIDER_FM,INSTRUMENT_FM,PROVIDER_FM_ID,DATA_TYPE_FM,TIME_PERIOD,OBS_VALUE,OBS_STATUS",
      "FM.M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA,M,U2,EUR,RT,MM,EURIBOR1MD_,HSTA,2026-08,2.2209524,A",
      "FM.M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA,M,U2,EUR,RT,MM,EURIBOR1MD_,HSTA,2026-09,2.4143636,A",
    ].join("\n");
    expect(citajEcbCsv(csv, "EURIBOR_1M", "mesacny_priemer")).toEqual([
      { index: "EURIBOR_1M", druh: "mesacny_priemer", datum: "2026-08-01", hodnota: 2.2209524 },
      { index: "EURIBOR_1M", druh: "mesacny_priemer", datum: "2026-09-01", hodnota: 2.4143636 },
    ]);
  });

  it("ročný TXT PRIBOR z ČNB", () => {
    const txt = [
      "|1 den||7 dní||14 dní||1 měsíc||2 měsíce||3 měsíce||6 měsíců||9 měsíců||1 rok|",
      "Datum|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR|PRIBID|PRIBOR",
      "12.10.2026||3,75||3,77||3,79||3,82||||3,91||4,06||||4,26",
    ].join("\n");
    expect(citajCnbPriborRok(txt)).toEqual([
      { index: "PRIBOR_1M", druh: "denna", datum: "2026-10-12", hodnota: 3.82 },
      { index: "PRIBOR_3M", druh: "denna", datum: "2026-10-12", hodnota: 3.91 },
      { index: "PRIBOR_6M", druh: "denna", datum: "2026-10-12", hodnota: 4.06 },
      { index: "PRIBOR_1R", druh: "denna", datum: "2026-10-12", hodnota: 4.26 },
    ]);
  });
});
