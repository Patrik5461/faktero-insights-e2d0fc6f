import { describe, expect, it } from "vitest";
import {
  chybaIcDphPreDodanieDoEu,
  jePlatitel,
  moznostiSadziebRezimu,
  predvolenaSchema,
  rezimFirmy,
  riadkySDphNeplatitela,
  sadzbaNovehoRiadku,
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
    expect(moznostiSadziebRezimu(neplatitel, 20)).toEqual([0, 20]);
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
  it("neplatiteľ sa predvolí bez registrácie, nie ako § 7 / identifikovaná osoba", () => {
    expect(predvolenaSchema("SK", false)).toBe("sk_neplatitel");
    expect(predvolenaSchema("CZ", false)).toBe("cz_neplatce");
    expect(zosuladSchemu("sk_neplatitel", "CZ", false)).toBe("cz_neplatce");
  });
});

describe("sadzba nového riadku (C-04, C-12)", () => {
  const platitelSk = rezimFirmy({ country: "SK", vat_payer: true, vat_scheme: "sk_4" });
  const neplatitelSk = rezimFirmy({ country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" });
  const neplatitel7 = rezimFirmy({ country: "SK", vat_payer: false, vat_scheme: "sk_7" });
  const platitelCz = rezimFirmy({ country: "CZ", vat_payer: true, vat_scheme: "cz_platce" });

  it("neplatiteľ dostane 0 % aj pri produkte s 23 %", () => {
    expect(sadzbaNovehoRiadku(neplatitelSk, { sadzbaProduktu: 23 })).toBe(0);
    expect(sadzbaNovehoRiadku(neplatitel7, { sadzbaProduktu: 23 })).toBe(0);
    expect(sadzbaNovehoRiadku(neplatitelSk)).toBe(0);
  });

  it("platiteľ: prázdny riadok základná sadzba, produkt si sadzbu nechá, ak platí", () => {
    expect(sadzbaNovehoRiadku(platitelSk, { den: "2026-11-01" })).toBe(23);
    expect(sadzbaNovehoRiadku(platitelSk, { sadzbaProduktu: 5, den: "2026-11-01" })).toBe(5);
    expect(sadzbaNovehoRiadku(platitelSk, { sadzbaProduktu: 0, den: "2026-11-01" })).toBe(0);
    // 20 % už na Slovensku neplatí — nový riadok dostane základnú sadzbu.
    expect(sadzbaNovehoRiadku(platitelSk, { sadzbaProduktu: 20, den: "2026-11-01" })).toBe(23);
  });

  it("česká firma nedostane slovenských 23 %", () => {
    expect(sadzbaNovehoRiadku(platitelCz, { sadzbaProduktu: 23, den: "2026-11-01" })).toBe(21);
    expect(sadzbaNovehoRiadku(platitelCz, { sadzbaProduktu: 12, den: "2026-11-01" })).toBe(12);
  });

  it("OSS: sadzba štátu spotreby, PDP na doklade: 0 %", () => {
    expect(sadzbaNovehoRiadku(platitelSk, { ossKrajina: "AT", sadzbaProduktu: 23 })).toBe(20);
    expect(sadzbaNovehoRiadku(platitelSk, { ossKrajina: "AT", sadzbaProduktu: 10 })).toBe(10);
    expect(sadzbaNovehoRiadku(platitelSk, { reverseCharge: true, sadzbaProduktu: 23 })).toBe(0);
  });

  it("odoslanie zastaví riadok s DPH u neplatiteľa, prenesenie nie", () => {
    const riadky = [
      { name: "A", vat_rate: 0 },
      { name: "B", vat_rate: 23 },
      { name: "C", vat_rate: 23, prenesenie: true },
    ];
    expect(riadkySDphNeplatitela(neplatitelSk, riadky).map((r) => r.name)).toEqual(["B"]);
    expect(riadkySDphNeplatitela(platitelSk, riadky)).toEqual([]);
    expect(riadkySDphNeplatitela(neplatitelSk, riadky, true)).toEqual([]);
  });
});

describe("IČ DPH pri dodaní do EÚ (C-02)", () => {
  it("tuzemské je IČ DPH krajiny firmy, nie vždy SK", () => {
    expect(chybaIcDphPreDodanieDoEu("SK2020202020", "SK")).toBe("tuzemske");
    expect(chybaIcDphPreDodanieDoEu("CZ12345678", "SK")).toBeNull();
    expect(chybaIcDphPreDodanieDoEu("CZ12345678", "CZ")).toBe("tuzemske");
    expect(chybaIcDphPreDodanieDoEu("SK2020202020", "CZ")).toBeNull();
    expect(chybaIcDphPreDodanieDoEu("de123456789", "DE")).toBe("tuzemske");
  });

  it("chýbajúce a zlé IČ DPH", () => {
    expect(chybaIcDphPreDodanieDoEu("", "SK")).toBe("chyba");
    expect(chybaIcDphPreDodanieDoEu(null, "SK")).toBe("chyba");
    expect(chybaIcDphPreDodanieDoEu("12345678", "SK")).toBe("format");
    expect(chybaIcDphPreDodanieDoEu("EL123456789", "SK")).toBeNull();
  });
});
