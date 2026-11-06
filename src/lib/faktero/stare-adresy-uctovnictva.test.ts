import { describe, expect, it } from "vitest";
import {
  novaAdresaUctovnictva,
  presmerovanieImportov,
  presmerovanieKonvertora,
  presmerovanieZauctovania,
} from "./stare-adresy-uctovnictva";

/* Staré adresy sekcie Účtovníctvo nesmú stratiť ani jeden parameter. */
describe("staré adresy Účtovníctva", () => {
  it("pravidlá prenesú celé predvyplnenie (PravidloZDokladu, banka)", () => {
    const p = {
      novy: "1",
      nazov: "Shell",
      ico: "123",
      predkontacia: "5Pr",
      clenenie: "PD",
      kv: "B2",
      kategoria: "pohonne",
      email: "a@b.sk",
      vs: "77",
      pokladna: "HP",
      upravit: "abc",
      iban: "SK12",
      smer: "vydaj",
      bvs: "88",
      protistrana: "Orange",
      ina: "x",
    };
    expect(presmerovanieZauctovania("pravidla", p)).toEqual({
      to: "/uctovnictvo/zauctovanie",
      search: { ...p, tab: "pravidla" },
    });
    expect(presmerovanieZauctovania("kontrola", {}).search).toEqual({ tab: "kontrola" });
  });

  it("konvertory: excel, výpis a brána", () => {
    expect(presmerovanieKonvertora("konvertor", {})).toEqual({
      to: "/uctovnictvo/konvertory",
      search: { tab: "excel" },
    });
    expect(presmerovanieKonvertora("vypis", {}).search).toEqual({ tab: "vypis" });
    expect(presmerovanieKonvertora("vypis", { zdroj: "brana", ucet: "1" }).search).toEqual({
      ucet: "1",
      tab: "brana",
    });
  });

  it("história importov", () => {
    expect(presmerovanieImportov({ q: "x" })).toEqual({
      to: "/importy/novy",
      search: { q: "x", tab: "historia" },
    });
  });

  it("odkaz v texte (e-mail, notifikácia) sa prepíše aj s parametrami", () => {
    expect(novaAdresaUctovnictva("/uctovnictvo/na-kontrolu")).toBe(
      "/uctovnictvo/zauctovanie?tab=kontrola",
    );
    expect(novaAdresaUctovnictva("/uctovnictvo/pravidla?novy=1&ico=12")).toBe(
      "/uctovnictvo/zauctovanie?novy=1&ico=12&tab=pravidla",
    );
    expect(novaAdresaUctovnictva("/uctovnictvo/vypis-do-pohody?zdroj=brana")).toBe(
      "/uctovnictvo/konvertory?tab=brana",
    );
    expect(novaAdresaUctovnictva("/importy")).toBe("/importy/novy?tab=historia");
    expect(novaAdresaUctovnictva("/faktury?type=credit")).toBe("/faktury?type=credit");
  });
});
