/*
  Nastavenia exportu do Pohody (Predkontácie → Export do účtovného programu):
  predvolené voľby musia dať presne ten istý súbor ako doteraz a zmenené
  voľby musia ostať platné podľa schémy Stormware.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml, buildOmegaTxt } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { PREDVOLENE_EXPORTU, type NastaveniaExportu } from "./export-nastavenia";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = {
  inv: "invoice.xsd",
  vch: "voucher.xsd",
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
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(
        `${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`,
      );
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}
const hodnota = (xml: string, el: string) =>
  new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;

const firma: any = { id: "c1", name: "Firma s.r.o.", ico: "36123456", country: "SK" };
const firmaS = (ex: Partial<NastaveniaExportu>) => ({
  ...firma,
  uctovanie_nastavenia: { export: ex },
});

const nastavenia: any = {
  predkontacia: "3Fv",
  predkontaciaZaloha: "3Zv",
  clenenieDph: "UD",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  banka: "TB",
  pokladna: "HP",
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
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_id: "cust-1",
  customer_name: "Odberateľ a.s.",
  customer_ico: "35999888",
  payment_method: "bank_transfer",
  payment_account_id: "ucet-2",
  payment_iban: "SK31 1200 0000 1987 4263 7541",
  intro_note: "Služby za október",
  notes: "Ďakujeme",
  total: 123,
  ...o,
});
const kPlatbe = faktura({
  id: "inv-dd",
  type: "advance_payment",
  invoice_number: "DD2026001",
  intro_note: null,
  notes: null,
});
const vyuctovanie = faktura({ id: "inv-v", invoice_number: "FA2026002", total: 246 });

const prijata = prijataAkoDoklad({
  id: "pi-1",
  company_id: "c1",
  customer_id: "cust-9",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "11223344",
  invoice_number: "F-118",
  variable_symbol: "118",
  issue_date: "2026-09-28",
  delivery_date: "2026-09-25",
  received_date: "2026-10-03",
  created_at: "2026-10-04T08:00:00Z",
  due_date: "2026-10-12",
  currency: "EUR",
  amount_total: 123,
  amount_without_vat: 100,
  vat_amount: 23,
  note: "Materiál",
  int_poznamka: "kontrola",
  type: "regular",
}) as any;
const blocek: any = {
  id: "bl-1",
  supplier_name: "OMV",
  document_number: "B55",
  issue_date: "2026-10-01",
  created_at: "2026-10-02T10:00:00Z",
  currency: "EUR",
  payment_method: "karta",
  total_amount: 61.5,
  vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
  note: "Nafta",
  int_poznamka: "auto BA123",
};

const faktury = [
  { invoice: faktura(), items: [polozka()] },
  { invoice: kPlatbe, items: [polozka()] },
  {
    invoice: vyuctovanie,
    items: [polozka({ quantity: 4, subtotal: 200, vat_amount: 46, total: 246 })],
  },
];
const zalohy = { "inv-v": { cislo: "ZF2026001", zaklad: 100, dph: 23, sadzba: 23 } };

describe("predvolené nastavenia = súbor ako doteraz", () => {
  it("vydané faktúry: bez nastavení, s prázdnymi aj s výslovne predvolenými je XML rovnaké", () => {
    const zaklad = buildPohodaInvoiceXml({ company: firma, invoices: faktury, nastavenia, zalohy });
    expect(
      buildPohodaInvoiceXml({ company: firmaS({}), invoices: faktury, nastavenia, zalohy }),
    ).toBe(zaklad);
    expect(
      buildPohodaInvoiceXml({
        company: firma,
        invoices: faktury,
        nastavenia: { ...nastavenia, export: PREDVOLENE_EXPORTU },
        zalohy,
      }),
    ).toBe(zaklad);
    // Daňový doklad k platbe ostáva interným dokladom, odpočet zálohy bez poznámky.
    expect(zaklad).toContain("<int:intDoc");
    expect(zaklad).not.toMatch(/invoiceAdvancePaymentItem>[\s\S]*?<inv:note>/);
    expect(chybySchemy(zaklad)).toEqual([]);
  });

  it("prijaté doklady: dátumy, text a poznámka ako doteraz", () => {
    const zaklad = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijata, blocek],
      nastavenia,
    });
    expect(
      buildPohodaExpensesXml({
        company: firmaS(PREDVOLENE_EXPORTU),
        doklady: [prijata, blocek],
        nastavenia: { ...nastavenia, export: PREDVOLENE_EXPORTU, partneriVPohode: ["cust-9"] },
      }),
    ).toBe(zaklad);
    expect(hodnota(zaklad, "inv:date")).toBe("2026-09-28");
    expect(hodnota(zaklad, "inv:dateTax")).toBe("2026-09-25");
    expect(hodnota(zaklad, "inv:intNote")).toBe("kontrola");
    expect(zaklad).not.toContain("<typ:extId>");
    expect(chybySchemy(zaklad)).toEqual([]);
  });
});

describe("zmenené nastavenia", () => {
  it("dátum zápisu = doručenie, odpočet = neskorší z dodania a doručenia", () => {
    const x = buildPohodaExpensesXml({
      company: firmaS({ datumZapisu: "dorucenie", datumOdpoctu: "neskorsi" }),
      doklady: [prijata, blocek],
      nastavenia,
    });
    expect(hodnota(x, "inv:date")).toBe("2026-10-03");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-10-03");
    // Bloček (interný doklad) — doručenie = dátum uloženia.
    expect(hodnota(x, "int:date")).toBe("2026-10-02");
    // Dátum dodania tovaru ostáva dátumom dodania.
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-09-25");
    expect(chybySchemy(x)).toEqual([]);
  });

  it("odpočet = dátum zaúčtovania (uzávierka posunie zaúčtovanie)", () => {
    const x = buildPohodaExpensesXml({
      company: firmaS({ datumOdpoctu: "zauctovanie" }),
      doklady: [prijata],
      nastavenia: { ...nastavenia, zamknuteDo: "2026-09-30" },
    });
    expect(hodnota(x, "inv:dateAccounting")).toBe("2026-10-01");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-10-01");
  });

  it("text dokladu a interná poznámka podľa voľby", () => {
    const x = buildPohodaExpensesXml({
      company: firmaS({
        textPrijate: "polozka",
        intPoznamkaPrijate: "interna_poznamka",
        intPoznamkaBlocky: "dodavatel_cislo",
      }),
      doklady: [prijata, blocek],
      nastavenia: { ...nastavenia, popisyPredkontacii: { "1Fp": "Nákup materiálu" } },
    });
    expect(hodnota(x, "inv:text")).toBe("Nákup materiálu");
    expect(hodnota(x, "inv:intNote")).toBe("kontrola · Materiál");
    expect(hodnota(x, "int:intNote")).toBe("OMV č. B55");
    // Bloček bez vlastnej predkontácie berie kód prijatých dokladov — aj jeho popis.
    expect(hodnota(x, "int:text")).toBe("Nákup materiálu");
    // Bez popisu predkontácie ide predvolený text.
    const z = buildPohodaExpensesXml({
      company: firmaS({ textPrijate: "polozka" }),
      doklady: [blocek],
      nastavenia,
    });
    expect(hodnota(z, "int:text")).toBe("OMV č. B55");
    const y = buildPohodaExpensesXml({
      company: firmaS({ textPrijate: "dodavatel_cislo" }),
      doklady: [prijata],
      nastavenia,
    });
    expect(hodnota(y, "inv:text")).toBe("Dodávateľ s.r.o. č. F-118");
  });

  it("partner sa spáruje s kartou adresára cez extId, len keď v Pohode je", () => {
    const x = buildPohodaExpensesXml({
      company: firmaS({ partneri: "parovat" }),
      doklady: [prijata],
      nastavenia: { ...nastavenia, partneriVPohode: ["cust-9"] },
    });
    expect(x).toMatch(
      /<inv:partnerIdentity>\s*<typ:extId>\s*<typ:ids>cust-9<\/typ:ids>\s*<typ:exSystemName>Faktero<\/typ:exSystemName>/,
    );
    expect(chybySchemy(x)).toEqual([]);
    const bez = buildPohodaExpensesXml({
      company: firmaS({ partneri: "parovat" }),
      doklady: [prijata],
      nastavenia,
    });
    expect(bez).not.toContain("<typ:extId>");
    const f = buildPohodaInvoiceXml({
      company: firmaS({ partneri: "parovat" }),
      invoices: [faktury[0]],
      nastavenia: { ...nastavenia, partneriVPohode: ["cust-1"] },
    });
    expect(f).toContain("<typ:ids>cust-1</typ:ids>");
    expect(chybySchemy(f)).toEqual([]);
  });

  it("položky z rozpisu DPH, keď doklad iné nemá", () => {
    const x = buildPohodaExpensesXml({
      company: firmaS({ polozkyZRozpisu: true }),
      doklady: [prijata, blocek],
      nastavenia,
    });
    expect(x).toContain("<inv:invoiceDetail>");
    expect(x).toContain("<int:intDocDetail>");
    expect(x).toMatch(
      /<inv:invoiceItem>[\s\S]*?<inv:rateVAT>high<\/inv:rateVAT>[\s\S]*?<inv:homeCurrency>/,
    );
    expect(chybySchemy(x)).toEqual([]);
  });

  it("daňový doklad k platbe ako vydaná faktúra s predkontáciou zálohy", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaS({ dokladKPlatbe: "vydane" }),
      invoices: [{ invoice: kPlatbe, items: [polozka()] }],
      nastavenia,
    });
    expect(x).not.toContain("<int:intDoc");
    expect(hodnota(x, "inv:invoiceType")).toBe("issuedInvoice");
    expect(x).toContain("<inv:accounting><typ:ids>3Zv</typ:ids></inv:accounting>");
    expect(hodnota(x, "inv:text")).toBe("Daňový doklad k prijatej platbe DD2026001");
    expect(chybySchemy(x)).toEqual([]);
  });

  it("text vystavenej faktúry a názov položky odpočtu zálohy", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaS({ textVystavene: "odberatel_cislo", nazovOdpoctu: "sadzba" }),
      invoices: [faktury[2]],
      nastavenia,
      zalohy,
    });
    expect(hodnota(x, "inv:text")).toBe("Odberateľ a.s. č. FA2026002");
    expect(x).toMatch(
      /<inv:invoiceAdvancePaymentItem>[\s\S]*?<inv:note>Odpočet zálohy 23 %<\/inv:note>/,
    );
    expect(chybySchemy(x)).toEqual([]);
  });

  it("skratka bankového účtu faktúry má prednosť pred spoločnou", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      invoices: [faktury[0]],
      nastavenia: { ...nastavenia, bankaPodlaUctu: { "ucet-2": "VUB" } },
    });
    expect(x).toContain("<inv:account><typ:ids>VUB</typ:ids></inv:account>");
    const podlaIban = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura({ payment_account_id: null }), items: [polozka()] }],
      nastavenia: { ...nastavenia, bankaPodlaUctu: { SK3112000000198742637541: "SLSP" } },
    });
    expect(podlaIban).toContain("<typ:ids>SLSP</typ:ids>");
    const bez = buildPohodaInvoiceXml({ company: firma, invoices: [faktury[0]], nastavenia });
    expect(bez).toContain("<inv:account><typ:ids>TB</typ:ids></inv:account>");
  });

  it("Omega: názov položky odpočtu zálohy podľa nastavenia", () => {
    const odpocty = [
      { zaloha: "ZF1", doklad: "DD1", suma: 123, riadky: [{ sadzba: 23, zaklad: 100, dph: 23 }] },
    ];
    const inv = { ...vyuctovanie, _odpocty: odpocty };
    const pred = buildOmegaTxt({
      company: firma,
      invoices: [
        {
          invoice: inv,
          items: [polozka({ quantity: 4, subtotal: 200, vat_amount: 46, total: 246 })],
        },
      ],
    } as any);
    const po = buildOmegaTxt({
      company: firmaS({ nazovOdpoctu: "sadzba" }),
      invoices: [
        {
          invoice: inv,
          items: [polozka({ quantity: 4, subtotal: 200, vat_amount: 46, total: 246 })],
        },
      ],
    } as any);
    const text = (o: any) => (typeof o === "string" ? o : (o.content ?? JSON.stringify(o)));
    expect(text(pred)).toContain("Odpočet zálohy DD1 (k ZF1)");
    expect(text(po)).toContain("Odpočet zálohy 23 %");
  });
});
