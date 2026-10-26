import { describe, expect, it } from "vitest";
import {
  blokatory,
  kodClenenia,
  odvodClenenia,
  ponukniPravidlo,
  popisZdroja,
  rezimDph,
  smieAutopilot,
  zvykZDokladov,
  type NavrhZauctovania,
  type VstupClenenia,
} from "./auto-uctovanie";

const prijata = (x: Partial<VstupClenenia> = {}): VstupClenenia => ({
  smer: "prijate",
  krajinaFirmy: "SK",
  firmaPlatitel: true,
  dph: 23,
  ...x,
});
const vydana = (x: Partial<VstupClenenia> = {}): VstupClenenia => prijata({ smer: "vydane", ...x });

describe("odvodClenenia — prijaté doklady", () => {
  it("tuzemská faktúra s DPH → PD, B2, odpočet", () => {
    expect(odvodClenenia(prijata())).toEqual({
      rezim: "tuzemsko",
      clenenieDph: "PD",
      kvClenenie: "B2",
      odpocet: true,
    });
  });
  it("bloček → PD, B3", () => {
    const c = odvodClenenia(prijata({ blocek: true }));
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["blocek", "PD", "B3"]);
  });
  it("dobropis → C2", () => {
    expect(odvodClenenia(prijata({ opravny: true, dph: -23 })).kvClenenie).toBe("C2");
  });
  it("bez nároku na odpočet → PN, X, bez odpočtu", () => {
    const c = odvodClenenia(prijata({ odpocet: false }));
    expect(c).toEqual({
      rezim: "tuzemsko_bez_odpoctu",
      clenenieDph: "PN",
      kvClenenie: "X",
      odpocet: false,
    });
  });
  it("doklad bez DPH (dodávateľ neplatiteľ) → PN, X", () => {
    const c = odvodClenenia(prijata({ dph: 0 }));
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["bez_dph", "PN", "X"]);
  });
  it("tuzemské prenesenie § 69 ods. 12 → B1, kód z číselníka", () => {
    const cis = [
      { druh: "clenenie_dph", kod: "PDpdp", popis: "Prenesenie daňovej povinnosti § 69 ods. 12" },
    ];
    const c = odvodClenenia(prijata({ reverseCharge: true, dph: 0 }), cis);
    expect([c.rezim, c.clenenieDph, c.kvClenenie, c.odpocet]).toEqual([
      "pdp_tuzemsko",
      "PDpdp",
      "B1",
      true,
    ]);
  });
  it("tuzemské prenesenie bez číselníka → kód nevie (null), radšej blokátor", () => {
    expect(odvodClenenia(prijata({ reverseCharge: true, dph: 0 })).clenenieDph).toBeNull();
  });
  it("nadobudnutie tovaru z EÚ → B1, kód podľa popisu", () => {
    const cis = [
      { druh: "clenenie_dph", kod: "PD", popis: "Tuzemské plnenie s nárokom na odpočet" },
      { druh: "clenenie_dph", kod: "PDnad", popis: "Nadobudnutie tovaru z iného členského štátu" },
    ];
    const c = odvodClenenia(
      prijata({ dphRezim: "nadobudnutie", partnerIcDph: "DE123456789", dph: 0 }),
      cis,
    );
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["eu_tovar", "PDnad", "B1"]);
  });
  it("služby z EÚ (samozdanenie) → eu_sluzby, B1", () => {
    const c = odvodClenenia(prijata({ dphRezim: "samozdanenie", partnerKrajina: "IE", dph: 0 }));
    expect([c.rezim, c.kvClenenie]).toEqual(["eu_sluzby", "B1"]);
  });
  it("faktúra z EÚ bez DPH bez príznaku → eu_sluzby", () => {
    expect(rezimDph(prijata({ partnerIcDph: "IE6388047V", dph: 0 }))).toBe("eu_sluzby");
  });
  it("partner mimo EÚ → tretia_krajina; so samozdanením B1, inak X", () => {
    expect(odvodClenenia(prijata({ partnerKrajina: "US", dph: 0 })).kvClenenie).toBe("X");
    const s = odvodClenenia(prijata({ partnerKrajina: "US", dph: 0, dphRezim: "samozdanenie" }));
    expect([s.rezim, s.kvClenenie]).toEqual(["tretia_krajina", "B1"]);
  });
  it("osobitná úprava → PN, X", () => {
    const c = odvodClenenia(prijata({ osobitnaUprava: "66_tovar", dph: 0 }));
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["osobitna_uprava", "PN", "X"]);
  });
  it("firma neplatiteľ → PN, X, bez odpočtu", () => {
    expect(odvodClenenia(prijata({ firmaPlatitel: false }))).toEqual({
      rezim: "firma_neplatitel",
      clenenieDph: "PN",
      kvClenenie: "X",
      odpocet: false,
    });
  });
  it("česká firma nemá KV", () => {
    expect(odvodClenenia(prijata({ krajinaFirmy: "CZ" })).kvClenenie).toBeNull();
  });
  it("grécke IČ DPH (EL) je EÚ", () => {
    expect(rezimDph(prijata({ partnerIcDph: "EL123456789", dph: 0 }))).toBe("eu_sluzby");
  });
});

describe("odvodClenenia — vydané doklady", () => {
  it("tuzemsko → UD, KV automaticky", () => {
    expect(odvodClenenia(vydana())).toEqual({
      rezim: "vystup_tuzemsko",
      clenenieDph: "UD",
      kvClenenie: null,
      odpocet: false,
    });
  });
  it("prenesenie § 69 ods. 12 → UDpdp, A2", () => {
    const c = odvodClenenia(vydana({ reverseChargeType: "domestic_69", dph: 0 }));
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["vystup_pdp", "UDpdp", "A2"]);
  });
  it("dodanie tovaru do EÚ, služby, trojstranný a vývoz", () => {
    expect(rezimDph(vydana({ euPlnenie: "tovar", dph: 0 }))).toBe("vystup_eu_tovar");
    expect(rezimDph(vydana({ euPlnenie: "sluzba", dph: 0 }))).toBe("vystup_eu_sluzby");
    expect(rezimDph(vydana({ euPlnenie: "trojstranny", dph: 0 }))).toBe("vystup_trojstranny");
    expect(rezimDph(vydana({ reverseChargeType: "export", dph: 0 }))).toBe("vystup_export");
    expect(rezimDph(vydana({ reverseChargeType: "eu_b2b", dph: 0 }))).toBe("vystup_eu_sluzby");
  });
  it("vývoz bez číselníka → kód nevie", () => {
    expect(odvodClenenia(vydana({ reverseChargeType: "export", dph: 0 })).clenenieDph).toBeNull();
  });
  it("OSS → UN", () => {
    expect(odvodClenenia(vydana({ ossKrajina: "AT" })).clenenieDph).toBe("UN");
  });
  it("neplatiteľ → UN", () => {
    expect(odvodClenenia(vydana({ firmaPlatitel: false, dph: 0 })).clenenieDph).toBe("UN");
  });
  it("tuzemsko bez DPH → oslobodené, kód len z číselníka", () => {
    expect(rezimDph(vydana({ dph: 0 }))).toBe("vystup_oslobodene");
    const cis = [{ druh: "clenenie_dph", kod: "UNoslob", popis: "Oslobodené plnenie § 65 ods. 7" }];
    expect(odvodClenenia(vydana({ dph: 0 }), cis).clenenieDph).toBe("UNoslob");
  });
  it("osobitná úprava", () => {
    expect(rezimDph(vydana({ osobitnaUprava: "65" }))).toBe("vystup_osobitna");
  });
});

describe("kodClenenia", () => {
  it("firma s vlastným číselníkom bez známeho kódu dostane kód podľa popisu a smeru", () => {
    const cis = [
      { druh: "clenenie_dph", kod: "Ptuz", popis: "Tuzemské plnenie s nárokom na odpočet" },
      { druh: "clenenie_dph", kod: "Utuz", popis: "Tuzemské plnenie" },
    ];
    expect(kodClenenia("tuzemsko", "prijate", cis)).toBe("Ptuz");
    expect(kodClenenia("vystup_tuzemsko", "vydane", cis)).toBe("Utuz");
  });
  it("neaktívny kód sa neponúkne", () => {
    const cis = [
      { druh: "clenenie_dph", kod: "PD", popis: "x", aktivne: false },
      { druh: "clenenie_dph", kod: "PX", popis: "y" },
    ];
    expect(kodClenenia("tuzemsko", "prijate", cis)).toBeNull();
  });
});

describe("zvykZDokladov", () => {
  const d = (pk: string, st: string | null = null) => ({ predkontacia: pk, stredisko: st });
  it("menej ako 3 doklady → žiadny zvyk", () => {
    expect(zvykZDokladov([d("518"), d("518")])).toBeNull();
  });
  it("istota je podiel zhody, najviac 98 %", () => {
    expect(zvykZDokladov([d("518"), d("518"), d("518")])?.istota).toBe(98);
    const z = zvykZDokladov([d("518", "A"), d("518", "A"), d("518", "A"), d("501")]);
    expect(z).toMatchObject({ predkontacia: "518", istota: 75, stredisko: "A", pocet: 4 });
  });
  it("bez väčšiny nič", () => {
    expect(zvykZDokladov([d("518"), d("501"), d("502"), d("518"), d("501")])).toBeNull();
  });
  it("berie len posledných 10", () => {
    const docs = [...Array(10).fill(d("518")), ...Array(20).fill(d("501"))];
    expect(zvykZDokladov(docs)?.predkontacia).toBe("518");
  });
});

describe("blokátory a autopilot", () => {
  const navrh = (x: Partial<NavrhZauctovania> = {}): NavrhZauctovania => ({
    predkontacia: "518",
    clenenieDph: "PD",
    kvClenenie: "B2",
    stredisko: null,
    cinnost: null,
    zdroj: "pravidlo",
    istota: 100,
    zdovodnenie: "",
    blokatory: [],
    ...x,
  });
  it("blokátory", () => {
    expect(
      blokatory({
        zaklad: 100,
        dph: 23,
        celkom: 123,
        predkontacia: "518",
        clenenieDph: "PD",
        sumaEur: 123,
        limit: 5000,
      }),
    ).toEqual([]);
    expect(
      blokatory({ zaklad: 100, dph: 23, celkom: 130, predkontacia: "518", clenenieDph: "PD" }),
    ).toEqual(["sucet"]);
    expect(
      blokatory({ sumaEur: 6000, limit: 5000, predkontacia: "518", clenenieDph: "PD" }),
    ).toEqual(["limit"]);
    expect(
      blokatory({ rezim: "eu_tovar", viesPlatne: false, predkontacia: "518", clenenieDph: "X" }),
    ).toEqual(["vies"]);
    expect(
      blokatory({ rezim: "eu_tovar", viesPlatne: true, predkontacia: "518", clenenieDph: "X" }),
    ).toEqual([]);
    expect(blokatory({ prvyOdPartnera: true, polozkyNesedia: true })).toEqual([
      "polozky",
      "prvy",
      "predkontacia",
      "clenenie",
    ]);
    expect(blokatory({ uzamknuty: true, prvyOdPartnera: true })).toEqual(["uzamknuty"]);
  });
  it("vypnutý nič nepotvrdí", () => {
    expect(smieAutopilot("vypnuty", navrh())).toBe(false);
  });
  it("bezpečný: pravidlo a zvyk ≥ 95, AI nie", () => {
    expect(smieAutopilot("bezpecny", navrh())).toBe(true);
    expect(smieAutopilot("bezpecny", navrh({ zdroj: "zvyk", istota: 98 }))).toBe(true);
    expect(smieAutopilot("bezpecny", navrh({ zdroj: "zvyk", istota: 75 }))).toBe(false);
    expect(smieAutopilot("bezpecny", navrh({ zdroj: "ai", istota: 99 }))).toBe(false);
  });
  it("plný: aj AI ≥ 90", () => {
    expect(smieAutopilot("plny", navrh({ zdroj: "ai", istota: 91 }))).toBe(true);
    expect(smieAutopilot("plny", navrh({ zdroj: "ai", istota: 89 }))).toBe(false);
  });
  it("blokátor alebo chýbajúci kód zastaví aj pravidlo", () => {
    expect(smieAutopilot("plny", navrh({ blokatory: ["prvy"] }))).toBe(false);
    expect(smieAutopilot("plny", navrh({ clenenieDph: null }))).toBe(false);
    expect(smieAutopilot("plny", navrh({ neprepisovat: true }))).toBe(false);
  });
});

describe("popis a ponuka pravidla", () => {
  it("popisZdroja", () => {
    expect(popisZdroja("pravidlo", 100, "Telekom")).toBe("pravidlo Telekom");
    expect(popisZdroja("zvyk", 98)).toBe("zvyk 98 %");
    expect(popisZdroja("ai", 91)).toBe("AI 91 %");
  });
  it("pravidlo sa ponúkne pri druhej rovnakej oprave", () => {
    expect(ponukniPravidlo([], "123", "518")).toBe(false);
    expect(ponukniPravidlo([{ ico: "123", po: "518" }], "123", "518")).toBe(true);
    expect(ponukniPravidlo([{ ico: "123", po: "501" }], "123", "518")).toBe(false);
  });
});

describe("polozkyNesedia", () => {
  it("sedí so sumou s DPH aj so základom, nesedí inak", async () => {
    const { polozkyNesedia } = await import("./auto-uctovanie");
    const it2 = [
      { name: "a", total: 100 },
      { name: "b", quantity: 2, unit_price: 10 },
    ];
    expect(polozkyNesedia(it2, 120, 147.6)).toBe(false);
    expect(polozkyNesedia(it2, 100, 147.6)).toBe(true);
    expect(polozkyNesedia([], 100, 123)).toBe(false);
    expect(polozkyNesedia([{ name: "a", total: -120 }], -120, -147.6)).toBe(false);
  });
});

describe("kodClenenia — číselník z Pohody SK (skutočné kódy)", () => {
  const c = (kod: string, popis: string, agenda: string, aktivne = true) => ({
    druh: "clenenie_dph",
    kod,
    popis,
    agenda,
    aktivne,
  });
  const cis = [
    c("DDnadEU", "Nadobudnutie tovaru z iného štátu EU", "1350 D01"),
    c("DDsluz", "Tovary a služby, pri ktorých daň platí príjemca", "1351 D02"),
    c("PB", "Tuzemské plnenia - bez nároku", "1302 P03"),
    c("PD", "Tuzemské plnenia", "1300 P01"),
    c("PDnadEU", "Nadobudnutie tovaru z iného štátu EU", "1303 P04"),
    c("PBnadEU", "Nadobudnutie tovaru z iného štátu EU - bez nároku", "1305 P06", false),
    c("PDsluz", "Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca", "1306 P07"),
    c(
      "PKsluz",
      "Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca - krátiť nárok",
      "1307 P08",
      false,
    ),
    c("PN", "Nezahrňovať do priznania DPH", "103 P"),
    c("UD", "Tuzemské plnenia", "1200 U01"),
    c("UDdodEU", "Dodanie tovaru do iného štátu EU", "1203 U04"),
    c(
      "UDpdp",
      "Prenesenie daňovej povinnosti §69 ods. 12 (s uvedením sadzby dane)",
      "1235 U36",
      false,
    ),
    c("UNodpBez", "Oslobodené plnenia bez možnosti odpočítania dane", "1209 U10"),
    c("UN", "Nezahrňovať do priznania DPH", "5 U"),
  ];
  it("prijaté: tuzemsko PD, prenesenie PDsluz (nie DDsluz), nadobudnutie PDnadEU, bez DPH PN", () => {
    expect(kodClenenia("tuzemsko", "prijate", cis)).toBe("PD");
    expect(kodClenenia("pdp_tuzemsko", "prijate", cis)).toBe("PDsluz");
    expect(kodClenenia("eu_sluzby", "prijate", cis)).toBe("PDsluz");
    expect(kodClenenia("eu_tovar", "prijate", cis)).toBe("PDnadEU");
    expect(kodClenenia("bez_dph", "prijate", cis)).toBe("PN");
    expect(kodClenenia("tuzemsko_bez_odpoctu", "prijate", cis)).toBe("PB");
    expect(kodClenenia("tuzemsko_bez_odpoctu", "prijate", [])).toBe("PN");
  });
  it("vydané: UD, dodanie do EÚ, oslobodené, neaktívne PDP sa neponúkne", () => {
    expect(kodClenenia("vystup_tuzemsko", "vydane", cis)).toBe("UD");
    expect(kodClenenia("vystup_eu_tovar", "vydane", cis)).toBe("UDdodEU");
    expect(kodClenenia("vystup_oslobodene", "vydane", cis)).toBe("UNodpBez");
    expect(kodClenenia("vystup_pdp", "vydane", cis)).toBeNull();
    expect(kodClenenia("vystup_oss", "vydane", cis)).toBe("UN");
  });
});
