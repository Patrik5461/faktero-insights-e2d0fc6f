/*
  Dátum zaúčtovania zadaný v okne exportu (požiadavka účtovníčky 2. 11. 2026):
  faktúra z februára účtovaná 30. 10. 2026 musí mať v Pohode ten deň aj ako
  dátum zápisu (`date`) a dátum odpočtu DPH (`dateTax`), nielen `dateAccounting`.
  Vystavená faktúra dostane len dátum účtovania — dátum vystavenia a DPH podľa
  dodania sa presunúť nesmú. XML sa overuje proti XSD Stormware.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = { inv: "invoice.xsd", vch: "voucher.xsd", int: "intDoc.xsd" };
const validatory = new Map<string, XsdValidator>();
function validator(prefix: string): XsdValidator {
  const v = validatory.get(prefix);
  if (v) return v;
  const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
  const novy = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  validatory.set(prefix, novy);
  return novy;
}
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  if (!polozky.length) chyby.push("balík je prázdny");
  for (const m of polozky) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(`${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}
const hodnota = (xml: string, el: string): string | null =>
  new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
const doklady = (xml: string) => xml.split("<dat:dataPackItem").slice(1);

const firma: any = {
  id: "c1",
  name: "Test s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
};
const zaklad: any = {
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  pokladna: "HP",
  blockyPodlaPlatby: true,
};
const PEVNY = "2026-10-30";

const prijata = (o: any = {}) => ({
  id: "pi-feb",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-0211",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_country: "SK",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  issue_date: "2026-02-12",
  delivery_date: "2026-02-10",
  received_date: "2026-02-14",
  due_date: "2026-02-26",
  variable_symbol: "20260211",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  payment_method: "prevod",
  items: [{ name: "Materiál", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});
const blocek = (o: any = {}) => ({
  id: "exp-feb",
  supplier_name: "Benzínka a.s.",
  supplier_ico: "31111111",
  supplier_ic_dph: "SK2020000001",
  document_number: "O-123",
  issue_date: "2026-02-04",
  currency: "EUR",
  total_amount: 61.5,
  vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
  category: "pohonne_hmoty",
  payment_method: "hotovost",
  ...o,
});

describe("Pohoda — dátum zaúčtovania z okna exportu", () => {
  it("prijatá faktúra z februára s dátumom zaúčtovania 30. 10.: zápis, odpočet aj účtovanie 2026-10-30", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...zaklad, datumZauctovaniaPevny: PEVNY },
      doklady: [prijataAkoDoklad(prijata())],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("receivedInvoice");
    expect(hodnota(x, "inv:date")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateTax")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateAccounting")).toBe(PEVNY);
    // Skutočný dátum dodania ostáva v samostatnom poli, splatnosť sa nemení.
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-02-10");
    expect(hodnota(x, "inv:dateDue")).toBe("2026-02-26");
  });

  it("bez dátumu zaúčtovania ostáva doterajšie správanie (zápis = vystavenie, odpočet = dodanie)", () => {
    const x = buildPohodaExpensesXml({ company: firma, nastavenia: zaklad, doklady: [prijataAkoDoklad(prijata())] });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:date")).toBe("2026-02-12");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-02-10");
    expect(x).not.toContain("dateAccounting");
  });

  it("ostatný záväzok (predkontácia s agendou záväzky) dostane tie isté dátumy", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...zaklad, datumZauctovaniaPevny: PEVNY, zavazkovePredkontacie: ["1Zav"] },
      doklady: [prijataAkoDoklad(prijata({ pohoda_predkontacia: "1Zav" }))],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("commitment");
    expect(hodnota(x, "inv:date")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateTax")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateAccounting")).toBe(PEVNY);
  });

  it("prijatý dobropis: dátum uplatnenia DPH je dátum zaúčtovania", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...zaklad, datumZauctovaniaPevny: PEVNY },
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "pi-d",
            invoice_number: "D-2026-5",
            opravuje_cislo: "2026-0211",
            amount_without_vat: -100,
            vat_amount: -23,
            amount_total: -123,
            items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 23, total: -100 }],
          }),
        ),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:date")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateTax")).toBe(PEVNY);
    expect(hodnota(x, "inv:dateApplicationVAT")).toBe(PEVNY);
  });

  it("bločky: interný doklad aj faktúra dostanú zápis a odpočet, pokladňa si dátum platby nechá", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...zaklad, datumZauctovaniaPevny: PEVNY },
      doklady: [
        blocek(),
        blocek({ id: "exp-2", payment_method: "karta" }),
        blocek({ id: "exp-3", payment_method: "prevod" }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    for (const d of doklady(x)) {
      const p = /<(\w+):(?:voucher|intDoc|invoice) /.exec(d)?.[1] ?? "";
      expect(hodnota(d, `${p}:dateTax`)).toBe(PEVNY);
      if (p === "vch") {
        // Deň pohybu v pokladni sa nemení (voucher.xsd dateAccounting nepozná).
        expect(hodnota(d, "vch:date")).toBe("2026-02-04");
      } else {
        expect(hodnota(d, `${p}:date`)).toBe(PEVNY);
        expect(hodnota(d, `${p}:dateAccounting`)).toBe(PEVNY);
      }
    }
  });

  it("dátum zaúčtovania pred dodaním neposunie odpočet pred dodanie", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...zaklad, datumZauctovaniaPevny: "2026-01-31" },
      doklady: [prijataAkoDoklad(prijata())],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:date")).toBe("2026-01-31");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-02-10");
  });

  it("vystavená faktúra: len dátum účtovania, vystavenie a DPH podľa dodania ostávajú", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia: { datumZauctovaniaPevny: PEVNY } as any,
      invoices: [
        {
          invoice: {
            id: "f1",
            type: "regular",
            invoice_number: "FA2026020",
            issue_date: "2026-02-12",
            delivery_date: "2026-02-10",
            due_date: "2026-02-26",
            currency: "EUR",
            customer_name: "Odberateľ a.s.",
            customer_country: "SK",
            customer_ico: "35999888",
            customer_ic_dph: "SK2021999888",
            subtotal: 100,
            vat_total: 23,
            total: 123,
          } as any,
          items: [
            { name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 } as any,
          ],
        },
      ],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:date")).toBe("2026-02-12");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-02-10");
    expect(hodnota(x, "inv:dateAccounting")).toBe(PEVNY);
  });
});
