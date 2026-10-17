import { describe, it, expect } from "vitest";
import {
  krajinaDane,
  sadzbyKrajiny,
  sadzbyKuDnu,
  zakladnaSadzba,
  historickeSadzby,
  najblizsiaSadzba,
  nazovKrajinyDane,
  KRAJINY_DANE,
} from "./vat-rates";
import {
  rezimFirmy,
  predvolenaSchema,
  schemyKrajiny,
  zosuladSchemu,
  sadzbyRezimu,
} from "./dph-rezim";
import {
  vetyDe,
  vetaPreneseniaDe,
  predvolenyJazykFirmy,
  datumNaDoklade,
  vetyPreneseniaCz,
} from "./faktura-jazyk";
import { epcQr, textQrPlatby } from "./qr-platba";
import {
  jeUstIdNr,
  jeSteuernummer,
  chybyIdentifikatorovDe,
  pataFirmyDe,
  popiskyIdentifikatorov,
} from "./firma-de";
import { domacaMena, krajinaKurzu, textPrepoctu } from "./kurzy";
import { jeTuzemske } from "./vies";

describe("Nemecko — krajina dane", () => {
  it("rozpozná kód aj názov", () => {
    for (const v of ["DE", "de", "DEU", "Deutschland", "Nemecko", "Německo", "Germany"])
      expect(krajinaDane(v)).toBe("DE");
  });
  it("Dánsko ani iné „DE…“ nie je Nemecko; SK a CZ ostávajú", () => {
    expect(krajinaDane("Denmark")).toBe("SK");
    expect(krajinaDane("DK")).toBe("SK");
    expect(krajinaDane("SK")).toBe("SK");
    expect(krajinaDane("Slovensko")).toBe("SK");
    expect(krajinaDane("CZ")).toBe("CZ");
    expect(krajinaDane(null)).toBe("SK");
  });
  it("je vo výbere a má názov; domáca mena EUR", () => {
    expect(KRAJINY_DANE.map((k) => k.kod)).toEqual(["SK", "CZ", "DE"]);
    expect(nazovKrajinyDane("DE")).toBe("Nemecko");
    expect(domacaMena("DE")).toBe("EUR");
    expect(krajinaKurzu("DE")).toBe("SK"); // kurz ECB v eurách, nie ČNB
  });
});

describe("Nemecko — sadzby DPH", () => {
  it("dnes 19, 7 a 0", () => {
    expect(sadzbyKrajiny("DE", "2026-10-17")).toEqual([19, 7, 0]);
    expect(zakladnaSadzba("DE", "2026-10-17")).toBe(19);
  });
  it("dočasne 16/5 od 1. 7. do 31. 12. 2020", () => {
    expect(sadzbyKuDnu("DE", "2020-06-30")).toEqual({ high: 19, low: 7, third: null });
    expect(sadzbyKuDnu("DE", "2020-07-01")).toEqual({ high: 16, low: 5, third: null });
    expect(sadzbyKuDnu("DE", "2020-12-31")).toEqual({ high: 16, low: 5, third: null });
    expect(sadzbyKuDnu("DE", "2021-01-01")).toEqual({ high: 19, low: 7, third: null });
  });
  it("19/7 od 2007, predtým 16/7", () => {
    expect(sadzbyKuDnu("DE", "2007-01-01").high).toBe(19);
    expect(sadzbyKuDnu("DE", "2006-12-31")).toEqual({ high: 16, low: 7, third: null });
  });
  it("historické sadzby na opravné doklady: 16 a 5 do 2020", () => {
    expect(historickeSadzby("DE", "2026-10-17")).toEqual([
      { sadzba: 16, doRoku: 2020 },
      { sadzba: 5, doRoku: 2020 },
    ]);
  });
  it("dopočítaná sadzba sa prilepí k nemeckej", () => {
    expect(najblizsiaSadzba(18.97, "DE")).toBe(19);
    expect(najblizsiaSadzba(5.02, "DE")).toBe(5);
  });
  it("SK a CZ sa nezmenili", () => {
    expect(sadzbyKrajiny("SK", "2026-10-17")).toEqual([23, 19, 5, 0]);
    expect(sadzbyKrajiny("CZ", "2026-10-17")).toEqual([21, 12, 0]);
  });
});

describe("Nemecko — režim DPH", () => {
  it("platiteľ = Regelbesteuerung, neplatiteľ = Kleinunternehmer", () => {
    expect(predvolenaSchema("DE", true)).toBe("de_regel");
    expect(predvolenaSchema("DE", false)).toBe("de_kleinunternehmer");
    expect(schemyKrajiny("DE", true).map((z) => z.kod)).toEqual(["de_regel"]);
  });
  it("Kleinunternehmer fakturuje bez dane s vetou § 19", () => {
    const r = rezimFirmy({ country: "DE", vat_payer: false, vat_scheme: "de_kleinunternehmer" });
    expect(r.platitel).toBe(false);
    expect(r.textNaDoklad).toBe("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
    expect(sadzbyRezimu(r)).toEqual([0]);
  });
  it("platiteľ bez USt-IdNr. ostáva platiteľom (schéma je pravda)", () => {
    const r = rezimFirmy({ country: "DE", ic_dph: null, vat_payer: true, vat_scheme: "de_regel" });
    expect(r.platitel).toBe(true);
    expect(r.textNaDoklad).toBeNull();
  });
  it("prepnutie krajiny zo SK na DE zahodí slovenskú schému", () => {
    expect(zosuladSchemu("sk_4", "DE", true)).toBe("de_regel");
    expect(zosuladSchemu("de_kleinunternehmer", "SK", false)).toBe("sk_neplatitel");
  });
});

describe("Nemecko — vety na faktúre", () => {
  const v = vetyDe("de");
  it("presné znenie", () => {
    expect(v.kleinunternehmer).toBe("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
    expect(v.tuzemsko).toBe("Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).");
    expect(v.euTovar).toBe("Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG.");
    expect(v.euSluzba).toBe(
      "Nicht im Inland steuerbare Leistung – Steuerschuldnerschaft des Leistungsempfängers.",
    );
    expect(v.vyvoz).toBe("Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG.");
  });
  it("podľa situácie na faktúre", () => {
    expect(vetaPreneseniaDe("eu_b2b", "tovar")).toBe(v.euTovar);
    // Trojstranný obchod má vlastnú vetu podľa § 25b Abs. 4 UStG.
    expect(vetaPreneseniaDe("eu_b2b", "trojstranny")).toBe(v.trojstranny);
    expect(v.trojstranny).toContain("§ 25b UStG");
    expect(vetaPreneseniaDe("eu_b2b", "sluzba")).toBe(v.euSluzba);
    expect(vetaPreneseniaDe("export", null)).toBe(v.vyvoz);
    expect(vetaPreneseniaDe("domestic_69", null)).toBe(v.tuzemsko);
    expect(vetaPreneseniaDe("", null)).toBeNull();
  });
  it("anglický doklad nesie aj nemeckú formuláciu; ostatné jazyky nemecky", () => {
    expect(vetyDe("en").kleinunternehmer).toContain("§ 19 UStG");
    expect(vetyDe("sk")).toEqual(v);
  });
  it("české vety ostali", () => {
    expect(vetyPreneseniaCz("cs").tuzemsko).toContain("§ 92a");
  });
  it("predvolený jazyk: nemecká firma po nemecky, ostatné po slovensky", () => {
    expect(predvolenyJazykFirmy("DE")).toBe("de");
    expect(predvolenyJazykFirmy("SK")).toBe("sk");
    expect(predvolenyJazykFirmy("CZ")).toBe("sk");
    expect(predvolenyJazykFirmy(null)).toBe("sk");
  });
  it("dátum po nemecky 17.10.2026", () => {
    expect(datumNaDoklade("2026-10-17", "de")).toBe("17.10.2026");
  });
  it("prepočet cudzej meny po nemecky", () => {
    expect(textPrepoctu("USD", 1.0845, "2026-10-16", 190, "de", "SK")).toBe(
      "USt. umgerechnet: 190,00 EUR (EZB-Referenzkurs vom 16.10.2026: 1 EUR = 1,0845 USD)",
    );
  });
});

describe("Nemecko — údaje firmy", () => {
  it("USt-IdNr. = DE + 9 číslic", () => {
    expect(jeUstIdNr("DE123456789")).toBe(true);
    expect(jeUstIdNr("de 123 456 789")).toBe(true);
    expect(jeUstIdNr("DE12345678")).toBe(false);
    expect(jeUstIdNr("SK2020123456")).toBe(false);
  });
  it("Steuernummer v bežných zápisoch", () => {
    expect(jeSteuernummer("12/345/67890")).toBe(true);
    expect(jeSteuernummer("123/456/78901")).toBe(true);
    expect(jeSteuernummer("9181081508155")).toBe(true);
    expect(jeSteuernummer("12/345")).toBe(false);
    expect(jeSteuernummer("DE123456789")).toBe(false);
  });
  it("na faktúre musí byť aspoň jedno z dvojice", () => {
    expect(chybyIdentifikatorovDe({})).toHaveLength(1);
    expect(chybyIdentifikatorovDe({ dic: "12/345/67890" })).toEqual([]);
    expect(chybyIdentifikatorovDe({ ic_dph: "DE123456789" })).toEqual([]);
    expect(chybyIdentifikatorovDe({ ic_dph: "DE1" })).toHaveLength(1);
  });
  it("popisky vo formulári", () => {
    expect(popiskyIdentifikatorov("DE")).toMatchObject({
      dic: "Steuernummer",
      icDph: "USt-IdNr.",
      icoPovinne: false,
    });
    expect(popiskyIdentifikatorov("SK")).toMatchObject({ dic: "DIČ", icDph: "IČ DPH" });
  });
  it("päta faktúry", () => {
    expect(
      pataFirmyDe({
        registergericht: "Amtsgericht München",
        handelsregister_nr: "HRB 123456",
        geschaeftsfuehrer: "Max Mustermann",
      }),
    ).toBe("Amtsgericht München, HRB 123456 · Geschäftsführer: Max Mustermann");
    expect(pataFirmyDe({})).toBeNull();
  });
  it("nemecké IČ DPH je pre nemeckú firmu tuzemské, pre slovenskú nie", () => {
    expect(jeTuzemske("DE123456789", "DE")).toBe(true);
    expect(jeTuzemske("DE123456789")).toBe(false);
    expect(jeTuzemske("SK2020123456")).toBe(true);
  });
});

describe("EPC QR (GiroCode)", () => {
  const udaje = {
    iban: "DE89 3704 0044 0532 0130 00",
    suma: 1234.5,
    mena: "EUR",
    vs: "2026001",
    sprava: "Rechnung 2026001",
    prijemca: "Muster GmbH",
    bic: "COBADEFFXXX",
  };
  it("presný reťazec podľa EPC069-12 verzie 002", () => {
    expect(epcQr(udaje)).toBe(
      "BCD\n002\n1\nSCT\nCOBADEFFXXX\nMuster GmbH\nDE89370400440532013000\nEUR1234.50\n\n\nRechnung 2026001",
    );
  });
  it("bez BIC ostane riadok prázdny; bez textu ide variabilný symbol", () => {
    expect(epcQr({ ...udaje, bic: null, sprava: null })).toBe(
      "BCD\n002\n1\nSCT\n\nMuster GmbH\nDE89370400440532013000\nEUR1234.50\n\n\nVS 2026001",
    );
  });
  it("bez textu aj symbolu sa prázdne riadky na konci nepíšu", () => {
    expect(epcQr({ ...udaje, sprava: null, vs: null })).toBe(
      "BCD\n002\n1\nSCT\nCOBADEFFXXX\nMuster GmbH\nDE89370400440532013000\nEUR1234.50",
    );
  });
  it("len eurá, kladná suma a meno príjemcu; dĺžky sa skrátia", () => {
    expect(epcQr({ ...udaje, mena: "USD" })).toBeNull();
    expect(epcQr({ ...udaje, suma: 0 })).toBeNull();
    expect(epcQr({ ...udaje, prijemca: "" })).toBeNull();
    const dlhe = epcQr({ ...udaje, prijemca: "A".repeat(90), sprava: "B".repeat(200) })!;
    const r = dlhe.split("\n");
    expect(r[5]).toHaveLength(70);
    expect(r[10]).toHaveLength(140);
  });
  it("nemecká firma dostane GiroCode, SK a CZ ostali", async () => {
    expect((await textQrPlatby(udaje, "DE"))?.format).toBe("GiroCode");
    expect((await textQrPlatby(udaje, "CZ"))?.format).toBe("SPD");
    expect((await textQrPlatby(udaje, "SK"))?.format).toBe("PAY by square");
    // Faktúra nemeckej firmy v cudzej mene ostane bez QR.
    expect(await textQrPlatby({ ...udaje, mena: "USD" }, "DE")).toBeNull();
  });
});
