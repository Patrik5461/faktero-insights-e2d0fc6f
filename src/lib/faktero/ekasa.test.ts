import { describe, it, expect } from "vitest";
import {
  doplnSumy,
  extractPayload,
  isEkasaQr,
  kandidatiPayloadu,
  parseDatum,
  parseEkasaXml,
  parseNumber,
  pick,
} from "./ekasa";

describe("parseDatum", () => {
  it("ISO dátum", () => {
    expect(parseDatum("2026-08-09")).toBe("2026-08-09");
  });

  // Toto je najdrahšia chyba v celom dekodéri: `new Date(x).toISOString()`
  // posunie doklad vydaný krátko po polnoci o deň dozadu — a s ním do
  // predošlého mesiaca DPH.
  it("čas s pásmom neposunie deň dozadu", () => {
    expect(parseDatum("2026-08-09T00:30:00+02:00")).toBe("2026-08-09");
    expect(parseDatum("2026-01-01T00:05:00+01:00")).toBe("2026-01-01");
  });

  it("slovenský zápis s bodkami", () => {
    expect(parseDatum("9.8.2026")).toBe("2026-08-09");
    expect(parseDatum("09.08.2026")).toBe("2026-08-09");
    expect(parseDatum("09. 08. 2026")).toBe("2026-08-09");
  });

  it("nezmysel nevráti dátum", () => {
    expect(parseDatum("")).toBeUndefined();
    expect(parseDatum(null)).toBeUndefined();
    expect(parseDatum("dnes")).toBeUndefined();
    expect(parseDatum("32.13.2026")).toBeUndefined();
  });
});

describe("parseNumber", () => {
  it("bežné tvary", () => {
    expect(parseNumber("12.50")).toBe(12.5);
    expect(parseNumber("12,50")).toBe(12.5);
    expect(parseNumber(" 7 ")).toBe(7);
  });

  // `String.replace(",", ".")` nahradí len prvý výskyt, takže z „1,234,56"
  // vyšlo „1.234,56" a z toho NaN — suma dokladu tíško zmizla.
  it("oddeľovač tisícov nerozbije sumu", () => {
    expect(parseNumber("1 234,56")).toBeCloseTo(1234.56, 6);
    expect(parseNumber("1.234,56")).toBeCloseTo(1234.56, 6);
    expect(parseNumber("1,234.56")).toBeCloseTo(1234.56, 6);
  });

  it("prázdne a nezmyselné vstupy", () => {
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("abc")).toBeUndefined();
  });
});

describe("pick", () => {
  it("prečíta hodnotu značky", () => {
    expect(pick("<Ico>12345678</Ico>", "Ico")).toBe("12345678");
    expect(pick('<Dic type="x">1020304050</Dic>', "Dic")).toBe("1020304050");
  });

  // `<Dic[^>]*>` chytilo aj `<DicDodavatela>` a do DIČ sa dostala cudzia hodnota.
  it("nezamení značku za dlhšiu s rovnakým začiatkom", () => {
    const xml = "<DicDodavatela>9999999999</DicDodavatela><Dic>1020304050</Dic>";
    expect(pick(xml, "Dic")).toBe("1020304050");
  });
});

describe("parseEkasaXml", () => {
  const xml = `<Receipt>
    <Ico>36123456</Ico>
    <Dic>2020123456</Dic>
    <IcDph>SK2020123456</IcDph>
    <ReceiptNumber>0123</ReceiptNumber>
    <CashRegisterCode>88812345678</CashRegisterCode>
    <IssueDate>2026-08-09T00:20:00+02:00</IssueDate>
    <TotalPrice>1 234,56</TotalPrice>
    <TotalVat>230,74</TotalVat>
    <Items>
      <Item><Name>Rúra PVC</Name><Quantity>3</Quantity><UnitPrice>12,50</UnitPrice><VatRate>23</VatRate><Price>37,50</Price></Item>
      <Item><Name>Koleno 90</Name><Quantity>2</Quantity><UnitPrice>4,20</UnitPrice><VatRate>23</VatRate><Price>8,40</Price></Item>
    </Items>
  </Receipt>`;

  it("prečíta hlavičku dokladu", () => {
    const d = parseEkasaXml(xml);
    expect(d.ico).toBe("36123456");
    expect(d.ic_dph).toBe("SK2020123456");
    expect(d.cisloDokladu).toBe("0123");
    expect(d.datum).toBe("2026-08-09");
    expect(d.suma).toBeCloseTo(1234.56, 6);
    expect(d.dph).toBeCloseTo(230.74, 6);
    expect(d.mena).toBe("EUR");
  });

  it("prečíta položky", () => {
    const d = parseEkasaXml(xml);
    expect(d.polozky).toHaveLength(2);
    expect(d.polozky[0]).toMatchObject({ name: "Rúra PVC", quantity: 3, vat_rate: 23 });
    expect(d.polozky[0].unit_price).toBeCloseTo(12.5, 6);
    expect(d.polozky[1].total).toBeCloseTo(8.4, 6);
  });

  it("prázdny doklad nevyrobí nezmyselné hodnoty", () => {
    const d = parseEkasaXml("<Receipt></Receipt>");
    expect(d.polozky).toEqual([]);
    expect(d.suma).toBeUndefined();
    expect(d.datum).toBeUndefined();
  });
});

describe("extractPayload / kandidatiPayloadu", () => {
  // Pôvodný výraz mal lomku v triede znakov, takže z odkazu vrátil aj cestu
  // („mdu/qr/AAAA…"). Base64 z toho bol nezmysel a QR sa nikdy nedekódoval.
  it("z URL vyberie payload bez cesty", () => {
    const b64 = "A".repeat(60);
    expect(extractPayload(`https://ekasa.financnasprava.sk/mdu/qr/${b64}`)).toBe(b64);
  });

  it("payload vo fragmente", () => {
    const b64 = "D".repeat(60);
    expect(extractPayload(`https://opd.financnasprava.sk/#/${b64}`)).toBe(b64);
  });

  it("holý payload nechá tak", () => {
    const b64 = "B".repeat(60);
    expect(extractPayload(` ${b64} `)).toBe(b64);
  });

  // Keď payload sám obsahuje lomky, prvý kandidát je useknutý — preto ich
  // dekodér dostane viac a skúša ich po jednom.
  it("ponúkne aj celý zvyšok za doménou", () => {
    const b64 = "E".repeat(30) + "/" + "F".repeat(30);
    const k = kandidatiPayloadu(`https://ekasa.financnasprava.sk/mdu/qr/${b64}`);
    expect(k).toContain(b64);
  });
});

describe("isEkasaQr", () => {
  it("rozpozná eKasa QR", () => {
    expect(isEkasaQr("https://ekasa.financnasprava.sk/mdu/qr/AAAA")).toBe(true);
    expect(isEkasaQr("C".repeat(90))).toBe(true);
  });

  it("cudzí QR odmietne", () => {
    expect(isEkasaQr("https://www.google.com")).toBe(false);
    expect(isEkasaQr("krátky text")).toBe(false);
  });
});

describe("doplnSumy", () => {
  it("dopočíta chýbajúci základ, DPH aj celkovú sumu", () => {
    expect(doplnSumy({ suma: 123, dph: 23 })).toEqual({ suma: 123, dph: 23, zaklad: 100 });
    expect(doplnSumy({ suma: 123, zaklad: 100 })).toEqual({ suma: 123, dph: 23, zaklad: 100 });
    expect(doplnSumy({ zaklad: 100, dph: 23 })).toEqual({ suma: 123, dph: 23, zaklad: 100 });
  });

  it("keď nie je z čoho počítať, nič si nevymyslí", () => {
    expect(doplnSumy({ suma: 123 })).toEqual({ suma: 123, dph: undefined, zaklad: undefined });
    expect(doplnSumy({})).toEqual({ suma: undefined, dph: undefined, zaklad: undefined });
  });
});
