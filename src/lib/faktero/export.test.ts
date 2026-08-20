import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  buildPohodaInvoiceXml,
  buildPohodaExpensesXml,
  buildPohodaCashXml,
  buildPohodaBankXml,
  rozdelUcet,
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
  {
    name: "Montážne práce",
    quantity: 10,
    unit: "h",
    unit_price: 10,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  },
  {
    name: "Kniha",
    quantity: 1,
    unit: "ks",
    unit_price: 50,
    vat_rate: 19,
    subtotal: 50,
    vat_amount: 9.5,
    total: 59.5,
  },
  {
    name: "Liek",
    quantity: 2,
    unit: "ks",
    unit_price: 10,
    vat_rate: 5,
    subtotal: 20,
    vat_amount: 1,
    total: 21,
  },
  {
    name: "Poštovné",
    quantity: 1,
    unit: "ks",
    unit_price: 5,
    vat_rate: 0,
    subtotal: 5,
    vat_amount: 0,
    total: 5,
  },
];

const xml = buildPohodaInvoiceXml({
  company: firma,
  invoices: [{ invoice: faktura, items: polozky }],
});
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
});
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
    // Schéma Pohody (type.xsd) pozná `price3`, nie `priceThird` — s tým
    // druhým by doklad neprešiel kontrolou a sadzba 5 % by vypadla.
    expect(Number(suhrn.price3)).toBe(20);
    expect(Number(suhrn.price3VAT)).toBe(1);
    expect(Number(suhrn.priceNone)).toBe(5);

    const zaklad = polozky.reduce((s, p) => s + p.subtotal, 0);
    const dan = polozky.reduce((s, p) => s + p.vat_amount, 0);
    expect(
      Number(suhrn.priceHigh) +
        Number(suhrn.priceLow) +
        Number(suhrn.price3) +
        Number(suhrn.priceNone),
    ).toBe(zaklad);
    expect(Number(suhrn.priceHighVAT) + Number(suhrn.priceLowVAT) + Number(suhrn.price3VAT)).toBe(
      dan,
    );
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
      invoices: [
        { invoice: { ...faktura, customer_name: "Kováč & Syn <s.r.o.>" }, items: polozky },
      ],
    });
    expect(XMLValidator.validate(d)).toBe(true);
    expect(
      parser.parse(d).dataPack.dataPackItem.invoice.invoiceHeader.partnerIdentity.address.company,
    ).toBe("Kováč & Syn <s.r.o.>");
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

/**
 * Veci, ktoré účtovníkovi po importe pokazia účtovníctvo potichu — doklad sa
 * naimportuje, len je zaúčtovaný zle. Preto majú vlastné kolo.
 */
describe("Pohoda XML — čo sa dá zaúčtovať zle", () => {
  const posli = (invoice: any, items = polozky, nastavenia?: any) =>
    parser.parse(
      buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice, items }], nastavenia }),
    ).dataPack.dataPackItem.invoice;

  it("zálohová faktúra nie je bežná faktúra", () => {
    // Ako `issuedInvoice` by sa záloha zaúčtovala ako výnos, hoci ním nie je.
    expect(posli({ ...faktura, type: "proforma" }).invoiceHeader.invoiceType).toBe(
      "issuedAdvanceInvoice",
    );
  });

  it("dobropis má záporné sumy", () => {
    // Pohoda zakladá dobropis záporne; s kladnými sumami by pohľadávku zvýšil.
    const d = posli({ ...faktura, type: "credit_note" });
    expect(Number(d.invoiceSummary.homeCurrency.priceHigh)).toBe(-100);
    expect(Number(d.invoiceSummary.homeCurrency.priceHighVAT)).toBe(-23);
    const p = d.invoiceDetail.invoiceItem;
    expect(Number(p[0].quantity)).toBe(-10);
    expect(Number(p[0].homeCurrency.priceSum)).toBe(-123);
    // Jednotková cena ostáva kladná — otáča sa množstvo, ako to robí Pohoda.
    expect(Number(p[0].homeCurrency.unitPrice)).toBe(10);
  });

  it("forma úhrady ide z dokladu, nie natvrdo príkazom", () => {
    const forma = (m: any) => posli({ ...faktura, payment_method: m }).invoiceHeader.paymentType;
    expect(forma("cash").paymentType).toBe("cash");
    expect(forma("card").paymentType).toBe("creditcard");
    expect(forma("bank_transfer").paymentType).toBe("draft");
    // Neznámu formu radšej príkazom než vôbec.
    expect(forma("nieco_ine").paymentType).toBe("draft");
  });

  it("konštantný a špecifický symbol sa nesú ďalej", () => {
    // Kontroluje sa surové XML — v konštantnom symbole je vedúca nula, ktorú by
    // parser v teste zahodil, kým v súbore ostáva.
    const x = buildPohodaInvoiceXml({
      company: firma,
      invoices: [
        {
          invoice: { ...faktura, constant_symbol: "0308", specific_symbol: "123456" },
          items: polozky,
        },
      ],
    });
    expect(x).toContain("<inv:symConst>0308</inv:symConst>");
    expect(x).toContain("<inv:symSpec>123456</inv:symSpec>");
  });

  it("prázdne polia sa nezapisujú vôbec", () => {
    // Prázdny `<typ:ico></typ:ico>` Pohoda pri importe hlási ako chybu.
    const a = posli({ ...faktura, customer_ico: null, customer_dic: "", customer_email: null })
      .invoiceHeader.partnerIdentity.address;
    expect(a.ico).toBeUndefined();
    expect(a.dic).toBeUndefined();
    expect(a.email).toBeUndefined();
    expect(a.company).toBe("ACME s.r.o.");
  });

  it("zaokrúhlenie dorovná rozdiel medzi hlavičkou a položkami", () => {
    // Bez toho Pohoda hlási nesúlad o cent a doklad sa nedá zlikvidovať úhradou.
    const s = posli({ ...faktura, total: 208.51 }).invoiceSummary.homeCurrency;
    expect(Number(s.round.priceRound)).toBe(0.01);
  });

  it("sadzby sa prekladajú podľa dňa plnenia, nie podľa dneška", () => {
    // Pohoda si k priehradke domyslí percento podľa dátumu; doklad z roku 2024
    // s 20 % je „základná sadzba", nie historická.
    const stare = posli({ ...faktura, issue_date: "2024-06-10", delivery_date: "2024-06-10" }, [
      { ...polozky[0], vat_rate: 20, subtotal: 100, vat_amount: 20, total: 120 },
      { ...polozky[1], vat_rate: 10, subtotal: 50, vat_amount: 5, total: 55 },
    ]);
    expect(stare.invoiceDetail.invoiceItem.map((x: any) => x.rateVAT)).toEqual(["high", "low"]);

    // Naopak 20 % na doklade z roku 2025 je oprava k staršej faktúre.
    const nove = posli(faktura, [
      { ...polozky[0], vat_rate: 20, subtotal: 100, vat_amount: 20, total: 120 },
    ]);
    expect(nove.invoiceDetail.invoiceItem.rateVAT).toBe("historyHigh");
  });

  it("faktúra v cudzej mene sa radšej vynechá, než by sa vyviezla zle", () => {
    // Pohoda chce rozpis po sadzbách v domácej mene a kurz k faktúre nemáme —
    // v `homeCurrency` by čítala doláre ako eurá a nikto by si to nevšimol.
    const r = EXPORT_STRATEGIES.pohoda_xml.build({
      company: firma,
      invoices: [
        { invoice: faktura, items: polozky },
        { invoice: { ...faktura, invoice_number: "20250009", currency: "USD" }, items: polozky },
      ],
    });
    const d = parser.parse(r.content).dataPack;
    expect(d.dataPackItem.invoice.invoiceHeader.number.numberRequested).toBe(20250001);
    expect(r.preskocene).toEqual(["20250009 — faktúra v mene USD"]);
  });

  it("keď by v balíku nezostalo nič, export sa nespraví", () => {
    // Prázdny `dataPack` schéma nepripúšťa a účtovníčke by prišiel súbor,
    // ktorý vyzerá ako export, ale niet v ňom dokladu.
    expect(() =>
      EXPORT_STRATEGIES.pohoda_xml.build({
        company: firma,
        invoices: [{ invoice: { ...faktura, currency: "CZK" }, items: polozky }],
      }),
    ).toThrow(/nedá vyviezť/);
  });

  it("prenesenie daňovej povinnosti sa dá na doklade spoznať", () => {
    // Z čísel to nevidno — vyzerá to rovnako ako oslobodené plnenie.
    const h = posli({ ...faktura, reverse_charge: true }).invoiceHeader;
    expect(String(h.note)).toContain("Prenesenie daňovej povinnosti");
  });

  it("predkontácia a členenie DPH sa doplnia podľa typu dokladu", () => {
    const n = {
      predkontacia: "3Fv",
      predkontaciaDobropis: "3Fd",
      clenenieDph: "UD",
      clenenieDphPdp: "UDpdp",
    };
    expect(posli(faktura, polozky, n).invoiceHeader.accounting.ids).toBe("3Fv");
    expect(posli(faktura, polozky, n).invoiceHeader.classificationVAT.ids).toBe("UD");
    expect(
      posli({ ...faktura, type: "credit_note" }, polozky, n).invoiceHeader.accounting.ids,
    ).toBe("3Fd");
    // Pri prenesení daňovej povinnosti platí vlastné členenie.
    expect(
      posli({ ...faktura, reverse_charge: true }, polozky, n).invoiceHeader.classificationVAT.ids,
    ).toBe("UDpdp");
    // Bez nastavenia sa nedopĺňa nič — vymyslený kód by import zhodil.
    expect(posli(faktura).invoiceHeader.accounting).toBeUndefined();
  });
});

/**
 * Prijaté doklady. Bloček z registračnej pokladne má položky v cenách s daňou
 * a býva ich aj dvadsať; do účtovníctva z nich nie je nič, zato rozpis DPH
 * musí sedieť na halier.
 */
describe("Pohoda XML — prijaté doklady", () => {
  const firmaSk = { ico: "56607016", default_currency: "EUR" };
  const bloček = {
    document_number: "2516",
    supplier_name: "STORX s. r. o.",
    supplier_ico: "12345678",
    supplier_ic_dph: "SK1234567890",
    issue_date: "2026-08-05",
    net_amount: 20.16,
    vat_amount: 4.41,
    total_amount: 24.57,
    vat_rate: 23,
    currency: "EUR",
    payment_method: "karta",
    vat_breakdown: [
      { dph: 4.32, sadzba: 23, zaklad: 18.77 },
      { dph: 0, sadzba: 0, zaklad: 0.9 },
      { dph: 0.09, sadzba: 19, zaklad: 0.49 },
    ],
  };
  const posli = (doklady: any[], nastavenia?: any) =>
    parser.parse(buildPohodaExpensesXml({ company: firmaSk, doklady, nastavenia })).dataPack;

  it("rozpis DPH z bločku sadne do priehradok Pohody", () => {
    const s = posli([bloček]).dataPackItem.invoice.invoiceSummary.homeCurrency;
    expect(Number(s.priceHigh)).toBe(18.77);
    expect(Number(s.priceHighVAT)).toBe(4.32);
    expect(Number(s.priceLow)).toBe(0.49);
    expect(Number(s.priceLowVAT)).toBe(0.09);
    expect(Number(s.priceNone)).toBe(0.9);
    // Súčet musí dať sumu dokladu, inak by účtovníčke nesedela pokladňa.
    const spolu =
      Number(s.priceHigh) +
      Number(s.priceHighVAT) +
      Number(s.priceLow) +
      Number(s.priceLowVAT) +
      Number(s.priceNone) +
      Number(s.round.priceRound);
    expect(Math.round(spolu * 100) / 100).toBe(24.57);
  });

  it("je to prijatá faktúra a číslo od dodávateľa ide do variabilného symbolu", () => {
    // Vlastné číslo si Pohoda pridelí z vlastnej rady, tak ako pri ručnom zadaní.
    const h = posli([bloček]).dataPackItem.invoice.invoiceHeader;
    expect(h.invoiceType).toBe("receivedInvoice");
    expect(String(h.symVar)).toBe("2516");
    expect(h.number).toBeUndefined();
    expect(h.paymentType.paymentType).toBe("creditcard");
    expect(h.partnerIdentity.address.company).toBe("STORX s. r. o.");
  });

  it("položky bločku sa nevyvážajú", () => {
    // Sú v cenách s daňou a „Záloh plech" v účtovníctve nikto nepotrebuje.
    expect(posli([bloček]).dataPackItem.invoice.invoiceDetail).toBeUndefined();
  });

  it("starší doklad bez rozpisu sa odvodí z hlavičky", () => {
    const s = posli([
      { ...bloček, vat_breakdown: null, net_amount: 100, vat_amount: 23, total_amount: 123 },
    ]).dataPackItem.invoice.invoiceSummary.homeCurrency;
    expect(Number(s.priceHigh)).toBe(100);
    expect(Number(s.priceHighVAT)).toBe(23);
  });

  it("predkontácia prijatého dokladu je vlastná", () => {
    const h = posli([bloček], { predkontacia: "3Fv", predkontaciaPrijata: "5Fp" }).dataPackItem
      .invoice.invoiceHeader;
    // Náklad sa neúčtuje predkontáciou výnosu.
    expect(h.accounting.ids).toBe("5Fp");
  });

  it("doklad v cudzej mene sa vynechá", () => {
    const d = posli([bloček, { ...bloček, document_number: "9", currency: "CZK" }]);
    expect(d.dataPackItem.invoice.invoiceHeader.symVar).toBe(2516);
  });
});

describe("Pohoda XML — pokladňa", () => {
  const firmaSk = { ico: "56607016", default_currency: "EUR" };
  const pohyby = [
    {
      entry_number: "PPD 2026/14",
      entry_date: "2026-08-03",
      type: "prijem",
      amount: 250,
      description: "Vklad do pokladne",
    },
    {
      entry_number: "VPD 2026/22",
      entry_date: "2026-08-07",
      type: "vydaj",
      amount: 18.4,
      description: "Kancelárske potreby",
      category: "Réžia",
    },
  ];
  const posli = (nastavenia?: any) =>
    parser.parse(buildPohodaCashXml({ company: firmaSk, pohyby, nastavenia })).dataPack;

  it("príjem a výdavok sú rozlíšené", () => {
    const v = posli().dataPackItem.map((x: any) => x.voucher.voucherHeader.voucherType);
    expect(v).toEqual(["receipt", "expense"]);
  });

  it("suma je vždy kladná a v nulovej sadzbe", () => {
    // Pokladničný pohyb u nás sadzbu nemá; vymyslená by bola tichá chyba v DPH.
    const s = posli().dataPackItem[1].voucher.voucherSummary.homeCurrency;
    expect(Number(s.priceNone)).toBe(18.4);
    // Výdavok sa nezapisuje záporne — o smere hovorí typ dokladu.
    expect(String(s.priceNone).startsWith("-")).toBe(false);
  });

  it("naše číslo pohybu ostane v texte, aby sa dal dohľadať", () => {
    const t = posli().dataPackItem[0].voucher.voucherHeader.text;
    expect(String(t)).toContain("PPD 2026/14");
    expect(String(t)).toContain("Vklad do pokladne");
  });

  it("pokladňa a predkontácia sa doplnia, len keď sú nastavené", () => {
    expect(posli().dataPackItem[0].voucher.voucherHeader.cashAccount).toBeUndefined();
    const h = posli({ pokladna: "HOT", predkontaciaPokladna: "3Pp" }).dataPackItem[0].voucher
      .voucherHeader;
    expect(h.cashAccount.ids).toBe("HOT");
    expect(h.accounting.ids).toBe("3Pp");
  });
});

describe("KROS Omega TXT", () => {
  const txt = buildOmegaTxt({
    company: {
      name: "Tobify s.r.o.",
      ico: "56607016",
      street: "Športová 707/43",
      zip: "91926",
      city: "Zavar",
    },
    invoices: [{ invoice: faktura, items: polozky }],
  });
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
    const d = buildOmegaTxt({
      company: {},
      invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }],
    });
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
    const d = buildOmegaTxt({
      company: {},
      invoices: [{ invoice: { ...faktura, currency: "CZK" }, items: polozky }],
    });
    const c = d.split("\r\n")[1].split("\t");
    expect(c[16]).toBe("208,50"); // suma spolu CM
    expect(c[42]).toBe(""); // suma spolu TM ostáva prázdna
    expect(c[39]).toBe("CZK");
  });
});

describe("Money S3 XML", () => {
  const x = buildMoneyS3Xml({
    company: { name: "Tobify s.r.o.", ico: "56607016" },
    invoices: [{ invoice: faktura, items: polozky }],
  });
  // Bez `parseTagValue: false` by parser z IČO `00151653` urobil číslo.
  const parserText = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
  });
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
    const c = buildMoneyS3Xml({
      company: {},
      invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }],
    });
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


describe("bankový výpis do Pohody", () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false,
  });
  const firmaSk = { ico: "12345678", default_currency: "EUR" } as any;
  const pohyby = [
    {
      datum: "2026-01-15",
      suma: 123.45,
      smer: "prijem" as const,
      popis: "Úhrada faktúry 2026001",
      protistrana: "Odberateľ s.r.o.",
      protiucet: "SK3111000000002612345678",
      vs: "2026001",
      ks: "0308",
    },
    {
      datum: "2026-01-20",
      suma: 58.9,
      smer: "vydaj" as const,
      popis: "Poplatok za vedenie účtu",
      protiucet: "1234567890/1100",
    },
    { datum: "2026-01-22", suma: 12, smer: "vydaj" as const },
  ];
  const posli = (navyse?: Record<string, unknown>) =>
    parser.parse(
      buildPohodaBankXml({
        company: firmaSk,
        pohyby,
        cisloVypisu: "8",
        datumVypisu: "2026-01-31",
        ...navyse,
      }),
    ).dataPack;

  it("je to platné XML a jeden pohyb = jeden doklad", () => {
    const xml = buildPohodaBankXml({ company: firmaSk, pohyby, cisloVypisu: "8" });
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(posli().dataPackItem).toHaveLength(3);
  });

  it("smer nesie typ dokladu, nie znamienko", () => {
    // Záporná suma s `receipt` by v Pohode urobila príjem mínus — tichá chyba.
    const polozky = posli().dataPackItem;
    expect(polozky.map((x: any) => x.bank.bankHeader.bankType)).toEqual([
      "receipt",
      "expense",
      "expense",
    ]);
    const sumy = polozky.map((x: any) => x.bank.bankSummary.homeCurrency.priceNone);
    expect(sumy).toEqual(["123.45", "58.90", "12.00"]);
    expect(sumy.some((s: string) => s.startsWith("-"))).toBe(false);
  });

  it("číslo výpisu a poradie pohybu sa zmestia do desiatich znakov", () => {
    const kratke = posli().dataPackItem[2].bank.bankHeader.statementNumber;
    expect(kratke.statementNumber).toBe("8");
    expect(kratke.numberMovement).toBe("3");

    // Desaťznakové číslo výpisu už na poradie miesto nenechá.
    const dlhe = posli({ cisloVypisu: "2026000123" }).dataPackItem[0].bank.bankHeader
      .statementNumber;
    expect(dlhe.statementNumber).toBe("2026000123");
    expect(dlhe.numberMovement).toBeUndefined();
  });

  it("protiúčet sa zapíše len celý — číslo aj kód banky", () => {
    const polozky = posli().dataPackItem;
    expect(polozky[0].bank.bankHeader.paymentAccount).toEqual({
      accountNo: "SK3111000000002612345678",
      bankCode: "1100",
    });
    expect(polozky[1].bank.bankHeader.paymentAccount).toEqual({
      accountNo: "1234567890",
      bankCode: "1100",
    });
    // Pohyb bez protiúčtu ho nesmie mať prázdny — import by spadol.
    expect(polozky[2].bank.bankHeader.paymentAccount).toBeUndefined();
  });

  it("označenie platby ide do poznámky dokladu", () => {
    // V Pohode je to jediné pole, kam sa dá napísať čokoľvek a nemusí to
    // najprv existovať v číselníku — štítok ani stredisko by import odmietol.
    const polozky = posli({
      pohyby: [
        { ...pohyby[0], oznacenie: "faktura" as const },
        { ...pohyby[1], oznacenie: "poplatok" as const },
        pohyby[2],
      ],
    }).dataPackItem;

    expect(polozky[0].bank.bankHeader.note).toBe("Úhrada faktúry");
    expect(polozky[1].bank.bankHeader.note).toBe("Bankový poplatok");
    // Bez označenia sa prázdna poznámka nezapisuje.
    expect(polozky[2].bank.bankHeader.note).toBeUndefined();
  });

  it("predkontácia sa berie podľa označenia, inak spoločná", () => {
    const polozky = posli({
      pohyby: [
        { ...pohyby[0], oznacenie: "faktura" as const },
        { ...pohyby[1], oznacenie: "poplatok" as const },
        pohyby[2],
      ],
      nastavenia: {
        predkontaciaBanka: "2Bv",
        predkontacieOznaceni: { poplatok: "3Bv", dan: "5Bv" },
      },
    }).dataPackItem;

    expect(polozky[0].bank.bankHeader.accounting.ids).toBe("2Bv");
    expect(polozky[1].bank.bankHeader.accounting.ids).toBe("3Bv");
    // Pohyb bez označenia dostane spoločnú.
    expect(polozky[2].bank.bankHeader.accounting.ids).toBe("2Bv");
  });

  it("bez akejkoľvek predkontácie sa element nezapíše", () => {
    // Prázdna predkontácia je v Pohode chyba importu, nie prázdne pole.
    const polozky = posli({
      pohyby: [{ ...pohyby[0], oznacenie: "faktura" as const }, pohyby[2]],
      nastavenia: { predkontacieOznaceni: { faktura: "  " } },
    }).dataPackItem;
    expect(polozky[0].bank.bankHeader.accounting).toBeUndefined();
  });

  it("prázdne symboly a protistrana sa nezapisujú", () => {
    const h = posli().dataPackItem[2].bank.bankHeader;
    expect(h.symVar).toBeUndefined();
    expect(h.symConst).toBeUndefined();
    expect(h.partnerIdentity).toBeUndefined();
    // Bez popisu musí ostať aspoň niečo, inak je doklad vo výpise bezmenný.
    expect(h.text).toBe("Platba z účtu");
  });

  it("účet a predkontácia sa doplnia, len keď sú nastavené", () => {
    expect(posli().dataPackItem[0].bank.bankHeader.account).toBeUndefined();
    const s = posli({ nastavenia: { banka: "TB", predkontaciaBanka: "2Bv" } }).dataPackItem[0].bank
      .bankHeader;
    expect(s.account.ids).toBe("TB");
    expect(s.accounting.ids).toBe("2Bv");
  });
});

describe("rozdelUcet", () => {
  it("rozpozná slovenský aj český IBAN a domáci tvar s lomkou", () => {
    expect(rozdelUcet("SK31 1100 0000 0026 1234 5678")).toEqual({
      cislo: "SK3111000000002612345678",
      kodBanky: "1100",
    });
    expect(rozdelUcet("CZ6508000000192000145399")).toEqual({
      cislo: "CZ6508000000192000145399",
      kodBanky: "0800",
    });
    expect(rozdelUcet("19-2000145399/0800")).toEqual({
      cislo: "19-2000145399",
      kodBanky: "0800",
    });
  });

  it("čomu nerozumie, to radšej nevyplní", () => {
    // Polovičný protiúčet zhodí celý import, tak radšej žiadny.
    expect(rozdelUcet("DE89370400440532013000")).toBeNull();
    expect(rozdelUcet("bez čísla")).toBeNull();
    expect(rozdelUcet("")).toBeNull();
  });
});
