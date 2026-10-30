/**
 * Overenie platiteľstva DPH — čistá logika nad podvrhnutými riadkami
 * zoznamov FS SR (ds_dphs, ds_dphz, ds_dphv) a Registra plátců DPH.
 * Riadky XML majú presne tvar zo súborov FS z 30. 10. 2026.
 */
import { describe, expect, it } from "vitest";
import {
  datumFs,
  dicPreCz,
  dphsNaRiadok,
  najdiVIndexe,
  polozkyXml,
  porovnaj,
  riadokNaDphs,
  rovnakyVysledok,
  schemaZDruhu,
  upozorneniaDph,
  vysledokCz,
  vysledokSk,
  zaznamDphs,
  zaznamZrusenia,
  zmenaRegistracie,
  type ZaznamOverenia,
} from "./platitel-dph";

const ITEM_DPHS = `<ITEM>
      <IC_DPH>SK2122358579</IC_DPH>
      <ICO>56607016</ICO>
      <NAZOV_DS>Tobify s. r. o.</NAZOV_DS>
      <OBEC>Bratislava</OBEC>
      <PSC>81101</PSC>
      <ULICA_CISLO>Hlavná 1</ULICA_CISLO>
      <STAT>Slovensko</STAT>
      <DRUH_REG_DPH>§7</DRUH_REG_DPH>
      <DATUM_REG>11.06.2025</DATUM_REG>
    </ITEM>`;

const ITEM_DPHV = `<ITEM>
      <IC_DPH>SK1020000938</IC_DPH>
      <NAZOV>Slavomír Sopko</NAZOV>
      <OBEC>Nižný Hrušov</OBEC>
      <PSC>09422</PSC>
      <ADRESA>569</ADRESA>
      <ROK_PORUSENIA>2020</ROK_PORUSENIA>
      <DAT_ZVEREJNENIA>25.02.2021</DAT_ZVEREJNENIA>
      <DAT_VYMAZU>11.02.2022</DAT_VYMAZU>
      <ICO>35343630</ICO>
    </ITEM>`;

const dphs = (o: Partial<ReturnType<typeof zaznamDphs> & object> = {}) => ({
  icDph: "SK2020317068",
  ico: "31333532",
  nazov: "ESET, spol. s r.o.",
  druh: "§4",
  datumReg: "11.10.2000",
  datumZmenyDruhu: null,
  platitelOd: "11.10.2000",
  ...o,
});

describe("zoznamy FS", () => {
  it("druh registrácie na režim", () => {
    expect(schemaZDruhu("§4")).toBe("sk_4");
    expect(schemaZDruhu("§ 4b")).toBe("sk_4b");
    expect(schemaZDruhu("§5")).toBe("sk_5");
    expect(schemaZDruhu("§7")).toBe("sk_7");
    expect(schemaZDruhu("§7A")).toBe("sk_7a");
    expect(schemaZDruhu("§99")).toBeNull();
    expect(schemaZDruhu(null)).toBeNull();
  });

  it("dátumy FS", () => {
    expect(datumFs("01.08.1998")).toBe("1998-08-01");
    expect(datumFs("1.8.1998")).toBe("1998-08-01");
    expect(datumFs("30102026")).toBe("2026-10-30");
    expect(datumFs("")).toBeNull();
  });

  it("položka ds_dphs a ds_dphv", () => {
    expect(zaznamDphs(ITEM_DPHS)).toEqual({
      icDph: "SK2122358579",
      ico: "56607016",
      nazov: "Tobify s. r. o.",
      druh: "§7",
      datumReg: "11.06.2025",
      datumZmenyDruhu: null,
      platitelOd: null,
    });
    expect(zaznamZrusenia(ITEM_DPHV)).toMatchObject({
      icDph: "SK1020000938",
      ico: "35343630",
      vymazane: "11.02.2022",
      zverejnene: "25.02.2021",
    });
  });

  it("položky sa poskladajú aj cez hranicu kúskov", () => {
    const xml = `<X><DatumAktualizacieZoznamu>30102026</DatumAktualizacieZoznamu><DS>${ITEM_DPHS}${ITEM_DPHS.replace("56607016", "11111111")}</DS></X>`;
    const najdene: string[] = [];
    let zvysok = "";
    for (let i = 0; i < xml.length; i += 37) {
      const r = polozkyXml(zvysok + xml.slice(i, i + 37));
      najdene.push(...r.polozky);
      zvysok = r.zvysok;
    }
    expect(najdene.map((p) => zaznamDphs(p)!.ico)).toEqual(["56607016", "11111111"]);
  });

  it("index: hľadanie podľa IČO aj IČ DPH, bez falošnej zhody na časti čísla", () => {
    const index = `\n${[
      dphs(),
      dphs({ ico: "56607016", icDph: "SK2122358579", druh: "§7" }),
      dphs({ ico: "1566070", icDph: "SK9999999999" }),
    ]
      .map(dphsNaRiadok)
      .join("\n")}\n`;
    expect(najdiVIndexe(index, "56607016", null).map((r) => riadokNaDphs(r).druh)).toEqual(["§7"]);
    expect(najdiVIndexe(index, null, "SK2020317068").map((r) => riadokNaDphs(r).ico)).toEqual([
      "31333532",
    ]);
    expect(najdiVIndexe(index, "6607016", null)).toEqual([]);
    // Tá istá firma nájdená dvoma spôsobmi je jeden riadok.
    expect(najdiVIndexe(index, "31333532", "SK2020317068")).toHaveLength(1);
  });
});

describe("výsledok pre slovenskú firmu", () => {
  it("platiteľ § 4 s dátumom", () => {
    const v = vysledokSk(
      { country: "SK", ico: "31333532" },
      { dphs: [dphs()], dphz: [], dphv: [] },
      "2026-10-30",
    );
    expect(v).toMatchObject({
      stav: "platitel",
      schema: "sk_4",
      icDph: "SK2020317068",
      platneOd: "2000-10-11",
      zoznamK: "2026-10-30",
    });
  });

  it("§ 7 je registrovaná osoba, nie platiteľ", () => {
    const v = vysledokSk(
      { country: "SK", ico: "56607016" },
      { dphs: [zaznamDphs(ITEM_DPHS)!], dphz: [], dphv: [] },
      null,
    );
    expect(v.stav).toBe("registrovany");
    expect(v.schema).toBe("sk_7");
    expect(v.platneOd).toBe("2025-06-11");
  });

  it("zmena druhu registrácie má prednosť pri dátume", () => {
    const v = vysledokSk(
      { country: "SK", ico: "31333532" },
      { dphs: [dphs({ druh: "§4", datumZmenyDruhu: "01.03.2026" })], dphz: [], dphv: [] },
      null,
    );
    expect(v.platneOd).toBe("2026-03-01");
  });

  it("vymazaný z registra → neplatiteľ od výmazu", () => {
    const v = vysledokSk(
      { country: "SK", ico: "35343630" },
      { dphs: [], dphz: [], dphv: [zaznamZrusenia(ITEM_DPHV)!] },
      null,
    );
    expect(v).toMatchObject({
      stav: "neregistrovany",
      schema: "sk_neplatitel",
      icDph: null,
      zruseneOd: "2022-02-11",
    });
  });

  it("dôvody na zrušenie sa prenesú, platiteľ ostáva platiteľom", () => {
    const v = vysledokSk(
      { country: "SK", ico: "31333532" },
      {
        dphs: [dphs()],
        dphz: [
          {
            icDph: "SK2020317068",
            ico: "31333532",
            nazov: null,
            rokPorusenia: "2025",
            zverejnene: "20.03.2026",
            vymazane: null,
          },
        ],
        dphv: [],
      },
      null,
    );
    expect(v.stav).toBe("platitel");
    expect(v.dovodyNaZrusenie).toEqual({ rok: "2025", zverejnene: "2026-03-20" });
  });

  it("v registri nie je → neplatiteľ bez dátumu", () => {
    const v = vysledokSk(
      { country: "SK", ico: "12345678" },
      { dphs: [], dphz: [], dphv: [] },
      null,
    );
    expect(v).toMatchObject({ stav: "neregistrovany", schema: "sk_neplatitel", platneOd: null });
  });
});

describe("výsledok pre českú firmu", () => {
  it("typ subjektu na režim", () => {
    expect(vysledokCz("25097563", "PLATCE_DPH", false, null, null)).toMatchObject({
      stav: "platitel",
      schema: "cz_platce",
      icDph: "CZ25097563",
    });
    expect(vysledokCz("25097563", "SKUPINA_DPH", false, null, null).schema).toBe("cz_platce");
    expect(vysledokCz("25097563", "IDENTIFIKOVANA_OSOBA", false, null, null)).toMatchObject({
      stav: "registrovany",
      schema: "cz_identifikovana",
    });
    expect(vysledokCz("25097563", "NENALEZEN", false, null, null)).toMatchObject({
      stav: "neregistrovany",
      schema: "cz_neplatce",
      icDph: null,
    });
  });

  it("DIČ pre register", () => {
    expect(dicPreCz({ ic_dph: "CZ25097563" })).toBe("25097563");
    expect(dicPreCz({ dic: "cz 8001011234" })).toBe("8001011234");
    expect(dicPreCz({ ico: "25097563" })).toBe("25097563");
    expect(dicPreCz({ ico: "123" })).toBeNull();
  });
});

describe("porovnanie s firmou", () => {
  const sk4 = vysledokSk(
    { country: "SK", ico: "31333532" },
    { dphs: [dphs()], dphz: [], dphv: [] },
    null,
  );

  it("prázdny režim sa doplní celý, aj s IČ DPH", () => {
    expect(porovnaj({ country: "SK", vat_scheme: null, vat_payer: false }, sk4)).toEqual({
      doplnit: { vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK2020317068" },
      nesulad: false,
    });
  });

  it("vyplnený režim sa neprepíše — len nesúlad", () => {
    const p = porovnaj(
      { country: "SK", vat_scheme: "sk_neplatitel", vat_payer: false, ic_dph: "SK2020317068" },
      sk4,
    );
    expect(p).toEqual({ doplnit: null, nesulad: true });
  });

  it("zhoda — nič", () => {
    expect(
      porovnaj(
        { country: "SK", vat_scheme: "sk_4", vat_payer: true, ic_dph: "sk 2020317068" },
        sk4,
      ),
    ).toEqual({ doplnit: null, nesulad: false });
  });

  it("iné IČ DPH je nesúlad", () => {
    expect(
      porovnaj({ country: "SK", vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK1234567890" }, sk4)
        .nesulad,
    ).toBe(true);
  });

  it("neregistrovaný nemaže IČ DPH a pri prázdnom režime nastaví neplatiteľa", () => {
    const nep = vysledokSk({ country: "SK", ico: "1" }, { dphs: [], dphz: [], dphv: [] }, null);
    expect(porovnaj({ country: "SK", vat_scheme: null, ic_dph: "SK2020317068" }, nep)).toEqual({
      doplnit: { vat_scheme: "sk_neplatitel", vat_payer: false },
      nesulad: false,
    });
  });

  it("chyba registra nič nedopĺňa ani nehlási", () => {
    expect(
      porovnaj(
        { country: "SK", vat_scheme: null },
        { ...sk4, stav: "chyba", schema: null, chyba: "nedostupné" },
      ),
    ).toEqual({ doplnit: null, nesulad: false });
  });
});

describe("zmena registrácie", () => {
  const sk4 = vysledokSk(
    { country: "SK", ico: "31333532" },
    { dphs: [dphs()], dphz: [], dphv: [] },
    null,
  );
  const nep = vysledokSk({ country: "SK", ico: "1" }, { dphs: [], dphz: [], dphv: [] }, null);

  it("rozlíši novú registráciu, zrušenie a zmenu druhu", () => {
    expect(zmenaRegistracie(null, sk4)).toBeNull();
    expect(
      zmenaRegistracie({ stav: "neregistrovany", schema: "sk_neplatitel", ic_dph: null }, sk4),
    ).toBe("nova_registracia");
    expect(zmenaRegistracie({ stav: "platitel", schema: "sk_4", ic_dph: "SK1" }, nep)).toBe(
      "zrusenie",
    );
    expect(zmenaRegistracie({ stav: "registrovany", schema: "sk_7", ic_dph: "SK1" }, sk4)).toBe(
      "zmena_druhu",
    );
    expect(zmenaRegistracie({ stav: "platitel", schema: "sk_4", ic_dph: "SK1" }, sk4)).toBeNull();
    expect(zmenaRegistracie({ stav: "chyba", schema: null, ic_dph: null }, sk4)).toBeNull();
  });

  it("rovnaký výsledok len posunie dátum", () => {
    const pred = {
      stav: "platitel" as const,
      schema: "sk_4",
      ic_dph: "SK2020317068",
      platne_od: "2000-10-11",
      nesulad: null,
    };
    expect(rovnakyVysledok(pred, sk4, false)).toBe(true);
    expect(rovnakyVysledok(pred, sk4, true)).toBe(false);
    expect(rovnakyVysledok({ ...pred, platne_od: "2026-01-01" }, sk4, false)).toBe(false);
    expect(rovnakyVysledok(null, sk4, false)).toBe(false);
  });
});

describe("zvonček", () => {
  const z = (o: Partial<ZaznamOverenia>): ZaznamOverenia => ({
    id: "z1",
    overene_at: "2026-10-29T05:00:00Z",
    stav: "platitel",
    zdroj: "fs_sk",
    schema: "sk_4",
    ic_dph: "SK2020317068",
    platne_od: "2026-10-01",
    zrusene_od: null,
    zmena: null,
    odpoved: null,
    ...o,
  });

  it("nová registrácia a nesúlad s nastavením", () => {
    const u = upozorneniaDph(
      { country: "SK", vat_scheme: "sk_neplatitel", vat_payer: false, ic_dph: null },
      [z({ zmena: "nova_registracia" })],
      "2026-10-30",
    );
    expect(u.map((x) => x.key)).toEqual(["dph_registracia:z1", "dph_nesulad:z1:sk_neplatitel:"]);
    expect(u[0].params).toEqual({ rezim: "Platiteľ DPH podľa § 4", od: "1. 10. 2026" });
    expect(u[1].severity).toBe("danger");
    expect(u.every((x) => x.to === "/firma")).toBe(true);
  });

  it("stará zmena a zosúladené nastavenie nič nehlásia", () => {
    expect(
      upozorneniaDph(
        { country: "SK", vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK2020317068" },
        [z({ zmena: "nova_registracia", overene_at: "2026-08-01T05:00:00Z" })],
        "2026-10-30",
      ),
    ).toEqual([]);
  });

  it("dôvody na zrušenie registrácie", () => {
    const u = upozorneniaDph(
      { country: "SK", vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK2020317068" },
      [z({ odpoved: { dovodyNaZrusenie: { rok: "2025", zverejnene: "2026-03-20" } } })],
      "2026-10-30",
    );
    expect(u.map((x) => x.key)).toEqual(["dph_dovody_zrusenia:z1"]);
    expect(u[0].params).toEqual({ datum: "20. 3. 2026" });
  });
});
