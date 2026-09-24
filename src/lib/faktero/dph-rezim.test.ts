import { describe, expect, it } from "vitest";
import {
  jePlatitel,
  moznostiSadziebRezimu,
  predvolenaSchema,
  rezimFirmy,
  sadzbyRezimu,
  schemyKrajiny,
  zakladnaSadzbaRezimu,
  zosuladSchemu,
} from "./dph-rezim";

describe("postavenie k DPH", () => {
  it("registrácia podľa § 7 a § 7a nie je platiteľ, hoci IČ DPH má", () => {
    expect(jePlatitel("sk_7")).toBe(false);
    expect(jePlatitel("sk_7a")).toBe(false);
    expect(jePlatitel("sk_4")).toBe(true);
  });

  it("výber ponúka len možnosti krajiny a zvolenej strany", () => {
    expect(schemyKrajiny("SK", true).map((z) => z.kod)).toEqual(["sk_4", "sk_4b", "sk_5"]);
    expect(schemyKrajiny("SK", false).map((z) => z.kod)).toEqual([
      "sk_7",
      "sk_7a",
      "sk_neplatitel",
    ]);
    expect(schemyKrajiny("CZ", true).map((z) => z.kod)).toEqual(["cz_platce"]);
  });

  it("po zmene krajiny sa česká schéma nepreberie na slovenskú firmu", () => {
    expect(zosuladSchemu("cz_platce", "SK", true)).toBe("sk_4");
    expect(zosuladSchemu("sk_7a", "SK", false)).toBe("sk_7a");
    // Odškrtnutie „platiteľ" musí schému prehodiť na tú druhú stranu.
    expect(zosuladSchemu("sk_4", "SK", false)).toBe(predvolenaSchema("SK", false));
  });
});

describe("režim z firmy", () => {
  it("firma bez uloženej schémy sa správa ako doteraz — rozhoduje IČ DPH", () => {
    expect(rezimFirmy({ country: "SK", ic_dph: "SK1234567890" }).platitel).toBe(true);
    expect(rezimFirmy({ country: "SK", ic_dph: null }).platitel).toBe(false);
  });

  it("uložená schéma prebíja IČ DPH", () => {
    const r = rezimFirmy({ country: "SK", ic_dph: "SK1234567890", vat_scheme: "sk_7a" });
    expect(r.platitel).toBe(false);
    expect(r.textNaDoklad).toMatch(/§ 7a/);
  });

  it("platiteľ na doklade žiadnu vetu nemá — daň je na ňom vyčíslená", () => {
    expect(rezimFirmy({ country: "SK", vat_scheme: "sk_4" }).textNaDoklad).toBeNull();
  });

  it("nezmysel v stĺpci firmu nezhodí", () => {
    const r = rezimFirmy({ country: "CZ", vat_scheme: "vymyslene", vat_payer: true });
    expect(r.krajina).toBe("CZ");
    expect(r.schema).toBe("cz_platce");
  });
});

describe("sadzby podľa režimu", () => {
  const platitel = rezimFirmy({ country: "SK", vat_scheme: "sk_4" });
  const neplatitel = rezimFirmy({ country: "SK", vat_scheme: "sk_neplatitel" });

  it("neplatiteľ dostane jedinú nulovú sadzbu", () => {
    expect(sadzbyRezimu(neplatitel)).toEqual([0]);
    expect(zakladnaSadzbaRezimu(neplatitel)).toBe(0);
  });

  it("platiteľ má sadzby svojej krajiny a základnú ako predvolenú", () => {
    expect(sadzbyRezimu(platitel)).toContain(23);
    expect(zakladnaSadzbaRezimu(platitel)).toBe(23);
  });

  it("staršia položka s daňou sa neplatiteľovi pri úprave ticho nevynuluje", () => {
    expect(moznostiSadziebRezimu(neplatitel, 20)).toEqual([20, 0]);
    expect(moznostiSadziebRezimu(neplatitel, 0)).toEqual([0]);
  });
});

describe("doplnenie z registra", () => {
  it("nájdené IČ DPH navrhne platiteľa, ale už vybraný § 7a neprepíše", async () => {
    const { mergeCompanyAutofill } = await import("./company-autofill");
    const najdene = {
      ico: "12345678",
      name: "Firma",
      ic_dph: "SK1234567890",
      country: "SK",
    } as any;

    const nove = mergeCompanyAutofill(
      { name: "", ico: "", vat_payer: false, vat_scheme: "" } as any,
      najdene,
      { mode: "overwrite" },
    );
    expect(nove).toMatchObject({ vat_payer: true, vat_scheme: "sk_4" });

    const uzVybrate = mergeCompanyAutofill(
      { name: "", ico: "", vat_payer: false, vat_scheme: "sk_7a" } as any,
      najdene,
      { mode: "overwrite" },
    );
    expect(uzVybrate).toMatchObject({ vat_payer: false, vat_scheme: "sk_7a" });
  });

  it("odberateľ nemá postavenie k DPH — polia mu nepribudnú", async () => {
    const { mergeCompanyAutofill } = await import("./company-autofill");
    const odberatel = mergeCompanyAutofill(
      { name: "", ico: "" } as any,
      { ico: "1", name: "X" } as any,
      {
        mode: "overwrite",
      },
    );
    expect("vat_scheme" in odberatel).toBe(false);
  });
});
