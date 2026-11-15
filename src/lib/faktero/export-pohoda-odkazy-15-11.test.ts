/*
  Vydané faktúry do POHODY — nálezy zo skúšky naostro v POHODE SK 14404.8
  (kópia PALIERY, 15. 11. 2026):

  1. Odkaz dobropisu (`correctiveDocument`) a odpočtu zálohy
     (`invoiceAdvancePaymentItem/sourceDocument`) na doklad, ktorý v Pohode nie
     je, zhodí CELÝ doklad („Nebol nájdený odkazovaný záznam“). Odkaz ide len
     na doklad odovzdaný (`exported_at`) alebo idúci v tom istom balíku skôr.
  2. `intrastatItem` na neskladovej položke Pohoda ignoruje — colné údaje
     idú aj do poznámky položky.
  3. Vypnuté členenie DPH (offer=false) Pohoda potichu zmení na UD — export
     ho zastaví ako závažnú prekážku.
  4. `clenenieMimoTuzemska` vypnutý presný kód firmy nenahradí systémovým.

  `POHODA_VZORKY=<adresár> npx vitest run export-pohoda-odkazy-15-11` uloží
  vzorky (PALIERA: IČO 54613124, predkontácia 2, banka TABe, čísla „V…“).
*/
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaInvoiceXml, pohodaPrekazka, poznamkaSColnymKodom } from "./export.server";
import { odkazNaDokladPohody } from "./export-priprava.server";
import { zalohyPrePohodu, type OdpocetZalohy } from "./zalohy-odpocty";
import { cleneniaVydanejPrePohodu, prekazkaVydanej } from "./pohoda-kontrola";
import { clenenieMimoTuzemska } from "./clenenie-vystavenej";

xmlRegisterFsInputProviders();

let schema: XsdValidator | null = null;
function chybySchemy(xml: string): string[] {
  if (!schema) {
    const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
    schema = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  }
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  if (!polozky.length) chyby.push("balík je prázdny");
  for (const m of polozky) {
    const vnutro = m[1].trim();
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      schema.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const VZORKY = process.env.POHODA_VZORKY;
function uloz(nazov: string, xml: string) {
  if (!VZORKY) return;
  mkdirSync(VZORKY, { recursive: true });
  writeFileSync(`${VZORKY}/${nazov}.xml`, xml, "utf8");
}

// Jedinečné čísla „V…“ pre každý beh — skúšobný import do tej istej kópie.
const BEH = Date.now().toString(36).toUpperCase().slice(-5);
const c = (n: string) => `V${BEH}${n}`;

const paliera: any = {
  id: "c-paliera",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  dic: "2121734567",
  ic_dph: "SK2121734567",
  vat_payer: true,
  country: "SK",
};
const nastavenia: any = {
  predkontacia: "2",
  predkontaciaZaloha: "2",
  predkontaciaDobropis: "2",
  clenenieDph: "UD",
  banka: "TABe",
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
  id: "f-1",
  type: "regular",
  invoice_number: c("01"),
  variable_symbol: "",
  issue_date: "2026-11-10",
  delivery_date: "2026-11-10",
  due_date: "2026-11-24",
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
const dobropis = (o: any = {}) =>
  faktura({
    id: "d-1",
    type: "credit_note",
    invoice_number: c("02"),
    opravuje_fakturu_id: "f-1",
    subtotal: -100,
    vat_total: -23,
    total: -123,
    ...o,
  });
const polozkaDobropisu = () => polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 });

/* --------------------------------------------- 1. odkazy na doklady */

describe("odkaz dobropisu a odpočtu len na doklad, ktorý v Pohode je", () => {
  it("odkazNaDokladPohody: odovzdaný áno, v balíku skôr áno, v balíku neskôr / mimo nie", () => {
    const poradie = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    expect(odkazNaDokladPohody("2026-11-01T00:00:00Z", "x", "b", poradie)).toBe(true);
    expect(odkazNaDokladPohody(null, "a", "b", poradie)).toBe(true);
    expect(odkazNaDokladPohody(null, "b", "a", poradie)).toBe(false);
    expect(odkazNaDokladPohody(null, "x", "b", poradie)).toBe(false);
    expect(odkazNaDokladPohody(false, null, "b", poradie)).toBe(false);
  });

  it("dobropis bez odovzdanej pôvodnej: bez correctiveDocument, pôvodné číslo pre KV ostáva; XSD", () => {
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [{ invoice: dobropis(), items: [polozkaDobropisu()] }],
      // `opravovane` chýba — pôvodná faktúra nebola odovzdaná.
      povodneCisla: { "d-1": c("01") },
    });
    uloz("V1-dobropis-bez-povodnej", xml);
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).not.toContain("correctiveDocument");
    expect(xml).toContain(`<inv:originalDocumentNumber>${c("01")}</inv:originalDocumentNumber>`);
    expect(xml).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
  });

  it("dobropis s odovzdanou pôvodnou (tu v tom istom balíku skôr): correctiveDocument; XSD", () => {
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [
        { invoice: faktura({ invoice_number: c("03"), id: "f-3" }), items: [polozka()] },
        { invoice: dobropis({ id: "d-3", invoice_number: c("04"), opravuje_fakturu_id: "f-3" }), items: [polozkaDobropisu()] },
      ],
      opravovane: { "d-3": c("03") },
      povodneCisla: { "d-3": c("03") },
    });
    uloz("V2-dobropis-s-povodnou", xml);
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).toMatch(
      new RegExp(`<inv:correctiveDocument itemTransfer="false">\\s*<typ:sourceDocument>\\s*<typ:number>${c("03")}</typ:number>`),
    );
  });

  it("pôvodná v tom istom balíku, ale vyradená kontrolou → dobropis ide bez odkazu", () => {
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [
        // Cudzia mena bez kurzu = prekážka, faktúra do súboru nejde.
        { invoice: faktura({ id: "f-5", invoice_number: c("05"), currency: "USD" }), items: [polozka()] },
        { invoice: dobropis({ id: "d-5", invoice_number: c("06"), opravuje_fakturu_id: "f-5" }), items: [polozkaDobropisu()] },
      ],
      opravovane: { "d-5": c("05") },
    });
    expect(xml).not.toContain(`<typ:numberRequested>${c("05")}<`);
    expect(xml).not.toContain("correctiveDocument");
    expect(chybySchemy(xml)).toEqual([]);
  });

  const odpocet = (o: Partial<OdpocetZalohy> = {}): OdpocetZalohy => ({
    zaloha: c("Z1"),
    zalohaId: "zf-1",
    doklad: c("P1"),
    vs: null,
    suma: 61.5,
    riadky: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
    ...o,
  });

  it("zalohyPrePohodu: bez povolenia odkazu `bezOdkazu`, číslo ostáva pre názov", () => {
    expect(zalohyPrePohodu([odpocet()], undefined, () => false)).toEqual([
      { cislo: c("Z1"), sadzba: 23, zaklad: 50, dph: 11.5, zalohaId: "zf-1", bezOdkazu: true },
    ]);
    expect(zalohyPrePohodu([odpocet()], undefined, (o) => Boolean(o.zalohaOdovzdana))?.[0].bezOdkazu).toBe(true);
    expect(zalohyPrePohodu([odpocet({ zalohaOdovzdana: true })], undefined, (o) => Boolean(o.zalohaOdovzdana))?.[0].bezOdkazu).toBeUndefined();
  });

  it("odpočet zálohy bez odovzdanej zálohovej: invoiceAdvancePaymentItem bez sourceDocument; XSD", () => {
    const f = faktura({
      id: "f-7",
      invoice_number: c("07"),
      subtotal: 200,
      vat_total: 46,
      total: 246,
      advance_amount: 61.5,
      _odpocty: [odpocet()],
    });
    const zalohy = { "f-7": zalohyPrePohodu([odpocet()], undefined, () => false)! };
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [{ invoice: f, items: [polozka({ quantity: 4, subtotal: 200, vat_amount: 46, total: 246 })] }],
      zalohy,
    });
    uloz("V3-odpocet-zalohy-bez-zalohovej", xml);
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).toContain("<inv:invoiceAdvancePaymentItem>");
    expect(xml).not.toMatch(/<inv:invoiceAdvancePaymentItem>\s*<inv:sourceDocument>/);
    expect(xml).toContain("<typ:priceVAT>-11.50</typ:priceVAT>");
  });

  it("odpočet s odovzdanou zálohovou: sourceDocument ostáva", () => {
    const zalohy = { "f-8": zalohyPrePohodu([odpocet({ zalohaOdovzdana: true })], undefined, (o) => Boolean(o.zalohaOdovzdana))! };
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [{ invoice: faktura({ id: "f-8", total: 123 }), items: [polozka()] }],
      zalohy,
    });
    expect(xml).toMatch(new RegExp(`<inv:sourceDocument>\\s*<typ:number>${c("Z1")}</typ:number>`));
    expect(chybySchemy(xml)).toEqual([]);
  });

  /* nacitajVazby (konektor aj balík) proti falošnému klientovi */
  function klient(tabulky: Record<string, any[]>) {
    return {
      from(t: string) {
        let rows = [...(tabulky[t] ?? [])];
        const q: any = {
          select: () => q,
          eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
          in: (k: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[k]))), q),
          is: (k: string, v: unknown) => ((rows = rows.filter((r) => (r[k] ?? null) === v)), q),
          order: () => q,
          range: () => q,
          then: (ok: any, zle: any) => Promise.resolve({ data: rows, error: null }).then(ok, zle),
        };
        return q;
      },
    };
  }
  const db = (exported: { zf?: string | null; f?: string | null }) =>
    klient({
      invoice_advances: [{ company_id: "c1", invoice_id: "fa", advance_invoice_id: "zf", amount: 61.5 }],
      invoices: [
        { id: "zf", company_id: "c1", type: "proforma", invoice_number: "ZF1", exported_at: exported.zf ?? null },
        {
          id: "ddp",
          company_id: "c1",
          type: "advance_payment",
          invoice_number: "DDP1",
          advance_invoice_id: "zf",
          status: "paid",
          deleted_at: null,
          invoice_items: [{ vat_rate: 23, subtotal: 50, vat_amount: 11.5 }],
        },
        { id: "pov", company_id: "c1", type: "regular", invoice_number: "FA1", exported_at: exported.f ?? null },
      ],
    });
  const fa = () => ({ id: "fa", type: "regular", invoice_number: "FA9" });
  const dob = () => ({ id: "dob", type: "credit_note", invoice_number: "DB9", opravuje_fakturu_id: "pov" });

  it("nacitajVazby: neodovzdaná zálohová a pôvodná → bez odkazov, pôvodné číslo pre KV áno", async () => {
    const { nacitajVazby } = await import("./pohoda-konektor.server");
    const v = await nacitajVazby(db({}), "c1", [fa(), dob()], new Map());
    expect(v.zalohy.fa.every((z) => z.bezOdkazu)).toBe(true);
    expect(v.opravovane).toEqual({});
    expect(v.povodneCisla).toEqual({ dob: "FA1" });
  });

  it("nacitajVazby: odovzdané (exported_at, aj migrácia z Doklada) → odkazy naším číslom", async () => {
    const { nacitajVazby } = await import("./pohoda-konektor.server");
    const v = await nacitajVazby(db({ zf: "2026-10-01", f: "2026-10-01" }), "c1", [fa(), dob()], new Map());
    expect(v.zalohy.fa.some((z) => z.bezOdkazu)).toBe(false);
    expect(v.zalohy.fa[0].cislo).toBe("ZF1");
    expect(v.opravovane).toEqual({ dob: "FA1" });
  });

  it("nacitajVazby: číslo potvrdené Pohodou má prednosť a platí ako odovzdané", async () => {
    const { nacitajVazby } = await import("./pohoda-konektor.server");
    const v = await nacitajVazby(db({}), "c1", [fa(), dob()], new Map([["zf", "26ZF01"], ["pov", "26FA01"]]));
    expect(v.zalohy.fa[0]).toMatchObject({ cislo: "26ZF01" });
    expect(v.zalohy.fa[0].bezOdkazu).toBeUndefined();
    expect(v.opravovane).toEqual({ dob: "26FA01" });
  });

  it("nacitajVazby: odkazovaný v tej istej dávke skôr áno, neskôr nie", async () => {
    const { nacitajVazby } = await import("./pohoda-konektor.server");
    const pov = { id: "pov", type: "regular", invoice_number: "FA1" };
    const skor = await nacitajVazby(db({}), "c1", [pov, dob()], new Map());
    expect(skor.opravovane).toEqual({ dob: "FA1" });
    const neskor = await nacitajVazby(db({}), "c1", [dob(), pov], new Map());
    expect(neskor.opravovane).toEqual({});
  });
});

/* ------------------------------------------------ 2. colné údaje */

describe("colný kód aj v poznámke položky (intrastatItem neskladová položka ignoruje)", () => {
  it("poznamkaSColnymKodom: KN, pôvod, hmotnosť; dlhý popis sa skráti, colné údaje ostanú celé", () => {
    expect(poznamkaSColnymKodom("", { kn: "85171300", povod: "CN", hmotnost: 0.4 })).toBe("KN 85171300, pôvod CN, 0,4 kg");
    expect(poznamkaSColnymKodom("Čierna", { kn: "85171300", povod: "", hmotnost: 0 })).toBe("Čierna · KN 85171300");
    expect(poznamkaSColnymKodom("Popis", { kn: "", povod: "CN", hmotnost: 1 })).toBe("Popis");
    const dlha = poznamkaSColnymKodom("x".repeat(200), { kn: "85171300", povod: "CN", hmotnost: 0.4 });
    expect(dlha.length).toBeLessThanOrEqual(90);
    expect(dlha.endsWith("KN 85171300, pôvod CN, 0,4 kg")).toBe(true);
  });

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

  it("tuzemská faktúra: note s KN aj intrastatItem; XSD", () => {
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [{ invoice: faktura({ id: "f-10", invoice_number: c("10") }), items: [mobil({ description: "Čierny, 128 GB" })] }],
    });
    uloz("V4-colny-kod-tuzemsko", xml);
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).toContain("<inv:note>Čierny, 128 GB · KN 85171300, pôvod CN, 0,4 kg</inv:note>");
    expect(xml).toContain("<inv:goodsCode>85171300</inv:goodsCode>");
  });

  it("dodanie tovaru do EÚ: note s KN, členenie UDdodEU; XSD", () => {
    const xml = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "f-11",
            invoice_number: c("11"),
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
      ],
    });
    uloz("V5-colny-kod-eu-tovar", xml);
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).toContain("<inv:note>KN 85171300, pôvod CN, 0,4 kg</inv:note>");
    expect(xml).toContain("<inv:classificationVAT><typ:ids>UDdodEU</typ:ids></inv:classificationVAT>");
    expect(xml).toContain("<inv:countryOfDestination>DE</inv:countryOfDestination>");
  });
});

/* ------------------------------------------ 3. + 4. vypnuté členenia */

describe("vypnuté členenie DPH v Pohode zastaví export", () => {
  const trojstranny = () =>
    faktura({
      id: "f-20",
      invoice_number: c("20"),
      customer_country: "DE",
      customer_ic_dph: "DE123456789",
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "trojstranny",
      vat_total: 0,
      total: 100,
    });
  const nula = () => polozka({ vat_rate: 0, vat_amount: 0, total: 100 });
  const ciselnik = [{ druh: "clenenie_dph", kod: "UD", popis: "Tuzemské plnenie", agenda: "U01", aktivne: true }];

  it("trojstranný obchod s vypnutým UDdod3 → závažná prekážka s návodom", () => {
    const nast = { ...nastavenia, cleneniaDph: ciselnik, vypnuteClenenia: ["UDdod3", "UDzahr"] };
    expect(cleneniaVydanejPrePohodu(trojstranny(), [nula()], paliera, nast)).toEqual(["UDdod3"]);
    const dovod = prekazkaVydanej(trojstranny(), [nula()], paliera, nast);
    expect(dovod).toBe(
      `${c("20")} — členenie DPH UDdod3 je v Pohode vypnuté (nie je v ponuke) — Pohoda by ho zmenila na tuzemské UD. Zapnite ho v Pohode (Nastavenie → Členenie DPH) alebo zvoľte iné.`,
    );
    expect(pohodaPrekazka(trojstranny(), paliera, { items: [nula()], nastavenia: nast })).toBe(dovod);
    // Bez potvrdenia faktúra do súboru nejde; po „Exportovať aj tak“ áno.
    expect(() =>
      buildPohodaInvoiceXml({ company: paliera, nastavenia: nast, invoices: [{ invoice: trojstranny(), items: [nula()] }] }),
    ).not.toThrow();
    const ajTak = buildPohodaInvoiceXml({
      company: paliera,
      nastavenia: { ...nast, ajSPrekazkami: true },
      invoices: [{ invoice: trojstranny(), items: [nula()] }],
    });
    expect(ajTak).toContain("<typ:ids>UDdod3</typ:ids>");
  });

  it("vypnuté členenie na položke (vlastné) tiež; zapnuté členenia prejdú", () => {
    const nast = { ...nastavenia, vypnuteClenenia: ["UDzahr"] };
    expect(prekazkaVydanej(faktura(), [polozka(), polozka({ pohoda_clenenie_dph: "UDzahr" })], paliera, nast)).toContain(
      "členenie DPH UDzahr je v Pohode vypnuté",
    );
    expect(prekazkaVydanej(faktura(), [polozka()], paliera, nast)).toBeNull();
    expect(prekazkaVydanej(trojstranny(), [nula()], paliera, nastavenia)).toBeNull();
  });

  it("clenenieMimoTuzemska: presný kód vypnutý v číselníku firmy sa nenahradí (ostane na kontrolu)", () => {
    const d = { reverseCharge: true, reverseChargeType: "eu_b2b", euPlnenie: "trojstranny" };
    const sVypnutym = [...ciselnik, { druh: "clenenie_dph", kod: "UDdod3", popis: "Trojstranný obchod", agenda: "U07", aktivne: false }];
    expect(clenenieMimoTuzemska(d, "SK", sVypnutym)).toBe("UDdod3");
    // Firma mimo SK nemá systémový záložný zoznam — predtým `null`, teraz vypnutý kód.
    expect(clenenieMimoTuzemska(d, "CZ", sVypnutym)).toBe("UDdod3");
    expect(clenenieMimoTuzemska(d, "CZ", ciselnik)).toBeNull();
    // Zapnutý náhradný kód z číselníka firmy má prednosť pred vypnutým.
    const sNahradou = [...sVypnutym, { druh: "clenenie_dph", kod: "UD3x", popis: "Trojstranný obchod – prostredník", agenda: "U07", aktivne: true }];
    expect(clenenieMimoTuzemska(d, "SK", sNahradou)).toBe("UD3x");
  });
});
