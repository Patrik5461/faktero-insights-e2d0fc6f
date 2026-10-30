import { describe, expect, it } from "vitest";
import {
  druhPlneniaZPoloziek,
  jeKrajinaEu,
  klucNavrhu,
  navrhRezimuDph,
  poliaZNavrhu,
  rezimNovejFaktury,
  sedisNavrhom,
} from "./rezim-odberatela";

const sk = { krajinaFirmy: "SK", platitel: true };

describe("navrhRezimuDph", () => {
  it("nemecká firma s IČ DPH → dodanie do EÚ, služba bez istoty", () => {
    const n = navrhRezimuDph({ ...sk, odberatel: { country: "DE", ic_dph: "DE 123 456 789" } });
    expect(n).toEqual({
      druh: "eu_b2b",
      krajina: "DE",
      icDph: "DE123456789",
      plnenie: "sluzba",
      isteZPoloziek: false,
    });
    expect(poliaZNavrhu(n)).toEqual({
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "sluzba",
    });
  });

  it("položka zo skladu alebo s colným kódom → tovar (§ 43)", () => {
    const n = navrhRezimuDph({
      ...sk,
      odberatel: { country: "AT", ic_dph: "ATU12345678" },
      polozky: [{}, { colny_kod: "84713000" }],
    });
    expect(n.druh === "eu_b2b" && n.plnenie).toBe("tovar");
    expect(druhPlneniaZPoloziek([{ stock_item_id: "x" }])).toEqual({
      plnenie: "tovar",
      iste: true,
    });
    expect(druhPlneniaZPoloziek([{ hmotnost_kg: "0" }])).toEqual({
      plnenie: "sluzba",
      iste: false,
    });
  });

  it("IČ DPH rozhoduje pred krajinou v adrese; grécke EL je GR", () => {
    const n = navrhRezimuDph({ ...sk, odberatel: { country: "SK", ic_dph: "EL123456789" } });
    expect(n.druh).toBe("eu_b2b");
    expect(n.druh === "eu_b2b" && n.krajina).toBe("GR");
  });

  it("slovenské IČ DPH, prázdny odberateľ a neplatiteľ → tuzemsko", () => {
    expect(
      navrhRezimuDph({ ...sk, odberatel: { country: "SK", ic_dph: "SK2020202020" } }).druh,
    ).toBe("tuzemsko");
    expect(navrhRezimuDph({ ...sk, odberatel: null }).druh).toBe("tuzemsko");
    expect(
      navrhRezimuDph({
        krajinaFirmy: "SK",
        platitel: false,
        odberatel: { country: "DE", ic_dph: "DE123456789" },
      }).druh,
    ).toBe("tuzemsko");
    expect(navrhRezimuDph({ ...sk, odberatel: { country: "", ic_dph: null } }).druh).toBe(
      "tuzemsko",
    );
  });

  it("česká firma: české DIČ je tuzemské, slovenské IČ DPH je EÚ", () => {
    const cz = { krajinaFirmy: "CZ", platitel: true };
    expect(navrhRezimuDph({ ...cz, odberatel: { country: "CZ", ic_dph: "CZ12345678" } }).druh).toBe(
      "tuzemsko",
    );
    expect(
      navrhRezimuDph({ ...cz, odberatel: { country: "SK", ic_dph: "SK2020202020" } }).druh,
    ).toBe("eu_b2b");
  });

  it("občan z EÚ bez IČ DPH → s DPH (prípadne OSS), polia sa nemenia", () => {
    const n = navrhRezimuDph({ ...sk, odberatel: { country: "AT", ic_dph: "" } });
    expect(n).toEqual({ druh: "eu_spotrebitel", krajina: "AT" });
    expect(poliaZNavrhu(n).reverse_charge).toBe(false);
  });

  it("odberateľ mimo EÚ → vývoz tovaru alebo služba mimo EÚ", () => {
    const n = navrhRezimuDph({ ...sk, odberatel: { country: "CH", ic_dph: "CHE-123.456.789" } });
    expect(n.druh).toBe("mimo_eu");
    expect(poliaZNavrhu(n)).toEqual({
      reverse_charge: true,
      reverse_charge_type: "export",
      eu_plnenie: "sluzba",
    });
    const t = navrhRezimuDph({ ...sk, odberatel: { country: "US" }, plnenie: "tovar" });
    expect(t.druh === "mimo_eu" && t.plnenie).toBe("tovar");
  });

  it("kľúč a zhoda s formulárom", () => {
    const n = navrhRezimuDph({ ...sk, odberatel: { country: "DE", ic_dph: "DE123456789" } });
    expect(klucNavrhu(n)).toBe("eu_b2b:DE:DE123456789:sluzba");
    expect(sedisNavrhom(n, { reverse_charge: false })).toBe(false);
    expect(sedisNavrhom(n, { reverse_charge: true, reverse_charge_type: "eu_b2b" })).toBe(true);
    expect(
      sedisNavrhom(
        { druh: "tuzemsko" },
        { reverse_charge: true, reverse_charge_type: "domestic_69" },
      ),
    ).toBe(true);
    expect(jeKrajinaEu("gr")).toBe(true);
    expect(jeKrajinaEu("CH")).toBe(false);
  });
});

describe("rezimNovejFaktury (API, appka)", () => {
  const de = { country: "DE", ic_dph: "DE123456789" };

  it("bez režimu a bez DPH na položkách → dodanie do EÚ, predvolene tovar", () => {
    expect(
      rezimNovejFaktury({ ...sk, odberatel: de, vstup: { items: [{}, { vat_rate: 0 }] } }),
    ).toEqual({
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "tovar",
      zNavrhu: true,
    });
  });

  it("e-shop naúčtoval DPH → režim sa nemení", () => {
    expect(
      rezimNovejFaktury({ ...sk, odberatel: de, vstup: { items: [{ vat_rate: 19 }] } }),
    ).toEqual({
      reverse_charge: false,
      reverse_charge_type: null,
      eu_plnenie: null,
      zNavrhu: false,
    });
  });

  it("výslovný režim platí, aj tuzemský pre zahraničného odberateľa", () => {
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: de,
        vstup: { reverse_charge: false, items: [{}] },
      }).valueOf(),
    ).toMatchObject({ reverse_charge: false, zNavrhu: false });
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: { country: "SK" },
        vstup: { reverse_charge: true, items: [{}] },
      }),
    ).toEqual({
      reverse_charge: true,
      reverse_charge_type: "domestic_69",
      eu_plnenie: null,
      zNavrhu: false,
    });
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: { country: "US" },
        vstup: { reverse_charge_type: "export", eu_plnenie: "sluzba", items: [{}] },
      }),
    ).toMatchObject({ reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "sluzba" });
  });

  it("výslovné prenesenie: sadzbu stiahne výpočet, presná DPH je chyba", () => {
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: de,
        vstup: { reverse_charge: true, items: [{ vat_rate: 23 }] },
      }),
    ).toMatchObject({ reverse_charge: true, reverse_charge_type: "domestic_69" });
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: de,
        vstup: { reverse_charge: true, items: [{ vat_rate: 23, vat_amount: 23 }] },
      }),
    ).toHaveProperty("chyba");
  });

  it("položka s prenesením sa za DPH nepočíta", () => {
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: de,
        vstup: { items: [{ vat_rate: 23, prenesenie: true }] },
      }),
    ).toMatchObject({ reverse_charge: true, reverse_charge_type: "eu_b2b" });
  });

  it("appka: predvolená služba, mimo EÚ vývoz", () => {
    expect(
      rezimNovejFaktury({
        ...sk,
        odberatel: de,
        vstup: { items: [{ vat_rate: 0 }] },
        predvolenePlnenie: "sluzba",
      }),
    ).toMatchObject({ reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" });
    expect(
      rezimNovejFaktury({ ...sk, odberatel: { country: "NO" }, vstup: { items: [{}] } }),
    ).toMatchObject({ reverse_charge_type: "export", eu_plnenie: "tovar" });
  });
});
