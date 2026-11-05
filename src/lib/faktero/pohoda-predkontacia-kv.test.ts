/*
  Predkontácia ako skratka Pohody a členenie KV DPH na každej položke —
  pripomienka Patrika 5. 11. 2026 po importe do Pohody (PALIERA):

   A) bloček kartou (Ostatný záväzok) Slovenský potravinársky priemysel,
      č. 13721 z 22. 10. 2026: predkontácia „501000 325000“ je dvojica účtov
      (číselník zo súboru z Doklada) — Pohoda takú skratku nepozná, hlavička
      dostala „Neviem“ a položky nič;
   B) výdavkový pokladničný doklad OMV č. 11665 z 26. 10. 2026, PHM pomerom
      50/30/20 %: položky 2 a 3 s členením DPH PN nemali Čl.KV DPH.

  Doklady sú skutočné (sumy a položky z DB), XML sa overuje proti schémam
  Stormware v `schemy/pohoda/`. Skratky predkontácií v testoch („2Bk“…) sú
  vymyslené — skutočné skratky PALIERY treba doplniť v nastaveniach exportu.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";
import {
  chybajuceSkratky,
  jeParUctov,
  mapaPredkontacii,
  ocistiRucne,
  predkontacieNaSkratky,
  predkontacieVXml,
  skratkaPredkontacie,
  varovanieSkratky,
} from "./pohoda-predkontacia";
import { clenenieBezKv, kvPolozkyPrePohodu } from "./pohoda-kv";
import { nastaveniaExportu } from "./export-nastavenia";

xmlRegisterFsInputProviders();

function chybySchemy(xml: string, prefix: string, subor: string): string[] {
  const url = new URL(`./schemy/pohoda/${subor}`, import.meta.url);
  const v = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const vnutro = m[1].trim();
    if (!vnutro.startsWith(`<${prefix}:`)) continue;
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      v.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

/** Položky dokladu (Item) ako zoznam blokov XML. */
const polozky = (xml: string, p: string, koren: string) =>
  [...xml.matchAll(new RegExp(`<${p}:${koren}Item>([\\s\\S]*?)</${p}:${koren}Item>`, "g"))].map((m) => m[1]);
const ids = (blok: string, el: string) =>
  new RegExp(`<\\w+:${el}><typ:ids>([^<]*)</typ:ids></\\w+:${el}>`).exec(blok)?.[1] ?? null;
const hlavicka = (xml: string, p: string, koren: string) =>
  new RegExp(`<${p}:${koren}Header>([\\s\\S]*?)</${p}:${koren}Header>`).exec(xml)?.[1] ?? "";

const firma: any = {
  id: "ee86eb5f-57b7-445a-9b3c-8e6058a905ca",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  country: "SK",
  vat_payer: true,
  pohoda_odkaz_na_doklady: false,
};

/** Číselník PALIERY: predkontácie pomenované účtami (zdroj súbor z Doklada). */
const ciselnikPaliery = [
  { druh: "predkontacia", kod: "501000 325000", zdroj: "subor", ucet_md: "501000", ucet_d: "325000" },
  { druh: "predkontacia", kod: "501100 211000", zdroj: "subor", ucet_md: "501100", ucet_d: "211000" },
  { druh: "predkontacia", kod: "501200 211000", zdroj: "subor", ucet_md: "501200", ucet_d: "211000" },
];
/** Vymyslené skratky Pohody (ako by ich účtovníčka doplnila v nastaveniach exportu). */
const tabulka = { "501000 325000": "2Bk", "501100 211000": "1PHM", "501200 211000": "2PHM" };

const nastaveniaPaliery = (mapa: any): any => ({
  blockyPodlaPlatby: true,
  pokladna: "HP",
  pokladneKody: { "4d4c05eb-0029-45f7-b187-302f1073e384": "HP" },
  polozkyBlockov: true,
  pomeryPredkontacii: {
    "501200 211000": {
      typ: "dph5050",
      zaklad: 80,
      lenZaklad: "501200 211000",
      zdanitelna: "501100 211000",
      nezdanitelna: "501200 211000",
      clenenieBezOdpoctu: null,
    },
  },
  mapaPredkontacii: mapa,
});

/** A) 13721 — bloček kartou, 13 položiek „ako doklad“, PD / B3. */
const blocek13721: any = {
  id: "7e391040-fa9f-41ab-82d9-a061acad0162",
  company_id: firma.id,
  status: "processed",
  supplier_name: "Slovenský potravinársky priemysel a.s .",
  supplier_ico: "47793155",
  supplier_ic_dph: "SK2024133650",
  document_number: "13721",
  issue_date: "2026-10-22",
  total_amount: "65.97",
  vat_amount: "9.15",
  payment_method: "karta",
  odpocet: true,
  pohoda_predkontacia: "501000 325000",
  pohoda_clenenie_dph: "PD",
  kv_clenenie: "B3",
  vat_breakdown: [
    { dph: 0.66, sadzba: 5, zaklad: 13.3, vat_category: "standard" },
    { dph: 1.25, sadzba: 23, zaklad: 5.42, vat_category: "standard" },
    { dph: 7.24, sadzba: 19, zaklad: 38.1, vat_category: "standard" },
  ],
  items: [
    { name: "Viac. kva. b. 400g", total: 2.99, quantity: 1, vat_rate: 5, unit_price: 2.99 },
    { name: "Nite neúd.", total: 11.4, quantity: 0.272, vat_rate: 19, unit_price: 41.9118 },
    { name: "Ovčí zákvas 0,5l", total: 4.99, quantity: 1, vat_rate: 5, unit_price: 4.99 },
    { name: "Kozí kefír 0,5l", total: 2.99, quantity: 1, vat_rate: 5, unit_price: 2.99 },
    { name: "Kozí camembert 100g", total: 4.99, quantity: 1, vat_rate: 19, unit_price: 4.99 },
    { name: "Parmareg.maslo 200g", total: 2.99, quantity: 1, vat_rate: 5, unit_price: 2.99 },
    { name: "Papierová taška malá", total: 0.69, quantity: 1, vat_rate: 23, unit_price: 0.69 },
    { name: "Pros.San.Daniele.90g", total: 6.99, quantity: 1, vat_rate: 19, unit_price: 6.99 },
    { name: "Los.úd.čier.kor.100g", total: 7.99, quantity: 1, vat_rate: 19, unit_price: 7.99 },
    { name: "Ovčie nite cca 250g", total: 8.98, quantity: 0.25, vat_rate: 19, unit_price: 35.92 },
    { name: "Cocofir banan 250ml", total: 4.99, quantity: 1, vat_rate: 19, unit_price: 4.99 },
    { name: "Prot.tyč.jahoda65g", total: 2.99, quantity: 1, vat_rate: 23, unit_price: 2.99 },
    { name: "Prot.pistácia 65g", total: 2.99, quantity: 1, vat_rate: 23, unit_price: 2.99 },
  ].map((x) => ({ ...x, vat_category: "standard" })),
};

/** B) 11665 — PHM v hotovosti, predkontácia s pomerom (DPH 50 %, náklad 80 %). */
const blocek11665: any = {
  id: "06eb6d19-550e-4ea2-96af-960baa07edfe",
  company_id: firma.id,
  status: "processed",
  supplier_name: "OMV Slovensko, s.r.o.",
  supplier_ico: "00604381",
  supplier_ic_dph: "SK2020491407",
  document_number: "11665",
  issue_date: "2026-10-26",
  total_amount: "135.15",
  vat_amount: "25.27",
  payment_method: "hotovost",
  pokladna_id: "4d4c05eb-0029-45f7-b187-302f1073e384",
  odpocet: true,
  pohoda_predkontacia: "501200 211000",
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
  vat_breakdown: [{ dph: 25.27, sadzba: 23, zaklad: 109.89, vat_category: "standard" }],
  items: [
    { name: "OMV Diesel", unit: "l", total: 135.16, quantity: 67.65, vat_rate: 23, unit_price: 1.998, vat_category: "standard" },
  ],
};

const sTabulkou = mapaPredkontacii(ciselnikPaliery, tabulka);
const bezTabulky = mapaPredkontacii(ciselnikPaliery, {});

describe("skratka predkontácie Pohody", () => {
  it("dvojicu účtov pozná, skratku nie", () => {
    expect(jeParUctov("501000 325000")).toBe(true);
    expect(jeParUctov("501003/321000")).toBe(true);
    expect(jeParUctov("1Fp")).toBe(false);
    expect(jeParUctov("Rozúčtovať")).toBe(false);
    expect(jeParUctov("502100")).toBe(false);
  });

  it("poradie: kód z Pohody > číselník Pohody podľa účtov > tabuľka v nastaveniach > nič", () => {
    const mapa = mapaPredkontacii(
      [
        { druh: "predkontacia", kod: "4V", zdroj: "pohoda", ucet_md: "501000", ucet_d: "325000" },
        { druh: "predkontacia", kod: "311000 602100", zdroj: "pohoda", ucet_md: "311000", ucet_d: "602100" },
        { druh: "predkontacia", kod: "1Fp", zdroj: "pohoda", ucet_md: "518000", ucet_d: "321000" },
        { druh: "predkontacia", kod: "2Fp", zdroj: "pohoda", ucet_md: "518000", ucet_d: "321000" },
        { druh: "predkontacia", kod: "9X", zdroj: "pohoda", ucet_md: "501200", ucet_d: "211000", aktivne: false },
        { druh: "clenenie_dph", kod: "PD", zdroj: "pohoda" },
      ],
      { "518000/321000": "1Fp", "504000 321000": "3Fp" },
    );
    // Pohoda má predkontáciu nazvanú účtami — ide tak, ako je.
    expect(skratkaPredkontacie("311000 602100", mapa)).toEqual({ skratka: "311000 602100", zdroj: "pohoda" });
    // Jediná predkontácia Pohody s rovnakými účtami.
    expect(skratkaPredkontacie("501000 325000", mapa)).toEqual({ skratka: "4V", zdroj: "ciselnik" });
    // Dve skratky s rovnakými účtami — rozhodne tabuľka (kľúč s lomkou sa zjednotí).
    expect(skratkaPredkontacie("518000 321000", mapa)).toEqual({ skratka: "1Fp", zdroj: "nastavenia" });
    expect(skratkaPredkontacie("504000/321000", mapa)).toEqual({ skratka: "3Fp", zdroj: "nastavenia" });
    // Vypnutý kód Pohody sa nepoužije; bez tabuľky nič.
    expect(skratkaPredkontacie("501200 211000", mapa)).toEqual({ skratka: "", zdroj: "chyba" });
    // Skratka zadaná ručne ide ďalej bez zmeny.
    expect(skratkaPredkontacie("PHM", mapa)).toEqual({ skratka: "PHM", zdroj: "kod" });
    expect(skratkaPredkontacie("Rozúčtovať", mapa)).toEqual({ skratka: "Rozúčtovať", zdroj: "kod" });
  });

  it("tabuľka v nastaveniach exportu sa číta aj čistí", () => {
    expect(ocistiRucne({ "501000/325000": " 2Bk ", prazdne: " ", "x": "12345678901234567890" })).toEqual({
      "501000 325000": "2Bk",
      x: "1234567890123456789",
    });
    expect(nastaveniaExportu({ export: { skratkyPredkontacii: { "501000 325000": "2Bk" } } }).skratkyPredkontacii).toEqual({
      "501000 325000": "2Bk",
    });
    expect(nastaveniaExportu(null).skratkyPredkontacii).toEqual({});
  });

  it("preklad v XML: hlavička aj položky, nepreložená dvojica účtov sa vynechá, bez mapy nič", () => {
    const xml = `
        <inv:accounting><typ:ids>501000 325000</typ:ids></inv:accounting>
          <vch:accounting><typ:ids>Rozúčtovať</typ:ids></vch:accounting>
          <int:accounting><typ:ids>999000 111000</typ:ids></int:accounting>
          <inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>`;
    expect(predkontacieNaSkratky(xml, sTabulkou)).toBe(`
        <inv:accounting><typ:ids>2Bk</typ:ids></inv:accounting>
          <vch:accounting><typ:ids>Rozúčtovať</typ:ids></vch:accounting>
          <inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>`);
    expect(predkontacieNaSkratky(xml, null)).toBe(xml);
    expect(predkontacieVXml(xml)).toEqual(["501000 325000", "Rozúčtovať", "999000 111000"]);
    expect(chybajuceSkratky(predkontacieVXml(xml), sTabulkou)).toEqual(["999000 111000"]);
    expect(varovanieSkratky("13721", ["501000 325000"])).toMatch(
      /^13721 — predkontácia „501000 325000“ je dvojica účtov.*Skratky predkontácií v Pohode$/,
    );
    expect(varovanieSkratky("13721", [])).toBeNull();
  });
});

describe("členenie KV DPH na položke", () => {
  const z = { cz: false, zdedene: "B3", dph: 1 };
  it("položka bez vlastného KV zdedí KV dokladu — aj pri PN", () => {
    expect(kvPolozkyPrePohodu({ ...z, clenenie: "PD" })).toBe("B3");
    expect(kvPolozkyPrePohodu({ ...z, clenenie: "PN" })).toBe("B3");
    expect(kvPolozkyPrePohodu({ ...z, clenenie: "PB" })).toBe("B3");
    expect(kvPolozkyPrePohodu({ ...z, clenenie: null })).toBe("B3");
  });
  it("vlastné KV, X a prenesenie majú prednosť", () => {
    expect(kvPolozkyPrePohodu({ ...z, vlastne: "B2" })).toBe("B2");
    expect(kvPolozkyPrePohodu({ ...z, vlastne: "x" })).toBe("");
    expect(kvPolozkyPrePohodu({ ...z, rucneDokladu: "X" })).toBe("");
    expect(kvPolozkyPrePohodu({ ...z, pdp: "B1", dph: 0 })).toBe("B1");
  });
  it("vedomé výnimky: UN a oslobodené, nedaňová položka, CZ, doklad mimo KV", () => {
    expect(clenenieBezKv("UN")).toBe(true);
    expect(clenenieBezKv("UNoslob")).toBe(true);
    expect(clenenieBezKv("RNodpS")).toBe(true);
    expect(clenenieBezKv("UN§69")).toBe(false);
    expect(clenenieBezKv("PN")).toBe(false);
    expect(kvPolozkyPrePohodu({ ...z, clenenie: "UN" })).toBe("");
    expect(kvPolozkyPrePohodu({ ...z, dph: 0 })).toBe("");
    expect(kvPolozkyPrePohodu({ ...z, cz: true })).toBe("");
    expect(kvPolozkyPrePohodu({ ...z, zdedene: "" })).toBe("");
    // Prenesenie sa uvádza aj bez dane.
    expect(kvPolozkyPrePohodu({ ...z, zdedene: "A2", dph: 0 })).toBe("A2");
  });
});

describe("A) 13721 — bloček kartou do Ostatných záväzkov", () => {
  const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocek13721], nastavenia: nastaveniaPaliery(sTabulkou) });

  it("hlavička aj každá položka nesú skratku predkontácie, PD a B3", () => {
    expect(xml).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    const h = hlavicka(xml, "inv", "invoice");
    expect(ids(h, "accounting")).toBe("2Bk");
    expect(ids(h, "classificationVAT")).toBe("PD");
    expect(ids(h, "classificationKVDPH")).toBe("B3");
    const p = polozky(xml, "inv", "invoice");
    expect(p).toHaveLength(13);
    for (const x of p) {
      expect(ids(x, "accounting")).toBe("2Bk");
      expect(ids(x, "classificationVAT")).toBe("PD");
      expect(ids(x, "classificationKVDPH")).toBe("B3");
    }
    expect(xml).not.toContain("501000 325000");
    expect(chybySchemy(xml, "inv", "invoice.xsd")).toEqual([]);
  });

  it("bez skratky ide kód z číselníka firmy (Doklado) tak, ako je — PALIERA ho tak posielala", () => {
    const bez = buildPohodaExpensesXml({ company: firma, doklady: [blocek13721], nastavenia: nastaveniaPaliery(bezTabulky) });
    expect(bez).toContain("<inv:accounting><typ:ids>501000 325000</typ:ids></inv:accounting>");
    expect(polozky(bez, "inv", "invoice").every((x) => ids(x, "classificationKVDPH") === "B3")).toBe(true);
    expect(chybySchemy(bez, "inv", "invoice.xsd")).toEqual([]);
  });

  it("dvojica účtov mimo číselníka sa nepošle a kontrola to nahlási", () => {
    const prazdna = mapaPredkontacii([], {});
    const bez = buildPohodaExpensesXml({ company: firma, doklady: [blocek13721], nastavenia: nastaveniaPaliery(prazdna) });
    expect(bez).not.toContain("<inv:accounting>");
    const surove = buildPohodaExpensesXml({ company: firma, doklady: [blocek13721], nastavenia: nastaveniaPaliery(null) });
    expect(chybajuceSkratky(predkontacieVXml(surove), prazdna)).toEqual(["501000 325000"]);
    expect(chybySchemy(bez, "inv", "invoice.xsd")).toEqual([]);
  });

  it("snímka XML", () => {
    expect(xml).toMatchSnapshot();
  });
});

describe("B) 11665 — PHM v hotovosti pomerom 50/30/20 %", () => {
  const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocek11665], nastavenia: nastaveniaPaliery(sTabulkou) });

  it("každá položka má KV B3 — aj tie s členením PN", () => {
    expect(xml).toContain("<vch:voucherType>expense</vch:voucherType>");
    const h = hlavicka(xml, "vch", "voucher");
    expect(ids(h, "accounting")).toBe("Rozúčtovať");
    expect(ids(h, "classificationKVDPH")).toBe("B3");
    const p = polozky(xml, "vch", "voucher");
    expect(p.map((x) => [ids(x, "accounting"), ids(x, "classificationVAT"), ids(x, "classificationKVDPH")])).toEqual([
      ["1PHM", "PD", "B3"],
      ["2PHM", "PN", "B3"],
      ["2PHM", "PN", "B3"],
    ]);
    expect(chybySchemy(xml, "vch", "voucher.xsd")).toEqual([]);
  });

  it("celý doklad bez odpočtu (všetky riadky PN) do KV nepatrí", () => {
    const bezOdpoctu = buildPohodaExpensesXml({
      company: firma,
      doklady: [{ ...blocek11665, odpocet: false }],
      nastavenia: nastaveniaPaliery(sTabulkou),
    });
    expect(bezOdpoctu).not.toContain("classificationKVDPH");
  });

  it("snímka XML", () => {
    expect(xml).toMatchSnapshot();
  });
});

describe("vydaná faktúra — položky dedia predkontáciu a KV", () => {
  it("položka „ako doklad“ dostane predkontáciu aj KV faktúry, UN položka KV nie", () => {
    const invoice: any = {
      id: "f1",
      type: "regular",
      invoice_number: "2026001",
      issue_date: "2026-10-20",
      delivery_date: "2026-10-20",
      due_date: "2026-11-03",
      total: 223,
      customer_name: "Odberateľ s.r.o.",
      customer_ico: "12345678",
      customer_ic_dph: "SK2012345678",
      currency: "EUR",
      pohoda_predkontacia: "311000 602000",
    };
    const items: any[] = [
      { name: "Služba", quantity: 1, unit_price: 100, subtotal: 100, vat_rate: 23, vat_amount: 23, total: 123 },
      {
        name: "Prefakturácia",
        quantity: 1,
        unit_price: 100,
        subtotal: 100,
        vat_rate: 0,
        vat_amount: 0,
        total: 100,
        pohoda_clenenie_dph: "UN",
      },
    ];
    const mapa = mapaPredkontacii([], { "311000 602000": "1Fv" });
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice, items }],
      nastavenia: { clenenieDph: "UD", mapaPredkontacii: mapa } as any,
    });
    const h = hlavicka(xml, "inv", "invoice");
    expect(ids(h, "accounting")).toBe("1Fv");
    expect(ids(h, "classificationKVDPH")).toBe("A1");
    const p = polozky(xml, "inv", "invoice");
    expect(p.map((x) => [ids(x, "accounting"), ids(x, "classificationKVDPH")])).toEqual([
      ["1Fv", "A1"],
      ["1Fv", null],
    ]);
    expect(chybySchemy(xml, "inv", "invoice.xsd")).toEqual([]);
  });
});
