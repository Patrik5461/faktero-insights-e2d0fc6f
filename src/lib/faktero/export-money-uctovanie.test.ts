/**
 * Money S3 so zaúčtovaním — overenie proti oficiálnym XSD schémam Money
 * (`__fixtures__/money-s3-uct-schemas`, z balíka www.money.sk). Schémy sú
 * sekvencie, takže zlé poradie elementov či príliš dlhý kód Money pri
 * importe odmietne; test to chytí skôr.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { XMLParser } from "fast-xml-parser";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import {
  blocekNaUctovanie,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type NastaveniaUctovania,
} from "./zauctovanie-export";

xmlRegisterFsInputProviders();
const SCHEMA = new URL("./__fixtures__/money-s3-uct-schemas/_Document.xsd", import.meta.url);
const validator = (() => {
  const xsd = XmlDocument.fromBuffer(readFileSync(SCHEMA), { url: fileURLToPath(SCHEMA) });
  return XsdValidator.fromDoc(xsd);
})();

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

const parser = new XMLParser({ parseTagValue: false, isArray: (n) => ["Polozka", "NormPolozka", "RozuctPolozka", "FaktPrij", "FaktVyd", "PokDokl", "IntDokl", "DalsiSazba"].includes(n) });

const nast: NastaveniaUctovania = {
  predkontacia: "FV001",
  clenenieDph: "UD",
  predkontaciaPrijata: "FP001",
  clenenieDphPrijata: "PD",
  predkontaciaDoklady: "PV001",
  blockyPodlaPlatby: true,
  stredisko: "BA",
  pomeryPredkontacii: {
    AUTO: { typ: "dph5050", zaklad: 100, zdanitelna: "AUTO1", lenZaklad: "AUTO2", nezdanitelna: "AUTO3" },
  },
};
const firma = { name: "Ukážka s.r.o.", ico: "12345678", default_currency: "EUR" };
const kody = {
  PV001: { kod: "PV001", popis: "Výdavky kartou", ucetMd: "501100", ucetD: "261" },
};

const vystavena = vystavenaNaUctovanie(
  {
    id: "v1",
    type: "regular",
    invoice_number: "2026001",
    variable_symbol: "2026001",
    issue_date: "2026-10-01",
    delivery_date: "2026-10-01",
    due_date: "2026-10-15",
    total: 128.5,
    customer_name: "Odberateľ a.s.",
    customer_ico: "87654321",
    customer_ic_dph: "SK2020123456",
    customer_city: "Bratislava",
    customer_country: "SK",
  },
  [
    { name: "Služba", quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23, vat_rate: 23 },
    { name: "Kniha", quantity: 1, unit_price: 5, subtotal: 5, vat_amount: 0.5, vat_rate: 10 },
  ],
  nast,
);

const prijataAuto = prijataNaUctovanie(
  {
    id: "p1",
    invoice_number: "FA-2026/0815",
    variable_symbol: "20260815",
    issue_date: "2026-09-28",
    delivery_date: "2026-09-27",
    due_date: "2026-10-12",
    supplier_name: "Autoservis s.r.o.",
    supplier_ico: "11223344",
    pohoda_predkontacia: "AUTO",
    amount_without_vat: 200,
    vat_amount: 46,
    amount_total: 246,
  },
  nast,
);

const dobropis = prijataNaUctovanie(
  {
    id: "p2",
    invoice_number: "DB-17",
    opravuje_cislo: "FA-2026/0700",
    issue_date: "2026-09-30",
    supplier_name: "Dodávateľ",
    amount_without_vat: -10,
    vat_amount: -2.3,
    amount_total: -12.3,
  },
  nast,
);

const blocekHotovost = blocekNaUctovanie(
  {
    id: "b1",
    document_number: "0012",
    issue_date: "2026-10-02",
    payment_method: "hotovost",
    supplier_name: "Papiernictvo",
    total_amount: 12.3,
    vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
  },
  nast,
);

const blocekKarta = blocekNaUctovanie(
  {
    id: "b2",
    document_number: "0099",
    issue_date: "2026-10-03",
    payment_method: "karta",
    supplier_name: "Benzínka",
    total_amount: 61.5,
    vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
  },
  nast,
);

describe("Money S3 so zaúčtovaním", () => {
  const { xml, preskocene } = buildMoneyS3Uctovanie({
    firma,
    doklady: [vystavena, prijataAuto, dobropis, blocekHotovost, blocekKarta],
    kody,
    nastavenia: { pokladna: "HP", radPrijate: "FP", ucetDph: "343100" },
  });
  const data = parser.parse(xml).MoneyData;

  it("prejde oficiálnou schémou Money S3", () => {
    expect(preskocene).toEqual([]);
    expect(chybaSchemy(xml)).toBeNull();
  });

  it("vystavená faktúra: predkontácia a členenie v hlavičke, sumy po sadzbách", () => {
    const fv = data.SeznamFaktVyd.FaktVyd[0];
    expect(fv.Doklad).toBe("2026001");
    expect(fv.PredKontac).toBe("FV001");
    expect(fv.KodDPH).toBe("UD");
    expect(fv.Stredisko).toBe("BA");
    expect(fv.SazbaDPH2).toBe("23");
    expect(fv.SazbaDPH1).toBe("10");
    expect(fv.SouhrnDPH).toMatchObject({ Zaklad22: "100.00", DPH22: "23.00", Zaklad5: "5.00", DPH5: "0.50" });
    expect(fv.Celkem).toBe("128.50");
    expect(fv.SeznamPolozek.Polozka).toHaveLength(2);
  });

  it("prijatá faktúra s pomerom: položky s vlastnými kódmi, číslo dodávateľa v PrijatDokl", () => {
    const fp = data.SeznamFaktPrij.FaktPrij.find((f: any) => f.PrijatDokl === "FA-2026/0815");
    expect(fp.Doklad).toBeUndefined();
    expect(fp.Rada).toBe("FP");
    expect(fp.PredKontac).toBeUndefined();
    expect(fp.PlnenoDPH).toBe("2026-09-27");
    const pol = fp.SeznamPolozek.Polozka;
    expect(pol.map((p: any) => [p.Predkontac, p.SouhrnDPH.Zaklad, p.SouhrnDPH.DPH])).toEqual([
      ["AUTO1", "100.00", "23.00"],
      ["AUTO2", "100.00", "23.00"],
    ]);
    expect(fp.SouhrnDPH.Zaklad22).toBe("200.00");
  });

  it("prijatý dobropis: kladné sumy, príznak a pôvodný doklad", () => {
    const fp = data.SeznamFaktPrij.FaktPrij.find((f: any) => f.PrijatDokl === "DB-17");
    expect(fp.Dobropis).toBe("1");
    expect(fp.PuvDoklad).toBe("FA-2026/0700");
    expect(fp.SouhrnDPH.Zaklad22).toBe("10.00");
    expect(fp.Celkem).toBe("12.30");
  });

  it("bloček v hotovosti ide ako výdavkový pokladničný doklad", () => {
    const pd = data.SeznamPokDokl.PokDokl[0];
    expect(pd.Vydej).toBe("1");
    expect(pd.Pokl).toBe("HP");
    expect(pd.PrKont).toBe("PV001");
    expect(pd.Cleneni).toBe("PD");
    expect(pd.ZjednD).toBe("1");
    expect(pd.SouhrnDPH.Zaklad22).toBe("10.00");
  });

  it("bloček kartou ide ako interný doklad na účty z číselníka", () => {
    const id = data.SeznamIntDokl.IntDokl[0];
    expect(id.Cleneni).toBe("PD");
    expect(id.RozuctPolozka.map((r: any) => [r.UcMD, r.UcD, r.Castka, r.TypCena])).toEqual([
      ["501100", "261", "50.00", "0"],
      ["343100", "261", "11.50", "1"],
    ]);
  });

  it("bez pokladne ide hotovostný bloček ako faktúra prijatá", () => {
    const r = buildMoneyS3Uctovanie({ firma, doklady: [blocekHotovost], kody });
    expect(r.xml).toContain("<SeznamFaktPrij>");
    expect(r.xml).not.toContain("<PokDokl>");
    expect(chybaSchemy(r.xml)).toBeNull();
  });

  it("čo Money neunesie, sa vynechá s dôvodom", () => {
    const r = buildMoneyS3Uctovanie({
      firma,
      doklady: [
        blocekKarta,
        { ...prijataAuto, mena: "CZK", kurz: null },
        { ...vystavena, predkontacia: "PRILIS-DLHY-KOD", rozuctovany: false, riadky: vystavena.riadky.map((x) => ({ ...x, predkontacia: "PRILIS-DLHY-KOD" })) },
      ],
      kody: {},
    });
    expect(r.preskocene).toHaveLength(3);
    expect(r.preskocene[0]).toMatch(/0099 — .*nemá v číselníku účty/);
    expect(r.preskocene[1]).toMatch(/CZK nemá kurz/);
    expect(r.preskocene[2]).toMatch(/viac ako 10 znakov/);
  });

  it("cudzia mena: hlavička v domácej mene, Valuty v mene dokladu", () => {
    const r = buildMoneyS3Uctovanie({ firma, doklady: [{ ...prijataAuto, mena: "CZK", kurz: 25 }], kody });
    expect(chybaSchemy(r.xml)).toBeNull();
    const fp = parser.parse(r.xml).MoneyData.SeznamFaktPrij.FaktPrij[0];
    expect(fp.Celkem).toBe("9.84");
    expect(fp.Valuty.Mena).toMatchObject({ Kod: "CZK", Mnozstvi: "100", Kurs: "4.0000" });
    expect(fp.Valuty.Celkem).toBe("246.00");
  });
});

describe("doterajší export vystavených faktúr do Money S3", () => {
  it("sedí s oficiálnou schémou (aj dobropis, záloha a cudzia mena)", async () => {
    const { buildMoneyS3Xml } = await import("./export.server");
    const company = { name: "Test s.r.o.", ico: "12345678", dic: "2020123456", ic_dph: "SK2020123456", street: "Hlavná 1", city: "Bratislava", zip: "81101", country: "SK", default_currency: "EUR" };
    const faktura = (type: string, currency = "EUR") => ({
      invoice: { id: "1", invoice_number: "2026001", type, issue_date: "2026-10-01", delivery_date: "2026-10-01", due_date: "2026-10-15", currency, exchange_rate: currency === "EUR" ? null : 25.1, customer_name: "Odberateľ a.s.", customer_ico: "87654321", customer_ic_dph: "SK2021111111", customer_street: "Ulica 2", customer_city: "Košice", customer_zip: "04001", customer_country: "SK", total: 144, variable_symbol: "2026001", payment_method: "prevod" },
      items: [
        { name: "Služba", quantity: 1, unit: "ks", unit_price: 100, subtotal: 100, vat_amount: 23, vat_rate: 23, total: 123 },
        { name: "Kniha", quantity: 2, unit: "ks", unit_price: 10, subtotal: 20, vat_amount: 1, vat_rate: 5, total: 21 },
      ],
    });
    for (const f of [faktura("regular"), faktura("credit_note"), faktura("proforma"), faktura("regular", "CZK")]) {
      const { xml } = buildMoneyS3Xml({ company, invoices: [f] } as never);
      expect(chybaSchemy(xml), `${f.invoice.type} ${f.invoice.currency}`).toBeNull();
    }
  });
});
