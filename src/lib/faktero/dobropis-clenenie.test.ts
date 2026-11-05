/*
  Členenie DPH a KV DPH opravných dokladov (dobropis, ťarchopis, prijatý
  dobropis): predvyplnenie z faktúry a návrhu, KV v časti opravných dokladov
  (C.1 / C.2, nie A.1 / B.2), prepočet uloženého návrhu po ručnej zmene a
  export do Pohody (classificationVAT / classificationKVDPH podľa invoice.xsd).
  Prípad z 4. 11. 2026: dobropis 20260004 SFC → PALIERA k faktúre 20260001.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, POHODA_XML } from "./export.server";
import { prekazkaVydanej } from "./pohoda-kontrola";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { kvOpravnehoZPovodnej, kvPrijatehoDokladu, kvVystavenehoDokladu } from "./kv-urcenie";
import { kvAutoVystavenej } from "./kv-auto";
import { aktualnyNavrh, odvodClenenia, type NavrhZauctovania } from "./auto-uctovanie";
import { navrhClenenieVystavenej } from "./clenenie-vystavenej";
import { ZAKLADNE_CLENENIA_DPH, ponuka, ponukaClenenia } from "./predkontacie";

xmlRegisterFsInputProviders();
const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
const xsd = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
function platne(xml: string): boolean {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  let n = 0;
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      xsd.validate(doc);
      n++;
    } finally {
      doc.dispose();
    }
  }
  return n > 0;
}
const hlavicka = (xml: string) => xml.split("<inv:invoiceDetail>")[0];

const sfc: any = {
  id: "5ec8ebf0-53ab-4eb5-904d-62b860778aa6",
  name: "SFC, s.r.o.",
  ico: "53297474",
  dic: "2121372693",
  ic_dph: "SK2121372693",
  country: "SK",
  vat_payer: true,
  vat_scheme: "sk_4",
};
const faktura: any = {
  id: "80ad7a46-fc10-4322-b637-6e82617bc8b7",
  company_id: sfc.id,
  type: "regular",
  status: "issued",
  invoice_number: "20260001",
  variable_symbol: "20260001",
  issue_date: "2026-10-22",
  delivery_date: "2026-10-22",
  due_date: "2026-11-05",
  currency: "EUR",
  intro_note: "Fakturujeme Vám",
  customer_name: "PALIERA s.r.o.",
  customer_street: "Hlavná 1",
  customer_city: "Bratislava",
  customer_zip: "811 01",
  customer_country: "SK",
  customer_ico: "54613124",
  customer_dic: "2121733614",
  customer_ic_dph: "SK2121733614",
  payment_method: "bank_transfer",
  subtotal: 1,
  vat_total: 0.23,
  total: 1.23,
  reverse_charge: false,
  rounding_mode: "per_document",
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
};
const dobropis: any = {
  ...faktura,
  id: "9687ab63-70ec-44b3-b67d-0629c823bc8c",
  type: "credit_note",
  invoice_number: "20260004",
  variable_symbol: "20260004",
  issue_date: "2026-11-04",
  delivery_date: "2026-11-04",
  intro_note: "Dobropis k faktúre č. 20260001",
  subtotal: -1,
  vat_total: -0.23,
  total: -1.23,
  opravuje_fakturu_id: faktura.id,
  pohoda_predkontacia: "2",
  pohoda_clenenie_dph: "UD",
  kv_clenenie: null,
  zauctovane_at: "2026-11-04T13:10:00Z",
};
const polozky = (inv: any, znamienko: 1 | -1) => [
  {
    id: `${inv.id}-p1`,
    invoice_id: inv.id,
    name: "Služby",
    unit: "ks",
    quantity: znamienko,
    unit_price: 1,
    subtotal: znamienko,
    vat_rate: 23,
    vat_amount: 0.23 * znamienko,
    total: 1.23 * znamienko,
    discount_percent: 0,
    position: 0,
    prenesenie: false,
  },
];
const nastavenia: any = { predkontaciaDobropis: null, clenenieDph: null };

describe("KV DPH opravného dokladu — časť C, nie A", () => {
  const zaklad = {
    maDph: true,
    icDphOdberatela: "SK2121733614",
    icoOdberatela: "54613124",
    dicOdberatela: "2121733614",
  };
  it("dobropis a ťarchopis podnikateľovi → C.1, občanovi → D.2", () => {
    for (const typ of ["credit_note", "debit_note"]) {
      expect(kvVystavenehoDokladu({ typ, ...zaklad })).toBe("C1");
      expect(kvVystavenehoDokladu({ typ, maDph: true })).toBe("D2");
    }
  });
  it("ručné A.1 / A.2 (z faktúry alebo z pravidla) opravný doklad do A nedostane", () => {
    expect(kvVystavenehoDokladu({ typ: "credit_note", kvDokladu: "A1", ...zaklad })).toBe("C1");
    expect(
      kvVystavenehoDokladu({ typ: "credit_note", kvDokladu: "A2", reverseCharge: true, tuzemskePdp: true, maDph: false }),
    ).toBe("C1");
    // Opravná faktúra (§ 25a) ako bežný typ s odkazom na pôvodnú tiež.
    expect(kvVystavenehoDokladu({ typ: "regular", opravny: true, kvDokladu: "A1", ...zaklad })).toBe("C1");
    // Bežná faktúra si ručné A.1 nechá; X (nezahŕňať) ostáva aj na dobropise.
    expect(kvVystavenehoDokladu({ typ: "regular", kvDokladu: "A1", ...zaklad })).toBe("A1");
    expect(kvVystavenehoDokladu({ typ: "credit_note", kvDokladu: "X", ...zaklad })).toBe("");
  });
  it("prijatý dobropis → C.2 aj s ručným B.2 z pravidla", () => {
    const p = { blocek: false, dobropis: true, pdp: false, maDph: true };
    expect(kvPrijatehoDokladu(p)).toBe("C2");
    expect(kvPrijatehoDokladu({ ...p, kvDokladu: "B2" })).toBe("C2");
    // Prenesenie ostáva v B.1 (oprava sa uvádza so záporným znamienkom tam).
    expect(kvPrijatehoDokladu({ ...p, pdp: true })).toBe("B1");
  });
  it("prevzatie KV z opravovanej faktúry", () => {
    expect(kvOpravnehoZPovodnej("A1")).toBe("C1");
    expect(kvOpravnehoZPovodnej("a2")).toBe("C1");
    expect(kvOpravnehoZPovodnej("D2")).toBe("D2");
    expect(kvOpravnehoZPovodnej("X")).toBe("X");
    expect(kvOpravnehoZPovodnej(null)).toBe("");
  });
  it("motor automatického účtovania: dobropis k prenesenej faktúre nedostane A.2", () => {
    const v = {
      smer: "vydane" as const,
      krajinaFirmy: "SK",
      firmaPlatitel: true,
      dph: 0,
      reverseCharge: true,
      reverseChargeType: "domestic_69",
    };
    expect(odvodClenenia(v).kvClenenie).toBe("A2");
    expect(odvodClenenia({ ...v, opravny: true }).kvClenenie).toBeNull();
    expect(odvodClenenia({ ...v, opravny: true }).clenenieDph).toBe("UDpdp");
    // Zobrazenie „automaticky (C1)“ v detaile dobropisu.
    expect(kvAutoVystavenej({ ...dobropis, kv_clenenie: null })).toBe("C1");
  });
});

describe("Návrh členenia DPH vo formulári a v detaile", () => {
  const ciselnik = ponukaClenenia([], "dobropis");
  const doklad = { opravny: true, dph: -0.23 };
  it("ponuka dobropisu je kompletná ako pri faktúre (UD, UDpdp, UKpdp, UNoslob, UN)", () => {
    expect(ciselnik.map((c) => c.kod)).toEqual(["UD", "UDpdp", "UKpdp", "UNoslob", "UN"]);
    expect(ponukaClenenia([], "faktura").map((c) => c.kod)).toEqual(ciselnik.map((c) => c.kod));
    expect(ZAKLADNE_CLENENIA_DPH.find((c) => c.kod === "UN")?.popis).toBe(
      "Nezahrnovať do priznania DPH",
    );
  });
  it("kód z číselníka obmedzený na vydanú faktúru sa ponúkne aj dobropisu (ako v navrhyKodovFn)", () => {
    const zaznamy = [
      { druh: "clenenie_dph", kod: "UD", popis: "Tuzemské plnenie", agenda: "", ucet_md: null, ucet_d: null, druhy_dokladov: ["faktura"] },
      { druh: "clenenie_dph", kod: "UN", popis: "Nezahrnovať", agenda: "", ucet_md: null, ucet_d: null, druhy_dokladov: null },
    ];
    // Bez rozšírenia by dobropis UD nevidel.
    expect(ponuka(zaznamy as any, "clenenie_dph", [], "dobropis").map((m) => m.kod)).toEqual(["UN"]);
    const rozsirene = zaznamy.map((r) =>
      r.druhy_dokladov?.includes("faktura") ? { ...r, druhy_dokladov: [...r.druhy_dokladov, "dobropis"] } : r,
    );
    expect(ponuka(rozsirene as any, "clenenie_dph", [], "dobropis").map((m) => m.kod)).toEqual(["UD", "UN"]);
  });
  it("platiteľ bez predvoleného → UD z režimu dane (prípad SFC)", () => {
    expect(
      navrhClenenieVystavenej({ platitel: true, krajinaFirmy: "SK", ciselnik, doklad }),
    ).toEqual({ kod: "UD", zdroj: "rezim" });
  });
  it("neplatiteľ → bez členenia (nie UN ani predvolené UD firmy) — zadanie 5. 11.", () => {
    expect(
      navrhClenenieVystavenej({ platitel: false, krajinaFirmy: "SK", ciselnik, predvoleneFirmy: "UD", doklad: { opravny: true, dph: 0 } }),
    ).toBeNull();
  });
  it("poradie: pravidlo → prenesenie firmy → predvolené firmy", () => {
    expect(
      navrhClenenieVystavenej({ pravidlo: "UDx", predvoleneFirmy: "UD", platitel: true, krajinaFirmy: "SK", ciselnik, doklad })?.kod,
    ).toBe("UDx");
    expect(
      navrhClenenieVystavenej({
        pdpFirmy: "UKpdp",
        predvoleneFirmy: "UD",
        platitel: true,
        krajinaFirmy: "SK",
        ciselnik,
        doklad: { opravny: true, dph: 0, reverseCharge: true, reverseChargeType: "domestic_69" },
      })?.kod,
    ).toBe("UKpdp");
    expect(
      navrhClenenieVystavenej({ predvoleneFirmy: "UD1", platitel: true, krajinaFirmy: "SK", ciselnik, doklad })?.kod,
    ).toBe("UD1");
    // Prenesenie bez nastavenia firmy → UDpdp z režimu dane.
    expect(
      navrhClenenieVystavenej({
        platitel: true,
        krajinaFirmy: "SK",
        ciselnik,
        doklad: { opravny: true, dph: 0, reverseCharge: true },
      })?.kod,
    ).toBe("UDpdp");
  });
});

describe("Uložený návrh proti kódom na doklade (dobropis 20260004)", () => {
  // Návrh tak, ako je v databáze: vznikol, kým dobropis predkontáciu nemal.
  const navrh: NavrhZauctovania = {
    kedy: "2026-11-04T12:57:00.886Z",
    zdroj: null,
    istota: 0,
    cinnost: null,
    rezimDph: "vystup_tuzemsko",
    blokatory: ["predkontacia"],
    kategoria: null,
    stredisko: null,
    kvClenenie: null,
    pravidloId: null,
    clenenieDph: "UD",
    zdovodnenie: "Tuzemské plnenie → UD",
    predkontacia: null,
    pravidloNazov: null,
  };
  it("predkontácia vybraná po návrhu: „Chýba predkontácia“ zmizne, ohlási sa chýbajúce členenie", () => {
    const n = aktualnyNavrh(navrh, { pohoda_predkontacia: "2", pohoda_clenenie_dph: null });
    expect(n.blokatory).toEqual(["bez_clenenia"]);
    expect(n.predkontacia).toBe("2");
    expect(n.clenenieDph).toBe("UD");
  });
  it("po uložení členenia nič nesvieti; bez predkontácie blokátor ostáva", () => {
    expect(aktualnyNavrh(navrh, { pohoda_predkontacia: "2", pohoda_clenenie_dph: "UD" }).blokatory).toEqual([]);
    expect(aktualnyNavrh(navrh, { pohoda_clenenie_dph: "UD" }).blokatory).toEqual(["predkontacia"]);
  });
});

describe("Export opravných dokladov do Pohody — classificationVAT a classificationKVDPH", () => {
  it("dobropis 20260004: UD a C1 v hlavičke, odkaz na pôvodnú faktúru, platné podľa invoice.xsd", () => {
    expect(prekazkaVydanej(dobropis, polozky(dobropis, -1), sfc, nastavenia)).toBeNull();
    const r = POHODA_XML.build({
      company: sfc,
      invoices: [{ invoice: dobropis, items: polozky(dobropis, -1) }],
      nastavenia,
      povodneCisla: { [dobropis.id]: "20260001" },
    } as any) as { content: string; preskocene?: string[] };
    expect(r.preskocene ?? []).toEqual([]);
    const h = hlavicka(r.content);
    expect(h).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
    expect(h).toContain("<inv:accounting><typ:ids>2</typ:ids></inv:accounting>");
    expect(h).toContain("<inv:classificationVAT><typ:ids>UD</typ:ids></inv:classificationVAT>");
    expect(h).toContain("<inv:classificationKVDPH><typ:ids>C1</typ:ids></inv:classificationKVDPH>");
    expect(h).toContain("<inv:originalDocumentNumber>20260001</inv:originalDocumentNumber>");
    expect(platne(r.content)).toBe(true);
  });

  it("dobropis s ručným A1 (z pravidla) ide do Pohody ako C1", () => {
    const d = { ...dobropis, kv_clenenie: "A1" };
    const { content } = POHODA_XML.build({
      company: sfc,
      invoices: [{ invoice: d, items: polozky(d, -1) }],
      nastavenia,
    }) as { content: string };
    expect(hlavicka(content)).toContain("<inv:classificationKVDPH><typ:ids>C1</typ:ids></inv:classificationKVDPH>");
    expect(platne(content)).toBe(true);
  });

  it("ťarchopis: vlastné členenie DPH a C1", () => {
    const t = {
      ...dobropis,
      id: "tarchopis-1",
      type: "debit_note",
      invoice_number: "20260005",
      subtotal: 1,
      vat_total: 0.23,
      total: 1.23,
      pohoda_clenenie_dph: "UD",
    };
    const { content } = POHODA_XML.build({
      company: sfc,
      invoices: [{ invoice: t, items: polozky(t, 1) }],
      nastavenia,
    }) as { content: string };
    const h = hlavicka(content);
    expect(h).toContain("<inv:classificationVAT><typ:ids>UD</typ:ids></inv:classificationVAT>");
    expect(h).toContain("<inv:classificationKVDPH><typ:ids>C1</typ:ids></inv:classificationKVDPH>");
    expect(platne(content)).toBe(true);
  });

  it("prijatý dobropis: PD a C2 (aj keď pravidlo dalo B2), platné podľa invoice.xsd", () => {
    const d = prijataAkoDoklad({
      id: "pd-1",
      company_id: sfc.id,
      type: "regular",
      status: "booked",
      invoice_number: "DB-2026-7",
      opravuje_cislo: "FV-2026-3",
      issue_date: "2026-11-03",
      delivery_date: "2026-11-03",
      due_date: "2026-11-17",
      currency: "EUR",
      supplier_name: "Dodávateľ s.r.o.",
      supplier_ico: "36123456",
      supplier_dic: "2020123456",
      supplier_ic_dph: "SK2020123456",
      supplier_country: "SK",
      amount_without_vat: -100,
      vat_amount: -23,
      amount_total: -123,
      pohoda_predkontacia: "1Fp",
      pohoda_clenenie_dph: "PD",
      kv_clenenie: "B2",
      zauctovane_at: "2026-11-04T10:00:00Z",
    } as any);
    const x = buildPohodaExpensesXml({ company: sfc, nastavenia: {} as any, doklady: [d] });
    expect(x).toContain("<inv:invoiceType>receivedCreditNotice</inv:invoiceType>");
    const h = hlavicka(x);
    expect(h).toContain("<inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>");
    expect(h).toContain("<inv:classificationKVDPH><typ:ids>C2</typ:ids></inv:classificationKVDPH>");
    expect(platne(x)).toBe(true);
  });
});
