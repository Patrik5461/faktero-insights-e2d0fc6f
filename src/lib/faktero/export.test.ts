import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  buildPohodaInvoiceXml,
  buildOmegaTxt,
  buildMoneyS3Xml,
  EXPORT_STRATEGIES,
} from "./export.server";

const firma = { ico: "12345678", iban: "SK1234567890123456789012" };

const faktura = {
  invoice_number: "20250001",
  variable_symbol: "20250001",
  type: "regular",
  issue_date: "2025-03-04",
  delivery_date: "2025-03-02",
  due_date: "2025-03-18",
  notes: "Za marec",
  customer_name: "ACME s.r.o.",
  customer_street: "Hlavná 1",
  customer_city: "Trnava",
  customer_zip: "91701",
  customer_country: "SK",
  customer_ico: "00151653",
  customer_dic: "2020304050",
  customer_ic_dph: "SK2020304050",
  customer_email: "fakturacia@acme.sk",
  total: 208.5,
};

// Sadzby zámerne rôzne — Pohoda ich triedi do štyroch košov.
const polozky = [
  { name: "Montážne práce", quantity: 10, unit: "h", unit_price: 10, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
  { name: "Kniha", quantity: 1, unit: "ks", unit_price: 50, vat_rate: 19, subtotal: 50, vat_amount: 9.5, total: 59.5 },
  { name: "Liek", quantity: 2, unit: "ks", unit_price: 10, vat_rate: 5, subtotal: 20, vat_amount: 1, total: 21 },
  { name: "Poštovné", quantity: 1, unit: "ks", unit_price: 5, vat_rate: 0, subtotal: 5, vat_amount: 0, total: 5 },
];

const xml = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: faktura, items: polozky }] });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true });
const doc = parser.parse(xml);
const hlavicka = doc.dataPack.dataPackItem.invoice.invoiceHeader;
const suhrn = doc.dataPack.dataPackItem.invoice.invoiceSummary.homeCurrency;

describe("Pohoda XML export", () => {
  it("je platné XML", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it("hlavička nesie číslo, symboly a dátumy", () => {
    expect(hlavicka.number.numberRequested).toBe(20250001);
    expect(String(hlavicka.symVar)).toBe("20250001");
    expect(hlavicka.date).toBe("2025-03-04");
    // Dátum zdaniteľného plnenia je dátum dodania, nie vystavenia.
    expect(hlavicka.dateTax).toBe("2025-03-02");
    expect(hlavicka.dateDue).toBe("2025-03-18");
    expect(hlavicka.invoiceType).toBe("issuedInvoice");
  });

  it("nesie odberateľa vrátane IČ DPH", () => {
    const a = hlavicka.partnerIdentity.address;
    expect(a.company).toBe("ACME s.r.o.");
    expect(a.city).toBe("Trnava");
    expect(a.icDph).toBe("SK2020304050");
    expect(a.country.ids).toBe("SK");
  });

  it("položky sú všetky a v správnych sadzbách", () => {
    const p = doc.dataPack.dataPackItem.invoice.invoiceDetail.invoiceItem;
    expect(p).toHaveLength(4);
    expect(p.map((x: any) => x.rateVAT)).toEqual(["high", "low", "third", "none"]);
    expect(p[0].text).toBe("Montážne práce");
    expect(Number(p[0].homeCurrency.priceSum)).toBe(123);
  });

  // Súčty v pätičke musia sedieť s položkami, inak Pohoda doklad odmietne.
  it("súčty po sadzbách sedia s položkami", () => {
    expect(Number(suhrn.priceHigh)).toBe(100);
    expect(Number(suhrn.priceHighVAT)).toBe(23);
    expect(Number(suhrn.priceLow)).toBe(50);
    expect(Number(suhrn.priceLowVAT)).toBe(9.5);
    expect(Number(suhrn.priceThird)).toBe(20);
    expect(Number(suhrn.priceThirdVAT)).toBe(1);
    expect(Number(suhrn.priceNone)).toBe(5);

    const zaklad = polozky.reduce((s, p) => s + p.subtotal, 0);
    const dan = polozky.reduce((s, p) => s + p.vat_amount, 0);
    expect(
      Number(suhrn.priceHigh) + Number(suhrn.priceLow) + Number(suhrn.priceThird) + Number(suhrn.priceNone),
    ).toBe(zaklad);
    expect(
      Number(suhrn.priceHighVAT) + Number(suhrn.priceLowVAT) + Number(suhrn.priceThirdVAT),
    ).toBe(dan);
  });

  it("dobropis sa označí ako dobropis", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }],
    });
    expect(parser.parse(d).dataPack.dataPackItem.invoice.invoiceHeader.invoiceType).toBe(
      "issuedCreditNotice",
    );
  });

  // Meno firmy s ampersandom alebo lomenou zátvorkou by inak XML rozbilo.
  it("znaky z názvu firmy sa ošetria", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...faktura, customer_name: 'Kováč & Syn <s.r.o.>' }, items: polozky }],
    });
    expect(XMLValidator.validate(d)).toBe(true);
    expect(parser.parse(d).dataPack.dataPackItem.invoice.invoiceHeader.partnerIdentity.address.company).toBe(
      "Kováč & Syn <s.r.o.>",
    );
  });

  it("viac faktúr dá viac položiek dátového balíka", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [
        { invoice: faktura, items: polozky },
        { invoice: { ...faktura, invoice_number: "20250002" }, items: polozky },
      ],
    });
    expect(parser.parse(d).dataPack.dataPackItem).toHaveLength(2);
  });

  it("stratégia vráti súbor s príponou a typom", () => {
    const r = EXPORT_STRATEGIES.pohoda_xml.build({
      company: firma,
      invoices: [{ invoice: faktura, items: polozky }],
    });
    expect(r.fileName).toMatch(/^pohoda-faktury-\d{4}-\d{2}-\d{2}\.xml$/);
    expect(r.mime).toBe("application/xml");
    expect(XMLValidator.validate(r.content)).toBe(true);
  });
});

describe("KROS Omega TXT", () => {
  const txt = buildOmegaTxt({ company: { name: "Tobify s.r.o.", ico: "56607016", street: "Športová 707/43", zip: "91926", city: "Zavar" }, invoices: [{ invoice: faktura, items: polozky }] });
  const riadky = txt.split("\r\n").filter(Boolean);
  const stlpce = (r: string) => r.split("\t");

  // Špecifikácia KROSu: hodnoty oddelené tabulátorom, riadky ukončené CRLF,
  // prvý riadok musí byť R00.
  it("štruktúra R00 / R01 / R02", () => {
    expect(txt.endsWith("\r\n")).toBe(true);
    expect(riadky[0].startsWith("R00\tT01\t")).toBe(true);
    expect(riadky[1].startsWith("R01\t")).toBe(true);
    expect(riadky.slice(2).every((r) => r.startsWith("R02\t"))).toBe(true);
    expect(riadky).toHaveLength(2 + polozky.length);
  });

  it("hlavička súboru nesie našu firmu", () => {
    const c = stlpce(riadky[0]);
    expect(c[3]).toBe("Tobify s.r.o.");
    expect(c[4]).toBe("56607016");
    expect(c[7]).toBe("Zavar");
  });

  it("hlavička dokladu na správnych pozíciách", () => {
    const c = stlpce(riadky[1]);
    expect(c[1]).toBe("20250001"); // číslo dokladu
    expect(c[2]).toBe("ACME s.r.o.");
    expect(c[3]).toBe("00151653"); // IČO aj s vedúcimi nulami
    expect(c[4]).toBe("04.03.2025"); // dátum vystavenia v slovenskom tvare
    expect(c[5]).toBe("18.03.2025");
    expect(c[6]).toBe("02.03.2025"); // DUZP = dátum dodania
    expect(c[17]).toBe("0"); // typ dokladu: odberateľská faktúra
    expect(c[70]).toBe("20250001"); // VS je stĺpec 71
  });

  /*
   * Omega má tri priehradky na sadzby: vyššia, nižšia a znížená 2. Slovenské
   * 23 / 19 / 5 do nich sadnú v tomto poradí — od najvyššej.
   */
  it("sadzby a základy dane po priehradkách", () => {
    const c = stlpce(riadky[1]);
    expect(c[11]).toBe("19"); // sadzba nižšia
    expect(c[12]).toBe("23"); // sadzba vyššia
    expect(c[7]).toBe("50,00"); // základ nižšia
    expect(c[8]).toBe("100,00"); // základ vyššia
    expect(c[9]).toBe("5,00"); // základ nulová
    expect(c[13]).toBe("9,50"); // DPH nižšia
    expect(c[14]).toBe("23,00"); // DPH vyššia
    expect(c[94]).toBe("5"); // sadzba znížená 2
    expect(c[95]).toBe("20,00"); // základ znížená 2
    expect(c[96]).toBe("1,00"); // DPH znížená 2
  });

  // Súbor sa podľa KROSu vyrába uložením z Excelu, teda v slovenskom tvare.
  it("čísla majú desatinnú čiarku", () => {
    expect(riadky[1]).toContain("100,00");
    expect(riadky[1]).not.toContain("100.00");
  });

  it("položky s kódom sadzby 0 / N / Y / V", () => {
    const kody = riadky.slice(2).map((r) => stlpce(r)[5]);
    expect(kody).toEqual(["V", "N", "Y", "0"]);
    const prva = stlpce(riadky[2]);
    expect(prva[1]).toBe("Montážne práce");
    expect(prva[2]).toBe("10");
    expect(prva[3]).toBe("h");
    expect(prva[4]).toBe("10,00");
    expect(prva[9]).toBe("V"); // voľná položka, nie skladová karta
  });

  it("dobropis má typ dokladu 4", () => {
    const d = buildOmegaTxt({ company: {}, invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }] });
    expect(d.split("\r\n")[1].split("\t")[17]).toBe("4");
  });

  // Tabulátor v názve by rozhodil stĺpce celého riadku.
  it("tabulátor v texte sa nahradí medzerou", () => {
    const d = buildOmegaTxt({
      company: {},
      invoices: [{ invoice: { ...faktura, customer_name: "ACME\ts.r.o." }, items: polozky }],
    });
    const r = d.split("\r\n")[1].split("\t");
    expect(r[2]).toBe("ACME s.r.o.");
    expect(r[1]).toBe("20250001");
  });

  it("cudzia mena ide do sumy CM, nie TM", () => {
    const d = buildOmegaTxt({ company: {}, invoices: [{ invoice: { ...faktura, currency: "CZK" }, items: polozky }] });
    const c = d.split("\r\n")[1].split("\t");
    expect(c[16]).toBe("208,50"); // suma spolu CM
    expect(c[42]).toBe(""); // suma spolu TM ostáva prázdna
    expect(c[39]).toBe("CZK");
  });
});

describe("Money S3 XML", () => {
  const x = buildMoneyS3Xml({ company: { name: "Tobify s.r.o.", ico: "56607016" }, invoices: [{ invoice: faktura, items: polozky }] });
  // Bez `parseTagValue: false` by parser z IČO `00151653` urobil číslo.
  const parserText = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false });
  const d = parserText.parse(x);
  const f = d.MoneyData.SeznamFaktVyd.FaktVyd;

  it("je platné XML v štruktúre MoneyData", () => {
    expect(XMLValidator.validate(x)).toBe(true);
    expect(d.MoneyData["@ICAgendy"]).toBe("56607016");
  });

  it("hlavička faktúry", () => {
    expect(String(f.Doklad)).toBe("20250001");
    expect(f.Vystaveno).toBe("2025-03-04");
    expect(f.Splatno).toBe("2025-03-18");
    expect(f.PlnenoDPH).toBe("2025-03-02");
    expect(String(f.VarSymbol)).toBe("20250001");
    expect(Number(f.Celkem)).toBe(208.5);
  });

  it("odberateľ je v DodOdb", () => {
    expect(f.DodOdb.ObchNazev).toBe("ACME s.r.o.");
    expect(String(f.DodOdb.ICO)).toBe("00151653");
    expect(f.DodOdb.Adresa.Misto).toBe("Trnava");
    expect(f.DodOdb.Adresa.KodStatu).toBe("SK");
  });

  /*
   * Money S3 má v hlavičke len dve sadzby. Slovenská druhá znížená (5 %) sa
   * preto zapisuje do `SeznamDalsiSazby` — na to je tá časť schémy určená.
   */
  it("dve sadzby v hlavičke, tretia v zozname ďalších", () => {
    expect(Number(f.SazbaDPH1)).toBe(19);
    expect(Number(f.SazbaDPH2)).toBe(23);
    expect(Number(f.SouhrnDPH.Zaklad22)).toBe(100);
    expect(Number(f.SouhrnDPH.DPH22)).toBe(23);
    expect(Number(f.SouhrnDPH.Zaklad5)).toBe(50);
    expect(Number(f.SouhrnDPH.DPH5)).toBe(9.5);
    expect(Number(f.SouhrnDPH.Zaklad0)).toBe(5);
    const dalsia = f.SouhrnDPH.SeznamDalsiSazby.DalsiSazba;
    expect(Number(dalsia.Sazba)).toBe(5);
    expect(Number(dalsia.Zaklad)).toBe(20);
    expect(Number(dalsia.DPH)).toBe(1);
  });

  it("položky nesú vlastnú sadzbu aj sumy", () => {
    const p = f.SeznamPolozek.Polozka;
    expect(p).toHaveLength(4);
    expect(p[0].Popis).toBe("Montážne práce");
    expect(Number(p[0].PocetMJ)).toBe(10);
    expect(Number(p[0].SazbaDPH)).toBe(23);
    expect(Number(p[0].SouhrnDPH.Zaklad)).toBe(100);
  });

  it("dobropis sa označí príznakom", () => {
    const c = buildMoneyS3Xml({ company: {}, invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }] });
    expect(Number(parser.parse(c).MoneyData.SeznamFaktVyd.FaktVyd.Dobropis)).toBe(1);
  });
});

describe("stratégie", () => {
  it("všetky tri sú zapojené a majú kódovanie", () => {
    expect(Object.keys(EXPORT_STRATEGIES).sort()).toEqual([
      "money_s3_xml",
      "omega_txt",
      "pohoda_xml",
    ]);
    // Omega slovenskú diakritiku v UTF-8 neprečíta.
    expect(EXPORT_STRATEGIES.omega_txt.encoding).toBe("windows-1250");
    expect(EXPORT_STRATEGIES.pohoda_xml.encoding).toBe("utf-8");
    expect(EXPORT_STRATEGIES.money_s3_xml.encoding).toBe("utf-8");
  });

  it("každá vyrobí súbor so správnou príponou", () => {
    const vstup = { company: { ico: "1" }, invoices: [{ invoice: faktura, items: polozky }] };
    expect(EXPORT_STRATEGIES.omega_txt.build(vstup).fileName).toMatch(/\.txt$/);
    expect(EXPORT_STRATEGIES.money_s3_xml.build(vstup).fileName).toMatch(/\.xml$/);
    expect(EXPORT_STRATEGIES.pohoda_xml.build(vstup).fileName).toMatch(/\.xml$/);
  });
});
