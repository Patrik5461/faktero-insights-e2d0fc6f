/*
  Dodávateľ, text a položky prijatých dokladov v exporte do účtovného
  programu (pripomienky 4. 11. 2026, PALIERA):

  - prijatá faktúra 20260001 od SFC (eFaktúra) išla bez IČO, DIČ a adresy
    a s textom „Faktúra č. 20260001“,
  - bloček kartou (ostatný záväzok) bez dátumu dodania, s OCR názvami v texte,
  - bloček v hotovosti s rozúčtovaním PHM mal položky „50 % / 30 % / 20 %“.

  Pohoda XML sa overuje proti schéme Stormware, Omega EUD na pozíciách
  stĺpcov hlavičky R01 podľa ImportExport_28_00_2025.xls (hárok EUD).
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { sDoplnenymDodavatelom } from "./blocek-pohoda";
import { dodavateliaPrijatych, dicZIcDph } from "./blocek-pohoda.server";
import { blocekNaUctovanie, prijataNaUctovanie } from "./zauctovanie-export";
import { buildOmegaUctovanie } from "./export-omega-uctovanie";
import { popisZPoznamky, textBlockuNaExport, textPrijatejFaktury } from "./text-dokladu";
import { riadkyDokladu } from "./rozuctovanie";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = { inv: "invoice.xsd", vch: "voucher.xsd", int: "intDoc.xsd" };
const validatory = new Map<string, XsdValidator>();
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    let v = validatory.get(prefix);
    if (!v) {
      const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
      v = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
      validatory.set(prefix, v);
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      v.validate(doc);
    } catch (e: any) {
      chyby.push(`${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 300)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}
const hodnota = (xml: string, el: string) =>
  new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
const vsetky = (xml: string, el: string) =>
  [...xml.matchAll(new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`, "g"))].map((m) => m[1]);
/** Stĺpce riadku Omegy (číslované od 1 ako v špecifikácii). */
const stlpce = (riadok: string) => ["", ...riadok.split("\t")];

const firma: any = { id: "c1", name: "Firma s.r.o.", ico: "36123456", country: "SK" };
const omegaEv = { evidencia: "DF", rad: "DF26" };
const nastOmega = { evidencie: { DF: omegaEv, PD: omegaEv, ID: omegaEv } };
const kody: any = {
  "|518 321": { kod: "518 321", agenda: "", popis: "Nákup služieb", ucetMd: "518000", ucetD: "321000" },
  "|501 325": { kod: "501 325", agenda: "", popis: "Spotreba materiálu", ucetMd: "501000", ucetD: "325000" },
  "|PHM": { kod: "PHM", agenda: "", popis: "Nákup PHM", ucetMd: "501200", ucetD: "211000" },
  "|PHM50": { kod: "PHM50", agenda: "", popis: "Nákup PHM s odpočtom", ucetMd: "501100", ucetD: "211000" },
};

/** Prijatá faktúra s kompletným dodávateľom a položkami. */
const kompletna: any = {
  id: "pi-1",
  company_id: "c1",
  supplier_name: "Dodávateľ Plný s.r.o.",
  supplier_ico: "53297474",
  supplier_dic: "2121372693",
  supplier_ic_dph: "SK2121372693",
  supplier_street: "Račianska 17",
  supplier_zip: "83102",
  supplier_city: "Bratislava",
  supplier_country: "SK",
  supplier_email: "fakturacia@dodavatel.sk",
  invoice_number: "20260001",
  issue_date: "2026-10-28",
  delivery_date: "2026-10-28",
  due_date: "2026-11-05",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  pohoda_predkontacia: "518 321",
  pohoda_clenenie_dph: "PD",
  type: "regular",
  items: [
    { name: "Servis tlačiarne", quantity: 1, unit: "ks", unit_price: 60, vat_rate: 23, total: 60 },
    { name: "Toner čierny", quantity: 2, unit: "ks", unit_price: 20, vat_rate: 23, total: 40 },
  ],
};

describe("prijatá faktúra s kompletným dodávateľom", () => {
  it("Pohoda: IČO, DIČ, IČ DPH, ulica, PSČ, obec, štát, e-mail a text z položiek", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [prijataAkoDoklad(kompletna)], nastavenia: {} as any });
    expect(hodnota(xml, "typ:company")).toBe("Dodávateľ Plný s.r.o.");
    expect(hodnota(xml, "typ:ico")).toBe("53297474");
    expect(hodnota(xml, "typ:dic")).toBe("2121372693");
    expect(hodnota(xml, "typ:icDph")).toBe("SK2121372693");
    expect(hodnota(xml, "typ:street")).toBe("Račianska 17");
    expect(hodnota(xml, "typ:zip")).toBe("83102");
    expect(hodnota(xml, "typ:city")).toBe("Bratislava");
    expect(xml).toContain("<typ:country><typ:ids>SK</typ:ids></typ:country>");
    expect(hodnota(xml, "typ:email")).toBe("fakturacia@dodavatel.sk");
    expect(hodnota(xml, "inv:text")).toBe("Servis tlačiarne, Toner čierny");
    expect(vsetky(xml, "inv:text").slice(1)).toEqual(["Servis tlačiarne", "Toner čierny"]);
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("Omega EUD: názov, IČO, DIČ, kód štátu, IČ DPH a text na pozíciách R01", () => {
    const d = prijataNaUctovanie(kompletna, {});
    const { obsah, preskocene } = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia: nastOmega });
    expect(preskocene).toEqual([]);
    const riadky = obsah.split("\r\n");
    const r01 = stlpce(riadky[1]);
    expect(r01[1]).toBe("R01");
    expect(r01[2]).toBe("130");
    expect(r01[6]).toBe("20260001");
    expect(r01[7]).toBe("Dodávateľ Plný s.r.o.");
    expect(r01[8]).toBe("53297474");
    expect(r01[9]).toBe("2121372693");
    expect(r01[41]).toBe("Servis tlačiarne, Toner čierny");
    expect(r01[44]).toBe("SK");
    expect(r01[45]).toBe("SK2121372693");
    expect(r01[54]).toBe("20260001");
    // Sumy a typy súm sa nemenia: 100 základ (A), 23 daň (19A), KV B2.
    expect(r01[20]).toBe("123,00");
    expect(r01[24]).toBe("100,00");
    expect(r01[28]).toBe("23,00");
    const r02 = riadky.slice(2).filter((r) => r.startsWith("R02")).map(stlpce);
    expect(r02.map((r) => [r[3], r[5], r[7], r[9], r[10], r[26]])).toEqual([
      ["518", "321", "100,00", "Servis tlačiarne, Toner čierny", "A", "B2"],
      ["343", "321", "23,00", "Servis tlačiarne, Toner čierny", "19A", "B2"],
    ]);
  });
});

/** eFaktúra s dodávateľom len ako meno a IČ DPH (zaevidovaná pred 30. 10. 2026). */
const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>20260001</cbc:ID>
  <cbc:IssueDate>2026-10-28</cbc:IssueDate>
  <cbc:DueDate>2026-11-05</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0245">2121372693</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>53297474</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>SFC, s.r.o.</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Račianska 17</cbc:StreetName><cbc:CityName>Bratislava - mestská časť Nové Mesto</cbc:CityName><cbc:PostalZone>83102</cbc:PostalZone><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>SK2121372693</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>SFC, s.r.o.</cbc:RegistrationName><cbc:CompanyID>53297474</cbc:CompanyID></cac:PartyLegalEntity>
    <cac:Contact><cbc:ElectronicMail>uctaren@sfc.sk</cbc:ElectronicMail></cac:Contact>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0245">2121999999</cbc:EndpointID>
    <cac:PartyLegalEntity><cbc:RegistrationName>PALIERA s.r.o.</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0.23</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">1.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">0.23</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">1.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">1.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">1.23</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">1.23</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">1.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>skúška efaktúry</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">1.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

const zEfaktury: any = {
  id: "pi-sfc",
  company_id: "c1",
  source: "efaktura",
  customer_id: null,
  supplier_name: "SFC, s.r.o.",
  supplier_ico: null,
  supplier_dic: null,
  supplier_ic_dph: "SK2121372693",
  supplier_street: null,
  supplier_city: null,
  supplier_zip: null,
  supplier_country: null,
  supplier_email: null,
  invoice_number: "20260001",
  issue_date: "2026-10-28",
  delivery_date: "2026-10-28",
  due_date: "2026-11-05",
  currency: "EUR",
  amount_without_vat: 1,
  vat_amount: 0.23,
  amount_total: 1.23,
  pohoda_predkontacia: "518 321",
  pohoda_clenenie_dph: "PD",
  note: "Prijaté cez eFaktúru (Peppol).",
  items: null,
  type: "regular",
};

/** Klient Supabase len na čítanie: vráti riadky tabuľky bez ohľadu na filtre. */
function falosnyKlient(tabulky: Record<string, any[]>) {
  return {
    from(tab: string) {
      const q: any = {};
      for (const m of ["select", "eq", "in", "or", "not", "order", "limit", "is"]) q[m] = () => q;
      q.then = (res: any) => res({ data: tabulky[tab] ?? [], error: null });
      return q;
    },
  };
}

describe("doklad z eFaktúry a importu bez IČO, DIČ a adresy", () => {
  it("z XML eFaktúry doplní IČO, DIČ, adresu, e-mail a názov položky do textu", async () => {
    const sb = falosnyKlient({
      efaktura_received_documents: [{ matched_supplier_invoice_id: "pi-sfc", xml_payload: UBL }],
    });
    const dopl = await dodavateliaPrijatych(sb, "c1", [prijataAkoDoklad(zEfaktury)], { register: false });
    expect(dopl["pi-sfc"]).toMatchObject({
      ico: "53297474",
      dic: "2121372693",
      street: "Račianska 17",
      city: "Bratislava - mestská časť Nové Mesto",
      zip: "83102",
      country: "SK",
      email: "uctaren@sfc.sk",
      nazvyPoloziek: ["skúška efaktúry"],
    });

    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijataAkoDoklad(zEfaktury)],
      nastavenia: { dodavateliaPrijatych: dopl } as any,
    });
    expect(hodnota(xml, "typ:ico")).toBe("53297474");
    expect(hodnota(xml, "typ:dic")).toBe("2121372693");
    expect(hodnota(xml, "typ:icDph")).toBe("SK2121372693");
    expect(hodnota(xml, "typ:street")).toBe("Račianska 17");
    expect(hodnota(xml, "typ:zip")).toBe("83102");
    expect(hodnota(xml, "typ:email")).toBe("uctaren@sfc.sk");
    expect(hodnota(xml, "inv:text")).toBe("skúška efaktúry");
    expect(chybySchemy(xml)).toEqual([]);

    const d = prijataNaUctovanie(sDoplnenymDodavatelom(zEfaktury, dopl["pi-sfc"]), {});
    const r01 = stlpce(buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia: nastOmega }).obsah.split("\r\n")[1]);
    expect([r01[7], r01[8], r01[9], r01[41], r01[45]]).toEqual([
      "SFC, s.r.o.",
      "53297474",
      "2121372693",
      "skúška efaktúry",
      "SK2121372693",
    ]);
  });

  it("import bez eFaktúry: karta v adresári podľa IČ DPH, inak aspoň DIČ z IČ DPH", async () => {
    const zImportu = { ...zEfaktury, id: "pi-imp", source: "import", note: "Prenesené z Doklada." };
    const sb = falosnyKlient({
      customers: [
        {
          id: "k1",
          ico: "53297474",
          dic: "2121372693",
          ic_dph: "SK2121372693",
          street: "Račianska 17",
          city: "Bratislava",
          zip: "831 02",
          country: "SK",
          email: null,
        },
      ],
    });
    const dopl = await dodavateliaPrijatych(sb, "c1", [zImportu], { register: false });
    expect(dopl["pi-imp"]).toMatchObject({ ico: "53297474", dic: "2121372693", street: "Račianska 17", zip: "831 02" });
    // Bez eFaktúry a bez karty: text ostane „Faktúra č.“ (náhradný), DIČ z IČ DPH.
    const prazdny = await dodavateliaPrijatych(falosnyKlient({}), "c1", [zImportu], { register: false });
    expect(prazdny["pi-imp"]).toEqual({ dic: "2121372693" });
    expect(textPrijatejFaktury(zImportu)).toBe("Faktúra č. 20260001");
    expect(dicZIcDph("SK 2121372693")).toBe("2121372693");
    expect(dicZIcDph("CZ12345678")).toBeNull();
  });

  it("údaj na doklade sa nikdy neprepíše", () => {
    const d = sDoplnenymDodavatelom(
      { supplier_ico: "11111111", supplier_street: "Vlastná 1" },
      { ico: "22222222", street: "Iná 2", city: "Nitra" },
    );
    expect(d).toMatchObject({ supplier_ico: "11111111", supplier_street: "Vlastná 1", supplier_city: "Nitra" });
  });
});

/* ------------------------------------------------------------- bločky */

/** Bloček kartou — ostatný záväzok, tri sadzby DPH, položky z OCR. */
const blocekKartou: any = {
  id: "bl-karta",
  supplier_name: "Potraviny a.s.",
  supplier_ico: "47793155",
  supplier_dic: "2024133650",
  supplier_ic_dph: "SK2024133650",
  supplier_street: "Tomášikova 46A",
  supplier_city: "Bratislava",
  supplier_zip: "83104",
  supplier_country: "SK",
  document_number: "13721",
  issue_date: "2026-10-22",
  created_at: "2026-11-02T09:00:00Z",
  currency: "EUR",
  payment_method: "karta",
  total_amount: 20.99,
  vat_breakdown: [
    { sadzba: 5, zaklad: 2.85, dph: 0.14 },
    { sadzba: 19, zaklad: 10, dph: 1.9 },
    { sadzba: 23, zaklad: 4.96, dph: 1.14 },
  ],
  pohoda_predkontacia: "501 325",
  pohoda_clenenie_dph: "PD",
  kv_clenenie: "B3",
  note: "Prenesené z Doklada.",
  items: [
    { name: "Viac. kva. b. 400g", quantity: 1, unit_price: 2.99, vat_rate: 5, total: 2.99 },
    { name: "Kozí camembert 100g", quantity: 1, unit_price: 11.9, vat_rate: 19, total: 11.9 },
    { name: "Papierová taška malá", quantity: 1, unit_price: 0.69, vat_rate: 23, total: 0.69 },
    { name: "Prot.tyč.jahoda65g", quantity: 2, unit_price: 2.705, vat_rate: 23, total: 5.41 },
  ],
};
const nastBlocky: any = {
  blockyPodlaPlatby: true,
  pokladna: "HP",
  polozkyBlockov: true,
  popisyPredkontacii: { "501 325": "Spotreba materiálu", PHM: "Nákup PHM" },
  pomeryPredkontacii: {
    PHM: { typ: "dph5050", zaklad: 80, zdanitelna: "PHM50", lenZaklad: "PHM", nezdanitelna: "PHM", clenenieBezOdpoctu: null },
  },
};

describe("bloček kartou — ostatný záväzok", () => {
  it("Pohoda: dátum dodania = deň predaja, text z účtovnej položky, kód predkontácie, položky s členením", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocekKartou], nastavenia: nastBlocky });
    expect(hodnota(xml, "inv:invoiceType")).toBe("commitment");
    expect(hodnota(xml, "inv:date")).toBe("2026-10-22");
    expect(hodnota(xml, "inv:dateDelivery")).toBe("2026-10-22");
    expect(hodnota(xml, "inv:dateTax")).toBe("2026-10-22");
    // Systémová poznámka nie je popis — text je názov účtovnej položky, nie OCR názvy.
    expect(hodnota(xml, "inv:text")).toBe("Spotreba materiálu");
    // Predkontácia vždy kód, nikdy názov.
    expect(vsetky(xml, "typ:ids").filter((x) => /materi/i.test(x))).toEqual([]);
    const polozky = [...xml.matchAll(/<inv:invoiceItem>([\s\S]*?)<\/inv:invoiceItem>/g)].map((m) => m[1]);
    expect(polozky.map((p) => hodnota(p, "inv:text"))).toEqual([
      "Viac. kva. b. 400g",
      "Kozí camembert 100g",
      "Papierová taška malá",
      "Prot.tyč.jahoda65g",
    ]);
    expect(polozky.map((p) => hodnota(p, "inv:rateVAT"))).toEqual(["third", "low", "high", "high"]);
    for (const p of polozky) {
      expect(p).toContain("<inv:accounting><typ:ids>501 325</typ:ids></inv:accounting>");
      expect(p).toContain("<inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>");
      expect(p).toContain("<inv:classificationKVDPH><typ:ids>B3</typ:ids></inv:classificationKVDPH>");
    }
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("Omega: dátum dodania (st. 13) a text z účtovnej položky", () => {
    const d = blocekNaUctovanie(blocekKartou, { blockyPodlaPlatby: true });
    const riadky = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia: nastOmega }).obsah.split("\r\n");
    const r01 = stlpce(riadky[1]);
    expect(r01[2]).toBe("180");
    expect([r01[10], r01[13], r01[14]]).toEqual(["22.10.2026", "22.10.2026", "22.10.2026"]);
    expect(r01[41]).toBe("Spotreba materiálu");
    expect(riadky.filter((r) => r.startsWith("R02")).every((r) => stlpce(r)[9] === "Spotreba materiálu")).toBe(true);
  });
});

/** Bloček v hotovosti — PHM s pomerom (50 % s odpočtom, 30 % len základ, 20 % nedaňový). */
const blocekPhm: any = {
  id: "bl-phm",
  supplier_name: "OMV Slovensko, s.r.o.",
  supplier_ico: "00604381",
  document_number: "11665",
  issue_date: "2026-10-26",
  currency: "EUR",
  payment_method: "hotovost",
  total_amount: 135.15,
  vat_breakdown: [{ sadzba: 23, zaklad: 109.89, dph: 25.27 }],
  pohoda_predkontacia: "PHM",
  note: null,
  items: [{ name: "* 3 03     OMV Diesel", unit: "l", quantity: 67.65, unit_price: 1.998, vat_rate: 23, total: 135.16 }],
};

describe("bloček v hotovosti — výdavkový pokladničný doklad s pomerom", () => {
  it("Pohoda: časti pomeru nesú názov položky, kód a členenie každej časti", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocekPhm], nastavenia: nastBlocky });
    expect(xml).toContain("<vch:voucherType>expense</vch:voucherType>");
    expect(hodnota(xml, "vch:text")).toBe("Nákup PHM");
    const polozky = [...xml.matchAll(/<vch:voucherItem>([\s\S]*?)<\/vch:voucherItem>/g)].map((m) => m[1]);
    expect(polozky.map((p) => hodnota(p, "vch:text"))).toEqual([
      "OMV Diesel · 50 %",
      "OMV Diesel · 30 %",
      "OMV Diesel · 20 %",
    ]);
    expect(polozky.map((p) => /<typ:ids>(\w+)<\/typ:ids><\/vch:accounting>/.exec(p)?.[1])).toEqual(["PHM50", "PHM", "PHM"]);
    // Časť s odpočtom PD + KV B3; časti bez nároku PN — do KV DPH nepatria.
    expect(polozky.map((p) => /classificationVAT><typ:ids>(\w+)/.exec(p)?.[1])).toEqual(["PD", "PN", "PN"]);
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("Omega: zápisy s názvom položky a percentom, zlúčená časť bez odpočtu 50 %", () => {
    const d = blocekNaUctovanie(blocekPhm, { blockyPodlaPlatby: true, pomeryPredkontacii: nastBlocky.pomeryPredkontacii });
    const riadky = buildOmegaUctovanie({ firma, doklady: [d], kody, nastavenia: nastOmega }).obsah.split("\r\n");
    const r01 = stlpce(riadky[1]);
    expect(r01[2]).toBe("160");
    expect(r01[13]).toBe("26.10.2026");
    expect(r01[41]).toBe("Nákup PHM");
    const texty = riadky.filter((r) => r.startsWith("R02")).map((r) => [stlpce(r)[9], stlpce(r)[10]]);
    expect(texty).toEqual([
      ["OMV Diesel · 50 %", "A"],
      ["OMV Diesel · 50 %", "19A"],
      ["OMV Diesel · 50 %", "KV"],
      ["OMV Diesel · 50 %", "KV23"],
      ["Zaokrúhlenie", "Vz"],
    ]);
  });
});

describe("text dokladu", () => {
  it("systémové vety z poznámky nie sú popis", () => {
    expect(popisZPoznamky("Prenesené z Doklada.")).toBeNull();
    expect(popisZPoznamky("poistne\nPrenesené z Doklada.")).toBe("poistne");
    expect(popisZPoznamky("Prijaté cez eFaktúru (Peppol).")).toBeNull();
    expect(popisZPoznamky("Prijaté e-mailom od x@y.sk.")).toBeNull();
  });

  it("bloček: popis → účtovná položka → položky → náhradný", () => {
    const polozky = [{ name: "A" }, { name: "B" }];
    expect(textBlockuNaExport({ poznamka: "Obed s klientom", uctovnaPolozka: "Reprezentácia", polozky })).toBe("Obed s klientom");
    expect(textBlockuNaExport({ uctovnaPolozka: "Reprezentácia", polozky })).toBe("Reprezentácia");
    expect(textBlockuNaExport({ polozky, nahradny: "X č. 1" })).toBe("A, B");
    expect(textBlockuNaExport({ nahradny: "X č. 1" })).toBe("X č. 1");
  });

  it("rozúčtovanie bez položiek ostane len s percentom", () => {
    const r = riadkyDokladu(
      { items: null },
      [{ sadzba: 23, zaklad: 100, dph: 23 }],
      "PHM",
      "PD",
      nastBlocky.pomeryPredkontacii,
    );
    expect(r.map((x) => x.text)).toEqual(["50 %", "30 %", "20 %"]);
  });
});
