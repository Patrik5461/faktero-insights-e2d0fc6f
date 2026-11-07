/*
  Checklist účtovníčky k exportu do Pohody, sekcia A (6. 11. 2026).

  A1.1  Každá položka (invoiceItem) nesie predkontáciu, členenie DPH a KV —
        vlastné, inak z hlavičky dokladu (aj rozúčtovanie a položky PDP).
  A1.2  Zálohové faktúry (vydané aj prijaté) idú rovnako — BEZ DPH: sadzba
        `none`, bez predkontácie, členenia DPH a KV (invoice.xsd: členenie
        „Nepoužívá se u typů Proforma a Zálohová faktura“).
  A1.3  Po exporte je zálohová zapísaná ako odovzdaná (export_logs →
        invoices.exported_at, purchase_invoices.exported_at + export_job_id).
  A1.4  Dátum zaúčtovania pri exporte vydaných zálohových (dateAccounting).
  A1.5  Daňový doklad k platbe bez predkontácie kontrola zastaví.
  A2    Vrátiť z Pohody — prijaté, pokladňa, vydané; len s právom upravovať.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";

/* ------------------------------------------------ zápisy mimo testovaného kódu */

const admin = { zapisy: [] as any[] };
vi.mock("./pohoda-odoslane-xml.server", () => ({
  ulozOdoslaneXml: async () => "job-prijate",
  zvysVerziuPohody: async (_s: any, tabulka: string, ids: string[]) => {
    admin.zapisy.push({ tab: tabulka, op: "verzia", ids });
  },
}));

import { buildPohodaExpensesXml, buildPohodaInvoiceXml, polozkyZalohyBezDph } from "./export.server";
import { NASTAVTE_PREDKONTACIU_ZALOHY, prekazkaDokladu, prekazkaVydanej } from "./pohoda-kontrola";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { VRATIT_LEN_S_UPRAVOU } from "./over-pristup";
import { vratDokladyZPohody, vratVystavenuZPohody } from "./vratenie-z-pohody.server";
import { oznacOdovzdane, type Balik } from "./odovzdanie.server";

/* ------------------------------------------------ falošná databáza */

type Zapis = { tab: string; op: string; val?: any; filtre?: any[][]; ids?: string[] };

/** Chainable klient: select filtruje `eq`/`in`, zápisy sa zaznamenajú. */
function falosnyKlient(
  tabulky: Record<string, any[]>,
  zapisy: Zapis[],
  opts: { rola?: string; pravo?: string[] } = {},
): any {
  const from = (tab: string) => {
    const st: Zapis = { tab, op: "select", filtre: [] };
    const riadky = () =>
      (tabulky[tab] ?? []).filter((r) =>
        (st.filtre ?? []).every(([f, k, v]) =>
          f === "eq" ? r[k] === v : f === "in" ? (v as any[]).includes(r[k]) : f === "is" ? (r[k] ?? null) === v : true,
        ),
      );
    const vysledok = () => {
      if (st.op === "insert") return { data: (Array.isArray(st.val) ? st.val : [st.val]).map((x: any, i: number) => ({ id: `${tab}-${i + 1}`, ...x })), error: null };
      if (st.op === "update") return { data: riadky().map((r) => ({ ...r, ...st.val })), error: null };
      return { data: riadky(), error: null };
    };
    const q: any = new Proxy(
      {},
      {
        get(_, k: string) {
          if (k === "then") return (res: any, rej: any) => Promise.resolve(vysledok()).then(res, rej);
          if (k === "single" || k === "maybeSingle") return () => Promise.resolve({ data: vysledok().data[0] ?? null, error: null });
          if (["insert", "update", "delete", "upsert"].includes(k))
            return (v: any) => {
              st.op = k;
              st.val = v;
              zapisy.push(st);
              return q;
            };
          if (k === "select") return () => q;
          return (...a: any[]) => {
            st.filtre!.push([k, ...a]);
            return q;
          };
        },
      },
    );
    return q;
  };
  return {
    from,
    rpc: async (fn: string, args: any) =>
      fn === "firmy_s_pravom" ? { data: (opts.pravo ?? [FIRMA.id]).filter(() => args._zapis ? opts.rola !== "len-citat" : true), error: null } : { data: null, error: null },
    tabulky,
  };
}

/* ------------------------------------------------ dáta */

const FIRMA: any = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Testovacia s.r.o.",
  ico: "54613124",
  ic_dph: "SK2121733614",
  country: "SK",
  vat_payer: true,
  vat_scheme: "sk_4",
};
const ZF_ID = "22222222-2222-4222-8222-222222222222";
const PZ_ID = "33333333-3333-4333-8333-333333333333";
const PK_ID = "44444444-4444-4444-8444-444444444444";

const faktura = (x: any = {}) => ({
  id: "f-1",
  company_id: FIRMA.id,
  type: "regular",
  status: "sent",
  invoice_number: "FA20260010",
  issue_date: "2026-11-02",
  delivery_date: "2026-11-01",
  due_date: "2026-11-16",
  currency: "EUR",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "53297474",
  customer_dic: "2121372693",
  customer_ic_dph: "SK2121372693",
  customer_country: "SK",
  payment_method: "bank_transfer",
  subtotal: 150,
  vat_total: 34.5,
  total: 184.5,
  reverse_charge: false,
  ...x,
});
const polozka = (x: any = {}) => ({
  id: `p-${Math.random()}`,
  name: "Služba",
  unit: "ks",
  quantity: 1,
  unit_price: 100,
  subtotal: 100,
  vat_rate: 23,
  vat_amount: 23,
  total: 123,
  discount_percent: 0,
  prenesenie: false,
  ...x,
});

xmlRegisterFsInputProviders();
const schemy: Record<string, any> = {};
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const out: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const vnutro = m[1].trim();
    const xsd = /^<int:/.test(vnutro) ? "intDoc.xsd" : /^<vch:/.test(vnutro) ? "voucher.xsd" : "invoice.xsd";
    if (!schemy[xsd]) {
      const url = new URL(`./schemy/pohoda/${xsd}`, import.meta.url);
      schemy[xsd] = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      schemy[xsd].validate(doc);
    } catch (e: any) {
      out.push(String(e?.message ?? e));
    } finally {
      doc.dispose();
    }
  }
  return out;
}
const polozkyXml = (xml: string) =>
  [...xml.matchAll(/<(\w+):(?:invoiceItem|intDocItem)>([\s\S]*?)<\/\1:(?:invoiceItem|intDocItem)>/g)].map((m) => m[2]);
const kod = (x: string, el: string) => new RegExp(`<\\w+:${el}><typ:ids>([^<]*)<`).exec(x)?.[1] ?? null;
const hodnota = (x: string, el: string) =>
  new RegExp(`<${el.includes(":") ? el : `\\w+:${el}`}>([^<]*)<`).exec(x)?.[1] ?? null;
const UCTOVNE = ["accounting>", "classificationVAT>", "classificationKVDPH>"];

/* ------------------------------------------------ A1.1 vydané */

describe("A1.1 VFA — kódy v každej položke", () => {
  const nast: any = { predkontacia: "3Fv", clenenieDph: "UD", kvFaktura: "A1" };

  it("položka bez vlastného členenia dostane členenie DPH a KV z hlavičky", () => {
    const xml = buildPohodaInvoiceXml({
      company: FIRMA,
      nastavenia: nast,
      invoices: [
        {
          invoice: faktura(),
          items: [
            polozka(),
            polozka({ name: "Tovar", unit_price: 50, subtotal: 50, vat_amount: 11.5, total: 61.5, pohoda_clenenie_dph: "UDA5" }),
          ],
        },
      ],
    });
    const [a, b] = polozkyXml(xml);
    expect([kod(a, "accounting"), kod(a, "classificationVAT"), kod(a, "classificationKVDPH")]).toEqual(["3Fv", "UD", "A1"]);
    // Vlastné členenie položky má prednosť.
    expect([kod(b, "accounting"), kod(b, "classificationVAT"), kod(b, "classificationKVDPH")]).toEqual(["3Fv", "UDA5", "A1"]);
    expect(kod(xml, "classificationVAT")).toBe("UD");
    expect(hodnota(xml, "date")).toBe("2026-11-02");
    expect(hodnota(xml, "dateTax")).toBe("2026-11-01");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("položka v prenesení na bežnej faktúre: UDpdp + A2SP (stavebné práce), ostatné UD + A1", () => {
    const xml = buildPohodaInvoiceXml({
      company: FIRMA,
      nastavenia: nast,
      invoices: [
        {
          invoice: faktura({ vat_total: 23, total: 173, pdp_druh: "j" }),
          items: [polozka(), polozka({ name: "Stavebné práce", unit_price: 50, subtotal: 50, vat_rate: 0, vat_amount: 0, total: 50, prenesenie: true })],
        },
      ],
    });
    const [a, b] = polozkyXml(xml);
    expect([kod(a, "classificationVAT"), kod(a, "classificationKVDPH")]).toEqual(["UD", "A1"]);
    expect([kod(b, "classificationVAT"), kod(b, "classificationKVDPH")]).toEqual(["UDpdp", "A2SP"]);
    expect(b).toContain("<inv:PDP>true</inv:PDP>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("rozúčtovanie: riadok bez členenia dostane členenie dokladu", () => {
    const xml = buildPohodaInvoiceXml({
      company: FIRMA,
      nastavenia: nast,
      invoices: [
        {
          invoice: faktura({
            subtotal: 100,
            vat_total: 23,
            total: 123,
            rozuctovanie: [
              { sadzba: 23, zaklad: 60, dph: 13.8, predkontacia: "3Fv" },
              { sadzba: 23, zaklad: 40, dph: 9.2, predkontacia: "3Fs", clenenie: "UDA5" },
            ],
          }),
          items: [polozka()],
        },
      ],
    });
    const [a, b] = polozkyXml(xml);
    expect([kod(a, "accounting"), kod(a, "classificationVAT"), kod(a, "classificationKVDPH")]).toEqual(["3Fv", "UD", "A1"]);
    expect([kod(b, "accounting"), kod(b, "classificationVAT"), kod(b, "classificationKVDPH")]).toEqual(["3Fs", "UDA5", "A1"]);
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("dobropis: kódy v položke, dátum uplatnenia DPH", () => {
    const xml = buildPohodaInvoiceXml({
      company: FIRMA,
      nastavenia: { ...nast, predkontaciaDobropis: "3Fd" },
      invoices: [
        {
          invoice: faktura({ type: "credit_note", invoice_number: "DB20260001", subtotal: -100, vat_total: -23, total: -123, issue_date: "2026-11-04", delivery_date: "2026-10-31", _opravujeCislo: "FA20260010" }),
          items: [polozka({ quantity: -1, subtotal: -100, vat_amount: -23, total: -123 })],
        },
      ],
    });
    expect(xml).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
    const [a] = polozkyXml(xml);
    expect([kod(a, "accounting"), kod(a, "classificationVAT"), kod(a, "classificationKVDPH")]).toEqual(["3Fd", "UD", "C1"]);
    expect(hodnota(xml, "dateApplicationVAT")).toBe("2026-11-04");
    expect(hodnota(xml, "dateTax")).toBe("2026-10-31");
    expect(chybySchemy(xml)).toEqual([]);
  });
});

/* ------------------------------------------------ A1.1 prijaté */

const prijata = (x: any = {}) => ({
  id: "pi-1",
  company_id: FIRMA.id,
  type: "regular",
  status: "booked",
  invoice_number: "5226187175",
  issue_date: "2026-10-20",
  delivery_date: "2026-10-18",
  received_date: "2026-10-21",
  due_date: "2026-11-03",
  currency: "EUR",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "36562939",
  supplier_ic_dph: "SK2021863811",
  supplier_country: "SK",
  amount_without_vat: 150,
  vat_amount: 34.5,
  amount_total: 184.5,
  pohoda_predkontacia: "501000 321000",
  pohoda_clenenie_dph: "PD",
  zauctovane_at: "2026-10-22T10:00:00Z",
  items: [
    { name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 },
    { name: "Doprava", quantity: 1, unit_price: 50, vat_rate: 23, total: 50 },
  ],
  ...x,
});

describe("A1.1 PFA — kódy v každej položke", () => {
  it("položky bez vlastného členenia dostanú PD + B2 z hlavičky, predkontáciu dokladu a dátumy", () => {
    const xml = buildPohodaExpensesXml({ company: FIRMA, nastavenia: {} as any, doklady: [prijataAkoDoklad(prijata())] });
    const pol = polozkyXml(xml);
    expect(pol).toHaveLength(2);
    for (const p of pol)
      expect([kod(p, "accounting"), kod(p, "classificationVAT"), kod(p, "classificationKVDPH")]).toEqual(["501000 321000", "PD", "B2"]);
    expect(hodnota(xml, "date")).toBe("2026-10-20");
    expect(hodnota(xml, "dateTax")).toBe("2026-10-21");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("vlastné členenie položky má prednosť, prenesená položka dostane členenie PDP a B1", () => {
    const xml = buildPohodaExpensesXml({
      company: FIRMA,
      nastavenia: { clenenieDphPdpPrijata: "PDpdp" } as any,
      doklady: [
        prijataAkoDoklad(
          prijata({
            amount_without_vat: 150,
            vat_amount: 23,
            amount_total: 173,
            items: [
              { name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100, clenenie: "PN" },
              { name: "Stavebné práce", quantity: 1, unit_price: 50, vat_rate: 23, total: 50, reverse_charge: true },
            ],
          }),
        ),
      ],
    });
    const [a, b] = polozkyXml(xml);
    expect(kod(a, "classificationVAT")).toBe("PN");
    expect(kod(a, "accounting")).toBe("501000 321000");
    expect(kod(a, "classificationKVDPH")).toBe("B2");
    expect([kod(b, "accounting"), kod(b, "classificationVAT"), kod(b, "classificationKVDPH")]).toEqual(["501000 321000", "PDpdp", "B1"]);
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("rozúčtovanie: riadok bez kódov dostane členenie a KV dokladu", () => {
    const xml = buildPohodaExpensesXml({
      company: FIRMA,
      nastavenia: {} as any,
      doklady: [
        prijataAkoDoklad(
          prijata({
            rozuctovanie: [
              { sadzba: 23, zaklad: 100, dph: 23, predkontacia: "501000 321000" },
              { sadzba: 23, zaklad: 50, dph: 11.5, predkontacia: "518000 321000", clenenie: "PN" },
            ],
          }),
        ),
      ],
    });
    const [a, b] = polozkyXml(xml);
    expect([kod(a, "accounting"), kod(a, "classificationVAT"), kod(a, "classificationKVDPH")]).toEqual(["501000 321000", "PD", "B2"]);
    expect([kod(b, "accounting"), kod(b, "classificationVAT")]).toEqual(["518000 321000", "PN"]);
    expect(chybySchemy(xml)).toEqual([]);
  });
});

/* ------------------------------------------------ A1.2 zálohové bez DPH */

describe("A1.2 zálohové faktúry bez DPH — vydané aj prijaté rovnako", () => {
  it("Vzaloh: sadzba none, suma na úhradu, bez účtovných kódov, súhrn v priceNone", () => {
    const xml = buildPohodaInvoiceXml({
      company: FIRMA,
      nastavenia: { predkontacia: "3Fv", clenenieDph: "UD", kvFaktura: "A1", predkontaciaZaloha: "3Zv" } as any,
      invoices: [
        {
          invoice: faktura({ id: ZF_ID, type: "proforma", invoice_number: "ZF20260002", subtotal: 108.13, vat_total: 24.87, total: 133, pohoda_predkontacia: "3Fv", pohoda_clenenie_dph: "UD" }),
          items: [polozka(), polozka({ name: "Záloha", quantity: 3, unit_price: 2.71, subtotal: 8.13, vat_amount: 1.87, total: 10 })],
        },
      ],
    });
    expect(xml).toContain("<inv:invoiceType>issuedAdvanceInvoice</inv:invoiceType>");
    const [a, b] = polozkyXml(xml);
    for (const p of [a, b]) {
      expect(p).toContain("<inv:rateVAT>none</inv:rateVAT>");
      expect(p).toContain("<typ:priceVAT>0.00</typ:priceVAT>");
      for (const el of UCTOVNE) expect(p).not.toContain(el);
      expect(p).not.toContain("<inv:PDP>");
    }
    expect(hodnota(a, "typ:price")).toBe("123.00");
    // 10,00 / 3 sa na cent nedá — riadok ide ako 1 × 10,00, množstvo ostane v texte.
    expect(hodnota(b, "inv:quantity")).toBe("1");
    expect(hodnota(b, "inv:text")).toBe("Záloha (3 ks)");
    expect(hodnota(b, "typ:unitPrice")).toBe("10.00");
    for (const el of UCTOVNE) expect(xml).not.toContain(el);
    expect(hodnota(xml, "typ:priceNone")).toBe("133.00");
    expect(hodnota(xml, "typ:priceHigh")).toBe("0.00");
    expect(hodnota(xml, "typ:priceHighVAT")).toBe("0.00");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("Pzaloh: tá istá podoba — priceNone, bez kódov", () => {
    const xml = buildPohodaExpensesXml({
      company: FIRMA,
      nastavenia: { predkontaciaPrijata: "501000 321000", clenenieDphPrijata: "PD" } as any,
      doklady: [prijataAkoDoklad(prijata({ id: PZ_ID, type: "proforma", invoice_number: "ZF20261101", status: "received", zauctovane_at: null }))],
    });
    expect(xml).toContain("<inv:invoiceType>receivedAdvanceInvoice</inv:invoiceType>");
    for (const el of UCTOVNE) expect(xml).not.toContain(el);
    expect(hodnota(xml, "typ:priceNone")).toBe("184.50");
    expect(hodnota(xml, "typ:priceHighVAT")).toBe("0.00");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("polozkyZalohyBezDph: celá suma ako základ, DPH 0, množstvo zachované, keď cena sedí na cent", () => {
    const [p] = polozkyZalohyBezDph([polozka({ quantity: 2, subtotal: 200, vat_amount: 46, total: 246 }) as any]);
    expect(p).toMatchObject({ quantity: 2, unit_price: 123, subtotal: 246, vat_amount: 0, vat_rate: 0, total: 246 });
  });
});

/* ------------------------------------------------ A1.5 daňový doklad k platbe */

describe("A1.5 daňový doklad k platbe", () => {
  const ddp = faktura({ id: "ddp-1", type: "advance_payment", invoice_number: "260800003", delivery_date: "2026-11-02", paid_at: "2026-11-02T00:00:00Z", subtotal: 100, vat_total: 23, total: 123 });
  const pol = [polozka()];

  it("predkontácia zálohy ide do XML, dátumy podľa dňa prijatia platby", () => {
    const xml = buildPohodaInvoiceXml({ company: FIRMA, nastavenia: { predkontaciaZaloha: "ZAL", clenenieDph: "UD" } as any, invoices: [{ invoice: ddp, items: pol }] });
    expect(kod(xml, "accounting")).toBe("ZAL");
    expect(kod(xml, "classificationVAT")).toBe("UD");
    expect(kod(xml, "classificationKVDPH")).toBe("A1");
    for (const el of ["dateTax", "dateDelivery", "dateKVDPH"]) expect(hodnota(xml, `int:${el}`)).toBe("2026-11-02");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("vlastná predkontácia dokladu (napr. „automaticky“ uložená z detailu) má prednosť", () => {
    const xml = buildPohodaInvoiceXml({ company: FIRMA, nastavenia: { predkontaciaZaloha: "ZAL" } as any, invoices: [{ invoice: { ...ddp, pohoda_predkontacia: "ZAL2" }, items: pol }] });
    expect(kod(xml, "accounting")).toBe("ZAL2");
  });

  it("bez predkontácie je to prekážka (nie len upozornenie) a do XML nejde", () => {
    expect(prekazkaVydanej(ddp, pol, FIRMA, { predkontacia: "3Fv" })).toContain(NASTAVTE_PREDKONTACIU_ZALOHY);
    const xml = buildPohodaInvoiceXml({ company: FIRMA, nastavenia: { predkontacia: "3Fv" } as any, invoices: [{ invoice: ddp, items: pol }] });
    expect(xml).not.toContain("<int:intDoc");
    expect(xml).not.toContain("<inv:invoice ");
  });
});

/* ------------------------------------------------ A1.3 + A1.4 označenie po exporte */

const kontext = (sb: any) => ({ supabase: sb, userId: "u-1" });

describe("A1.3 zálohová sa po odovzdaní zapíše ako odovzdaná (balík, e-mail)", () => {
  beforeEach(() => {
    admin.zapisy.length = 0;
  });

  it("vydaná zálohová → export_logs „ok“ (spúšťač nastaví invoices.exported_at a zámok), prijatá zálohová → exported_at + export_job_id, pokladňa → exported_at", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient(
      {
        purchase_invoices: [{ id: PZ_ID, company_id: FIRMA.id, type: "proforma" }],
        cash_entries: [{ id: PK_ID, company_id: FIRMA.id }],
      },
      zapisy,
    );
    const balik = {
      base64: "",
      fileName: "odovzdanie-2026-11.zip",
      pocetFaktur: 1,
      pocetDokladov: 0,
      pocetPokladnicnych: 1,
      pokladnicaIds: [PK_ID],
      pocetOstatnych: 0,
      ostatneIds: [],
      preskocene: [],
      vynechanePrilohy: 0,
      fakturyIds: [ZF_ID],
      dokladyIds: [],
      prijateIds: [PZ_ID],
      pocetPrijatych: 1,
      ciselniky: [],
      pocetCiselnikov: 0,
      xmlFaktur: "<xml/>",
      xmlPrijatych: "<xml/>",
      poslednyDatum: "2026-11-02",
      nazovObdobia: "november 2026",
    } as Balik;
    await oznacOdovzdane(sb, { companyId: FIRMA.id, mesiac: "2026-11", userId: "u-1" }, balik, [
      { id: ZF_ID, invoice_number: "ZF20260002" },
    ]);
    const log = zapisy.find((z) => z.tab === "export_logs" && z.op === "insert");
    expect(log?.val).toEqual([expect.objectContaining({ invoice_id: ZF_ID, status: "ok" })]);
    const pz = zapisy.find((z) => z.tab === "purchase_invoices" && z.op === "update");
    expect(pz?.val).toMatchObject({ export_job_id: "job-prijate" });
    expect(pz?.val.exported_at).toBeTruthy();
    expect(pz?.filtre).toContainEqual(["in", "id", [PZ_ID]]);
    const pk = zapisy.find((z) => z.tab === "cash_entries" && z.op === "update");
    expect(pk?.val.exported_at).toBeTruthy();
    expect(pk?.filtre).toContainEqual(["in", "id", [PK_ID]]);
  });

  it("vynechaná zálohová (prekážka) sa zapíše ako „skipped“, nie ako odovzdaná", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient({}, zapisy);
    await oznacOdovzdane(
      sb,
      { companyId: FIRMA.id, mesiac: "2026-11", userId: "u-1" },
      { preskocene: ["ZF20260002 — faktúra v mene USD nemá kurz"], dokladyIds: [], ostatneIds: [], ciselniky: [], xmlFaktur: "" } as any,
      [{ id: ZF_ID, invoice_number: "ZF20260002" }],
    );
    const log = zapisy.find((z) => z.tab === "export_logs" && z.op === "insert");
    expect(log?.val).toEqual([expect.objectContaining({ invoice_id: ZF_ID, status: "skipped" })]);
  });
});

/* ------------------------------------------------ A2 vrátenie z Pohody */

describe("A2 Vrátiť z Pohody — všetky druhy, len s právom upravovať", () => {
  beforeEach(() => {
    admin.zapisy.length = 0;
  });
  const clen = (rola = "employee") => [{ company_id: FIRMA.id, user_id: "u-1", role: rola }];

  it("prijatá (aj zálohová): zruší odovzdanie a zvýši verziu pre Pohodu", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient(
      { company_users: clen(), purchase_invoices: [{ id: PZ_ID, company_id: FIRMA.id, status: "received", exported_at: "2026-11-05" }] },
      zapisy,
    );
    const r = await vratDokladyZPohody(kontext(sb), { company_id: FIRMA.id, druh: "prijata", ids: [PZ_ID] });
    expect(r.vratenych).toBe(1);
    expect(zapisy[0]).toMatchObject({ tab: "purchase_invoices", op: "update", val: { exported_at: null, pohoda_cislo: null } });
    expect(admin.zapisy).toContainEqual({ tab: "purchase_invoices", op: "verzia", ids: [PZ_ID] });
  });

  it("zaúčtovaná prijatá: stav späť na prijatú len v tej istej firme, aj export_job_id preč", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient(
      { company_users: clen(), purchase_invoices: [{ id: PZ_ID, company_id: FIRMA.id, status: "booked", exported_at: "2026-11-05" }] },
      zapisy,
    );
    await vratDokladyZPohody(kontext(sb), { company_id: FIRMA.id, druh: "prijata", ids: [PZ_ID] });
    expect(zapisy[0].val).toMatchObject({ export_job_id: null });
    const stav = zapisy.find((z) => z.op === "update" && (z.val as any)?.status === "received");
    expect(stav?.filtre).toContainEqual(["eq", "company_id", FIRMA.id]);
  });

  it("pokladničný doklad: zruší odovzdanie a zvýši verziu", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient({ company_users: clen(), cash_entries: [{ id: PK_ID, company_id: FIRMA.id, exported_at: "2026-11-05" }] }, zapisy);
    const r = await vratDokladyZPohody(kontext(sb), { company_id: FIRMA.id, druh: "pokladna", ids: [PK_ID] });
    expect(r.vratenych).toBe(1);
    expect(zapisy[0]).toMatchObject({ tab: "cash_entries", op: "update", val: { exported_at: null, export_job_id: null, pohoda_cislo: null } });
    expect(admin.zapisy).toContainEqual({ tab: "cash_entries", op: "verzia", ids: [PK_ID] });
  });

  it("vydaná (zálohová, doklad k platbe, dobropis): história „returned“ a nová verzia", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient({ company_users: clen(), invoices: [{ id: ZF_ID, company_id: FIRMA.id, type: "proforma" }] }, zapisy);
    const adminSb = falosnyKlient({}, admin.zapisy);
    const r = await vratVystavenuZPohody(kontext(sb), adminSb, { company_id: FIRMA.id, id: ZF_ID });
    expect(r.ok).toBe(true);
    expect(admin.zapisy).toContainEqual(expect.objectContaining({ tab: "export_logs", op: "update", val: { status: "returned" } }));
    expect(admin.zapisy).toContainEqual({ tab: "invoices", op: "verzia", ids: [ZF_ID] });
  });

  it("vlastný prístup „len čítať“ vrátiť nesmie — nič sa nezapíše", async () => {
    for (const [fn, data, tab] of [
      [(c: any, d: any) => vratDokladyZPohody(c, d), { company_id: FIRMA.id, druh: "prijata", ids: [PZ_ID] }, "purchase_invoices"],
      [(c: any, d: any) => vratDokladyZPohody(c, d), { company_id: FIRMA.id, druh: "pokladna", ids: [PK_ID] }, "cash_entries"],
      [(c: any, d: any) => vratVystavenuZPohody(c, falosnyKlient({}, admin.zapisy), d), { company_id: FIRMA.id, id: ZF_ID }, "invoices"],
    ] as const) {
      const zapisy: Zapis[] = [];
      admin.zapisy.length = 0;
      const sb = falosnyKlient(
        { company_users: clen("custom"), [tab]: [{ id: (data as any).id ?? (data as any).ids[0], company_id: FIRMA.id }] },
        zapisy,
        { rola: "len-citat" },
      );
      await expect((fn as any)(kontext(sb), data)).rejects.toThrow(VRATIT_LEN_S_UPRAVOU);
      expect(zapisy).toEqual([]);
      expect(admin.zapisy).toEqual([]);
    }
  });

  it("nečlen firmy nevráti nič", async () => {
    const zapisy: Zapis[] = [];
    const sb = falosnyKlient({ company_users: [] }, zapisy);
    await expect(
      vratDokladyZPohody(kontext(sb), { company_id: FIRMA.id, druh: "prijata", ids: [PZ_ID] }),
    ).rejects.toThrow("K tejto firme nemáte prístup.");
    expect(zapisy).toEqual([]);
  });
});

describe("overovačka schémy naozaj chybu nájde", () => {
  it("nezmyselný element v položke neprejde", () => {
    const xml = buildPohodaInvoiceXml({ company: FIRMA, nastavenia: {} as any, invoices: [{ invoice: faktura(), items: [polozka()] }] });
    expect(chybySchemy(xml)).toEqual([]);
    expect(chybySchemy(xml.replace("<inv:payVAT>", "<inv:nezmysel>1</inv:nezmysel><inv:payVAT>")).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------ A6 (vetva checklist-b1): hotovosť v cudzej mene */

describe("hotovostný bloček v cudzej mene ide cez pokladňu v tej istej mene", () => {
  const blocek = (x: any = {}) => ({
    id: "55555555-5555-4555-8555-555555555555",
    company_id: FIRMA.id,
    status: "processed",
    document_number: "BL-CZ-1",
    supplier_name: "Benzina a.s.",
    issue_date: "2026-11-03",
    payment_method: "hotovost",
    currency: "CZK",
    exchange_rate: 25.3,
    pokladna_id: "c",
    total_amount: 123,
    vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
    pohoda_predkontacia: "501000 211000",
    pohoda_clenenie_dph: "PN",
    ...x,
  });
  const nast: any = {
    blockyPodlaPlatby: true,
    pokladna: "HP",
    pokladneKody: { c: "HPCZK", e: "HP" },
    pokladneMeny: { c: "CZK", e: "EUR" },
  };

  it("CZK bloček z pokladne „HP CZK“ (mena CZK) prejde a ide ako pokladničný doklad s jej skratkou", () => {
    expect(prekazkaDokladu(blocek(), FIRMA, nast)).toBeNull();
    const xml = buildPohodaExpensesXml({ company: FIRMA, nastavenia: nast, doklady: [blocek() as any] });
    expect(xml).toContain("<vch:voucher ");
    expect(xml).toContain("<vch:cashAccount><typ:ids>HPCZK</typ:ids></vch:cashAccount>");
    expect(xml).toContain("<vch:foreignCurrency>");
    expect(xml).toContain("<typ:ids>CZK</typ:ids>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("pokladňa v inej mene alebo bez skratky ho zastaví", () => {
    expect(prekazkaDokladu(blocek({ pokladna_id: "e" }), FIRMA, nast)).toContain("nie je v mene CZK");
    expect(prekazkaDokladu(blocek({ pokladna_id: null }), FIRMA, nast)).toContain("nie je v mene CZK");
    expect(
      prekazkaDokladu(blocek(), FIRMA, { ...nast, pokladna: "", pokladneKody: {} }),
    ).toContain("nie je v mene CZK");
  });
});
