import { describe, expect, it } from "vitest";
import {
  CHYBA_BEZ_FOTKY,
  chybaFotkyZAppky,
  coChybaBlocku,
  jeBlocekDoBlockov,
  jeQrPokladnice,
  kamUlozitVydavok,
} from "./blocek-z-appky";

const zaklad = {
  zAppky: true,
  zQr: false,
  mime: "image/jpeg",
  suma: 12.5,
  datum: "2026-10-29",
  doNespracovanych: false,
};

describe("kamUlozitVydavok", () => {
  it("odfotený bloček z appky ide rovno do Bločkov", () => {
    expect(kamUlozitVydavok(zaklad)).toBe("blocky");
  });

  it("QR bloček z appky ide do Bločkov", () => {
    expect(kamUlozitVydavok({ ...zaklad, zQr: true })).toBe("blocky");
  });

  it("QR bloček z webu ide do Bločkov ako doteraz", () => {
    expect(kamUlozitVydavok({ ...zaklad, zAppky: false, zQr: true, mime: null })).toBe("blocky");
  });

  it("ručný zápis alebo fotka na webe ostáva v Nespracovaných", () => {
    expect(kamUlozitVydavok({ ...zaklad, zAppky: false })).toBe("nespracovane");
    expect(kamUlozitVydavok({ ...zaklad, zAppky: false, mime: null })).toBe("nespracovane");
  });

  it("bloček bez sumy alebo dátumu čaká v Nespracovaných", () => {
    expect(kamUlozitVydavok({ ...zaklad, suma: null })).toBe("nespracovane");
    expect(kamUlozitVydavok({ ...zaklad, datum: null })).toBe("nespracovane");
    expect(kamUlozitVydavok({ ...zaklad, zQr: true, datum: "" })).toBe("nespracovane");
  });

  it("nulová suma je suma", () => {
    expect(kamUlozitVydavok({ ...zaklad, suma: 0 })).toBe("blocky");
  });

  it("PDF z appky (výber súboru bez signálu) nie je bloček", () => {
    expect(kamUlozitVydavok({ ...zaklad, mime: "application/pdf" })).toBe("nespracovane");
  });

  it("PDF s QR kódom bločku je bloček", () => {
    expect(kamUlozitVydavok({ ...zaklad, zQr: true, mime: "application/pdf" })).toBe("blocky");
  });

  it("zálohová faktúra medzi bločky nepatrí ani s QR", () => {
    expect(kamUlozitVydavok({ ...zaklad, zalohova: true })).toBe("nespracovane");
    expect(kamUlozitVydavok({ ...zaklad, zQr: true, zalohova: true })).toBe("nespracovane");
  });

  it("nastavenie firmy pošle bloček z appky do Nespracovaných — QR aj fotku", () => {
    expect(kamUlozitVydavok({ ...zaklad, doNespracovanych: true })).toBe(
      "presun-do-nespracovanych",
    );
    expect(kamUlozitVydavok({ ...zaklad, zQr: true, doNespracovanych: true })).toBe(
      "presun-do-nespracovanych",
    );
  });

  it("nastavenie firmy sa netýka dokladu, ktorý bločkom nie je", () => {
    expect(kamUlozitVydavok({ ...zaklad, zAppky: false, doNespracovanych: true })).toBe(
      "nespracovane",
    );
  });
});

describe("jeBlocekDoBlockov", () => {
  it("obrázok z appky áno, obrázok z webu nie", () => {
    expect(jeBlocekDoBlockov({ zAppky: true, zQr: false, mime: "image/png" })).toBe(true);
    expect(jeBlocekDoBlockov({ zAppky: false, zQr: false, mime: "image/png" })).toBe(false);
  });
});

describe("chybaFotkyZAppky", () => {
  it("bloček z appky bez súboru odmietne", () => {
    expect(chybaFotkyZAppky({ zAppky: true, filePath: null })).toBe(CHYBA_BEZ_FOTKY);
    expect(chybaFotkyZAppky({ zAppky: true, filePath: "  " })).toBe(CHYBA_BEZ_FOTKY);
    expect(chybaFotkyZAppky({ zAppky: true })).toBe(CHYBA_BEZ_FOTKY);
  });

  it("bloček z appky so súborom pustí", () => {
    expect(chybaFotkyZAppky({ zAppky: true, filePath: "firma/abc.jpg" })).toBeNull();
  });

  it("web môže uložiť bloček aj bez fotky", () => {
    expect(chybaFotkyZAppky({ zAppky: false, filePath: null })).toBeNull();
  });
});

describe("coChybaBlocku", () => {
  it("bez fotky sa uložiť nedá — fotka sa pýta prvá", () => {
    expect(coChybaBlocku({ foto: null, uhrada: null })).toBe("foto");
    expect(coChybaBlocku({ foto: null, uhrada: "karta" })).toBe("foto");
  });

  it("s fotkou chýba už len úhrada", () => {
    expect(coChybaBlocku({ foto: "data:image/jpeg;base64,AA", uhrada: null })).toBe("uhrada");
  });

  it("fotka aj úhrada — dá sa uložiť", () => {
    expect(coChybaBlocku({ foto: "data:image/jpeg;base64,AA", uhrada: "hotovost" })).toBeNull();
  });
});

describe("jeQrPokladnice", () => {
  it("bloček z Finančnej správy alebo z kódu pokladnice áno", () => {
    expect(jeQrPokladnice({ zdroj: "ekasa" })).toBe(true);
    expect(jeQrPokladnice({ zdroj: "qr" })).toBe(true);
  });
  it("prečítaný len z fotky alebo nič — nie (napr. PAY by square na faktúre)", () => {
    expect(jeQrPokladnice({ zdroj: "foto" })).toBe(false);
    expect(jeQrPokladnice({ zdroj: "nic" })).toBe(false);
    expect(jeQrPokladnice(null)).toBe(false);
  });
});
