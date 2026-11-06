import { describe, expect, it } from "vitest";
import {
  chybaZapisVRegistri,
  jeObchodnaSpolocnost,
  sudVGenitive,
  textZapisuVRegistri,
} from "./zapis-v-registri";

describe("textZapisuVRegistri", () => {
  it("hotový text má prednosť", () => {
    expect(
      textZapisuVRegistri({ registracia_text: "  Zapísaná v OR  ", register_sud: "X" }),
    ).toBe("Zapísaná v OR");
  });
  it("skladá SK zápis zo štruktúrovaných polí", () => {
    expect(
      textZapisuVRegistri({
        register_sud: "Mestský súd Bratislava III",
        register_oddiel: "Sro",
        register_vlozka: "123456/B",
      }),
    ).toBe("Obchodný register Mestského súdu Bratislava III, oddiel: Sro, vložka č. 123456/B");
    expect(
      textZapisuVRegistri({ register_sud: "Okresného súdu Žilina", register_oddiel: "Sro", register_vlozka: "1/L" }),
    ).toBe("Obchodný register Okresného súdu Žilina, oddiel: Sro, vložka č. 1/L");
  });
  it("skladá CZ spisovú značku", () => {
    expect(
      textZapisuVRegistri({
        country: "CZ",
        register_sud: "Městský soud v Praze",
        register_oddiel: "C",
        register_vlozka: "12345",
      }),
    ).toBe("Spisová značka C 12345 vedená u Městského soudu v Praze");
  });
  it("prázdne → null", () => {
    expect(textZapisuVRegistri({})).toBeNull();
    expect(textZapisuVRegistri({ registracia_text: "  ", register_sud: "" })).toBeNull();
    expect(textZapisuVRegistri(null)).toBeNull();
  });
});

describe("sudVGenitive", () => {
  it("prevedie 1. pád", () => {
    expect(sudVGenitive("Okresný súd Banská Bystrica")).toBe("Okresného súdu Banská Bystrica");
    expect(sudVGenitive("Krajský soud v Brně")).toBe("Krajského soudu v Brně");
  });
});

describe("jeObchodnaSpolocnost / chybaZapisVRegistri", () => {
  it.each([
    ["PALIERA s.r.o.", true],
    ["Tobify, s. r. o.", true],
    ["ABC spol. s r.o.", true],
    ["Slovnaft, a.s.", true],
    ["Xyz a. s.", true],
    ["Novák k.s.", true],
    ["Ján Novák", false],
    ["Peter Kováč - PK servis", false],
    ["Mass Media", false],
    ["", false],
  ])("%s → %s", (nazov, ocakavane) => {
    expect(jeObchodnaSpolocnost(nazov)).toBe(ocakavane);
  });
  it("upozorní len pri s.r.o. bez zápisu a nie pri DE", () => {
    expect(chybaZapisVRegistri({ name: "PALIERA s.r.o." })).toBe(true);
    expect(chybaZapisVRegistri({ name: "PALIERA s.r.o.", registracia_text: "OR MS BA III" })).toBe(false);
    expect(chybaZapisVRegistri({ name: "Muster GmbH s.r.o.", country: "DE" })).toBe(false);
    expect(chybaZapisVRegistri({ name: "Ján Novák" })).toBe(false);
  });
});

import { zapisZAresVr, zapisZFinstatTextu, zapisZRpo } from "./zapis-v-registri";

describe("prevod odpovedí registrov", () => {
  it("FinStat OR", () => {
    const z = zapisZFinstatTextu("Obchodný register Okresného súdu Trnava, oddiel: Sro, vložka č. 51630/T");
    expect(z).toMatchObject({ sud: "Okresný súd Trnava", oddiel: "Sro", vlozka: "51630/T", druh: "obchodny" });
    expect(z?.text).toBe("Obchodný register Okresného súdu Trnava, oddiel: Sro, vložka č. 51630/T");
  });
  it("FinStat živnostník", () => {
    expect(
      zapisZFinstatTextu("Okresný úrad Žilina, Číslo živnostenského registra: 580-53442")?.text,
    ).toBe("Zapísaný v Živnostenskom registri Okresného úradu Žilina, č. ŽR 580-53442");
  });
  it("RPO s.r.o. — platná hodnota, nie história", () => {
    const z = zapisZRpo({
      sourceRegister: {
        value: { value: "Obchodný register" },
        registrationOffices: [
          { value: "Okresný súd Bratislava I", validFrom: "2010-01-01", validTo: "2025-03-06" },
          { value: "Mestský súd Bratislava III", validFrom: "2025-03-07" },
        ],
        registrationNumbers: [{ value: "Sro/200997/B", validFrom: "2025-03-07" }],
      },
    });
    expect(z?.text).toBe("Obchodný register Mestského súdu Bratislava III, oddiel: Sro, vložka č. 200997/B");
  });
  it("RPO živnostník", () => {
    const z = zapisZRpo({
      sourceRegister: {
        value: { value: "Živnostenský register" },
        registrationOffices: [{ value: "Okresný úrad Žilina" }],
        registrationNumbers: [{ value: "580-53442" }],
      },
    });
    expect(z?.druh).toBe("zivnostensky");
    expect(z?.text).toBe("Zapísaný v Živnostenskom registri Okresného úradu Žilina, č. ŽR 580-53442");
  });
  it("ARES VR", () => {
    expect(
      zapisZAresVr({
        zaznamy: [{ primarniZaznam: true, spisovaZnacka: [{ soud: "MSPH", oddil: "B", vlozka: 8573 }] }],
      })?.text,
    ).toBe("Spisová značka B 8573 vedená u Městského soudu v Praze");
    expect(zapisZAresVr({ zaznamy: [] })).toBeNull();
  });
});

import { nazvySedia } from "./zapis-v-registri";
describe("nazvySedia", () => {
  it("zhoda aj bez právnej formy a diakritiky", () => {
    expect(nazvySedia("BÝVAJLEPŠIE s. r. o.", "BÝVAJLEPŠIE s.r.o.")).toBe(true);
    expect(nazvySedia("Support Delivery", "Support Delivery s. r. o.")).toBe(true);
    expect(nazvySedia("Faktero Demo s.r.o.", "Poľovnícke združenie Bukovina")).toBe(false);
    expect(nazvySedia("mаrкеtрlасе nоtifу", "Marketplace s.r.o.")).toBe(false);
  });
});
