/**
 * České priznanie k DPH a kontrolné hlásenie — výpočet aj XML proti
 * oficiálnym schémam Finančnej správy ČR (`schemy/dphdp3_epo2.xsd`,
 * `schemy/dphkh1_epo2.xsd`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { kontrolniHlaseni, priznaniCz, dicCz, kontrolniRadkyC, souhrnneHlaseni } from "./cz-dph";
import { dp3NaXml, kh1NaXml, rozdelUlicu, shvNaXml, type HlavickaCz } from "./cz-dph-xml";
import type { Vstup } from "./dph-vykazy";

function overSchemou(xml: string, subor: string): string | null {
  const xsd = XmlDocument.fromBuffer(readFileSync(new URL(`./schemy/${subor}`, import.meta.url)));
  const validator = XsdValidator.fromDoc(xsd);
  const doc = XmlDocument.fromBuffer(Buffer.from(xml, "utf8"));
  try {
    validator.validate(doc);
    return null;
  } catch (e) {
    return String((e as Error)?.message ?? e);
  } finally {
    doc.dispose();
    validator.dispose();
    xsd.dispose();
  }
}

const vstup: Vstup = {
  obdobie: { rok: 2026, mesiac: 9 },
  vystavene: [
    // Veľká faktúra s českým DIČ → A.4.
    {
      cislo: "FV2026001",
      typ: "regular",
      datumDodania: "2026-09-10",
      odberatelIcDph: "CZ27082440",
      riadky: [
        { sadzba: 21, zaklad: 20000, dan: 4200 },
        { sadzba: 12, zaklad: 1000, dan: 120 },
      ],
    },
    // Malá faktúra → A.5.
    {
      cislo: "FV2026002",
      typ: "regular",
      datumDodania: "2026-09-12",
      odberatelIcDph: "CZ12345678",
      riadky: [{ sadzba: 21, zaklad: 5000, dan: 1050 }],
    },
    // Prenesenie § 92a → A.1, ř. 25.
    {
      cislo: "FV2026003",
      typ: "regular",
      datumDodania: "2026-09-15",
      odberatelIcDph: "CZ87654321",
      prenosDane: true,
      prenosTyp: "domestic_69",
      riadky: [{ sadzba: 0, zaklad: 50000, dan: 0 }],
    },
    // Služba do EÚ → ř. 21, do KH nejde.
    {
      cislo: "FV2026004",
      typ: "regular",
      datumDodania: "2026-09-20",
      odberatelIcDph: "SK2122358579",
      prenosDane: true,
      prenosTyp: "eu_b2b",
      euPlnenie: "sluzba",
      riadky: [{ sadzba: 0, zaklad: 8000, dan: 0 }],
    },
  ],
  prijate: [
    // Tuzemský nákup nad hranicu → B.2, ř. 40.
    {
      cislo: "PF-77",
      dodavatelIcDph: "CZ25097563",
      datumDodania: "2026-09-05",
      rezim: "tuzemsko",
      odpocet: true,
      riadky: [{ sadzba: 21, zaklad: 30000, dan: 6300 }],
    },
    // Služba z EÚ bez dane → A.2, ř. 5 + odpočet ř. 43.
    {
      cislo: "INV-9",
      dodavatelIcDph: "DE123456789",
      datumDodania: "2026-09-08",
      rezim: "samozdanenie",
      odpocet: true,
      riadky: [{ sadzba: 0, zaklad: 10000, dan: 0 }],
    },
  ],
  doklady: [
    {
      dodavatelIcDph: "CZ11111111",
      odpocet: true,
      riadky: [{ sadzba: 21, zaklad: 1000, dan: 210 }],
      cislo: "BL1",
      datum: "2026-09-03",
    },
  ],
};

const hlavicka: HlavickaCz = {
  dic: "25097563",
  nazov: "QA Česká s.r.o.",
  ulica: "Jeremiášova 1422/7b",
  obec: "Praha",
  psc: "155 00",
  email: "qa@example.cz",
  cUfo: "451",
  cPracufo: "2001",
  typPlatce: "P",
  oprJmeno: "Jan",
  oprPrijmeni: "Novák",
  oprPostaveni: "jednatel",
};

describe("kontrolní hlášení", () => {
  const kh = kontrolniHlaseni(vstup, { kodPredmetu: "4", vlastneDic: "99999999" });

  it("rozdelí doklady podľa hranice 10 000 Kč", () => {
    expect(kh.a4).toHaveLength(1);
    expect(kh.a4[0]).toMatchObject({
      dic: "27082440",
      zaklad1: 20000,
      dan1: 4200,
      zaklad2: 1000,
      dan2: 120,
    });
    expect(kh.a5).toEqual({ zaklad1: 5000, dan1: 1050, zaklad2: 0, dan2: 0 });
    expect(kh.a1).toEqual([
      { dic: "87654321", doklad: "FV2026003", duzp: "2026-09-15", zaklad: 50000 },
    ]);
    expect(kh.b2).toHaveLength(1);
    expect(kh.b3).toEqual({ zaklad1: 1000, dan1: 210, zaklad2: 0, dan2: 0 });
  });

  it("služba z EÚ ide do A.2 so samozdanením 21 %", () => {
    expect(kh.a2).toEqual([
      {
        stat: "DE",
        vatId: "123456789",
        doklad: "INV-9",
        dppd: "2026-09-08",
        zaklad1: 10000,
        dan1: 2100,
        zaklad2: 0,
        dan2: 0,
      },
    ]);
  });

  it("kontrolné riadky C sedia so súčtami", () => {
    const c = kontrolniRadkyC(kh);
    expect(c.obrat23).toBe(25000);
    expect(c.pln_rez_pren).toBe(50000);
    expect(c.pln23).toBe(31000);
    expect(c.celk_zd_a2).toBe(10000);
  });

  it("XML zodpovedá schéme DPHKH1", () => {
    const xml = kh1NaXml(
      kh,
      hlavicka,
      { rok: 2026, mesiac: 9 },
      { kodPredmetu: "4", dnes: new Date("2026-10-11") },
    );
    expect(overSchemou(xml, "dphkh1_epo2.xsd")).toBeNull();
    expect(xml).toContain('<VetaA4 c_radku="1" dic_odb="27082440"');
    expect(xml).toContain('kod_pred_pl="4"');
  });

  it("bez kódu predmetu plnenia pri prenesení upozorní", () => {
    const bez = kontrolniHlaseni(vstup, {});
    expect(bez.vytky.some((v) => v.text.includes("kód predmetu"))).toBe(true);
  });
});

describe("přiznání k DPH", () => {
  const { riadky } = priznaniCz(vstup);

  it("riadky výstupu a odpočtu v celých korunách", () => {
    expect(riadky.obrat23).toBe(25000);
    expect(riadky.dan23).toBe(5250);
    expect(riadky.obrat5).toBe(1000);
    expect(riadky.dan5).toBe(120);
    expect(riadky.pln_rez_pren).toBe(50000);
    expect(riadky.pln_sluzby).toBe(8000);
    expect(riadky.p_sl23_e).toBe(10000);
    expect(riadky.dan_psl23_e).toBe(2100);
    expect(riadky.pln23).toBe(31000);
    expect(riadky.odp_tuz23_nar).toBe(6510);
    expect(riadky.od_zdp23).toBe(2100);
  });

  it("vlastná daňová povinnosť = výstup − odpočet", () => {
    expect(riadky.dan_zocelk).toBe(5250 + 120 + 2100);
    expect(riadky.odp_zocelk).toBe(6510 + 2100);
    expect(riadky.dano_no).toBe(6510 + 2100 - (5250 + 120 + 2100));
  });

  it("XML zodpovedá schéme DPHDP3", () => {
    const xml = dp3NaXml(riadky, hlavicka, { rok: 2026, mesiac: 9 }, "B", new Date("2026-10-11"));
    expect(overSchemou(xml, "dphdp3_epo2.xsd")).toBeNull();
    expect(xml).toContain('dokument="DP3"');
    expect(xml).toContain('c_pop="1422"');
  });

  it("štvrťročné priznanie má ctvrt namiesto mesic", () => {
    const xml = dp3NaXml(riadky, hlavicka, { rok: 2026, stvrtrok: 3 }, "B");
    expect(xml).toContain('ctvrt="3"');
    expect(xml).not.toContain("mesic=");
    expect(overSchemou(xml, "dphdp3_epo2.xsd")).toBeNull();
  });
});

describe("pomocné", () => {
  it("DIČ a ulica", () => {
    expect(dicCz("CZ27082440")).toBe("27082440");
    expect(dicCz("SK2122358579", null)).toBe("");
    expect(dicCz(null, "12345678")).toBe("12345678");
    expect(rozdelUlicu("Jeremiášova 1422/7b")).toEqual({
      ulice: "Jeremiášova",
      c_pop: "1422",
      c_orient: "7b",
    });
    expect(rozdelUlicu("Náměstí")).toEqual({ ulice: "Náměstí" });
  });
});

describe("souhrnné hlášení", () => {
  const vstupSh: Vstup = {
    obdobie: { rok: 2026, mesiac: 9 },
    vystavene: [
      {
        cislo: "F1",
        typ: "regular",
        datumDodania: "2026-09-02",
        odberatelIcDph: "DE123456789",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "tovar",
        riadky: [{ sadzba: 0, zaklad: 10000.4, dan: 0 }],
      },
      {
        cislo: "F2",
        typ: "regular",
        datumDodania: "2026-09-10",
        odberatelIcDph: "DE123456789",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "tovar",
        riadky: [{ sadzba: 0, zaklad: 5000, dan: 0 }],
      },
      // Dobropis k F1 — hodnota sa zníži, počet plnení nie.
      {
        cislo: "D1",
        typ: "credit_note",
        datumDodania: "2026-09-15",
        odberatelIcDph: "DE123456789",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "tovar",
        riadky: [{ sadzba: 0, zaklad: -1000, dan: 0 }],
      },
      {
        cislo: "F3",
        typ: "regular",
        datumDodania: "2026-09-12",
        odberatelIcDph: "SK2122358579",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "sluzba",
        riadky: [{ sadzba: 0, zaklad: 8000, dan: 0 }],
      },
      {
        cislo: "F4",
        typ: "regular",
        datumDodania: "2026-09-13",
        odberatelIcDph: "EL123456789",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "trojstranny",
        riadky: [{ sadzba: 0, zaklad: 3000, dan: 0 }],
      },
      // Bez IČ DPH → výtka.
      {
        cislo: "F5",
        typ: "regular",
        datumDodania: "2026-09-14",
        odberatelIcDph: "",
        prenosDane: true,
        prenosTyp: "eu_b2b",
        euPlnenie: "tovar",
        riadky: [{ sadzba: 0, zaklad: 100, dan: 0 }],
      },
      // Tuzemská faktúra do SH nepatrí.
      {
        cislo: "F6",
        typ: "regular",
        datumDodania: "2026-09-14",
        odberatelIcDph: "CZ27082440",
        riadky: [{ sadzba: 21, zaklad: 100, dan: 21 }],
      },
    ],
    prijate: [],
    doklady: [],
  };
  const sh = souhrnneHlaseni(vstupSh);

  it("sčíta podľa odberateľa a kódu plnenia, dobropis odpočíta", () => {
    expect(sh.riadky).toEqual([
      { stat: "DE", vatId: "123456789", kod: 0, hodnota: 14001, pocet: 2 },
      { stat: "EL", vatId: "123456789", kod: 2, hodnota: 3000, pocet: 1 },
      { stat: "SK", vatId: "2122358579", kod: 3, hodnota: 8000, pocet: 1 },
    ]);
    expect(sh.vytky.map((v) => v.doklad)).toEqual(["F5"]);
  });

  it("XML zodpovedá schéme DPHSHV", () => {
    const xml = shvNaXml(sh, hlavicka, { rok: 2026, mesiac: 9 }, { dnes: new Date("2026-10-11") });
    expect(overSchemou(xml, "dphshv_epo2.xsd")).toBeNull();
    expect(xml).toContain('dokument="SHV"');
    expect(xml).toContain(
      'k_stat="DE" c_vat="123456789" k_pln_eu="0" pln_pocet="2" pln_hodnota="14001"',
    );
    expect(xml).not.toContain("email=");
  });

  it("štvrťročné a nad 99 riadkov pokračuje na ďalšej strane", () => {
    const vela = {
      riadky: Array.from({ length: 120 }, (_, i) => ({
        stat: "DE",
        vatId: String(100000000 + i),
        kod: 3 as const,
        hodnota: 10,
        pocet: 1,
      })),
      vytky: [],
    };
    const xml = shvNaXml(vela, hlavicka, { rok: 2026, stvrtrok: 3 });
    expect(overSchemou(xml, "dphshv_epo2.xsd")).toBeNull();
    expect(xml).toContain('ctvrt="3"');
    expect(xml).toContain('por_c_stran="2" c_rad="21"');
  });
});
