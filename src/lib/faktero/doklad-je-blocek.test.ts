import { describe, expect, it } from "vitest";
import { daSaPresunutMedziPrijate, dovodBlocku, jeSkutocnyBlocek } from "./doklad-je-blocek";

describe("dovodBlocku", () => {
  it("UID z eKasy v QR", () => {
    expect(dovodBlocku({ source: "import", qr_raw: "O-A4CECF95438A4A328ECF95438A9A32A5" })).toBe(
      "ekasa",
    );
  });

  it("odkaz Finančnej správy v QR", () => {
    expect(
      dovodBlocku({
        qr_raw:
          "https://ekasa.financnasprava.sk/mdu/opd/receipt/O-A4CECF95438A4A328ECF95438A9A32A5",
      }),
    ).toBe("ekasa");
  });

  it("offline doklad podľa OKP a kódu pokladnice", () => {
    expect(
      dovodBlocku({
        qr_raw:
          "1a2b3c4d-5e6f7081-92a3b4c5-d6e7f809-0a1b2c3d|88812345678900001|2026-08-09T14:32|42|17,90",
      }),
    ).toBe("ekasa");
  });

  it("český QR EET", () => {
    expect(
      dovodBlocku({
        qr_raw: "EET*1.0*BKP:12345678-ABCDEF12*DIC:45316872*KC:117*DT:201710101844*R:B*",
      }),
    ).toBe("eet");
  });

  it("UID v čísle dokladu bez QR", () => {
    expect(dovodBlocku({ document_number: "O-C92013C7DC1942E2A013C7DC1952E293" })).toBe("ekasa");
  });

  it("doklad založený z QR kódu", () => {
    expect(dovodBlocku({ source: "qr", document_number: "5376" })).toBe("qr");
  });

  it("druh bloček od AI", () => {
    expect(
      dovodBlocku({
        source: "photo",
        ai_raw: { document_type: "faktura", document_subtype: "blocek" },
      }),
    ).toBe("druh");
    expect(dovodBlocku({ ai_raw: { druh: "blocek" } })).toBe("druh");
  });

  it("platobný QR faktúry bločkom nie je", () => {
    expect(
      dovodBlocku({ qr_raw: "SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK" }),
    ).toBeNull();
    expect(
      dovodBlocku({ qr_raw: "0004G0003L1TJ4H3E9P0LSDKVJ8H2ECJ0FN6OHA3M7GL0D0PSF8B8OD4H0M8FVF0AQ" }),
    ).toBeNull();
  });
});

describe("daSaPresunutMedziPrijate", () => {
  it("nahraté PDF bez znakov bločku sa ponúkne", () => {
    expect(
      daSaPresunutMedziPrijate({ source: "photo", document_number: "FA261428", qr_raw: null }),
    ).toBe(true);
  });

  it("sken bez QR sa ponúkne", () => {
    expect(daSaPresunutMedziPrijate({ source: "upload", document_number: null })).toBe(true);
  });

  it("AI rozpoznala faktúru", () => {
    expect(
      daSaPresunutMedziPrijate({
        source: "photo",
        ai_raw: { document_type: "faktura", document_subtype: "ostra" },
      }),
    ).toBe(true);
  });

  it("bloček z eKasy sa neponúkne", () => {
    expect(
      daSaPresunutMedziPrijate({ source: "qr", qr_raw: "O-73F46F77A28945B8B46F77A28905B83F" }),
    ).toBe(false);
    expect(jeSkutocnyBlocek({ source: "qr", qr_raw: "O-73F46F77A28945B8B46F77A28905B83F" })).toBe(
      true,
    );
  });

  it("bez dokladu nič", () => {
    expect(daSaPresunutMedziPrijate(null)).toBe(false);
    expect(jeSkutocnyBlocek(undefined)).toBe(false);
  });
});
