/*
  Spätný chod Pohody: doklad z Faktera → Pohoda XML → schéma Stormware →
  import z Pohody (ten istý parser ako `/importy` a `/importy/doklady`) →
  sumy, DPH, sadzby, kurz, členenie KV a väzby musia sedieť na cent.

  Bez skutočnej Pohody je to najbližšie, ako sa dá overiť, že export a import
  hovoria tým istým jazykom: čo Faktero pošle, to by Pohoda vrátila (export
  z Pohody má ten istý tvar `dataPack`/`responsePack`).

  `POHODA_SKUSKA=<adresár>` uloží XML všetkých druhov dokladov — z nich je
  skúšobný balík pre Pohodu (`scripts/pohoda-skuska.mjs`, `docs/pohoda-skuska.md`).
*/
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  buildPohodaBankXml,
  buildPohodaCashXml,
  buildPohodaExpensesXml,
  buildPohodaInvoiceXml,
  buildPohodaStornaXml,
} from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { pohodaNaRiadky, pohodaStorna } from "./pohoda";
import { nesuladKrajinyPohody } from "./pohoda-citanie";
import { planStorien } from "./import-superfaktura.server";
import {
  klucPrijmu,
  pohodaPokladnaPrijmy,
  pohodaPrijate,
  pohodaPrijateStorna,
  riadokBlocku,
  riadokPrijatejFaktury,
  type PrijatyZaznam,
} from "./import-prijatych";
import { fakturaZRiadkov } from "./import-superfaktura.server";
import { KANONICKE_POLIA } from "./import-vendors.server";
import { citajBankoveXml } from "./vypis-xml";

xmlRegisterFsInputProviders();

/* ----------------------------------------------------------- schéma */

const SCHEMY: Record<string, string> = {
  inv: "invoice.xsd",
  vch: "voucher.xsd",
  bnk: "bank.xsd",
  int: "intDoc.xsd",
};
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
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  if (!polozky.length) chyby.push("balík je prázdny");
  for (const m of polozky) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    if (!SCHEMY[prefix]) {
      chyby.push(`neznáma agenda ${prefix}`);
      continue;
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(
        `${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 300)}`,
      );
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

/*
  Skúšobný balík pre Pohodu (`scripts/pohoda-skuska.mjs`). Pri uložení:
   - IČO v hlavičke balíka = účtovná jednotka, do ktorej sa importuje
     (predvolene firma Test a QA Česká), inak Pohoda balík odmietne;
   - položky dávky dostanú predponu behu, aby sa skúška dala zopakovať
     (Pohoda kontroluje duplicitu podľa id balíka a položky);
   - `POHODA_SKUSKA_BEZ_KODOV=1` vynechá skratky, ktoré skúšobná jednotka
     nemusí mať (predkontácie, účet, stredisko, činnosť, zákazka) — členenie
     DPH a KV ostávajú, tie sa skúšajú.
  Sumy ani doklady sa nemenia — sú to tie isté XML, ktoré prešli schémou
  a spätným importom v tomto teste.
*/
const SKUSKA = process.env.POHODA_SKUSKA;
function uloz(nazov: string, xml: string) {
  if (!SKUSKA) return;
  const cz = /(^|-)cz-/.test(nazov);
  const ico = cz
    ? (process.env.POHODA_SKUSKA_ICO_CZ ?? "25097563")
    : (process.env.POHODA_SKUSKA_ICO_SK ?? "86179504");
  const beh =
    process.env.POHODA_SKUSKA_BEH ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let x = xml
    .replace(/(<dat:dataPack\b[^>]*\bico=")[^"]*"/, `$1${ico}"`)
    .replace(/(<dat:dataPackItem\b[^>]*\bid=")([^"]+)"/g, `$1SKUSKA-${beh}-$2"`);
  if (process.env.POHODA_SKUSKA_BEZ_KODOV === "1")
    x = x.replace(
      /\n\s*<(\w+):(accounting|account|centre|activity|contract)><typ:ids>[^<]*<\/typ:ids><\/\1:\2>/g,
      "",
    );
  const adresar = `${SKUSKA}/${cz ? "CZ" : "SK"}`;
  mkdirSync(adresar, { recursive: true });
  writeFileSync(`${adresar}/${nazov}.xml`, x, "utf8");
}

/* ------------------------------------------------------------ import */

// Rovnaké nastavenie ako `import-vendors.server.ts` a `import-prijatych.server.ts`.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
});
const mapovanie = Object.fromEntries(KANONICKE_POLIA.map((k) => [k, k])) as any;

/** Vydané doklady späť tak, ako by ich uložil `runImport`. */
function vydaneSpat(xml: string, krajina = "SK") {
  const riadky = pohodaNaRiadky(parser.parse(xml), { krajina });
  // Import nesmie dostať pole, ktoré mapovanie neprenesie (tak sa kedysi stratil druh dokladu).
  for (const r of riadky)
    for (const k of Object.keys(r))
      if (r[k] !== "" && k !== "item_sku") expect(KANONICKE_POLIA).toContain(k);
  const skupiny = new Map<string, Record<string, string>[]>();
  for (const r of riadky) {
    const k = r.invoice_number;
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k)!.push(r);
  }
  return [...skupiny].map(([cislo, g]) => {
    const f = fakturaZRiadkov(g, mapovanie, () => 23, cislo);
    return { cislo, head: g[0]!, ...f };
  });
}

function prijateSpat(xml: string, krajina = "SK") {
  return pohodaPrijate(parser.parse(xml), { krajina });
}

const c = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

/** Súčty položiek importovanej faktúry musia sedieť s hlavičkou. */
function polozkySedia(f: ReturnType<typeof vydaneSpat>[number]) {
  const z = c(f.items.reduce((a, i) => a + Number(i.subtotal), 0));
  const d = c(f.items.reduce((a, i) => a + Number(i.vat_amount), 0));
  expect(z).toBe(c(f.subtotal));
  expect(d).toBe(c(f.vatTotal));
}

/* ------------------------------------------------------------- údaje */

const firmaSK: any = {
  id: "c1",
  name: "Vzorová firma s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
  iban: "SK3112000000198742637541",
};
const firmaCZ: any = {
  ...firmaSK,
  ico: "27123456",
  dic: "CZ27123456",
  ic_dph: null,
  country: "CZ",
};

const nastavenia: any = {
  predkontacia: "3Fv",
  predkontaciaZaloha: "3Zv",
  predkontaciaDobropis: "3Dv",
  clenenieDph: "UD",
  clenenieDphPdp: "UDpdp",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  clenenieDphPdpPrijata: "PDpdp",
  banka: "TB",
  pokladna: "HP",
  predkontaciaPokladna: "1Pv",
  predkontaciaBanka: "1Bv",
  blockyPodlaPlatby: true,
};
const nastavenieCZ: any = { ...nastavenia, banka: "KB", clenenieDphPdpPrijata: null };

const polozka = (o: any = {}) => ({
  name: "Konzultácia",
  quantity: 2,
  unit: "hod",
  unit_price: 50,
  vat_rate: 23,
  subtotal: 100,
  vat_amount: 23,
  total: 123,
  ...o,
});

const faktura = (o: any = {}) => ({
  id: "inv-1",
  type: "regular",
  invoice_number: "FA2026001",
  variable_symbol: "2026001",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Odberateľ a.s.",
  customer_street: "Obchodná 5",
  customer_city: "Bratislava",
  customer_zip: "81106",
  customer_country: "SK",
  customer_ico: "35999888",
  customer_dic: "2021999888",
  customer_ic_dph: "SK2021999888",
  payment_method: "bank_transfer",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  ...o,
});

const vydana = (opts: Parameters<typeof buildPohodaInvoiceXml>[0], nazov: string) => {
  const x = buildPohodaInvoiceXml(opts);
  uloz(nazov, x);
  expect(chybySchemy(x)).toEqual([]);
  return x;
};

/* ------------------------------------------------- vystavené faktúry */

describe("spätný chod — vystavené doklady SK", () => {
  it("faktúra so sadzbami 23/19/5/0: sumy, sadzby, dátumy, KV A1, predkontácia a členenie", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({ subtotal: 400, vat_total: 47, total: 447 }),
            items: [
              polozka(),
              polozka({
                name: "Tovar",
                quantity: 1,
                unit_price: 100,
                vat_rate: 19,
                vat_amount: 19,
                total: 119,
              }),
              polozka({
                name: "Kniha",
                quantity: 1,
                unit_price: 100,
                vat_rate: 5,
                vat_amount: 5,
                total: 105,
              }),
              polozka({
                name: "Oslobodené",
                quantity: 1,
                unit_price: 100,
                vat_rate: 0,
                vat_amount: 0,
                total: 100,
              }),
            ],
          },
        ],
      },
      "01-vydana-faktura-sadzby",
    );
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("regular");
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([400, 47, 447]);
    expect(f.items.map((i) => i.vat_rate)).toEqual([23, 19, 5, 0]);
    expect(f.items.map((i) => c(i.unit_price))).toEqual([50, 100, 100, 100]);
    polozkySedia(f);
    expect([f.issueDate, f.deliveryDate, f.dueDate]).toEqual([
      "2026-10-10",
      "2026-10-08",
      "2026-10-24",
    ]);
    expect(f.pohoda).toMatchObject({
      kv_clenenie: "A1",
      pohoda_predkontacia: "3Fv",
      pohoda_clenenie_dph: "UD",
    });
    expect(f.head.variable_symbol).toBe("2026001");
    expect(f.head.customer_ic_dph).toBe("SK2021999888");
  });

  it("zálohová faktúra sa vráti ako zálohová, nie ako výnos", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({ id: "z", type: "proforma", invoice_number: "ZF2026001" }),
            items: [polozka()],
          },
        ],
      },
      "02-vydana-zalohova",
    );
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("proforma");
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
  });

  it("dobropis SK: kladný v Pohode, záporný vo Fakteri, s väzbou na opravovanú faktúru", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        opravovane: { d: "FA2026001" },
        invoices: [
          {
            invoice: faktura({
              id: "d",
              type: "credit_note",
              invoice_number: "DB2026001",
              subtotal: -100,
              vat_total: -23,
              total: -123,
            }),
            items: [polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 })],
          },
        ],
      },
      "03-vydany-dobropis",
    );
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("credit_note");
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([-100, -23, -123]);
    expect(f.items[0]!.quantity).toBe(-2);
    polozkySedia(f);
    expect(f.opravujeCislo).toBe("FA2026001");
    expect(f.pohoda.kv_clenenie).toBe("C1");
  });

  it("ťarchopis (vrubopis) ostane ťarchopisom", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        povodneCisla: { t: "FA2026001" },
        invoices: [
          {
            invoice: faktura({ id: "t", type: "debit_note", invoice_number: "TP2026001" }),
            items: [polozka()],
          },
        ],
      } as any,
      "04-vydany-tarchopis",
    );
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("debit_note");
    expect(c(f.total)).toBe(123);
    expect(f.opravujeCislo).toBe("FA2026001");
  });

  it("vyúčtovanie s odpočtom zálohy: plnenie celé, záloha ako odpočet so zálohovou faktúrou", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        zalohy: { v: { cislo: "ZF2026001", zaklad: 50, dph: 11.5, sadzba: 23 } },
        invoices: [
          { invoice: faktura({ id: "v", invoice_number: "FA2026002" }), items: [polozka()] },
        ],
      },
      "05-vyuctovanie-odpocet-zalohy",
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
    expect(c(f.head.advance_amount)).toBe(61.5);
    expect(f.zalohaCislo).toBe("ZF2026001");
    expect(f.items).toHaveLength(1);
  });

  it("zľava riadku a zľava na doklad: základ po zľave sedí na cent", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "zl",
              invoice_number: "FA2026003",
              subtotal: 81,
              vat_total: 18.63,
              total: 99.63,
              discount_total: 9,
            }),
            items: [
              polozka({
                quantity: 1,
                unit_price: 100,
                discount_percent: 10,
                subtotal: 90,
                vat_amount: 20.7,
                total: 110.7,
              }),
            ],
          },
        ],
      },
      "06-vydana-zlavy",
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([81, 18.63, 99.63]);
    polozkySedia(f);
  });

  it("tuzemské prenesenie (§ 69 ods. 12): DPH nula, sadzba ostáva, prenesenie a KV A2", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "pdp",
              invoice_number: "FA2026004",
              reverse_charge: true,
              vat_total: 0,
              total: 100,
            }),
            items: [polozka({ vat_amount: 0, total: 100, colny_kod: "72142000" })],
          },
        ],
      },
      "07-vydana-tuzemske-prenesenie",
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 0, 100]);
    expect(f.pohoda).toMatchObject({
      reverse_charge: true,
      kv_clenenie: "A2",
      pohoda_clenenie_dph: "UDpdp",
    });
    polozkySedia(f);
  });

  it("položka v prenesení na inak bežnej faktúre si príznak nechá", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "pp",
              invoice_number: "FA2026005",
              subtotal: 200,
              vat_total: 23,
              total: 223,
            }),
            items: [
              polozka(),
              polozka({ name: "Mobil", prenesenie: true, vat_amount: 0, total: 100 }),
            ],
          },
        ],
      },
      "08-vydana-polozka-prenesenie",
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([200, 23, 223]);
    expect(f.pohoda.reverse_charge).toBeUndefined();
    expect(f.items.map((i: any) => Boolean(i.prenesenie))).toEqual([false, true]);
    polozkySedia(f);
  });

  it("dodanie do EÚ: prenesenie, krajina a IČ DPH odberateľa", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "eu",
              invoice_number: "FA2026006",
              reverse_charge: true,
              eu_plnenie: "tovar",
              customer_country: "DE",
              customer_ic_dph: "DE123456789",
              customer_dic: null,
              vat_total: 0,
              total: 100,
            }),
            items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
          },
        ],
      },
      "09-vydana-dodanie-eu",
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 0, 100]);
    expect(f.pohoda.reverse_charge).toBe(true);
    expect(f.head.customer_country).toBe("DE");
    expect(f.head.customer_ic_dph).toBe("DE123456789");
  });

  it("cudzia mena: sumy v mene dokladu a kurz ECB (mena za 1 €) bez zmeny", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "usd",
              invoice_number: "FA2026007",
              currency: "USD",
              exchange_rate: 1.0812,
            }),
            items: [polozka()],
          },
        ],
      },
      "10-vydana-cudzia-mena",
    );
    const [f] = vydaneSpat(x);
    expect(f.head.currency).toBe("USD");
    expect(f.pohoda.exchange_rate).toBe(1.0812);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
    expect(f.items[0]!.vat_rate).toBe(23);
  });

  it("cudzia mena s odpočtom zálohy: súčet v mene je po odpočte, plnenie celé", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        zalohy: { uz: { cislo: "ZF2026009", zaklad: 50, dph: 11.5, sadzba: 23 } },
        invoices: [
          {
            invoice: faktura({
              id: "uz",
              invoice_number: "FA2026008",
              currency: "USD",
              exchange_rate: 1.08,
            }),
            items: [polozka()],
          },
        ],
      },
      "11-vydana-cudzia-mena-zaloha",
    );
    // Súčet dokladu v Pohode = položky + odpočet (záporný) — inak hlási nesúlad.
    expect(x).toMatch(
      /<inv:foreignCurrency>[\s\S]*<typ:priceSum>61\.50<\/typ:priceSum>[\s\S]*<\/inv:invoiceSummary>/,
    );
    const [f] = vydaneSpat(x);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
    expect(c(f.head.advance_amount)).toBe(61.5);
  });

  it("daňový doklad k prijatej platbe (interný doklad) sa vráti ako doklad k platbe", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({ id: "dp", type: "advance_payment", invoice_number: "DP2026001" }),
            items: [polozka()],
          },
        ],
      },
      "12-danovy-doklad-k-platbe",
    );
    const [f] = vydaneSpat(x);
    expect(f.cislo).toBe("DP2026001");
    expect(f.druh).toBe("advance_payment");
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
    expect(f.items[0]!.vat_rate).toBe(23);
  });

  it("OSS: sadzby štátu spotreby (DE 19/7) a štát OSS", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "oss",
              invoice_number: "FA2026010",
              oss: true,
              oss_country: "DE",
              customer_country: "DE",
              customer_ico: null,
              customer_dic: null,
              customer_ic_dph: null,
              subtotal: 200,
              vat_total: 26,
              total: 226,
            }),
            items: [
              polozka({ unit_price: 50, vat_rate: 19, vat_amount: 19, total: 119 }),
              polozka({ unit_price: 50, vat_rate: 7, vat_amount: 7, total: 107 }),
            ],
          },
        ],
      },
      "13-vydana-oss",
    );
    const [f] = vydaneSpat(x);
    expect(f.items.map((i) => i.vat_rate)).toEqual([19, 7]);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([200, 26, 226]);
    expect(f.pohoda).toMatchObject({ oss: true, oss_country: "DE" });
  });

  it("malé sumy: sadzba z priehradky, nie z podielu centov", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({
              id: "m",
              invoice_number: "FA2026011",
              subtotal: 0.04,
              vat_total: 0.01,
              total: 0.05,
            }),
            items: [
              polozka({
                quantity: 1,
                unit_price: 0.04,
                subtotal: 0.04,
                vat_amount: 0.01,
                total: 0.05,
              }),
            ],
          },
        ],
      },
      "14-vydana-male-sumy",
    );
    const [f] = vydaneSpat(x);
    expect(f.items[0]!.vat_rate).toBe(23);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([0.04, 0.01, 0.05]);
  });
});

describe("spätný chod — vystavené doklady CZ", () => {
  it("faktúra 21/12 a opravný daňový doklad so záporným znamienkom", () => {
    const x = vydana(
      {
        company: firmaCZ,
        nastavenia: nastavenieCZ,
        opravovane: { "cz-d": "FV2026001" },
        invoices: [
          {
            invoice: faktura({
              id: "cz-f",
              invoice_number: "FV2026001",
              currency: "CZK",
              customer_country: "CZ",
              customer_ic_dph: null,
              customer_dic: "CZ12345678",
              subtotal: 200,
              vat_total: 33,
              total: 233,
            }),
            items: [
              polozka({ unit_price: 50, vat_rate: 21, vat_amount: 21, total: 121 }),
              polozka({ unit_price: 50, vat_rate: 12, vat_amount: 12, total: 112 }),
            ],
          },
          {
            invoice: faktura({
              id: "cz-d",
              type: "credit_note",
              invoice_number: "OD2026001",
              currency: "CZK",
              customer_country: "CZ",
              customer_ic_dph: null,
              subtotal: -100,
              vat_total: -21,
              total: -121,
            }),
            items: [
              polozka({ quantity: -2, vat_rate: 21, subtotal: -100, vat_amount: -21, total: -121 }),
            ],
          },
        ],
      },
      "20-cz-faktura-a-opravny-doklad",
    );
    const [f, d] = vydaneSpat(x, "CZ");
    expect(f!.items.map((i) => i.vat_rate)).toEqual([21, 12]);
    expect([c(f!.subtotal), c(f!.vatTotal), c(f!.total)]).toEqual([200, 33, 233]);
    expect(f!.head.currency ?? "").toBe("");
    expect(d!.druh).toBe("credit_note");
    expect([c(d!.subtotal), c(d!.vatTotal), c(d!.total)]).toEqual([-100, -21, -121]);
    expect(d!.opravujeCislo).toBe("FV2026001");
    polozkySedia(d!);
  });

  it("tuzemské prenesenie § 92a: členenie UDpdp, DPH nula, sadzba 21 % ostáva", () => {
    const x = vydana(
      {
        company: firmaCZ,
        nastavenia: nastavenieCZ,
        invoices: [
          {
            invoice: faktura({
              id: "cz-pdp",
              invoice_number: "FV2026002",
              currency: "CZK",
              customer_country: "CZ",
              customer_ic_dph: null,
              customer_dic: "CZ12345678",
              reverse_charge: true,
              vat_total: 0,
              total: 100,
            }),
            items: [polozka({ vat_rate: 21, vat_amount: 0, total: 100 })],
          },
        ],
      },
      "21-cz-prenesenie-92a",
    );
    expect(x).toContain("<inv:classificationVAT><typ:ids>UDpdp</typ:ids></inv:classificationVAT>");
    expect(x).not.toContain("classificationKVDPH");
    const [f] = vydaneSpat(x, "CZ");
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 0, 100]);
    expect(f.items[0]!.vat_rate).toBe(21);
    expect(f.pohoda).toMatchObject({ reverse_charge: true, pohoda_clenenie_dph: "UDpdp" });
  });

  it("faktúra v EUR českej firmy: kurz ČNB Kč za 1 € bez zmeny", () => {
    const x = vydana(
      {
        company: firmaCZ,
        nastavenia: nastavenieCZ,
        invoices: [
          {
            invoice: faktura({
              id: "cz-eur",
              invoice_number: "FV2026003",
              currency: "EUR",
              exchange_rate: 24.335,
              customer_country: "SK",
              reverse_charge: true,
              vat_total: 0,
              total: 100,
            }),
            items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
          },
        ],
      },
      "22-cz-faktura-v-eur",
    );
    const [f] = vydaneSpat(x, "CZ");
    expect(f.head.currency).toBe("EUR");
    expect(f.pohoda.exchange_rate).toBe(24.335);
    expect(c(f.total)).toBe(100);
  });
});

/* -------------------------------------------------- prijaté doklady */

const prijata = (o: any = {}) => ({
  id: "pi-1",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-778",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_country: "SK",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  supplier_iban: "SK8975000000000012345671",
  issue_date: "2026-10-05",
  delivery_date: "2026-10-03",
  received_date: "2026-10-06",
  due_date: "2026-10-19",
  variable_symbol: "2026778",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  payment_method: "prevod",
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
  items: [{ name: "Materiál", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});

const prijate = (company: any, doklady: any[], nazov: string, nast: any = nastavenia) => {
  const x = buildPohodaExpensesXml({ company, nastavenia: nast, doklady });
  uloz(nazov, x);
  expect(chybySchemy(x)).toEqual([]);
  return x;
};
const ulozPrijatu = (z: PrijatyZaznam) =>
  riadokPrijatejFaktury(z, { stav: "booked" as any, dnes: "2026-10-31", zdrojAplikacie: "Pohoda" });
const ulozBlocek = (z: PrijatyZaznam) =>
  riadokBlocku(z, {
    stav: "exported" as any,
    dnes: "2026-10-31",
    zdrojAplikacie: "Pohoda",
    doPokladne: true,
  });

describe("spätný chod — prijaté doklady", () => {
  it("prijatá faktúra SK: sumy, dátum dodania, číslo dodávateľa, KV B2 a kódy zaúčtovania", () => {
    const x = prijate(firmaSK, [prijataAkoDoklad(prijata())], "30-prijata-faktura");
    const [z] = prijateSpat(x);
    const r = ulozPrijatu(z!);
    expect([r.amount_without_vat, r.vat_amount, r.amount_total]).toEqual([100, 23, 123]);
    expect(r).toMatchObject({
      invoice_number: "2026-778",
      issue_date: "2026-10-05",
      delivery_date: "2026-10-03",
      due_date: "2026-10-19",
      supplier_ico: "44111222",
      supplier_ic_dph: "SK2022111222",
      kv_clenenie: "B2",
      pohoda_predkontacia: "1Fp",
      pohoda_clenenie_dph: "PD",
      type: "regular",
    });
    expect(z!.polozky.map((p) => p.vat_rate)).toEqual([23]);
  });

  it("prijatý dobropis: záporný, s číslom opravovanej faktúry a KV C2", () => {
    const x = prijate(
      firmaSK,
      [
        prijataAkoDoklad(
          prijata({
            id: "pi-d",
            invoice_number: "D-2026-5",
            opravuje_cislo: "2026-778",
            amount_without_vat: -100,
            vat_amount: -23,
            amount_total: -123,
            items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 23, total: -100 }],
          }),
        ),
      ],
      "31-prijaty-dobropis",
    );
    const [z] = prijateSpat(x);
    const r = ulozPrijatu(z!);
    expect([r.amount_without_vat, r.vat_amount, r.amount_total]).toEqual([-100, -23, -123]);
    expect(r).toMatchObject({ opravuje_cislo: "2026-778", kv_clenenie: "C2" });
  });

  it("prijatá v prenesení z EÚ: samozdanenie, KV B1, daň nula", () => {
    const x = prijate(
      firmaSK,
      [
        prijataAkoDoklad(
          prijata({
            id: "pi-pdp",
            supplier_country: "CZ",
            supplier_ic_dph: "CZ12345678",
            reverse_charge: true,
            pohoda_clenenie_dph: null,
            vat_amount: 0,
            amount_total: 100,
            items: [{ name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 }],
          }),
        ),
      ],
      "32-prijata-prenesenie",
    );
    const [z] = prijateSpat(x);
    const r = ulozPrijatu(z!);
    expect([r.amount_without_vat, r.vat_amount, r.amount_total]).toEqual([100, 0, 100]);
    expect(r).toMatchObject({
      dph_rezim: "samozdanenie",
      kv_clenenie: "B1",
      pohoda_clenenie_dph: "PDpdp",
    });
  });

  it("prijatá v cudzej mene: sumy v mene a kurz bez zmeny", () => {
    const x = prijate(
      firmaSK,
      [prijataAkoDoklad(prijata({ id: "pi-usd", currency: "USD", exchange_rate: 1.1 }))],
      "33-prijata-cudzia-mena",
    );
    const [z] = prijateSpat(x);
    const r = ulozPrijatu(z!);
    expect(r.currency).toBe("USD");
    expect((r as any).exchange_rate).toBe(1.1);
    expect([r.amount_without_vat, r.vat_amount, r.amount_total]).toEqual([100, 23, 123]);
  });

  it("prijatá bez nároku na odpočet si príznak nechá", () => {
    const x = prijate(
      firmaSK,
      [prijataAkoDoklad(prijata({ id: "pi-bo", odpocet: false }))],
      "34-prijata-bez-odpoctu",
    );
    const [z] = prijateSpat(x);
    expect((ulozPrijatu(z!) as any).odpocet).toBe(false);
  });

  const blocek = (o: any = {}) => ({
    id: "exp-1",
    supplier_name: "Benzínka a.s.",
    supplier_ico: "31111111",
    supplier_ic_dph: "SK2020000001",
    document_number: "O-123",
    issue_date: "2026-10-04",
    currency: "EUR",
    total_amount: 61.5,
    vat_amount: 11.5,
    net_amount: 50,
    vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
    category: "pohonne_hmoty",
    payment_method: "hotovost",
    ...o,
  });

  it("bloček: hotovosť (pokladňa), karta (interný doklad), prevod (faktúra) — všetky späť na cent", () => {
    const x = prijate(
      firmaSK,
      [
        blocek(),
        blocek({ id: "exp-2", document_number: "O-124", payment_method: "karta" }),
        blocek({ id: "exp-3", document_number: "O-125", payment_method: "prevod" }),
      ],
      "35-blocky",
    );
    const zaznamy = prijateSpat(x);
    expect(zaznamy.map((z) => z.cislo).sort()).toEqual(["O-123", "O-124", "O-125"]);
    for (const z of zaznamy) {
      expect([z.zaklad, z.dph, z.spolu]).toEqual([50, 11.5, 61.5]);
      expect(z.kv).toBe("B3");
    }
    const hotovost = zaznamy.find((z) => z.cislo === "O-123")!;
    const karta = zaznamy.find((z) => z.cislo === "O-124")!;
    expect(hotovost.uhrada).toBe("hotovost");
    expect(karta.uhrada).toBe("karta");
    expect(ulozBlocek(karta)).toMatchObject({
      vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
    });
  });

  it("bloček s dvomi sadzbami si rozpis nechá", () => {
    const x = prijate(
      firmaSK,
      [
        blocek({
          id: "exp-4",
          document_number: "O-200",
          total_amount: 85.3,
          vat_amount: 15.3,
          net_amount: 70,
          vat_breakdown: [
            { sadzba: 23, zaklad: 50, dph: 11.5 },
            { sadzba: 19, zaklad: 20, dph: 3.8 },
          ],
        }),
      ],
      "36-blocek-dve-sadzby",
    );
    const [z] = prijateSpat(x);
    const r = ulozBlocek(z!);
    expect([r.net_amount, r.vat_amount, r.total_amount]).toEqual([70, 15.3, 85.3]);
    expect((r as any).vat_breakdown).toEqual([
      { sadzba: 19, zaklad: 20, dph: 3.8 },
      { sadzba: 23, zaklad: 50, dph: 11.5 },
    ]);
  });

  it("CZ: prijatá 21 % a prijatý opravný daňový doklad so znamienkom", () => {
    const x = prijate(
      firmaCZ,
      [
        prijataAkoDoklad(
          prijata({
            id: "cz-p",
            currency: "CZK",
            supplier_country: "CZ",
            supplier_ic_dph: null,
            supplier_dic: "CZ44111222",
            items: [{ name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 21, total: 100 }],
            vat_amount: 21,
            amount_total: 121,
          }),
        ),
        prijataAkoDoklad(
          prijata({
            id: "cz-pd",
            invoice_number: "OD-5",
            opravuje_cislo: "2026-778",
            currency: "CZK",
            supplier_country: "CZ",
            amount_without_vat: -100,
            vat_amount: -21,
            amount_total: -121,
            items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 21, total: -100 }],
          }),
        ),
      ],
      "40-cz-prijate",
      nastavenieCZ,
    );
    const [f, d] = prijateSpat(x, "CZ");
    expect([f!.zaklad, f!.dph, f!.spolu]).toEqual([100, 21, 121]);
    expect(f!.polozky[0]!.vat_rate).toBe(21);
    expect(f!.kv).toBeNull();
    expect([d!.zaklad, d!.dph, d!.spolu]).toEqual([-100, -21, -121]);
    expect(d!.druh).toBe("Dobropis");
  });

  it("CZ: prijaté plnenie v režime § 92a (DDpdp) ide ako samozdanenie", () => {
    const x = prijate(
      firmaCZ,
      [
        prijataAkoDoklad(
          prijata({
            id: "cz-pdp",
            currency: "CZK",
            supplier_country: "CZ",
            supplier_ic_dph: null,
            supplier_dic: "CZ44111222",
            reverse_charge: true,
            pohoda_clenenie_dph: null,
            vat_amount: 0,
            amount_total: 100,
            items: [{ name: "Šrot", quantity: 1, unit_price: 100, vat_rate: 21, total: 100 }],
          }),
        ),
      ],
      "41-cz-prijata-92a",
      nastavenieCZ,
    );
    expect(x).toContain("<typ:ids>DDpdp</typ:ids>");
    const [z] = prijateSpat(x, "CZ");
    expect([z!.zaklad, z!.dph, z!.spolu]).toEqual([100, 0, 100]);
    expect(z!.dphRezim).toBe("samozdanenie");
  });
});

/* ------------------------------------------------ pokladňa a banka */

describe("spätný chod — pokladňa a banka", () => {
  it("pokladňa: výdavok sa vráti ako hotovostný doklad so sumou, príjem sa nepovažuje za náklad", () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      nastavenia,
      pohyby: [
        {
          id: "c1",
          entry_date: "2026-10-04",
          type: "prijem",
          amount: 200,
          description: "Vklad",
          entry_number: "PPD1",
        },
        {
          id: "c2",
          entry_date: "2026-10-05",
          type: "vydaj",
          amount: -35.4,
          description: "Poštovné",
          entry_number: "VPD1",
        },
      ],
    } as any);
    uloz("50-pokladna", x);
    expect(chybySchemy(x)).toEqual([]);
    const z = prijateSpat(x);
    expect(z).toHaveLength(1);
    expect(z[0]!.spolu).toBe(35.4);
    expect(z[0]!.uhrada).toBe("hotovost");
  });

  it("bankový výpis z Pohody sa dá načítať späť ako výpis (smer, suma, VS, protiúčet)", () => {
    const x = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      cisloVypisu: "12",
      datumVypisu: "2026-10-31",
      pohyby: [
        {
          datum: "2026-10-10",
          suma: 123,
          smer: "prijem",
          vs: "2026001",
          protiucet: "SK8975000000000012345671",
          protistrana: "Odberateľ a.s.",
          popis: "Úhrada FA2026001",
        },
        {
          datum: "2026-10-11",
          suma: 61.5,
          smer: "vydaj",
          vs: "2026778",
          protiucet: "SK8975000000000012345671",
          protistrana: "Dodávateľ s.r.o.",
          popis: "Platba",
        },
      ],
    } as any);
    uloz("60-bankovy-vypis", x);
    expect(chybySchemy(x)).toEqual([]);
    const { vypis } = citajBankoveXml(x);
    expect(vypis.pohyby.map((p) => [p.datum, p.suma, p.smer, p.vs])).toEqual([
      ["2026-10-10", 123, "prijem", "2026001"],
      ["2026-10-11", 61.5, "vydaj", "2026778"],
    ]);
  });
});

describe("spätný chod — export z Pohody (responsePack so zoznamom dokladov)", () => {
  /*
    Pohoda doklady vyváža ako `rsp:responsePack/rsp:responsePackItem/lst:listInvoice`
    — ten istý doklad v inom obale musí dať tie isté sumy.
  */
  const naOdpoved = (xml: string) =>
    xml
      .replace(
        /<dat:dataPack\b[^>]*>/,
        '<rsp:responsePack version="2.0" state="ok" xmlns:rsp="r" xmlns:lst="l" xmlns:inv="i" xmlns:int="n" xmlns:typ="t">',
      )
      .replace(/<\/dat:dataPack>/, "</rsp:responsePack>")
      .replace(
        /<dat:dataPackItem\b([^>]*)>\s*<inv:invoice\b/g,
        '<rsp:responsePackItem$1 state="ok"><lst:listInvoice version="2.0"><inv:invoice',
      )
      .replace(
        /<\/inv:invoice>\s*<\/dat:dataPackItem>/g,
        "</inv:invoice></lst:listInvoice></rsp:responsePackItem>",
      );

  it("vydaná faktúra a prijatá faktúra zo zoznamu Pohody", () => {
    const v = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });
    const [f] = vydaneSpat(naOdpoved(v));
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
    const p = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata())],
    });
    const [z] = prijateSpat(naOdpoved(p));
    expect([z!.zaklad, z!.dph, z!.spolu]).toEqual([100, 23, 123]);
  });
});

/* ------------------------------------------- doplnky 31. 10. 2026 */

describe("spätný chod — storno", () => {
  it("storno z Faktera (`cancelDocument`): doklad sa označí ako stornovaný, storno nie je doklad", () => {
    const x = buildPohodaStornaXml({
      company: firmaSK,
      storna: [{ id: "s1", cislo: "FA2026001", typ: "regular" }],
    });
    expect(chybySchemy(x)).toEqual([]);
    const doc = parser.parse(x);
    expect(pohodaNaRiadky(doc, { krajina: "SK" })).toEqual([]);
    expect(pohodaStorna(doc)).toEqual({ cislaNaStorno: ["FA2026001"], stornujuce: [] });
    // Doklad vo firme je → storno; nie je → zrozumiteľné upozornenie.
    const p = planStorien(pohodaStorna(doc), new Map([["FA2026001", "inv-1"]]));
    expect(p.naStorno).toEqual([{ cislo: "FA2026001", id: "inv-1" }]);
    expect(p.upozornenia).toEqual([]);
    const bez = planStorien(pohodaStorna(doc), new Map());
    expect(bez.naStorno).toEqual([]);
    expect(bez.upozornenia[0]).toContain("Storno dokladu FA2026001");
    // Prijaté doklady storno faktúry neimportujú.
    expect(prijateSpat(x)).toEqual([]);
  });

  it("export z Pohody: stornovaný doklad príde stornovaný, stornujúci sa preskočí a nahlási", () => {
    const v = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        { invoice: faktura(), items: [polozka()] },
        {
          invoice: faktura({ id: "inv-2", invoice_number: "FA2026099" }),
          items: [polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 })],
        },
      ],
    });
    // Pohoda pri exporte dáva príznak `storno` do hlavičky (invoice.xsd, „pouze pro export“).
    let n = 0;
    const x = v.replace(/<inv:invoiceType>issuedInvoice<\/inv:invoiceType>/g, (m) =>
      n++ === 0
        ? `${m}<inv:storno>cancelledDocument</inv:storno>`
        : `${m}<inv:storno>cancelDocument</inv:storno>`,
    );
    const spat = vydaneSpat(x);
    expect(spat.map((f) => f.cislo)).toEqual(["FA2026001"]);
    expect(spat[0]!.knownStatus).toBe("cancelled");
    expect(pohodaStorna(parser.parse(x))).toEqual({ cislaNaStorno: [], stornujuce: ["FA2026099"] });
    expect(planStorien(pohodaStorna(parser.parse(x)), new Map()).upozornenia[0]).toContain(
      "FA2026099",
    );
  });

  it("prijatá faktúra stornovaná v Pohode: uloží sa ako stornovaná, stornujúca sa nahlási", () => {
    const p = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(prijata()),
        prijataAkoDoklad(prijata({ id: "pi-2", invoice_number: "2026-779" })),
      ],
    });
    let n = 0;
    const x = p.replace(/<inv:invoiceType>receivedInvoice<\/inv:invoiceType>/g, (m) =>
      n++ === 0
        ? `${m}<inv:storno>cancelledDocument</inv:storno>`
        : `${m}<inv:storno>cancelDocument</inv:storno>`,
    );
    const z = prijateSpat(x);
    expect(z).toHaveLength(1);
    expect(z[0]!.stornovany).toBe(true);
    expect(ulozPrijatu(z[0]!).status).toBe("cancelled");
    expect(pohodaPrijateStorna(parser.parse(x))).toEqual([
      expect.stringContaining("Stornujúci doklad"),
    ]);
  });
});

describe("spätný chod — § 25a", () => {
  const oprava = (o: any) =>
    faktura({
      id: "o25",
      type: "credit_note",
      oprava_25a: true,
      invoice_number: "DB2026025",
      intro_note:
        "Oprava základu dane podľa § 25a zákona č. 222/2004 Z. z. o DPH k faktúre FA2026001",
      ...o,
    });

  it("zníženie (dobropis v Pohode) sa vráti ako credit_note záporný s oprava_25a", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        povodneCisla: { o25: "FA2026001" },
        invoices: [
          {
            invoice: oprava({ subtotal: -100, vat_total: -23, total: -123 }),
            items: [polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 })],
          },
        ],
      } as any,
      "71-oprava-25a-znizenie",
    );
    expect(x).toContain("issuedCreditNotice");
    expect(x).toContain("Oprava základu dane podľa § 25a");
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("credit_note");
    expect(f.pohoda.oprava_25a).toBe(true);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([-100, -23, -123]);
    expect(f.opravujeCislo).toBe("FA2026001");
    polozkySedia(f);
  });

  it("vrátenie po zaplatení (vrubopis v Pohode) sa vráti ako credit_note kladný s oprava_25a, nie ťarchopis", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        povodneCisla: { o25: "FA2026001" },
        // Text dokladu bez vety § 25a — rozhoduje veta, ktorú export dáva do poznámky.
        invoices: [{ invoice: oprava({ intro_note: "Vrátenie opravy" }), items: [polozka()] }],
      } as any,
      "72-oprava-25a-vratenie",
    );
    expect(x).toContain("issuedDebitNote");
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("credit_note");
    expect(f.pohoda.oprava_25a).toBe(true);
    expect([c(f.subtotal), c(f.vatTotal), c(f.total)]).toEqual([100, 23, 123]);
  });

  it("obyčajný ťarchopis a dobropis príznak § 25a nedostanú", () => {
    const x = vydana(
      {
        company: firmaSK,
        nastavenia,
        invoices: [
          {
            invoice: faktura({ id: "t", type: "debit_note", invoice_number: "TP2026002" }),
            items: [polozka()],
          },
        ],
      },
      "73-tarchopis-bez-25a",
    );
    const [f] = vydaneSpat(x);
    expect(f.druh).toBe("debit_note");
    expect(f.pohoda.oprava_25a).toBeUndefined();
  });
});

describe("spätný chod — pokladničný príjem", () => {
  it("príjmový pokladničný doklad sa vráti do pokladne (cash_entries príjem), výdavok ostáva bločkom", () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      nastavenia,
      pohyby: [
        {
          id: "c1",
          entry_date: "2026-10-04",
          type: "prijem",
          amount: 200,
          description: "Vklad",
          entry_number: "PPD1",
        },
        {
          id: "c2",
          entry_date: "2026-10-05",
          type: "vydaj",
          amount: -35.4,
          description: "Poštovné",
          entry_number: "VPD1",
        },
      ],
    } as any);
    const doc = parser.parse(x);
    const prijmy = pohodaPokladnaPrijmy(doc);
    expect(prijmy).toEqual([
      { cislo: null, datum: "2026-10-04", suma: 200, popis: "PPD1 — Vklad", poznamka: null },
    ]);
    expect(prijateSpat(x).map((z) => z.spolu)).toEqual([35.4]);
    // Opakovaný import ten istý príjem spozná.
    expect(klucPrijmu(prijmy[0]!)).toBe(
      klucPrijmu({ datum: "2026-10-04", suma: 200, popis: "PPD1 — Vklad" }),
    );
  });
});

describe("spätný chod — XML inej krajiny", () => {
  const czXml = () =>
    buildPohodaInvoiceXml({
      company: firmaCZ,
      nastavenia: nastavenieCZ,
      invoices: [
        {
          invoice: faktura({
            id: "cz-f",
            invoice_number: "FV2026001",
            currency: "CZK",
            customer_country: "CZ",
            customer_ic_dph: null,
            subtotal: 100,
            vat_total: 21,
            total: 121,
          }),
          items: [polozka({ vat_rate: 21, vat_amount: 21, total: 121 })],
        },
      ],
    });
  const skXml = () =>
    buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });

  it("české XML do slovenskej firmy sa odmietne (koruny by sa zapísali ako eurá)", () => {
    expect(nesuladKrajinyPohody(czXml(), "SK")).toContain("českej Pohody");
    expect(nesuladKrajinyPohody(czXml(), "CZ")).toBeNull();
  });

  it("slovenské XML do českej firmy sa odmietne", () => {
    expect(nesuladKrajinyPohody(skXml(), "CZ")).toContain("slovenskej Pohody");
    expect(nesuladKrajinyPohody(skXml(), "SK")).toBeNull();
  });

  it("prijaté CZ doklady aj CZ v EUR sa rozpoznajú, doklad bez stopy sa nezastaví", () => {
    const p = buildPohodaExpensesXml({
      company: firmaCZ,
      nastavenia: nastavenieCZ,
      doklady: [
        prijataAkoDoklad(
          prijata({
            currency: "CZK",
            amount_vat: 21,
            vat_amount: 21,
            amount_total: 121,
            items: [
              { name: "M", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 21, total: 100 },
            ],
          }),
        ),
      ],
    });
    expect(nesuladKrajinyPohody(p, "SK")).not.toBeNull();
    const eur = buildPohodaInvoiceXml({
      company: firmaCZ,
      nastavenia: nastavenieCZ,
      invoices: [
        {
          invoice: faktura({
            id: "e",
            currency: "EUR",
            exchange_rate: 24.3,
            reverse_charge: true,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    expect(nesuladKrajinyPohody(eur, "SK")).not.toBeNull();
    const nula = buildPohodaInvoiceXml({
      company: { ...firmaSK, vat_payer: false },
      nastavenia: { ...nastavenia, predkontacia: null },
      invoices: [
        {
          invoice: faktura({ vat_total: 0, total: 100 }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    // Neplatiteľ bez sadzieb a bez KV — nedá sa povedať, import pokračuje.
    expect(nesuladKrajinyPohody(nula, "CZ")).toBeNull();
  });
});
