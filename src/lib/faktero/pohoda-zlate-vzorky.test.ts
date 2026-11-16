/*
  Zlaté vzorky overené importom do skutočnej POHODY (15.–16. 11. 2026).
  Zmena vzorky = zmena toho, čo ide do Pohody: najprv over importom do kópie
  PALIERY, potom `npx vitest run src/lib/faktero/pohoda-zlate-vzorky.test.ts -u`.

  Každý prípad zapíše presné XML (alebo text konektora) do
  `__pohoda-vzorky__/<názov>` a porovná ho bajt po bajte. Akákoľvek zmena
  v generátoroch exportu do Pohody tak test zhodí a musí sa vedome schváliť.
  Každé XML ide navyše celé proti oficiálnej schéme Stormware (e2e/schemy/
  pohoda/data.xsd, ktorá importuje všetky agendy vrátane list, filter a lqd).

  Čas je pevný (16. 11. 2026) — generátory berú „dnes“ pre sadzby DPH
  skladových kariet, likvidáciu a dátum výpisu.
*/
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Kurz ECB pre účet v cudzej mene — bez siete, pevne.
vi.mock("./kurzy.server", () => ({
  kurzPreDoklad: async (_mena: string, den: string) => ({ kurz: den === "2026-10-05" ? 24.312 : 24.4 }),
}));

import {
  buildPohodaAddressbookXml,
  buildPohodaBankXml,
  buildPohodaCashXml,
  buildPohodaContractsXml,
  buildPohodaDavkaXml,
  buildPohodaExpensesXml,
  buildPohodaInvoiceXml,
  buildPohodaMovementsXml,
  buildPohodaStockXml,
  buildPohodaStornaXml,
  polozkyAutomatickejLikvidacie,
  zoskupPohyby,
} from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { zalohyPrePohodu, type OdpocetZalohy } from "./zalohy-odpocty";
import { pohodaXmlBlockov } from "./blocky-pohoda-xml.server";
import { xmlSplatokDoPohody, type SplatkaPreExport, type ZmluvaPreExport } from "./financovanie-pohoda";
import { likvidaciePreSkupiny, PRAVIDLO_PAROVANIA_ID, type TransakciaBanky } from "./banka-pohoda";
import { bankaPreDavku, xmlVypisuPrePohodu } from "./banka-pohoda.server";
import { pridajZiadost, ziadostCiselnikov } from "./predkontacie";
import { blokPolozky, pridajPolozky, stornoOpravyXml } from "./pohoda-konektor-davka";
import { davkovySubor, httpSkript, nastavenieUlohy, zoznamFiriem } from "./pohoda-konektor.server";

/* ------------------------------------------------------------ pomôcky */

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

/** XML do Pohody: celý balík proti data.xsd a presná zhoda so zlatou vzorkou. */
async function vzorka(nazov: string, xml: string) {
  expect(xml.trim().length).toBeGreaterThan(0);
  expect(xml).toContain("<dat:dataPackItem");
  expect(await chybaXsd(xml)).toBeNull();
  await expect(xml).toMatchFileSnapshot(`./__pohoda-vzorky__/${nazov}.xml`);
}

/** Text konektora (dávkový súbor, PowerShell) — len presná zhoda. */
async function textVzorka(subor: string, text: string) {
  expect(text.trim().length).toBeGreaterThan(0);
  await expect(text).toMatchFileSnapshot(`./__pohoda-vzorky__/${subor}`);
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

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
const firmaCZ: any = { ...firmaSK, ico: "27123456", dic: "CZ27123456", ic_dph: null, country: "CZ" };

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
  stredisko: "BA",
  pokladna: "HP",
  predkontaciaPokladna: "1Pv",
  predkontaciaBanka: "1Bv",
  sklad: "HLAVNY",
  cenovaSkupina: "Predaj",
  blockyPodlaPlatby: true,
};

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
  constant_symbol: "0308",
  specific_symbol: "77",
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
  customer_email: "uctaren@odberatel.sk",
  payment_method: "bank_transfer",
  order_number: "OBJ-55/2026",
  intro_note: "Fakturujeme vám služby za október",
  notes: "Ďakujeme za spoluprácu",
  int_poznamka: "Interná poznámka",
  stredisko: "KE",
  cinnost: "SLUZBY",
  job_id: "job-1",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  ...o,
});

const dobropis = (o: any = {}) =>
  faktura({
    id: "inv-d",
    type: "credit_note",
    invoice_number: "DB2026001",
    subtotal: -100,
    vat_total: -23,
    total: -123,
    ...o,
  });
const polozkaDobropisu = () => polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 });

const mobil = (o: any = {}) =>
  polozka({
    name: "Mobilný telefón",
    unit: "ks",
    quantity: 2,
    unit_price: 50,
    colny_kod: "8517 13 00",
    krajina_povodu: "CN",
    hmotnost_kg: 0.2,
    ...o,
  });

const prijata = (o: any = {}) => ({
  id: "pi-1",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-778",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_street: "Priemyselná 3",
  supplier_city: "Žilina",
  supplier_zip: "01001",
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
  constant_symbol: "0308",
  specific_symbol: null,
  order_number: "NAK-12",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  payment_method: "prevod",
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
  zauctovane_at: "2026-10-07T10:00:00Z",
  items: [{ name: "Materiál", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});
const prijateXml = (doklady: any[], n: any = nastavenia, firma: any = firmaSK) =>
  buildPohodaExpensesXml({ company: firma, nastavenia: n, doklady: doklady.map((d) => prijataAkoDoklad(d) as any) });

/* ------------------------------------------------- vydané faktúry */

describe("zlaté vzorky — vydané faktúry", () => {
  it("faktúra SK: sadzby 23/19/5/0, symboly, objednávka, zákazka, stredisko, činnosť, účet, odkaz na PDF", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      zakazky: { "job-1": "Z2026-01" },
      odkazy: { "inv-1": "https://faktero.sk/api/public/faktura/abc" },
      invoices: [
        {
          invoice: faktura({ subtotal: 400, vat_total: 47, total: 447 }),
          items: [
            polozka(),
            polozka({ name: "Tovar 19 %", quantity: 1, unit_price: 100, vat_rate: 19, vat_amount: 19, total: 119 }),
            polozka({ name: "Kniha 5 %", quantity: 1, unit_price: 100, vat_rate: 5, vat_amount: 5, total: 105 }),
            polozka({ name: "Oslobodené", quantity: 1, unit_price: 100, vat_rate: 0, vat_amount: 0, total: 100 }),
          ],
        },
      ],
    });
    await vzorka("vydana-01-faktura-sk-sadzby", x);
  });

  it("zálohová faktúra: issuedAdvanceInvoice bez predkontácie a členenia", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura({ id: "inv-z", type: "proforma", invoice_number: "ZF2026001" }), items: [polozka()] }],
    });
    await vzorka("vydana-02-zalohova", x);
  });

  it("dobropis s odkazom na odovzdanú pôvodnú faktúru (correctiveDocument) a pôvodným číslom", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      opravovane: { "inv-d": "FA2026001" },
      povodneCisla: { "inv-d": "FA2026001" },
      invoices: [{ invoice: dobropis(), items: [polozkaDobropisu()] }],
    } as any);
    await vzorka("vydana-03-dobropis-s-odkazom", x);
  });

  it("dobropis bez odovzdanej pôvodnej: bez correctiveDocument, pôvodné číslo pre KV ostáva", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      povodneCisla: { "inv-d": "FA2026001" },
      invoices: [{ invoice: dobropis(), items: [polozkaDobropisu()] }],
    } as any);
    await vzorka("vydana-04-dobropis-bez-odkazu", x);
  });

  it("ťarchopis ako vrubopis (issuedDebitNote) a opravný doklad § 25a (zníženie aj vrátenie)", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      povodneCisla: { "inv-t": "FA2026001", "inv-25a": "FA2026001", "inv-25b": "FA2026001" },
      invoices: [
        { invoice: faktura({ id: "inv-t", type: "debit_note", invoice_number: "TP2026001" }), items: [polozka()] },
        {
          invoice: dobropis({ id: "inv-25a", oprava_25a: true, invoice_number: "OD2026001" }),
          items: [polozkaDobropisu()],
        },
        {
          invoice: faktura({ id: "inv-25b", type: "credit_note", oprava_25a: true, invoice_number: "OD2026002" }),
          items: [polozka()],
        },
      ],
    } as any);
    await vzorka("vydana-05-vrubopis-a-oprava-25a", x);
  });

  it("vyúčtovacia faktúra s odpočtom zdanenej zálohy (s odkazom na zálohovú)", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      zalohy: { "inv-v": { cislo: "ZF2026001", zaklad: 50, dph: 11.5, sadzba: 23 } },
      invoices: [{ invoice: faktura({ id: "inv-v", invoice_number: "FA2026002" }), items: [polozka()] }],
    });
    await vzorka("vydana-06-odpocet-zalohy", x);
  });

  it("odpočet zálohy vo viacerých sadzbách (23 % + 0 %, PALIERA FA20260006) a nezdanenej zálohy bez odkazu", async () => {
    const odpocet: OdpocetZalohy[] = [
      {
        zaloha: "ZF20260002",
        zalohaId: "zf-2",
        doklad: "260800003",
        vs: null,
        suma: 3.23,
        riadky: [
          { sadzba: 23, zaklad: 1, dph: 0.23 },
          { sadzba: 0, zaklad: 2, dph: 0 },
        ],
      },
    ];
    const nezdanena = zalohyPrePohodu([{ zaloha: "ZF2026009", doklad: null, vs: null, suma: 61.5, riadky: [] }], undefined, () => false)!;
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      zalohy: { "fa-6": zalohyPrePohodu(odpocet)!, "fa-7": nezdanena },
      invoices: [
        {
          invoice: faktura({ id: "fa-6", invoice_number: "FA20260006", subtotal: 3, vat_total: 0.23, total: 3.23, _odpocty: odpocet }) as any,
          items: [
            polozka({ name: "Tovar", quantity: 1, unit: "ks", unit_price: 1, subtotal: 1, vat_amount: 0.23, total: 1.23 }),
            polozka({ name: "Tovar oslobodený", quantity: 2, unit: "ks", unit_price: 1, vat_rate: 0, subtotal: 2, vat_amount: 0, total: 2 }),
          ] as any,
        },
        { invoice: faktura({ id: "fa-7", invoice_number: "FA20260007" }), items: [polozka()] },
      ],
    });
    await vzorka("vydana-07-odpocet-zalohy-viac-sadzieb", x);
  });

  it("tuzemské prenesenie (PDP stavebné práce, A2SP), zmiešaná faktúra s mobilmi v prenesení (A2MT) a dodanie služby do EÚ", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-pdp-sk",
            invoice_number: "FA2026010",
            reverse_charge: true,
            reverse_charge_type: "domestic_69",
            pdp_druh: "j",
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ name: "Stavebné práce", vat_amount: 0, total: 100 })],
        },
        {
          invoice: faktura({ id: "inv-pdp-mix", invoice_number: "FA2026015", subtotal: 200, vat_total: 23, total: 223 }),
          items: [polozka(), mobil({ prenesenie: true, vat_amount: 0, total: 100 })],
        },
        {
          invoice: faktura({
            id: "inv-pdp-eu",
            invoice_number: "FA2026011",
            reverse_charge: true,
            customer_country: "DE",
            customer_ic_dph: "DE123456789",
            customer_dic: null,
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    await vzorka("vydana-08-prenesenie-pdp-a-eu", x);
  });

  it("OSS služby (SB) — sadzby štátu spotreby ako historické priehradky s percentom", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-oss",
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
    });
    await vzorka("vydana-09-oss-sluzby", x);
  });

  it("OSS tovar (GD) — tovar podľa colného kódu aj podľa eu_plnenie", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-oss-t",
            invoice_number: "FA2026012",
            oss: true,
            oss_country: "AT",
            eu_plnenie: "tovar",
            customer_country: "AT",
            customer_ico: null,
            customer_dic: null,
            customer_ic_dph: null,
            subtotal: 200,
            vat_total: 30,
            total: 230,
          }),
          items: [
            mobil({ vat_rate: 20, vat_amount: 20, total: 120 }),
            polozka({ name: "Obal", unit_price: 50, vat_rate: 10, vat_amount: 10, total: 110 }),
          ],
        },
      ],
    });
    await vzorka("vydana-10-oss-tovar", x);
  });

  it("faktúra v cudzej mene (USD s kurzom)", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-usd",
            currency: "USD",
            exchange_rate: 1.08,
            customer_country: "US",
            customer_ic_dph: null,
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    await vzorka("vydana-11-cudzia-mena", x);
  });

  it("zľava položky v percentách a zľava na celý doklad", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({ id: "inv-zl1", invoice_number: "FA2026013", subtotal: 90, vat_total: 20.7, total: 110.7 }),
          items: [polozka({ discount_percent: 10, subtotal: 90, vat_amount: 20.7, total: 110.7 })],
        },
        {
          invoice: faktura({ id: "inv-zl2", invoice_number: "FA2026014", discount_total: 20, subtotal: 180, vat_total: 41.4, total: 221.4 }),
          items: [
            polozka(),
            polozka({ name: "Školenie", subtotal: 100, vat_amount: 23, total: 123 }),
          ],
        },
      ],
    });
    await vzorka("vydana-12-zlava", x);
  });

  it("colné kódy: tuzemská faktúra (note + intrastat), dodanie tovaru do EÚ, zálohová s KN", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        { invoice: faktura({ id: "f-10", invoice_number: "FA2026020" }), items: [mobil({ description: "Čierny, 128 GB" })] },
        {
          invoice: faktura({
            id: "f-11",
            invoice_number: "FA2026021",
            customer_name: "Kunde GmbH",
            customer_street: "Hauptstraße 1",
            customer_city: "Berlin",
            customer_zip: "10115",
            customer_country: "DE",
            customer_ico: null,
            customer_dic: null,
            customer_ic_dph: "DE123456789",
            reverse_charge: true,
            reverse_charge_type: "eu_b2b",
            eu_plnenie: "tovar",
            vat_total: 0,
            total: 100,
          }),
          items: [mobil({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
        { invoice: faktura({ id: "f-12", type: "proforma", invoice_number: "ZF2026020" }), items: [mobil()] },
      ],
    });
    await vzorka("vydana-13-colne-kody", x);
  });

  it("rozúčtovanie vystavenej faktúry (riadky s vlastnými kódmi, stredisko, činnosť, KV)", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-roz",
            invoice_number: "FA2026030",
            subtotal: 300,
            vat_total: 51,
            total: 351,
            rozuctovanie: [
              { predkontacia: "3Fv", clenenie: "UD", sadzba: 23, zaklad: 150, dph: 34.5, text: "Služby", stredisko: "KE" },
              { predkontacia: "3Fm", clenenie: "UD", sadzba: 23, zaklad: 50, dph: 11.5, kv: "A1", cinnost: "MAT" },
              { predkontacia: "3Fv", clenenie: null, sadzba: 5, zaklad: 100, dph: 5 },
            ],
          }),
          items: [
            polozka({ id: "i1" }),
            polozka({ id: "i2", name: "Materiál", quantity: 1, unit_price: 100 }),
            polozka({ id: "i3", name: "Kniha", quantity: 1, unit_price: 100, vat_rate: 5, vat_amount: 5, total: 105 }),
          ],
        },
      ],
    });
    await vzorka("vydana-14-rozuctovanie", x);
  });

  it("daňový doklad k prijatej platbe ide ako interný doklad", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura({ id: "inv-dp", type: "advance_payment", invoice_number: "DP2026001" }), items: [polozka()] }],
    });
    await vzorka("vydana-15-danovy-doklad-k-platbe", x);
  });

  it("CZ firma: sadzby 21/12 a opravný daňový doklad so znamienkom", async () => {
    const x = buildPohodaInvoiceXml({
      company: firmaCZ,
      nastavenia: { ...nastavenia, banka: "KB" },
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
          invoice: dobropis({ id: "cz-d", invoice_number: "OD2026001", currency: "CZK", customer_country: "CZ", customer_ic_dph: null, vat_total: -21, total: -121 }),
          items: [polozka({ quantity: -2, vat_rate: 21, subtotal: -100, vat_amount: -21, total: -121 })],
        },
      ],
    });
    await vzorka("vydana-16-cz-firma", x);
  });
});

/* -------------------------------------------------- prijaté doklady */

/* Samozdanenie — model podľa PALIERY v POHODE SK 14404.8 (export-pohoda-samozdanenie.test.ts). */
const paliera: any = {
  id: "c-paliera",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  dic: "2121712345",
  ic_dph: "SK2121712345",
  vat_payer: true,
  country: "SK",
};
const nastSam: any = {
  predkontaciaPrijata: "1",
  clenenieDphPrijata: "PD",
  predkontaciaSamozdanenieDan: "aInt",
  predkontaciaSamozdanenieOdpocet: "bInt",
  radSamozdanenie: "26sam",
};
const zakladSam = {
  company_id: "c-paliera",
  type: "regular",
  status: "booked",
  issue_date: "2026-10-31",
  delivery_date: "2026-10-31",
  received_date: "2026-11-05",
  due_date: "2026-11-14",
  currency: "EUR",
  payment_method: "prevod",
  odpocet: true,
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
};
const tuzemske = {
  ...zakladSam,
  id: "5a0e0001-0000-4000-8000-000000000001",
  invoice_number: "S2610057",
  variable_symbol: "2610057",
  supplier_name: "JD Stav s.r.o.",
  supplier_ico: "51234567",
  supplier_dic: "2120654321",
  supplier_ic_dph: "SK2120654321",
  supplier_street: "Hlavná 12",
  supplier_city: "Žilina",
  supplier_zip: "01001",
  supplier_country: "SK",
  amount_without_vat: 417,
  vat_amount: 0,
  amount_total: 417,
  reverse_charge: true,
  dph_rezim: "samozdanenie",
  items: [{ name: "Stavebné práce — murovanie", quantity: 1, unit: "ks", unit_price: 417, vat_rate: 23, total: 417 }],
};
const sluzbaIE = {
  ...zakladSam,
  id: "5a0e0001-0000-4000-8000-000000000002",
  invoice_number: "S5268411923",
  variable_symbol: "5268411923",
  supplier_name: "Google Ireland Limited",
  supplier_ic_dph: "IE6388047V",
  supplier_street: "Gordon House, Barrow Street",
  supplier_city: "Dublin 4",
  supplier_zip: "D04 E5W5",
  supplier_country: "IE",
  amount_without_vat: 125.4,
  vat_amount: 0,
  amount_total: 125.4,
  dph_rezim: "samozdanenie",
  items: [{ name: "Google Workspace — október 2026", quantity: 1, unit_price: 125.4, vat_rate: 0, total: 125.4 }],
};
const sluzbaUS = {
  ...zakladSam,
  id: "5a0e0001-0000-4000-8000-000000000003",
  invoice_number: "S-INV-77812",
  variable_symbol: "77812",
  supplier_name: "Anthropic, PBC",
  supplier_street: "548 Market Street",
  supplier_city: "San Francisco",
  supplier_zip: "94104",
  supplier_country: "US",
  currency: "USD",
  exchange_rate: 1.1612,
  amount_without_vat: 200,
  vat_amount: 0,
  amount_total: 200,
  dph_rezim: "samozdanenie",
  items: [{ name: "Claude Team — predplatné", quantity: 2, unit_price: 100, vat_rate: 0, total: 200 }],
};
const tovarDE = {
  ...zakladSam,
  id: "5a0e0001-0000-4000-8000-000000000004",
  invoice_number: "S-RE-2026-4411",
  variable_symbol: "20264411",
  supplier_name: "Würth Handelsgesellschaft mbH",
  supplier_ic_dph: "DE146283481",
  supplier_street: "Reinhold-Würth-Straße 12",
  supplier_city: "Künzelsau",
  supplier_zip: "74653",
  supplier_country: "DE",
  amount_without_vat: 864.2,
  vat_amount: 0,
  amount_total: 864.2,
  dph_rezim: "nadobudnutie",
  items: [
    { name: "Kotvy chemické", quantity: 20, unit: "ks", unit_price: 21.5, vat_rate: 0, total: 430 },
    // 14 × 31,0143 ≠ 434,20 na cent → položka ide ako 1 × základ, množstvo v texte.
    { name: "Vrtáky SDS", quantity: 14, unit: "ks", unit_price: 31.0143, vat_rate: 0, total: 434.2 },
  ],
};
const bezNaroku = {
  ...tuzemske,
  id: "5a0e0001-0000-4000-8000-000000000005",
  invoice_number: "S2610099",
  variable_symbol: "2610099",
  amount_without_vat: 250,
  amount_total: 250,
  odpocet: false,
  items: [{ name: "Stavebné práce — rekreačné zariadenie", quantity: 1, unit_price: 250, vat_rate: 23, total: 250 }],
};
const zmiesana = {
  ...zakladSam,
  id: "5a0e0001-0000-4000-8000-000000000006",
  invoice_number: "S261100051",
  variable_symbol: "261100051",
  supplier_name: "Stavmat Žilina s.r.o.",
  supplier_ico: "36412345",
  supplier_dic: "2021712345",
  supplier_ic_dph: "SK2021712345",
  supplier_country: "SK",
  amount_without_vat: 1500,
  vat_amount: 115,
  amount_total: 1615,
  items: [
    { name: "Materiál", quantity: 1, unit_price: 500, vat_rate: 23, total: 500 },
    { name: "Stavebné práce (PDP)", quantity: 1, unit_price: 1000, vat_rate: 23, total: 1000, pdp: true },
  ],
};

describe("zlaté vzorky — prijaté doklady", () => {
  it("prijatá faktúra SK: číslo dodávateľa, symboly, dátum dodania a odpočtu, účet dodávateľa", async () => {
    await vzorka("prijata-01-faktura-sk", prijateXml([prijata()]));
  });

  it("prijatý dobropis s pôvodným číslom opravovanej faktúry", async () => {
    const x = prijateXml([
      prijata({
        id: "pi-d",
        invoice_number: "D-2026-5",
        opravuje_cislo: "2026-778",
        amount_without_vat: -100,
        vat_amount: -23,
        amount_total: -123,
        items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 23, total: -100 }],
      }),
    ]);
    await vzorka("prijata-02-dobropis", x);
  });

  it("samozdanenie — tuzemské prenesenie § 69 ods. 12 (faktúra + Priznanie DPH + Odpočet DPH)", async () => {
    await vzorka("prijata-03-samozdanenie-tuzemske-69-12", prijateXml([tuzemske], nastSam, paliera));
  });

  it("samozdanenie — služba z EÚ (Írsko, § 69 ods. 3)", async () => {
    await vzorka("prijata-04-samozdanenie-sluzba-eu", prijateXml([sluzbaIE], nastSam, paliera));
  });

  it("samozdanenie — služba z USA v USD s kurzom (cudzia mena)", async () => {
    await vzorka("prijata-05-samozdanenie-sluzba-usa-usd", prijateXml([sluzbaUS], nastSam, paliera));
  });

  it("samozdanenie — nadobudnutie tovaru z EÚ, položka s nesediacou cenou ide ako 1 × základ", async () => {
    await vzorka("prijata-06-samozdanenie-tovar-eu", prijateXml([tovarDE], nastSam, paliera));
  });

  it("samozdanenie bez nároku na odpočet — len Priznanie DPH", async () => {
    await vzorka("prijata-07-samozdanenie-bez-naroku", prijateXml([bezNaroku], nastSam, paliera));
  });

  it("zmiešaná faktúra: materiál s DPH + stavebné práce v prenesení", async () => {
    await vzorka("prijata-08-zmiesana-pdp", prijateXml([zmiesana], nastSam, paliera));
  });

  it("rozúčtovanie prijatej faktúry po sadzbách 23/19/5 s vlastnými kódmi a KV", async () => {
    const x = prijateXml([
      prijata({
        id: "pi-roz",
        amount_without_vat: 170,
        vat_amount: 33.5,
        amount_total: 203.5,
        items: [
          { name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 },
          { name: "Potraviny", quantity: 1, unit_price: 50, vat_rate: 19, total: 50 },
          { name: "Knihy", quantity: 1, unit_price: 20, vat_rate: 5, total: 20 },
        ],
        rozuctovanie: [
          { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 60, dph: 13.8, text: "Kancelária" },
          { predkontacia: "1Rep", clenenie: "PD", sadzba: 23, zaklad: 40, dph: 9.2, text: "Reprezentácia", kv: "B2" },
          { predkontacia: "1Fp", clenenie: "PD", sadzba: 19, zaklad: 50, dph: 9.5 },
          { predkontacia: "1Fp", clenenie: "PD", sadzba: 5, zaklad: 20, dph: 1 },
        ],
      }),
    ]);
    await vzorka("prijata-09-rozuctovanie", x);
  });

  it("prijatá faktúra s odpočtom nezdanenej zálohy (JŠ servis) — k úhrade len rozdiel", async () => {
    const x = prijateXml([
      prijata({
        id: "pi-zal",
        invoice_number: "202652141",
        supplier_name: "JŠ servis s.r.o.",
        supplier_ico: "34152181",
        issue_date: "2026-11-02",
        delivery_date: "2026-11-02",
        received_date: "2026-11-03",
        due_date: "2026-11-16",
        variable_symbol: "202652141",
        amount_without_vat: 1026.95,
        vat_amount: 236.2,
        amount_total: 1263.15,
        advance_amount: 900,
        zauctovane_at: "2026-11-04T10:00:00Z",
        vat_breakdown: [{ sadzba: 23, zaklad: 1026.95, dph: 236.2 }],
        items: undefined,
      }),
    ]);
    await vzorka("prijata-10-odpocet-zalohy", x);
  });

  it("prijatá faktúra v cudzej mene (USD s kurzom)", async () => {
    await vzorka("prijata-11-cudzia-mena", prijateXml([prijata({ id: "pi-usd", currency: "USD", exchange_rate: 1.1, items: [] })]));
  });

  it("prijatá zálohová (receivedAdvanceInvoice) a samofaktúra", async () => {
    const x = prijateXml(
      [
        prijata({
          id: "pz-1",
          type: "proforma",
          invoice_number: "26ZF-00035",
          variable_symbol: "2600035",
          amount_without_vat: 0,
          vat_amount: 0,
          amount_total: 2566.7,
          pohoda_predkontacia: null,
          pohoda_clenenie_dph: null,
          zauctovane_at: null,
          items: [{ name: "Záloha na dodávku", quantity: 1, unit_price: 2566.7, total: 2566.7 }],
        }),
        prijata({
          id: "pi-sf",
          invoice_number: "SF2026001",
          samofakturacia: true,
          items: [{ name: "Výkup", quantity: 1, unit_price: 100, vat_rate: 23 }],
        }),
      ],
      { ...nastavenia, radPrijate: "PF", kvPrijata: "B2" },
    );
    await vzorka("prijata-12-zalohova-a-samofaktura", x);
  });

  it("prijatá faktúra bez nároku na odpočet (poznámka)", async () => {
    await vzorka("prijata-13-bez-naroku", prijateXml([prijata({ id: "pi-bn", odpocet: false })]));
  });

  it("CZ firma: prijatá faktúra (dateKHDPH) a prijatý opravný doklad so znamienkom", async () => {
    const x = prijateXml(
      [
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
      ],
      nastavenia,
      firmaCZ,
    );
    await vzorka("prijata-14-cz-firma", x);
  });

  it("prijatý daňový doklad k prijatej platbe: interný doklad s PD a KV B2, odpočet podľa prijatia", async () => {
    /*
      Doklad od dodávateľa k našej zaplatenej zálohe (purchase_invoices.type
      advance_payment): DUZP = deň platby 8. 10., doklad prišiel 12. 10. →
      dateTax a dateKVDPH 12. 10. Vlastná predkontácia „343/314“ (DPH zo
      zálohy), členenie PD z nastavení firmy, KV B2 automaticky. Bez
      splatnosti, účtu dodávateľa a odpočtu zálohy — záloha je zaplatená.
    */
    const x = prijateXml([
      prijata({
        id: "pi-ddp",
        type: "advance_payment",
        status: "paid",
        invoice_number: "DD2026015",
        variable_symbol: "2026015",
        constant_symbol: null,
        order_number: null,
        issue_date: "2026-10-09",
        delivery_date: "2026-10-08",
        received_date: "2026-10-12",
        payment_date: "2026-10-08",
        due_date: "2026-10-09",
        advance_invoice_id: "pi-zf",
        pohoda_predkontacia: "343/314",
        pohoda_clenenie_dph: null,
        items: null,
        vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
      }),
    ]);
    await vzorka("prijata-15-danovy-doklad-k-platbe", x);
  });
});

/* ------------------------------------------------------------ bločky */

/* Bloček z Kauflandu: dve sadzby, položky v cenách s DPH (pohoda-blocek-zavazok-polozky.test.ts). */
const kaufland: any = {
  id: "bl-1",
  supplier_name: "Kaufland Slovenská republika v.o.s.",
  supplier_ico: "35790164",
  supplier_ic_dph: "SK2020234216",
  supplier_city: "Bratislava",
  supplier_street: "Trnavská cesta 41/A",
  supplier_zip: "83104",
  document_number: "0123-45",
  issue_date: "2026-10-20",
  created_at: "2026-10-21T08:00:00Z",
  currency: "EUR",
  payment_method: "karta",
  total_amount: 29.36,
  vat_amount: 5.36,
  net_amount: 24,
  vat_breakdown: [
    { sadzba: 23, zaklad: 20, dph: 4.6 },
    { sadzba: 19, zaklad: 4, dph: 0.76 },
  ],
  items: [
    { name: "Čistiaci prostriedok", quantity: 2, unit_price: 6.15, total: 12.3, vat_rate: 23 },
    { name: "Papier A4", quantity: 1, unit_price: 12.3, total: 12.3, vat_rate: 23 },
    { name: "Káva", quantity: 1, unit_price: 4.76, total: 4.76, vat_rate: 19 },
  ],
  pohoda_predkontacia: "1Pv",
  pohoda_clenenie_dph: "PD",
};
const podlaPlatby: any = { blockyPodlaPlatby: true, pokladna: "HP", radInterne: "26ID", radDoklady: "26FPB" };

/* Bloček so zaokrúhlením −0,02 € (12,30 → 12,28), ako ho uloží čítanie z fotky. */
const blocekZaokruhleny: any = {
  id: "b-zaok",
  company_id: "c1",
  supplier_name: "Potraviny Jednota",
  supplier_ico: "31411801",
  document_number: "0042",
  issue_date: "2026-10-28",
  currency: "EUR",
  payment_method: "hotovost",
  total_amount: 12.28,
  net_amount: 10,
  vat_amount: 2.3,
  vat_rate: 23,
  vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
  items: [
    { name: "Káva zrnková", quantity: 1, unit_price: 8.61, vat_rate: 23, total: 8.61 },
    { name: "Mlieko", quantity: 3, unit_price: 1.23, vat_rate: 23, total: 3.69 },
    { name: "Zaokrúhlenie", quantity: 1, unit_price: -0.02, total: -0.02, zaokruhlenie: true },
  ],
  pohoda_predkontacia: "5PHM",
  pohoda_clenenie_dph: "PD",
};

describe("zlaté vzorky — bločky", () => {
  it("hotovosť → pokladňa s položkami v dvoch sadzbách (23 % a 19 %)", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [{ ...kaufland, id: "bl-h", payment_method: "hotovost" }],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    await vzorka("blocek-01-hotovost-pokladna-polozky", x);
  });

  it("hotovosť → pokladňa bez položiek (súhrn po sadzbách)", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [{ ...kaufland, id: "bl-hs", payment_method: "hotovost" }],
      nastavenia: podlaPlatby,
    });
    await vzorka("blocek-02-hotovost-pokladna-suhrn", x);
  });

  it("hotovosť so zaokrúhlením: položka „Centové zaokrúhlenie“ bez DPH (s položkami aj bez nich)", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [blocekZaokruhleny, { ...blocekZaokruhleny, id: "b-zaok-2", document_number: "0043" }],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    await vzorka("blocek-03-zaokruhlenie", x);
    const bez = buildPohodaExpensesXml({ company: firmaSK, doklady: [blocekZaokruhleny], nastavenia: podlaPlatby });
    await vzorka("blocek-04-zaokruhlenie-bez-poloziek", bez);
  });

  it("karta → Ostatné záväzky (commitment) s položkami", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [kaufland],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    await vzorka("blocek-05-karta-ostatne-zavazky", x);
  });

  it("prevod → prijatá faktúra", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [{ ...kaufland, id: "bl-p", payment_method: "prevod" }],
      nastavenia: podlaPlatby,
    });
    await vzorka("blocek-06-prevod-prijata-faktura", x);
  });

  it("vyúčtovanie výdavkov zamestnanca → interný doklad", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      doklady: [{ ...kaufland, id: "bl-v", vyuctovanie_id: "v1" }],
      nastavenia: podlaPlatby,
    });
    await vzorka("blocek-07-vyuctovanie-interny-doklad", x);
  });

  it("rozúčtovaný bloček (kartou aj hotovosťou), tri sadzby 23/19/5", async () => {
    const rozuctovanie = [
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 23, zaklad: 60, dph: 13.8, text: "Kancelária" },
      { predkontacia: "1Rep", clenenie: "PD", sadzba: 23, zaklad: 40, dph: 9.2, text: "Reprezentácia", kv: "B2" },
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 19, zaklad: 50, dph: 9.5 },
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 5, zaklad: 20, dph: 1 },
    ];
    const blocek = (o: any) => ({
      id: "exp-1",
      supplier_name: "Potraviny s.r.o.",
      supplier_ico: "31111111",
      supplier_ic_dph: "SK2020000001",
      document_number: "O-123",
      issue_date: "2026-10-04",
      currency: "EUR",
      total_amount: 203.5,
      vat_breakdown: [
        { sadzba: 23, zaklad: 100, dph: 23 },
        { sadzba: 19, zaklad: 50, dph: 9.5 },
        { sadzba: 5, zaklad: 20, dph: 1 },
      ],
      category: "kancelaria",
      status: "processed",
      rozuctovanie,
      ...o,
    });
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia: { ...nastavenia, predkontaciaDoklady: "1Bl", clenenieDphDoklady: "PD" },
      doklady: [blocek({ payment_method: "karta" }), blocek({ id: "exp-2", document_number: "O-124", payment_method: "hotovost" })],
    });
    await vzorka("blocek-08-rozuctovanie", x);
  });

  it("PHM pri vozidle s pomerným odpočtom 50 % (rozúčtované na dve položky)", async () => {
    const { subory } = pohodaXmlBlockov({
      oznacit: false,
      datumZauctovania: null,
      obdobie: "2026-10",
      firma: { ico: "56607016", default_currency: "EUR", country: "SK" },
      rows: [
        {
          id: "b1",
          document_number: "11665",
          supplier_name: "OMV Slovensko, s.r.o.",
          supplier_ico: "31322832",
          supplier_ic_dph: "SK2020372640",
          issue_date: "2026-10-26",
          net_amount: 40.65,
          vat_amount: 9.35,
          total_amount: 50,
          vat_rate: 23,
          currency: "EUR",
          payment_method: "karta",
          vat_breakdown: [{ sadzba: 23, zaklad: 40.65, dph: 9.35 }],
          vehicle_id: "v1",
        },
      ],
      nastavenia: {
        predkontaciaDoklady: "5PHM",
        clenenieDphDoklady: "PD",
        odpocetVozidiel: {
          v1: { podiel: 50, nazov: "Auto (AA 000AA)", predkontaciaBezOdpoctu: "5PHMN", clenenieBezOdpoctu: "PN" },
        },
      },
    });
    expect(subory).toHaveLength(1);
    await vzorka("blocek-09-phm-pomer-odpoctu", subory[0]!.xml);
  });
});

/* ---------------------------------------------------------- pokladňa */

describe("zlaté vzorky — pokladňa (cash_entries)", () => {
  it("príjem a výdaj v pokladni (nezahŕňať do DPH)", async () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      nastavenia,
      pohyby: [
        { id: "c-1", type: "prijem", amount: 200, entry_date: "2026-10-01", entry_number: "PPD1", description: "Vklad" },
        { id: "c-2", type: "vydaj", amount: -15.2, entry_date: "2026-10-02", entry_number: "VPD1", description: "Známky" },
      ],
    });
    await vzorka("pokladna-01-prijem-vydaj", x);
  });

  it("viac pokladní: skratka podľa pokladne pohybu, valutová pokladňa v CZK", async () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      nastavenia: {
        ...nastavenia,
        pokladna: "HP",
        pokladneKody: { "p-eur": "HP", "p-czk": "HPCZ" },
        pokladneMeny: { "p-eur": "EUR", "p-czk": "CZK", "p-bez": "EUR" },
      },
      pohyby: [
        { id: "c-1", type: "prijem", amount: 100, entry_date: "2026-10-01", entry_number: "PD1", description: "Vklad EUR", pokladna_id: "p-eur" },
        { id: "c-2", type: "prijem", amount: 5000, entry_date: "2026-10-01", entry_number: "PD2", description: "Vklad CZK", pokladna_id: "p-czk" },
        { id: "c-3", type: "vydaj", amount: 12, entry_date: "2026-10-02", entry_number: "PD3", description: "Známky", pokladna_id: "p-bez" },
        { id: "c-4", type: "vydaj", amount: 3, entry_date: "2026-10-03", entry_number: "PD4", description: "Parkovné" },
      ],
    });
    await vzorka("pokladna-02-viac-pokladni", x);
  });
});

/* ------------------------------------------------------------- banka */

const FIRMA = "c0000000-0000-0000-0000-000000000001";
const firmaBanka: any = {
  id: FIRMA,
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
  pohoda_posielat_banku: true,
  pohoda_banka: "TB",
  pohoda_predkontacia_banka: "1Bank",
  pohoda_predkontacie_oznaceni: { poplatok: "BPopl" },
};
const UCET_TB = { id: "a0000000-0000-0000-0000-00000000000a", iban: "SK31 1100 0000 0029 4502 4401", currency: "EUR", account_name: "Tatra" };
const UCET_CZK = { id: "c0000000-0000-0000-0000-00000000000c", iban: "SK12 1100 0000 0029 9999 0001", currency: "CZK", account_name: "Koruny" };
const SKRATKY = [
  { iban: "SK3111000000002945024401", pohoda_skratka: "TB" },
  { iban: "SK12 1100 0000 0029 9999 0001", pohoda_skratka: "TBCZK" },
];
const pravidla = [{ id: "r1", aktivne: true, druh: "banka", smer: "vydaj", dodavatel_text: "Orange", predkontacia: "5Tel", poradie: 1 }];
const tx = (n: number, ucet: string, datum: string, suma: number, extra: Partial<TransakciaBanky> = {}): TransakciaBanky => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  bank_account_id: ucet,
  booking_date: datum,
  amount: suma,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  counterparty_iban: null,
  description: null,
  created_at: `${datum}T10:00:00Z`,
  exported_at: null,
  ...extra,
});
const TXS: TransakciaBanky[] = [
  tx(1, UCET_TB.id, "2026-10-03", 123, {
    variable_symbol: "20260001",
    counterparty: "Odberateľ s.r.o.",
    counterparty_iban: "SK6807200002891987426353",
    description: "Úhrada faktúry /VS20260001/SS77/KS0308",
  }),
  tx(2, UCET_TB.id, "2026-10-03", -2.5, { description: "Poplatok za vedenie účtu" }),
  tx(3, UCET_TB.id, "2026-10-07", -45.9, { counterparty: "Orange Slovensko", description: "Faktúra za telefón · IBAN DE89370400440532013000" }),
  tx(4, UCET_TB.id, "2026-10-31", 10, { description: "Vklad" }),
];

/** Falošná databáza pre `bankaPreDavku` (rovnaká ako v banka-pohoda.test.ts). */
function databaza(tabulky: Record<string, Record<string, any>[]>) {
  const from = (t: string) => {
    const filtre: ((r: Record<string, any>) => boolean)[] = [];
    let rozsah: [number, number] | null = null;
    const poradie: string[] = [];
    let hlava = false;
    const q: any = {
      select: (_s?: string, o?: { head?: boolean }) => ((hlava = !!o?.head), q),
      eq: (k: string, v: any) => (filtre.push((r) => String(r[k]) === String(v)), q),
      in: (k: string, v: any[]) => (filtre.push((r) => v.map(String).includes(String(r[k]))), q),
      is: (k: string, v: null) => (filtre.push((r) => r[k] == v), q),
      not: (k: string, _o: string, _v: null) => (filtre.push((r) => r[k] != null), q),
      gte: (k: string, v: any) => (filtre.push((r) => String(r[k]) >= String(v)), q),
      lte: (k: string, v: any) => (filtre.push((r) => String(r[k]) <= String(v)), q),
      lt: (k: string, v: any) => (filtre.push((r) => String(r[k]) < String(v)), q),
      order: (k: string) => (poradie.push(k), q),
      range: (a: number, b: number) => ((rozsah = [a, b]), q),
      then: (ok: any, zle: any) => Promise.resolve(vykonaj()).then(ok, zle),
    };
    function vykonaj() {
      let out = (tabulky[t] ?? []).filter((r) => filtre.every((f) => f(r))).map((r) => ({ ...r }));
      out.sort((a, b) => {
        for (const k of poradie) {
          const c = String(a[k]).localeCompare(String(b[k]));
          if (c) return c;
        }
        return 0;
      });
      if (rozsah) out = out.slice(rozsah[0], rozsah[1] + 1);
      return { data: hlava ? null : out, error: null, count: out.length };
    }
    return q;
  };
  return { from };
}
const db = (txs: TransakciaBanky[]) =>
  databaza({
    bank_accounts: [UCET_TB, UCET_CZK].map((u) => ({ ...u, company_id: FIRMA })),
    company_bank_accounts: SKRATKY.map((s) => ({ ...s, company_id: FIRMA })),
    bank_transactions: txs.map((t) => ({ ...t, company_id: FIRMA })),
    pravidla_uctovania: pravidla.map((p) => ({ ...p, company_id: FIRMA })),
  });
const DNES = new Date("2026-11-16T08:00:00Z");

describe("zlaté vzorky — banka", () => {
  it("bankový výpis priamo z pohybov: účet, číslo výpisu, symboly, protiúčet, poplatok", async () => {
    const x = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      cisloVypisu: "10",
      datumVypisu: "2026-10-31",
      pohyby: [
        {
          datum: "2026-10-12",
          suma: 123,
          smer: "prijem",
          popis: "Úhrada FA2026001",
          protistrana: "Odberateľ a.s.",
          protiucet: "SK3112000000198742637541",
          vs: "2026001",
          ks: "0308",
        },
        { datum: "2026-10-15", suma: 2.5, smer: "vydaj", popis: "Poplatok", oznacenie: "poplatok" as any },
      ],
    });
    await vzorka("banka-01-vypis-z-pohybov", x);
  });

  it("ručné „XML pre POHODU“ za mesiac (EUR, pravidlo, označenie poplatku, KS/ŠS z textu, zahraničný IBAN)", async () => {
    const x = await xmlVypisuPrePohodu({ company: firmaBanka, ucet: UCET_TB, txs: TXS, pravidla, banka: "TB", periodEnd: "2026-10-31" });
    await vzorka("banka-02-rucne-xml-eur", x);
  });

  it("ručné „XML pre POHODU“ účtu v CZK s kurzom ECB ku dňu", async () => {
    const txs = [
      tx(21, UCET_CZK.id, "2026-10-05", 1000, { currency: "CZK" }),
      tx(22, UCET_CZK.id, "2026-10-06", -300, { currency: "CZK" }),
    ];
    const x = await xmlVypisuPrePohodu({ company: firmaBanka, ucet: UCET_CZK, txs, pravidla: [], banka: "TBCZK", periodEnd: "2026-10-31" });
    await vzorka("banka-03-rucne-xml-czk", x);
  });

  it("dávka konektora: banka pokračuje v numberMovement za odovzdaným pohybom, za ňou automatická likvidácia (lqd) a storno", async () => {
    const t = TXS.map((x, i) => (i === 1 ? { ...x, exported_at: "2026-11-01T00:00:00Z" } : x));
    const r = await bankaPreDavku(db(t) as any, { company: firmaBanka, od: "2026-10-01", dnes: DNES });
    const x = buildPohodaDavkaXml({
      likvidacia: polozkyAutomatickejLikvidacie(likvidaciePreSkupiny(r.skupiny, "2026-11-16"), PRAVIDLO_PAROVANIA_ID),
      company: firmaBanka,
      invoices: [
        {
          invoice: {
            id: "11111111-1111-1111-1111-111111111111",
            invoice_number: "20260001",
            type: "regular",
            issue_date: "2026-10-03",
            delivery_date: "2026-10-03",
            due_date: "2026-10-17",
            currency: "EUR",
            subtotal: 100,
            vat_total: 23,
            total: 123,
            customer_name: "Odberateľ s.r.o.",
          } as any,
          items: [{ name: "Práca", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 }] as any,
        },
      ],
      doklady: [],
      pohyby: [{ id: "44444444-4444-4444-4444-444444444444", entry_number: "P1", entry_date: "2026-10-05", type: "prijem", amount: 20, description: "Tržba" }],
      storna: [{ id: "33333333-3333-3333-3333-333333333333", cislo: "260148" }],
      nastavenia: { pokladna: "HP" } as any,
      banka: r.entries,
    });
    await vzorka("banka-04-davka-likvidacia-pokracovanie", x);
  });
});

/* ------------------------------------------------- splátkové kalendáre */

const leasing: ZmluvaPreExport = {
  id: "z1",
  kind: "leasing",
  name: "Škoda Octavia",
  provider_name: "ČSOB Leasing, a.s.",
  contract_number: "UZF/26/80613",
  variable_symbol: "2680613",
  currency: "EUR",
  vat_rate: 0,
  term_months: 60,
  pohoda_predkontacia: "1Lz",
  pohoda_clenenie_dph: "PN",
  kv_clenenie: "X",
};
const s1: SplatkaPreExport = {
  id: "s1",
  number: 1,
  due_date: "2026-11-15",
  amount: 512.4,
  principal_part: 430.1,
  interest_part: 62.3,
  vat_amount: 0,
  insurance_part: 20,
};

describe("zlaté vzorky — leasingy a úvery (Ostatné záväzky)", () => {
  it("finančný leasing: dve splátky rozpadnuté na istinu, úrok a poistenie, vlastné KV splátky", async () => {
    const s2 = { ...s1, id: "s2", number: 2, due_date: "2026-12-15", pohoda_predkontacia: "1Lu", kv_clenenie: "B2" };
    const r = xmlSplatokDoPohody({ ico: "36123456", krajinaFirmy: "SK", zmluva: leasing, splatky: [s2, s1] });
    expect(r.pocet).toBe(2);
    await vzorka("splatky-01-leasing", r.xml);
  });

  it("operatívny leasing s DPH 23 %", async () => {
    const r = xmlSplatokDoPohody({
      ico: "36123456",
      krajinaFirmy: "SK",
      zmluva: { ...leasing, vat_rate: 23, pohoda_clenenie_dph: "PD", kv_clenenie: "B2" },
      splatky: [{ ...s1, amount: 615, principal_part: 450, interest_part: 50, vat_amount: 115, insurance_part: 0 }],
    });
    expect(r.pocet).toBe(1);
    await vzorka("splatky-02-operativny-leasing-dph", r.xml);
  });

  it("rozúčtovanie splátky po zložkách (istina, úrok, poistenie, poplatky)", async () => {
    const r = xmlSplatokDoPohody({
      ico: "36123456",
      krajinaFirmy: "SK",
      zmluva: {
        ...leasing,
        pohoda_rozuctovanie: {
          istina: { predkontacia: "1Li" },
          urok: { predkontacia: "1Lu", clenenie: "PN" },
          poistenie: { predkontacia: "1Lp", clenenie: "PN" },
        },
      } as any,
      splatky: [{ ...s1, amount: 515.4 }],
    });
    expect(r.pocet).toBe(1);
    await vzorka("splatky-03-rozuctovanie", r.xml);
  });

  it("úver českej firmy v CZK (bez KV, dateKHDPH)", async () => {
    const r = xmlSplatokDoPohody({
      ico: "27123456",
      krajinaFirmy: "CZ",
      zmluva: { ...leasing, kind: "uver", currency: "CZK", kv_clenenie: "B2" } as any,
      splatky: [s1],
    });
    expect(r.pocet).toBe(1);
    await vzorka("splatky-04-cz-uver", r.xml);
  });
});

/* ---------------------------------------- adresár, sklad, zákazky, storno */

describe("zlaté vzorky — adresár, sklad, zákazky, storno", () => {
  const zakaznici = [
    {
      id: "cu-1",
      name: "Odberateľ a.s.",
      contact_person: "Ján Novák",
      street: "Obchodná 5",
      city: "Bratislava",
      zip: "81106",
      country: "SK",
      ico: "35999888",
      dic: "2021999888",
      ic_dph: "SK2021999888",
      email: "a@b.sk",
      phone: "+421900000000",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ];
  const zasoby = [
    {
      id: "st-1",
      nazov: "Papier A4",
      name: "Papier A4",
      sku: "PAP-A4",
      barcode: "8591234567890",
      unit: "bal",
      vat_rate: 23,
      purchase_price: 3,
      sale_price: 4.5,
      min_stock: 10,
      description: "80 g",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ];
  const pohyby = [
    { id: "m-1", type: "prijem", quantity: 10, unit_cost: 3, vat_rate: 23, created_at: "2026-10-02T08:00:00Z", stock_item_id: "st-1", name: "Papier A4", nazov: "Papier A4", sku: "PAP-A4" },
    { id: "m-2", type: "vydaj", quantity: -2, unit_price: 4.5, vat_rate: 23, created_at: "2026-10-03T08:00:00Z", stock_item_id: "st-1", name: "Papier A4", nazov: "Papier A4", sku: "PAP-A4" },
  ];

  it("adresár", async () => {
    await vzorka("adresar-01", buildPohodaAddressbookXml({ company: firmaSK, zakaznici }));
  });

  it("skladová karta s členením skladu a cenovou skupinou", async () => {
    await vzorka("sklad-01-karty-cenova-skupina", buildPohodaStockXml({ company: firmaSK, zasoby, nastavenia }));
  });

  it("príjemka a výdajka", async () => {
    await vzorka("sklad-02-prijemka-vydajka", buildPohodaMovementsXml({ company: firmaSK, skupiny: zoskupPohyby(pohyby), nastavenia }));
  });

  it("zákazky", async () => {
    const zakazky = [{ id: "job-1", job_number: "Z2026-01", name: "Rekonštrukcia", start_date: "2026-10-01", customer_name: "Odberateľ a.s." }];
    await vzorka("zakazky-01", buildPohodaContractsXml({ company: firmaSK, zakazky }));
  });

  it("storno odovzdanej faktúry", async () => {
    await vzorka("storno-01-faktura", buildPohodaStornaXml({ company: firmaSK, storna: [{ id: "inv-1", cislo: "FA2026001" }] }));
  });

  it("storno pôvodnej verzie opraveného dokladu (faktúra aj pokladničný doklad) pridané do dávky", async () => {
    const davka = buildPohodaDavkaXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
      doklady: [],
      pohyby: [{ id: "c-1", type: "prijem", amount: 10, entry_date: "2026-10-01", entry_number: "PPD1", description: "Vklad" }],
    });
    const fa = stornoOpravyXml({ id: "inv-1-storno-v1", cislo: "FA2026001", povodnyBlok: blokPolozky(davka, "inv-1")! });
    const pok = stornoOpravyXml({ id: "c-1-storno-v1", cislo: "PPD1", povodnyBlok: blokPolozky(davka, "c-1")! });
    expect(fa).not.toBeNull();
    expect(pok).not.toBeNull();
    await vzorka("storno-02-oprava-v-davke", pridajPolozky(davka, `${fa}${pok}`));
  });
});

/* --------------------------------------------------- číselníky (list) */

describe("zlaté vzorky — žiadosť o číselníky", () => {
  it("samostatný súbor: predkontácie, strediská, činnosti vo verzii 1.1, členenia, rady, účty, zákazky", async () => {
    await vzorka("ciselniky-01-ziadost", ziadostCiselnikov("36123456"));
  });

  it("žiadosť pridaná na koniec dávky konektora", async () => {
    const davka = buildPohodaDavkaXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
      doklady: [],
      pohyby: [],
    });
    await vzorka("ciselniky-02-v-davke", pridajZiadost(davka, "36123456"));
  });
});

/* -------------------------------------------------- dávka konektora */

describe("zlaté vzorky — dávka konektora", () => {
  it("všetky agendy naraz: adresár, karty, zákazky, pohyby skladu, faktúry, prijaté, bločky, pokladňa, storno", async () => {
    const x = buildPohodaDavkaXml({
      company: firmaSK,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      zakazky: { "job-1": "Z2026-01" },
      zakaznici: [
        { id: "77777777-7777-7777-7777-777777777777", updated_at: "2026-03-10T08:30:00.000Z", name: "ACME s.r.o.", street: "Hlavná 1", city: "Trnava", zip: "91701", country: "SK", ico: "00151653", dic: "2020304050", ic_dph: "SK2020304050" },
      ],
      zasoby: [
        { id: "88888888-8888-8888-8888-888888888888", updated_at: "2026-03-11T09:00:00.000Z", nazov: "Skrutka M8", sku: "SKR-M8", unit: "ks", vat_rate: 23, purchase_price: 0.12, sale_price: 0.29 },
      ],
      zakazkyNove: [{ id: "job-1", job_number: "Z2026-01", name: "Rekonštrukcia", start_date: "2026-10-01", customer_name: "ACME s.r.o." }],
      skupinyPohybov: zoskupPohyby([
        { id: "m-1", type: "prijem", quantity: 100, unit_cost: 0.12, vat_rate: 23, created_at: "2026-10-02T08:00:00Z", stock_item_id: "88888888-8888-8888-8888-888888888888", nazov: "Skrutka M8", sku: "SKR-M8", unit: "ks" },
      ]),
      invoices: [{ invoice: faktura(), items: [polozka()] }],
      doklady: [prijataAkoDoklad(prijata()) as any, { ...kaufland, id: "bl-d" }],
      pohyby: [{ id: "c-1", type: "prijem", amount: 10, entry_date: "2026-10-01", entry_number: "PPD1", description: "Vklad" }],
      storna: [{ id: "inv-old", cislo: "FA2025099" }],
    });
    await vzorka("davka-01-vsetky-agendy", x);
  });
});

/* ------------------------------------------------ súbory konektora */

describe("zlaté vzorky — balíček konektora (text)", () => {
  it("dávkový súbor faktero-pohoda.cmd", async () => {
    await textVzorka("konektor-faktero-pohoda.cmd", davkovySubor({ adresa: "https://www.faktero.sk" }));
  });

  it("HTTPS cez PowerShell faktero-http.ps1", async () => {
    await textVzorka("konektor-faktero-http.ps1", httpSkript());
  });

  it("zoznam firiem firmy.txt", async () => {
    await textVzorka(
      "konektor-firmy.txt",
      zoznamFiriem([
        { kluc: "fk_live_abc", firma: "Vzorová firma s.r.o.", databaza: "StwPh_36123456_2026.mdb" },
        { kluc: "fk_live_def", firma: "Druhá; firma", databaza: "StwPh_27123456_2026.mdb" },
      ]),
    );
  });

  it("naplánovaná úloha nastav-ulohu.cmd", async () => {
    await textVzorka("konektor-nastav-ulohu.cmd", nastavenieUlohy());
  });
});
