/**
 * MRP-K/S (XML 2.0) so zaúčtovaním — výstup sa overuje proti schéme
 * `schemy/mrp/mrpks-2-0.xsd`, vygenerovanej z oficiálnej dokumentácie MRP
 * (typy a dĺžky polí), a sumy proti vzorovým súborom MRP: dobropis záporne
 * s DocType „D“, prijaté prenesenie s daňou v ReverseCharge…, cudzia mena
 * s hlavičkou v domácej mene.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { XMLParser } from "fast-xml-parser";
import { buildMrpUctovanie, textPreMrp } from "./export-mrp-uctovanie";
import {
  blocekNaUctovanie,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type NastaveniaUctovania,
} from "./zauctovanie-export";

const validator = XsdValidator.fromDoc(
  XmlDocument.fromBuffer(readFileSync(new URL("./schemy/mrp/mrpks-2-0.xsd", import.meta.url))),
);

function chybaSchemy(xml: string): string | null {
  const doc = XmlDocument.fromString(xml);
  try {
    validator.validate(doc);
    return null;
  } catch (e) {
    const det = (e as { details?: { message?: string }[] }).details ?? [];
    return [String((e as Error)?.message ?? e), ...det.map((d) => d.message)].join(" | ");
  } finally {
    doc.dispose();
  }
}

const parser = new XMLParser({
  parseTagValue: false,
  isArray: (n) => ["Invoice", "CashVoucher", "Item", "SumValue"].includes(n),
});
const citaj = (xml: string) => parser.parse(xml).MRPKSData;

const nast: NastaveniaUctovania = {
  predkontacia: "311",
  predkontaciaZaloha: "324",
  predkontaciaPrijata: "501",
  predkontaciaDoklady: "512",
  blockyPodlaPlatby: true,
  stredisko: "BA",
};
const firmaSk = { name: "Ukážka s.r.o.", ico: "12345678", country: "SK" };
const firmaCz = { name: "Ukázka s.r.o.", ico: "12345678", country: "CZ" };

const odberatel = {
  customer_name: "Odberateľ a.s.",
  customer_ico: "87654321",
  customer_dic: "2020123456",
  customer_ic_dph: "SK2020123456",
  customer_street: "Hlavná 1",
  customer_city: "Bratislava",
  customer_zip: "81101",
  customer_country: "SK",
};

const vystavena = (inv: Record<string, unknown>, items: any[], n: NastaveniaUctovania = nast) =>
  vystavenaNaUctovanie(
    {
      id: "6f1c2c1e-1111-4a5b-8c9d-000000000001",
      type: "regular",
      invoice_number: "2026001",
      issue_date: "2026-10-01",
      delivery_date: "2026-10-01",
      due_date: "2026-10-15",
      currency: "EUR",
      ...odberatel,
      ...inv,
    },
    items,
    n,
  );

const dveSadzby = [
  {
    name: "Služba",
    quantity: 2,
    unit: "hod",
    unit_price: 50,
    subtotal: 100,
    vat_amount: 23,
    vat_rate: 23,
  },
  {
    name: "Kniha",
    quantity: 1,
    unit: "ks",
    unit_price: 5,
    subtotal: 5,
    vat_amount: 0.25,
    vat_rate: 5,
  },
];

describe("MRP-K/S — vystavené faktúry", () => {
  it("bežná faktúra: typ DPH 10 (SK), predkontácia, súčty po sadzbách, platí schéma", () => {
    const d = vystavena({ total: 128.25 }, dveSadzby);
    const { xml, preskocene, upozornenia } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(preskocene).toEqual([]);
    expect(upozornenia).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
    const data = citaj(xml);
    expect(data["@_countryCode"] ?? xml.includes('countryCode="SK"')).toBeTruthy();
    const f = data.IssuedInvoices.Invoice[0];
    expect(f.DocumentNumber).toBe("2026001");
    expect(f.TaxCode).toBe("10");
    expect(f.DoubleEntryBookkeepingCode).toBe("311.000");
    expect(f.BaseTaxRateAmount).toBe("100.00");
    expect(f.BaseTaxRateTax).toBe("23.00");
    expect(f.ReducedTaxRateAmount).toBe("5.00");
    expect(f.ReducedTaxRateTax).toBe("0.25");
    expect(f.CostCentre).toBe("BA");
    expect(f.Company.VatNumber).toBe("2020123456");
    expect(f.Company.VatNumberSK).toBe("SK2020123456");
    expect(f.Items.Item).toHaveLength(2);
    expect(f.Items.Item[0]).toMatchObject({
      Quantity: "2.000000",
      UnitPrice: "50.000000",
      UnitCode: "hod",
      TaxAmount: "11.500000",
    });
    expect(f.SumValues.SumValue.map((s: any) => [s.TaxType, s.TaxPercent, s.Amount])).toEqual([
      ["1", "23.00", "100.00"],
      ["2", "5.00", "5.00"],
    ]);
  });

  it("zľava na doklad: položky dorovná riadok „Zľava na doklad“ v každej sadzbe", () => {
    const d = vystavena({ total: 115.43, discount_total: 10.5 }, dveSadzby);
    const { xml, preskocene } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(preskocene).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    const zlavy = f.Items.Item.filter((i: any) => i.Description === "Zľava na doklad");
    expect(zlavy).toHaveLength(2);
    // Hlavička = súčet položiek po zľave (90 + 4,50).
    expect(f.BaseTaxRateAmount).toBe("90.00");
    expect(f.ReducedTaxRateAmount).toBe("4.50");
    const zaklad = f.Items.Item.reduce(
      (a: number, i: any) => a + Number(i.UnitPrice) * Number(i.Quantity),
      0,
    );
    expect(Math.round(zaklad * 100) / 100).toBe(94.5);
  });

  it("dobropis: DocType D, záporné sumy a číslo opravovanej faktúry", () => {
    const d = vystavena(
      { type: "credit_note", invoice_number: "D2026001", total: -123, _opravujeCislo: "2026001" },
      [
        {
          name: "Vrátenie",
          quantity: -1,
          unit_price: 100,
          subtotal: -100,
          vat_amount: -23,
          vat_rate: 23,
        },
      ],
    );
    const { xml } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    expect(f.DocType).toBe("D");
    expect(f.CreditNoteOriginalNumber).toBe("2026001");
    expect(f.BaseTaxRateAmount).toBe("-100.00");
    expect(f.BaseTaxRateTax).toBe("-23.00");
    expect(f.Items.Item[0]).toMatchObject({
      Quantity: "1.000000",
      UnitPrice: "-100.000000",
      TaxAmount: "-23.000000",
    });
    expect(f.SumValues.SumValue[0].Amount).toBe("-100.00");
  });

  it("prenesenie daňovej povinnosti: bez typu v nastaveniach sa vynechá, s ním ide v nulovej sadzbe", () => {
    const d = vystavena(
      {
        invoice_number: "2026002",
        total: 1000,
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
      },
      [
        {
          name: "Stavebné práce",
          quantity: 1,
          unit_price: 1000,
          subtotal: 1000,
          vat_amount: 0,
          vat_rate: 23,
        },
      ],
    );
    const bez = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(bez.preskocene[0]).toMatch(/^2026002 — .*typ DPH pre vystavená faktúra v prenesení/);
    const s = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [d],
      nastavenia: { typDphVydanePdp: "15" },
    });
    expect(s.preskocene).toEqual([]);
    expect(chybaSchemy(s.xml)).toBeNull();
    const f = citaj(s.xml).IssuedInvoices.Invoice[0];
    expect(f.TaxCode).toBe("15");
    expect(f.ZeroTaxRateAmount).toBe("1000.00");
    expect(f.BaseTaxRateAmount).toBe("0.00");
    expect(f.SumValues.SumValue[0]).toMatchObject({
      TaxType: "3",
      TaxPercent: "0.00",
      Amount: "1000.00",
    });
  });

  it("dodanie tovaru do EÚ: typ z nastavení a kód pre súhrnný výkaz", () => {
    const d = vystavena(
      {
        invoice_number: "2026003",
        total: 500,
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        eu_plnenie: "tovar",
        customer_country: "DE",
      },
      [{ name: "Tovar", quantity: 1, unit_price: 500, subtotal: 500, vat_amount: 0, vat_rate: 0 }],
    );
    const { xml } = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [d],
      nastavenia: { typDphVydaneEu: "13" },
    });
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    expect(f.TaxCode).toBe("13");
    expect(f.RecapitulativeStatementCode).toBe("0");
  });

  it("cudzia mena: hlavička v eurách kurzom, položky a súčty aj v mene dokladu", () => {
    // ECB: 1 € = 1,25 USD → 0,8 € za dolár.
    const d = vystavena(
      { invoice_number: "2026004", currency: "USD", exchange_rate: 1.25, total: 123 },
      [
        {
          name: "Licencia",
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
          vat_amount: 23,
          vat_rate: 23,
        },
      ],
    );
    const { xml } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    expect(f.CurrencyCode).toBe("USD");
    expect(f.CurrRate).toBe("0.800000");
    expect(f.CurrRateAmount).toBe("1.000000");
    expect(f.BaseTaxRateAmount).toBe("80.00");
    expect(f.BaseTaxRateTax).toBe("18.40");
    expect(f.TotalWithTaxCurr).toBe("123.00");
    expect(f.Items.Item[0].UnitPrice).toBe("100.000000");
    expect(f.SumValues.SumValue.map((s: any) => [s.CurrencyCode, s.Amount])).toEqual([
      ["EUR", "80.00"],
      ["USD", "100.00"],
    ]);
  });

  it("odpočet zdanenej zálohy ide riadkom s RowSumType 2", () => {
    const d = vystavena(
      {
        invoice_number: "2026005",
        total: 246,
        _odpocty: [
          {
            zaloha: "Z2026001",
            doklad: "DP2026001",
            vs: null,
            suma: 123,
            riadky: [{ sadzba: 23, zaklad: 100, dph: 23 }],
          },
        ],
      },
      [
        {
          name: "Dielo",
          quantity: 1,
          unit_price: 200,
          subtotal: 200,
          vat_amount: 46,
          vat_rate: 23,
        },
      ],
    );
    const { xml, preskocene } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(preskocene).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    const odpocet = f.Items.Item.find((i: any) => i.RowSumType === "2");
    expect(odpocet).toMatchObject({ UnitPrice: "-100.000000", TaxAmount: "-23.000000" });
    expect(f.BaseTaxRateAmount).toBe("100.00");
    expect(f.BaseTaxRateTax).toBe("23.00");
  });

  it("česká firma: typ 41, DIČ vo VatNumber, bez VatNumberSK, koruny", () => {
    const d = vystavena(
      {
        currency: "CZK",
        total: 1210,
        customer_dic: null,
        customer_ic_dph: "CZ87654321",
        customer_country: "CZ",
      },
      [
        {
          name: "Služba",
          quantity: 1,
          unit_price: 1000,
          subtotal: 1000,
          vat_amount: 210,
          vat_rate: 21,
        },
      ],
    );
    const { xml } = buildMrpUctovanie({ firma: firmaCz, doklady: [d] });
    expect(chybaSchemy(xml)).toBeNull();
    expect(xml).toContain('countryCode="CZ" currencyCode="CZK"');
    const f = citaj(xml).IssuedInvoices.Invoice[0];
    expect(f.TaxCode).toBe("41");
    expect(f.VatCountry).toBe("CZ");
    expect(f.Company.VatNumber).toBe("CZ87654321");
    expect(f.Company.VatNumberSK).toBeUndefined();
  });

  it("zálohová faktúra je predfaktúra (X) s nedaňovým typom 19", () => {
    const d = vystavena({ type: "proforma", invoice_number: "Z2026001", total: 123 }, [
      { name: "Záloha", quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23, vat_rate: 23 },
    ]);
    const f = citaj(buildMrpUctovanie({ firma: firmaSk, doklady: [d] }).xml).IssuedInvoices
      .Invoice[0];
    expect(f.InvoiceType).toBe("X");
    expect(f.TaxCode).toBe("19");
    expect(f.DoubleEntryBookkeepingCode).toBe("324.000");
  });

  it("dlhé číslo, OSS a nečíselná predkontácia", () => {
    const dlhe = vystavena({ invoice_number: "FA-2026-00001", total: 123 }, dveSadzby);
    const oss = vystavena({ invoice_number: "2026006", oss: true, total: 123 }, dveSadzby);
    const pohodova = vystavena(
      { invoice_number: "2026007", total: 128.25, pohoda_predkontacia: "3Fv" },
      dveSadzby,
    );
    const r = buildMrpUctovanie({ firma: firmaSk, doklady: [dlhe, oss, pohodova] });
    expect(r.preskocene).toEqual([
      expect.stringMatching(/^FA-2026-00001 — číslo faktúry má viac ako 10 znakov/),
      expect.stringMatching(/^2026006 — predaj cez OSS/),
    ]);
    expect(r.upozornenia).toEqual([
      expect.stringMatching(/^2026007 — predkontácia „3Fv“ nie je číslo/),
    ]);
    expect(citaj(r.xml).IssuedInvoices.Invoice[0].DoubleEntryBookkeepingCode).toBeUndefined();
  });
});

describe("MRP-K/S — prijaté faktúry a bločky", () => {
  const prijata = (p: Record<string, unknown>) =>
    prijataNaUctovanie(
      {
        id: "6f1c2c1e-2222-4a5b-8c9d-000000000002",
        invoice_number: "FA-2026/0815",
        variable_symbol: "20260815",
        issue_date: "2026-09-28",
        delivery_date: "2026-09-27",
        received_date: "2026-09-30",
        due_date: "2026-10-12",
        supplier_name: "Dodávateľ s.r.o.",
        supplier_ico: "11223344",
        supplier_dic: "2021111111",
        supplier_iban: "SK31 1200 0000 1987 4263 7541",
        currency: "EUR",
        ...p,
      },
      nast,
    );

  it("prijatá faktúra: typ 40, číslo dodávateľa ako pôvodné, odpočet dane, IBAN", () => {
    const d = prijata({ amount_without_vat: 200, vat_amount: 46, amount_total: 246 });
    const { xml, preskocene } = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [d],
      nastavenia: { radPrijate: "FP" },
    });
    expect(preskocene).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IncomingInvoices.Invoice[0];
    expect(f.DocumentNumber).toBeUndefined();
    expect(f.DocumentNumberPrefix).toBe("FP");
    expect(f.OriginalDocumentNumber).toBe("FA-2026/0815");
    expect(f.VariableSymbol).toBe("20260815");
    expect(f.TaxCode).toBe("40");
    expect(f.TaxPointDate).toBe("2026-09-30");
    expect(f.TaxPointDate2).toBe("2026-09-27");
    expect(f.DoubleEntryBookkeepingCode).toBe("501.000");
    expect(f.BaseTaxRateAmount).toBe("200.00");
    expect(f.SumValues.SumValue[0]).toMatchObject({ Tax: "46.00", TaxApplied: "46.00" });
    expect(f.Company.BankAccounts.BankAccount.IBAN).toBe("SK3112000000198742637541");
  });

  it("prijatý dobropis je záporný s DocType D", () => {
    const d = prijata({
      invoice_number: "DB-17",
      opravuje_cislo: "FA-2026/0700",
      amount_without_vat: -10,
      vat_amount: -2.3,
      amount_total: -12.3,
    });
    const { xml } = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IncomingInvoices.Invoice[0];
    expect(f.DocType).toBe("D");
    expect(f.CreditNoteOriginalNumber).toBe("FA-2026/0700");
    expect(f.BaseTaxRateAmount).toBe("-10.00");
    expect(f.BaseTaxRateTax).toBe("-2.30");
  });

  it("prijaté prenesenie: základ v sadzbe, daň v ReverseCharge a v odpočte (ako vzor MRP)", () => {
    const d = prijata({
      dph_rezim: "samozdanenie",
      amount_without_vat: 1000,
      vat_amount: 0,
      amount_total: 1000,
      items: [{ name: "Stavebné práce", quantity: 1, unit_price: 1000, total: 1000, vat_rate: 23 }],
    });
    const bez = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(bez.preskocene[0]).toMatch(/typ DPH pre prijatá faktúra v prenesení/);
    const { xml } = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [d],
      nastavenia: { typDphPrijatePdp: "45" },
    });
    expect(chybaSchemy(xml)).toBeNull();
    const f = citaj(xml).IncomingInvoices.Invoice[0];
    expect(f.TaxCode).toBe("45");
    expect(f.BaseTaxRateAmount).toBe("1000.00");
    expect(f.BaseTaxRateTax).toBe("0.00");
    expect(f.ReverseChargeBaseTaxRateTax).toBe("230.00");
    expect(f.SumValues.SumValue[0]).toMatchObject({
      Tax: "0.00",
      ReverseChargeTax: "230.00",
      TaxApplied: "230.00",
    });
  });

  it("rozúčtovanie na dve predkontácie MRP neunesie — doklad sa vynechá", () => {
    const d = prijata({
      amount_without_vat: 300,
      vat_amount: 69,
      amount_total: 369,
      rozuctovanie: [
        { zaklad: 200, dph: 46, sadzba: 23, predkontacia: "501" },
        { zaklad: 100, dph: 23, sadzba: 23, predkontacia: "518" },
      ],
    });
    const r = buildMrpUctovanie({ firma: firmaSk, doklady: [d] });
    expect(d.rozuctovany).toBe(true);
    expect(r.preskocene[0]).toMatch(/len jednu predkontáciu, doklad je rozúčtovaný na 501, 518/);
  });

  it("bloček v hotovosti s pokladňou → CashVoucher, kartou → faktúra prijatá", () => {
    const blocek = (id: string, platba: string) =>
      blocekNaUctovanie(
        {
          id,
          document_number: `00${id.slice(-1)}`,
          issue_date: "2026-10-02",
          payment_method: platba,
          supplier_name: "Potraviny – Žabka",
          supplier_ico: "33445566",
          total_amount: 12.3,
          vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
          currency: "EUR",
        },
        nast,
      );
    const hot = blocek("6f1c2c1e-3333-4a5b-8c9d-000000000003", "hotovost");
    const karta = blocek("6f1c2c1e-3333-4a5b-8c9d-000000000004", "karta");
    const bezPokladne = buildMrpUctovanie({ firma: firmaSk, doklady: [hot, karta] });
    expect(citaj(bezPokladne.xml).IncomingInvoices.Invoice).toHaveLength(2);
    const { xml, preskocene } = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [hot, karta],
      nastavenia: { pokladna: "HP" },
    });
    expect(preskocene).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
    const data = citaj(xml);
    expect(data.CashVouchers.CashVoucher).toHaveLength(1);
    expect(data.CashVouchers.CashVoucher[0]).toMatchObject({
      CashVoucherType: "V",
      CashRegisterIdentif: "HP",
      TaxCode: "40",
      DoubleEntryBookkeepingCode: "512.000",
    });
    expect(data.IncomingInvoices.Invoice).toHaveLength(1);
    // Pomlčka „–“ je vo Windows-1250, ostáva.
    expect(data.CashVouchers.CashVoucher[0].Company.Name).toBe("Potraviny – Žabka");
  });
});

describe("MRP-K/S — pomôcky a schéma", () => {
  it("znaky mimo Windows-1250 sa nahradia", () => {
    expect(textPreMrp("Łódź – Ελλάδα ✓ ő")).toBe("Łódź – ?????? ? ő");
    expect(textPreMrp("Müller ñ")).toBe("Müller n");
  });

  it("schéma chybu nájde (zlý boolean, dlhé číslo, neznámy prvok)", () => {
    const { xml } = buildMrpUctovanie({
      firma: firmaSk,
      doklady: [vystavena({ total: 128.25 }, dveSadzby)],
    });
    expect(chybaSchemy(xml.replace("<ValuesWithTax>F<", "<ValuesWithTax>N<"))).toMatch(
      /ValuesWithTax/,
    );
    expect(
      chybaSchemy(xml.replace("<DocumentNumber>2026001<", "<DocumentNumber>20260011111<")),
    ).toMatch(/DocumentNumber/);
    expect(chybaSchemy(xml.replace("<RowType>1</RowType>", "<RowTyp>1</RowTyp>"))).toMatch(
      /RowTyp/,
    );
  });
});

describe("MRP-K/S — formát v Účtovných exportoch", () => {
  it("stratégia mrp_xml berie typy DPH z nastavení firmy pre MRP", async () => {
    const { EXPORT_STRATEGIES } = await import("./export.server");
    const firma = { ...firmaSk, uctovanie_nastavenia: { mrp: { typDphVydanePdp: "15" } } };
    const r = await EXPORT_STRATEGIES.mrp_xml.build({
      company: firma as any,
      invoices: [
        {
          invoice: {
            id: "6f1c2c1e-4444-4a5b-8c9d-000000000005",
            type: "regular",
            invoice_number: "2026010",
            issue_date: "2026-10-05",
            currency: "EUR",
            total: 1000,
            reverse_charge: true,
            reverse_charge_type: "domestic_69",
            ...odberatel,
          } as any,
          items: [
            {
              name: "Práce",
              quantity: 1,
              unit_price: 1000,
              subtotal: 1000,
              vat_amount: 0,
              vat_rate: 0,
            },
          ] as any,
        },
      ],
      nastavenia: { predkontacia: "311" } as any,
    });
    expect(r.preskocene).toEqual([]);
    expect(r.fileName).toMatch(/^mrp-faktury-.*\.xml$/);
    expect(chybaSchemy(r.content)).toBeNull();
    const f = citaj(r.content).IssuedInvoices.Invoice[0];
    expect(f.TaxCode).toBe("15");
    expect(f.DoubleEntryBookkeepingCode).toBe("311.000");
  });
});
