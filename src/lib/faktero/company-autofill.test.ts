import { describe, expect, it } from "vitest";
import { kodKrajiny, mergeCompanyAutofill } from "./company-autofill";

describe("kodKrajiny", () => {
  it("názov z registra preloží na kód", () => {
    expect(kodKrajiny("Česká republika")).toBe("CZ");
    expect(kodKrajiny("Slovenská republika")).toBe("SK");
    expect(kodKrajiny("CZ")).toBe("CZ");
    expect(kodKrajiny("DE")).toBe("DE");
    expect(kodKrajiny("")).toBeNull();
  });
  it("autofill uloží kód krajiny", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK" } as any,
      { name: "ABRA Software s.r.o.", country: "Česká republika" } as any,
      { mode: "overwrite" },
    );
    expect((r as any).country).toBe("CZ");
  });
  it("režim DPH sa prispôsobí krajine z registra", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" } as any,
      { name: "ABRA Software s.r.o.", country: "Česká republika" } as any,
      { mode: "overwrite" },
    );
    expect((r as any).vat_scheme).toBe("cz_neplatce");
  });
  it("česká firma, ktorú ARES hlási ako platiteľa, sa zaškrtne ako platiteľ", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel", ic_dph: "" } as any,
      {
        name: "ABRA Software s.r.o.",
        country: "CZ",
        ic_dph: "CZ25097563",
        vatStatus: "Áno",
      } as any,
      { mode: "overwrite" },
    );
    expect((r as any).vat_payer).toBe(true);
    expect((r as any).vat_scheme).toBe("cz_platce");
  });
});

describe("režim DPH z registra (FS SR / Registr plátců DPH)", () => {
  const zRegistra = (vatScheme: string) =>
    ({
      ico: "56607016",
      name: "Tobify s. r. o.",
      country: "SK",
      ic_dph: "SK2122358579",
      vatScheme,
    }) as any;

  it("prebije predvoleného neplatiteľa aj pri automatickom vyhľadaní", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel", ic_dph: "" } as any,
      zRegistra("sk_7"),
      { mode: "fill-empty" },
    );
    expect(r).toMatchObject({ vat_payer: false, vat_scheme: "sk_7", ic_dph: "SK2122358579" });
  });

  it("§ 4 zaškrtne platiteľa", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" } as any,
      zRegistra("sk_4"),
      { mode: "fill-empty" },
    );
    expect(r).toMatchObject({ vat_payer: true, vat_scheme: "sk_4" });
  });

  it("vlastnú voľbu pri automatickom vyhľadaní neprepíše, výslovné áno", () => {
    const prev = { name: "", country: "SK", vat_payer: true, vat_scheme: "sk_4" } as any;
    expect(mergeCompanyAutofill(prev, zRegistra("sk_7a"), { mode: "fill-empty" })).toMatchObject({
      vat_scheme: "sk_4",
    });
    expect(mergeCompanyAutofill(prev, zRegistra("sk_7a"), { mode: "overwrite" })).toMatchObject({
      vat_payer: false,
      vat_scheme: "sk_7a",
    });
  });

  it("režim inej krajiny sa nepoužije", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" } as any,
      { ...zRegistra("cz_platce"), country: "SK" },
      { mode: "overwrite" },
    );
    expect((r as any).vat_scheme).not.toBe("cz_platce");
  });
});
