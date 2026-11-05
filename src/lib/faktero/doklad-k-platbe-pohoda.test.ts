/*
  Daňový doklad k prijatej platbe do Pohody a „jedna pravda“ pre detail aj
  export — pripomienka 5. 11. 2026, PALIERA 260800002 (interný doklad 26IDT…):

   - detail ukazoval „Tržby za služby 311000/602000 · automaticky“, v DB bolo
     `pohoda_predkontacia` NULL, do Pohody nešlo nič („Neviem“);
   - tržba sa pri zálohe neúčtuje — predkontácia len z
     `pohoda_predkontacia_zaloha`, bez náhrady predkontáciou faktúr;
   - v Pohode chýbal dátum dodania aj dátum KV DPH (intDoc.xsd: SK
     `dateDelivery`, `dateKVDPH`; CZ `dateKHDPH`).

  Doklad je skutočný (DB, len čítanie). Predkontácia zálohy „ZALOHA-TEST“ je
  nastavená len v teste, nie vo firme.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaInvoiceXml } from "./export.server";
import { resolveVatClassification } from "./clenenie-vystavenej";
import { doplnokZauctovania, zauctovanieNaExport } from "./clenenie-vystavenej.server";
import { NASTAVTE_PREDKONTACIU_ZALOHY, varovanieDokladuKPlatbe } from "./pohoda-kontrola";
import { PREDVOLENE } from "./predkontacie";

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
const hodnota = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;
const ids = (xml: string, tag: string) =>
  new RegExp(`<${tag}><typ:ids>([^<]*)</typ:ids></${tag}>`).exec(xml)?.[1] ?? null;

/** PALIERA — predkontácia faktúr („Tržby za služby“) zámerne vyplnená, zálohy nie. */
const firma: any = {
  id: "ee86eb5f-57b7-445a-9b3c-8e6058a905ca",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  country: "SK",
  vat_payer: true,
  pohoda_predkontacia: "311000 602000",
  pohoda_predkontacia_zaloha: null,
};

/** 260800002 tak, ako bol nahlásený (predkontácia NULL, UD a A1 uložené). */
const doklad260800002: any = {
  id: "9fce653d-98f9-4c6a-87bd-c1dbbb2946e3",
  company_id: firma.id,
  type: "advance_payment",
  status: "paid",
  invoice_number: "260800002",
  variable_symbol: "260800002",
  issue_date: "2026-11-02",
  delivery_date: "2026-11-02",
  due_date: "2026-11-02",
  paid_at: "2026-11-02T00:00:00+00:00",
  currency: "EUR",
  subtotal: 1,
  vat_total: 0.23,
  total: 1.23,
  advance_amount: 1.23,
  advance_invoice_id: "632af8a3-3184-4bf7-89a3-1c029a82801d",
  customer_name: "SFC, s.r.o.",
  customer_ico: "53297474",
  customer_dic: "2121372693",
  customer_ic_dph: "SK2121372693",
  customer_street: "Račianska 17",
  customer_city: "Bratislava - mestská časť Nové Mesto",
  customer_zip: "831 02",
  customer_country: "SK",
  payment_method: "bank_transfer",
  notes: "Daňový doklad k platbe prijatej 2. 11. 2026 k zálohovej faktúre ZF20260001.",
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: "UD",
  kv_clenenie: "A1",
  exported_at: null,
  pohoda_verzia: 1,
};
const polozky260800002: any[] = [
  { name: "test", quantity: 1, unit: "ks", unit_price: 1, subtotal: 1, vat_rate: 23, vat_amount: 0.23, total: 1.23 },
];

/** Doklad pripravený na export: kódy doplnené tou istou funkciou, ktorú ukazuje detail. */
function naExport(inv: any, f: any) {
  return { ...inv, ...doplnokZauctovania(inv, resolveVatClassification(f, inv, { odhad: { faktura: "311000 602000" } })) };
}

describe("predkontácia daňového dokladu k platbe", () => {
  it("len z predkontácie zálohy — bez náhrady predkontáciou faktúr ani zvykom firmy", () => {
    const bez = resolveVatClassification(firma, doklad260800002, { odhad: { faktura: "311000 602000" } });
    expect(bez.pohoda_predkontacia).toBeNull();
    expect(bez.pohoda_clenenie_dph).toBe("UD");
    expect(bez.kv_clenenie).toBe("A1");
    const s = resolveVatClassification({ ...firma, pohoda_predkontacia_zaloha: "ZALOHA-TEST" }, doklad260800002);
    expect(s.pohoda_predkontacia).toBe("ZALOHA-TEST");
    expect(s.zdroj.predkontacia).toBe("firma");
    // Bežná faktúra predkontáciu faktúr dostane ďalej.
    expect(resolveVatClassification(firma, { ...doklad260800002, type: "regular" }).pohoda_predkontacia).toBe(
      "311000 602000",
    );
  });

  it("upozornenie, keď predkontácia chýba", () => {
    expect(varovanieDokladuKPlatbe(doklad260800002, {})).toMatch(
      new RegExp(`^260800002 — ${NASTAVTE_PREDKONTACIU_ZALOHY}`),
    );
    expect(varovanieDokladuKPlatbe(doklad260800002, { predkontaciaZaloha: "ZALOHA-TEST" })).toBeNull();
    expect(varovanieDokladuKPlatbe({ ...doklad260800002, pohoda_predkontacia: "X1" }, {})).toBeNull();
    expect(varovanieDokladuKPlatbe({ ...doklad260800002, type: "regular" }, {})).toBeNull();
  });

  it("Predkontácie → Predvolené: pole pre daňový doklad k platbe s ponukou interných dokladov", () => {
    const z = PREDVOLENE.find((p) => p.kluc === "zaloha")!;
    expect(z.nazov).toBe("Predkontácia – daňový doklad k platbe (záloha)");
    expect(z.predkontacia).toBe("pohoda_predkontacia_zaloha");
    expect(z.agendy[0]).toBe("internalDocument");
  });
});

describe("XML 260800002 — interný doklad v Pohode", () => {
  const firmaTest = { ...firma, pohoda_predkontacia_zaloha: "ZALOHA-TEST" };
  const xml = buildPohodaInvoiceXml({
    company: firmaTest,
    invoices: [{ invoice: naExport(doklad260800002, firmaTest), items: polozky260800002 }],
    nastavenia: { predkontaciaZaloha: firmaTest.pohoda_predkontacia_zaloha } as any,
  });

  it("predkontácia, UD, A1, dátum dodania a dátum KV DPH; väzba cez VS a pôvodné číslo", () => {
    expect(xml).toContain("<int:intDoc ");
    expect(ids(xml, "int:accounting")).toBe("ZALOHA-TEST");
    expect(ids(xml, "int:classificationVAT")).toBe("UD");
    expect(ids(xml, "int:classificationKVDPH")).toBe("A1");
    expect(hodnota(xml, "int:date")).toBe("2026-11-02");
    expect(hodnota(xml, "int:dateTax")).toBe("2026-11-02");
    expect(hodnota(xml, "int:dateAccounting")).toBe("2026-11-02");
    expect(hodnota(xml, "int:dateDelivery")).toBe("2026-11-02");
    expect(hodnota(xml, "int:dateKVDPH")).toBe("2026-11-02");
    // CZ dátum KH DPH slovenská Pohoda nepozná.
    expect(xml).not.toContain("dateKHDPH");
    expect(hodnota(xml, "int:symVar")).toBe("260800002");
    expect(hodnota(xml, "int:originalDocumentNumber")).toBe("260800002");
    expect(chybySchemy(xml, "int", "intDoc.xsd")).toEqual([]);
  });

  it("bez predkontácie zálohy ide bez predkontácie — nie s tržbami 311/602 ani nákladovou", () => {
    const bez = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: naExport(doklad260800002, firma), items: polozky260800002 }],
      nastavenia: { predkontacia: "311000 602000", predkontaciaPrijata: "501000 321000" } as any,
    });
    expect(bez).not.toContain("<int:accounting>");
    expect(ids(bez, "int:classificationKVDPH")).toBe("A1");
    expect(hodnota(bez, "int:dateKVDPH")).toBe("2026-11-02");
  });

  it("CZ firma dostane dátum KH DPH", () => {
    const cz = buildPohodaInvoiceXml({
      company: { ...firmaTest, country: "CZ" },
      invoices: [
        {
          invoice: { ...doklad260800002, currency: "CZK", pohoda_predkontacia: "ZALOHA-TEST" },
          items: polozky260800002,
        },
      ],
      nastavenia: {} as any,
    });
    expect(hodnota(cz, "int:dateKHDPH")).toBe("2026-11-02");
    expect(cz).not.toContain("dateKVDPH");
  });

  it("snímka XML", () => {
    expect(xml).toMatchSnapshot();
  });
});

describe("faktúra a dobropis — kódy z automatiky a dátum dodania", () => {
  const faktura: any = {
    ...doklad260800002,
    id: "f-regular",
    type: "regular",
    invoice_number: "2026010",
    variable_symbol: "2026010",
    issue_date: "2026-11-03",
    delivery_date: "2026-10-31",
    pohoda_clenenie_dph: null,
    kv_clenenie: null,
    advance_invoice_id: null,
  };
  it("bežná faktúra: predkontácia, UD a A1 z automatiky, dátum dodania v dateTax", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: naExport(faktura, firma), items: polozky260800002 }],
      nastavenia: {} as any,
    });
    expect(ids(xml, "inv:accounting")).toBe("311000 602000");
    expect(ids(xml, "inv:classificationVAT")).toBe("UD");
    expect(ids(xml, "inv:classificationKVDPH")).toBe("A1");
    expect(hodnota(xml, "inv:date")).toBe("2026-11-03");
    expect(hodnota(xml, "inv:dateTax")).toBe("2026-10-31");
    expect(chybySchemy(xml, "inv", "invoice.xsd")).toEqual([]);
  });
  it("dobropis: C1, dátum dodania aj dátum uplatnenia", () => {
    const dobropis = {
      ...faktura,
      id: "f-dobropis",
      type: "credit_note",
      invoice_number: "2026011",
      total: -1.23,
      subtotal: -1,
      vat_total: -0.23,
    };
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [
        {
          invoice: naExport(dobropis, firma),
          items: [{ ...polozky260800002[0], quantity: -1, subtotal: -1, vat_amount: -0.23, total: -1.23 }],
        },
      ],
      nastavenia: {} as any,
    });
    expect(xml).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
    expect(ids(xml, "inv:accounting")).toBe("311000 602000");
    expect(ids(xml, "inv:classificationKVDPH")).toBe("C1");
    expect(hodnota(xml, "inv:dateTax")).toBe("2026-10-31");
    expect(hodnota(xml, "inv:dateApplicationVAT")).toBe("2026-11-03");
    expect(chybySchemy(xml, "inv", "invoice.xsd")).toEqual([]);
  });
});

describe("odovzdaný doklad sa nemení", () => {
  const vyriesene = { pohoda_predkontacia: "ZALOHA-TEST", pohoda_clenenie_dph: "UD", kv_clenenie: "A1" };
  it("doplní len prázdne polia neodovzdaného dokladu; proforma ani odovzdaný nič", () => {
    expect(doplnokZauctovania(doklad260800002, vyriesene)).toEqual({
      pohoda_predkontacia: "ZALOHA-TEST",
      predkontacia_zdroj: "auto",
    });
    expect(doplnokZauctovania({ ...doklad260800002, exported_at: "2026-11-05T17:16:41Z" }, vyriesene)).toEqual({});
    expect(doplnokZauctovania({ ...doklad260800002, type: "proforma" }, vyriesene)).toEqual({});
    expect(doplnokZauctovania({ ...doklad260800002, pohoda_predkontacia: "1Zv" }, vyriesene)).toEqual({});
  });

  it("export zapíše len neodovzdaný doklad a len prázdne pole", async () => {
    const zapisy: { tab: string; zmena: any; filtre: string[] }[] = [];
    const sb = falosnyKlient(
      { ...firma, pohoda_predkontacia_zaloha: "ZALOHA-TEST" },
      (tab, zmena, filtre) => zapisy.push({ tab, zmena, filtre }),
    );
    const odovzdany = { ...doklad260800002, id: "odovzdany", exported_at: "2026-11-05T17:16:41Z" };
    const out = await zauctovanieNaExport(sb, firma.id, [doklad260800002, odovzdany], { ulozit: true });
    expect(out[0].pohoda_predkontacia).toBe("ZALOHA-TEST");
    expect(out[1]).toBe(odovzdany);
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].zmena).toEqual({ pohoda_predkontacia: "ZALOHA-TEST", predkontacia_zdroj: "auto" });
    expect(zapisy[0].filtre).toEqual(
      expect.arrayContaining([`id=${doklad260800002.id}`, "exported_at is null", "pohoda_predkontacia is null"]),
    );
    // Kontrola pred exportom len číta.
    zapisy.length = 0;
    await zauctovanieNaExport(sb, firma.id, [doklad260800002], { ulozit: false });
    expect(zapisy).toHaveLength(0);
  });
});

/** Klient Supabase bez siete: firma, prázdne číselníky a záznam zápisov. */
function falosnyKlient(f: any, zapis: (tab: string, zmena: any, filtre: string[]) => void): any {
  return {
    from(tab: string) {
      const filtre: string[] = [];
      let zmena: any = null;
      const vysledok = () => ({ data: tab === "companies" ? f : [], error: null });
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filtre.push(`${k}=${v}`), q),
        is: (k: string, v: unknown) => (filtre.push(`${k} is ${v}`), q),
        not: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        update: (z: any) => ((zmena = z), q),
        maybeSingle: () => Promise.resolve(vysledok()),
        single: () => Promise.resolve(vysledok()),
        then: (ok: any, chyba: any) => {
          if (zmena) zapis(tab, zmena, filtre);
          return Promise.resolve(vysledok()).then(ok, chyba);
        },
      };
      return q;
    },
  };
}
