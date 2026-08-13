import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseVendorFile, summarize } from "./import-vendors.server";

/** Oficiálne vzorové súbory Money S3 (money.cz → XML prenosy → vzorové XML). */
function fixture(meno: string) {
  return new Uint8Array(readFileSync(new URL(`./__fixtures__/${meno}`, import.meta.url)));
}

const VYDANA = fixture("money-s3-vydana.xml");
const SKLADOVA = fixture("money-s3-skladova.xml");
const CUDZIA_MENA = fixture("money-s3-cudzia-mena.xml");

describe("Money S3", () => {
  /*
   * Parser hľadal odberateľa v `Firma`/`Odberatel`, dátumy v `DatVyst`/`DatSplat`
   * a sumy v `KcBezDph`. Money S3 ich má v `DodOdb`, `Vystaveno`/`Splatno` a
   * `SouhrnDPH` — na oficiálnej vzorke teda vychádzal odberateľ prázdny, dátumy
   * prázdne a základ dane prázdny. Faktúry sa importovali bez odberateľa
   * a s dnešným dátumom.
   */
  it("prečíta hlavičku vydanej faktúry", () => {
    const [r] = parseVendorFile("money-s3", "VF.xml", VYDANA);
    expect(r).toMatchObject({
      invoice_number: "1024014",
      variable_symbol: "240300",
      issue_date: "2024-10-18",
      due_date: "2024-11-01",
      delivery_date: "2024-10-18",
      currency: "CZK",
      subtotal: "1350",
      vat_total: "283.5",
      total: "1633.5",
    });
  });

  it("odberateľa berie z DodOdb, nie z MojeFirma", () => {
    const [r] = parseVendorFile("money-s3", "VF.xml", VYDANA);
    expect(r.customer_name).toBe("Seyfor, a. s.");
    expect(r.customer_street).toBe("Drobného 555/49");
    // V Money S3 sa mesto volá `Misto`.
    expect(r.customer_city).toBe("Brno");
    expect(r.customer_zip).toBe("60200");
    expect(r.customer_country).toBe("CZ");
    expect(r.customer_email).toBe("info@money.cz");
    // Telefón je vnorený v `Tel/Cislo`.
    expect(r.customer_phone).toBe("549522511");
  });

  // Money S3 IČO vypisuje s vedúcou nulou; parser ho prevádzal na číslo.
  it("IČO si zachová vedúcu nulu", () => {
    const [r] = parseVendorFile("money-s3", "VF.xml", VYDANA);
    expect(r.customer_ico).toBe("01572377");
    expect(r.customer_ic_dph).toBe("CZ01572377");
    expect(r.customer_dic).toBe("01572377");
  });

  it("položky vrátane mernej jednotky zo skladovej karty", () => {
    const rows = parseVendorFile("money-s3", "VF.xml", SKLADOVA);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      item_name: "Kolečkové brusle",
      item_quantity: "1",
      item_unit: "ks",
      item_unit_price: "750",
      item_vat_rate: "21",
    });
    // Suma položky = základ + daň zo `SouhrnDPH`.
    expect(rows[0].item_total).toBe("750");
    expect(rows[1].item_name).toBe("Poštovné");
  });

  /*
   * Pri faktúre v cudzej mene je v `Celkem` domáca mena a skutočné sumy sú
   * v `Valuty`. Brať menu z `Valuty` a sumu z `Celkem` by faktúru nafúklo
   * kurzom — z 27,85 EUR by bolo 702,66 EUR.
   */
  it("faktúra v cudzej mene má sumy v tej mene", () => {
    const [r] = parseVendorFile("money-s3", "VF.xml", CUDZIA_MENA);
    expect(r.currency).toBe("EUR");
    expect(r.total).toBe("27.85");
    expect(r.subtotal).toBe("27.85");
    expect(r.customer_name).toBe("Seyfor Slovensko, a.s.");
    expect(r.customer_ic_dph).toBe("SK2020193890");
  });

  it("prijaté faktúry sa čítajú rovnako", () => {
    const xml = new TextDecoder()
      .decode(VYDANA)
      .replace(/SeznamFaktVyd/g, "SeznamFaktPrij")
      .replace(/FaktVyd/g, "FaktPrij");
    const [r] = parseVendorFile("money-s3", "PF.xml", new TextEncoder().encode(xml));
    expect(r.invoice_number).toBe("1024014");
    expect(r.customer_name).toBe("Seyfor, a. s.");
  });
});

describe("summarize", () => {
  /*
   * Celková hodnota sa sčítavala za každý riadok, ale riadok je položka a
   * hlavičkové `total` sa na nich opakuje. Faktúra s dvoma položkami sa do
   * náhľadu započítala dvakrát — 850 € vyzeralo ako 1 700 €.
   */
  it("faktúru s viacerými položkami počíta raz", () => {
    const rows = parseVendorFile("money-s3", "VF.xml", SKLADOVA);
    const s = summarize(rows);
    expect(s.invoicesCount).toBe(1);
    expect(s.itemsCount).toBe(2);
    expect(s.totalValue).toBe(850);
  });

  it("mena sa berie z dokladov, nie natvrdo", () => {
    expect(summarize(parseVendorFile("money-s3", "VF.xml", VYDANA)).currency).toBe("CZK");
    expect(summarize(parseVendorFile("money-s3", "VF.xml", CUDZIA_MENA)).currency).toBe("EUR");
  });
});

describe("CSV z iDokladu, Omegy a KROSu", () => {
  const IDOKLAD = [
    "Číslo dokladu;Variabilný symbol;Odberateľ;IČO;DIČ;IČ DPH;Dátum vystavenia;Dátum splatnosti;Mena;Celkom bez DPH;DPH;Celkom s DPH;Stav",
    "2025001;2025001;ACME s.r.o.;00151653;2020304050;SK2020304050;04.03.2025;18.03.2025;EUR;100,00;23,00;123,00;Uhradená",
    "2025002;2025002;Beta a.s.;36237337;2010203040;SK2010203040;05.03.2025;19.03.2025;EUR;250,00;57,50;307,50;Neuhradená",
  ].join("\n");

  const OMEGA = [
    "Číslo faktúry;Odberateľ - názov;IČO;IČ DPH;Ulica;Mesto;PSČ;Štát;Dátum vystavenia;Dátum splatnosti;Suma bez DPH;DPH;Celkom s DPH;Názov položky;Množstvo;MJ;Jednotková cena;Sadzba DPH;Cena celkom",
    "FA2025001;Gama spol. s r.o.;00151653;SK2020304050;Hlavná 1;Trnava;91701;SK;04.03.2025;18.03.2025;100,00;23,00;123,00;Montážne práce;10;h;10,00;23;123,00",
    "FA2025001;Gama spol. s r.o.;00151653;SK2020304050;Hlavná 1;Trnava;91701;SK;04.03.2025;18.03.2025;100,00;23,00;123,00;Doprava;1;ks;0,00;23;0,00",
  ].join("\n");

  const bajty = (s: string) => new TextEncoder().encode(s);

  it("iDoklad: hlavička, dátumy a desatinná čiarka", () => {
    const rows = parseVendorFile("idoklad", "export.csv", bajty(IDOKLAD));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      invoice_number: "2025001",
      variable_symbol: "2025001",
      customer_name: "ACME s.r.o.",
      issue_date: "2025-03-04",
      due_date: "2025-03-18",
      currency: "EUR",
      subtotal: "100.00",
      vat_total: "23.00",
      total: "123.00",
    });
    expect(summarize(rows).totalValue).toBe(430.5);
  });

  // Slovenské IČO má vedúce nuly bežne (00151653).
  it("iDoklad: IČO si zachová vedúce nuly", () => {
    const [r] = parseVendorFile("idoklad", "export.csv", bajty(IDOKLAD));
    expect(r.customer_ico).toBe("00151653");
    expect(r.customer_ic_dph).toBe("SK2020304050");
    expect(r.customer_dic).toBe("2020304050");
  });

  it("Omega: dva riadky jednej faktúry aj s položkami", () => {
    const rows = parseVendorFile("omega", "export.csv", bajty(OMEGA));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      invoice_number: "FA2025001",
      customer_name: "Gama spol. s r.o.",
      customer_city: "Trnava",
      customer_country: "SK",
      item_name: "Montážne práce",
      item_quantity: "10",
      item_unit: "h",
      item_unit_price: "10.00",
      item_vat_rate: "23",
    });
    const s = summarize(rows);
    expect(s.invoicesCount).toBe(1);
    expect(s.totalValue).toBe(123);
  });

  it("KROS číta rovnaké CSV rovnako", () => {
    const a = parseVendorFile("omega", "export.csv", bajty(OMEGA));
    const b = parseVendorFile("kros", "export.csv", bajty(OMEGA));
    expect(b).toEqual(a);
  });

  it("prázdny súbor nespadne", () => {
    expect(parseVendorFile("idoklad", "prazdne.csv", bajty(""))).toEqual([]);
  });
});
