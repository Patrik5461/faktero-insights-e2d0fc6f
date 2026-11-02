/*
  Hotovostný bloček z eKasy do Pohody (pokladničný doklad) — pripomienka
  účtovníčky 2. 11. 2026: chýbalo členenie KV DPH, adresa, text a členenie
  DPH v položkách. Doklady sú skutočné: odpoveď Finančnej správy (Action,
  9. 8. 2026) a bloček SCARIS z eKasy so zálohou na obal (0 %).
  XML sa overuje proti oficiálnej schéme Stormware (voucher.xsd).
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml } from "./export.server";
import { mapujFsDoklad } from "./ekasa";
import {
  clenenieBlockuPodlaZakona,
  jeHotovostnyBlocek,
  kodyPolozkyBlocku,
  rozdelAdresu,
  sAdresouDodavatela,
  textBlocku,
} from "./blocek-pohoda";
import { icaBezAdresy, zRegistra } from "./blocek-pohoda.server";

xmlRegisterFsInputProviders();

function chybySchemy(xml: string, prefix = "vch", subor = "voucher.xsd"): string[] {
  const url = new URL(`./schemy/pohoda/${subor}`, import.meta.url);
  const v = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
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

const hodnota = (xml: string, tag: string) =>
  new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;

const firma: any = {
  id: "c1",
  name: "Vzorová firma s.r.o.",
  ico: "36123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
};
/** Nastavenia ako PALIERA: bločky podľa platby, pokladňa HP, žiadne predvolené členenie. */
const nastavenia: any = { blockyPodlaPlatby: true, pokladna: "HP" };

/* Skutočná odpoveď Finančnej správy (ekasa-fs.test.ts) — bloček uložený tak, ako ho uloží skener. */
const fs = mapujFsDoklad({
  receiptId: "O-E2B1BC957FA443C8B1BC957FA463C814",
  ico: "54527571",
  dic: "2121713605",
  icDph: "SK2121713605",
  issueDate: "09.08.2026 18:43:20",
  receiptNumber: 8305,
  totalPrice: 48.55,
  organization: {
    buildingNumber: null,
    country: "Slovensko",
    municipality: "Bratislava - mestská časť Staré Mesto",
    name: "Action Slovakia s.r.o.",
    postalCode: "81108",
    propertyRegistrationNumber: "2",
    streetName: "Karadžičova",
  },
  vatSummary: [
    { vatBase: 1.42, vatAmount: 0.07, vat: { vatRate: 5 } },
    { vatBase: 38.26, vatAmount: 8.8, vat: { vatRate: 23 } },
  ],
  items: [],
});
const blocekAction: any = {
  id: "0b6f8f0e-0000-4000-8000-000000000001",
  source: "qr",
  status: "processed",
  payment_method: "hotovost",
  supplier_name: fs.dodavatel,
  supplier_ico: fs.ico,
  supplier_ic_dph: fs.ic_dph,
  document_number: fs.cisloDokladu,
  issue_date: fs.datum,
  currency: "EUR",
  total_amount: fs.suma,
  vat_amount: fs.dph,
  net_amount: fs.zaklad,
  vat_breakdown: fs.sadzby,
  items: null,
  pohoda_predkontacia: "501100 211000",
};

/* Bloček SCARIS z eKasy (O-F3326D3F…), tri sadzby vrátane zálohy na obal. */
const blocekScaris: any = {
  id: "0b6f8f0e-0000-4000-8000-000000000002",
  source: "qr",
  status: "processed",
  payment_method: "hotovost",
  supplier_name: "SCARIS s.r.o.",
  supplier_ico: "46904841",
  supplier_ic_dph: "SK2023632666",
  document_number: "13141",
  issue_date: "2026-10-21",
  currency: "EUR",
  total_amount: 6.13,
  vat_breakdown: [
    { dph: 0.37, sadzba: 23, zaklad: 1.62 },
    { dph: 0, sadzba: 0, zaklad: 0.15 },
    { dph: 0.64, sadzba: 19, zaklad: 3.35 },
  ],
  items: [
    {
      name: "Z San Pellegrino pom.0,33l  k",
      total: 1.99,
      quantity: 1,
      vat_rate: 23,
      unit_price: 1.99,
    },
    { name: "Záloh plech", total: 0.15, quantity: 1, vat_rate: 0, unit_price: 0.15 },
    {
      name: "SC Panini Kura a Chorizo 186g",
      total: 3.99,
      quantity: 1,
      vat_rate: 19,
      unit_price: 3.99,
    },
  ],
  qr_raw: "O-F3326D3FA8124934B26D3FA812993412",
  pohoda_predkontacia: "501100 211000",
};

describe("adresa dodávateľa z eKasy", () => {
  it("jeden riadok z Finančnej správy → ulica, PSČ, obec, krajina", () => {
    expect(fs.adresa).toBe("Karadžičova 2, 81108 Bratislava - mestská časť Staré Mesto, Slovensko");
    expect(rozdelAdresu(fs.adresa)).toEqual({
      street: "Karadžičova 2",
      zip: "81108",
      city: "Bratislava - mestská časť Staré Mesto",
      country: "SK",
    });
    expect(rozdelAdresu("Bajkalská 9834/19/A, 821 02 Bratislava, SK")).toMatchObject({
      street: "Bajkalská 9834/19/A",
      zip: "82102",
      city: "Bratislava",
      country: "SK",
    });
    expect(rozdelAdresu("")).toEqual({});
  });

  it("doplní sa len prázdne pole, údaj z bločku má prednosť", () => {
    const d = sAdresouDodavatela(
      { supplier_ico: "54527571", supplier_ic_dph: "SK2121713605", supplier_city: "Nitra" },
      {
        "54527571": {
          street: "Karadžičova 2",
          city: "Bratislava",
          zip: "81108",
          dic: "2121713605",
          ic_dph: "SKX",
        },
      },
    );
    expect(d).toMatchObject({
      supplier_street: "Karadžičova 2",
      supplier_city: "Nitra",
      supplier_zip: "81108",
      supplier_dic: "2121713605",
      supplier_ic_dph: "SK2121713605",
    });
  });

  it("z registra (company_cache) a len bločky v hotovosti či kartou bez adresy", () => {
    expect(
      zRegistra({
        street: "Drevárska 23",
        city: "Pezinok",
        zip: "902 01",
        country: "SK",
        dic: "2121372891",
      }),
    ).toMatchObject({ street: "Drevárska 23", zip: "90201", country: "SK", dic: "2121372891" });
    expect(
      icaBezAdresy([
        blocekAction,
        { ...blocekScaris, payment_method: "prevod" },
        { ...blocekScaris, id: "x", supplier_street: "Hlavná 1" },
        { ...blocekAction, _typPohody: "receivedInvoice" },
      ]),
    ).toEqual(["54527571"]);
  });
});

describe("text, členenie a položky", () => {
  it("text je čo sa kúpilo, ako pri prijatej faktúre", () => {
    expect(textBlocku({ items: [{ name: "* 3 03     OMV Diesel" }] })).toBe("OMV Diesel");
    expect(textBlocku(blocekScaris)).toBe(
      "Z San Pellegrino pom.0,33l k, Záloh plech, SC Panini Kura a Chorizo 186g",
    );
    expect(textBlocku({ items: null })).toBe("");
  });

  it("členenie podľa zákona: s DPH PD, bez DPH či bez odpočtu PN, CZ nič", () => {
    expect(clenenieBlockuPodlaZakona({ company: firma, doklad: blocekAction, dph: 8.87 })).toBe(
      "PD",
    );
    expect(clenenieBlockuPodlaZakona({ company: firma, doklad: blocekAction, dph: 0 })).toBe("PN");
    expect(
      clenenieBlockuPodlaZakona({
        company: firma,
        doklad: { ...blocekAction, odpocet: false },
        dph: 8.87,
      }),
    ).toBe("PN");
    expect(
      clenenieBlockuPodlaZakona({
        company: { ...firma, country: "CZ" },
        doklad: blocekAction,
        dph: 1,
      }),
    ).toBe(null);
  });

  it("položka: vlastné kódy, inak dokladu; KV len s DPH a mimo nezahŕňať", () => {
    expect(
      kodyPolozkyBlocku({
        polozka: { vat_rate: 23 },
        predkontacia: "501",
        clenenie: "PD",
        kv: "B3",
      }),
    ).toEqual({
      predkontacia: "501",
      clenenie: "PD",
      kv: "B3",
    });
    expect(
      kodyPolozkyBlocku({ polozka: { vat_rate: 0 }, predkontacia: "501", clenenie: "PD", kv: "B3" })
        .kv,
    ).toBe("");
    expect(
      kodyPolozkyBlocku({
        polozka: { vat_rate: 23, predkontacia: "518", clenenie: "PN" },
        predkontacia: "501",
        clenenie: "PD",
        kv: "B3",
      }),
    ).toEqual({ predkontacia: "518", clenenie: "PN", kv: "" });
  });

  it("doplnenie má bloček v hotovosti aj kartou (nie prevod, faktúra ani vyúčtovanie)", () => {
    expect(jeHotovostnyBlocek(blocekAction)).toBe(true);
    expect(jeHotovostnyBlocek({ ...blocekAction, payment_method: "karta" })).toBe(true);
    expect(jeHotovostnyBlocek({ ...blocekAction, payment_method: "prevod" })).toBe(false);
    expect(jeHotovostnyBlocek({ ...blocekAction, _typPohody: "receivedInvoice" })).toBe(false);
    expect(jeHotovostnyBlocek({ ...blocekAction, vyuctovanie_id: "v1" })).toBe(false);
  });
});

describe("pokladničný doklad v Pohode (voucher.xsd)", () => {
  it("bloček Action: členenie DPH aj KV, adresa z eKasy, text", () => {
    const a = rozdelAdresu(fs.adresa);
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: {
        ...nastavenia,
        adresyDodavatelov: {
          "54527571": {
            street: a.street,
            city: a.city,
            zip: a.zip,
            country: a.country,
            dic: fs.dic,
          },
        },
      },
      doklady: [blocekAction],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<vch:voucherType>expense</vch:voucherType>");
    expect(x).toContain("<vch:classificationVAT><typ:ids>PD</typ:ids></vch:classificationVAT>");
    expect(x).toContain("<vch:classificationKVDPH><typ:ids>B3</typ:ids></vch:classificationKVDPH>");
    expect(hodnota(x, "vch:text")).toBe("Action Slovakia s.r.o. č. 8305");
    expect(hodnota(x, "typ:company")).toBe("Action Slovakia s.r.o.");
    expect(hodnota(x, "typ:street")).toBe("Karadžičova 2");
    expect(hodnota(x, "typ:zip")).toBe("81108");
    expect(hodnota(x, "typ:city")).toBe("Bratislava - mestská časť Staré Mesto");
    expect(x).toContain("<typ:country><typ:ids>SK</typ:ids></typ:country>");
    expect(hodnota(x, "typ:ico")).toBe("54527571");
    expect(hodnota(x, "typ:dic")).toBe("2121713605");
    expect(hodnota(x, "typ:icDph")).toBe("SK2121713605");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("8.80");
    expect(hodnota(x, "typ:price3VAT")).toBe("0.07");
  });

  it("bloček SCARIS s položkami: každá položka nesie predkontáciu, členenie DPH a KV", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      doklady: [blocekScaris],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "vch:text")).toMatch(/^Z San Pellegrino/);
    const polozky = x.split("<vch:voucherItem>").slice(1);
    expect(polozky).toHaveLength(3);
    for (const p of polozky) {
      expect(p).toContain("<vch:accounting><typ:ids>501100 211000</typ:ids></vch:accounting>");
      expect(p).toContain("<vch:classificationVAT><typ:ids>PD</typ:ids></vch:classificationVAT>");
    }
    expect(polozky[0]).toContain(
      "<vch:classificationKVDPH><typ:ids>B3</typ:ids></vch:classificationKVDPH>",
    );
    // Záloha na obal (0 %) do KV nepatrí.
    expect(polozky[1]).toContain("<vch:rateVAT>none</vch:rateVAT>");
    expect(polozky[1]).not.toContain("classificationKVDPH");
    expect(polozky[2]).toContain(
      "<vch:classificationKVDPH><typ:ids>B3</typ:ids></vch:classificationKVDPH>",
    );
  });

  it("vlastné členenie a KV dokladu majú prednosť pred zákonom", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [{ ...blocekAction, pohoda_clenenie_dph: "PDx", kv_clenenie: "B2" }],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<vch:classificationVAT><typ:ids>PDx</typ:ids></vch:classificationVAT>");
    expect(x).toContain("<vch:classificationKVDPH><typ:ids>B2</typ:ids></vch:classificationKVDPH>");
  });

  it("bloček kartou ide do Ostatných záväzkov s doplneným členením a adresou", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, adresyDodavatelov: { "54527571": { street: "Karadžičova 2" } } },
      doklady: [{ ...blocekAction, payment_method: "karta" }],
    });
    expect(chybySchemy(x, "inv", "invoice.xsd")).toEqual([]);
    expect(x).toContain("<inv:invoice ");
    expect(x).not.toContain("<vch:voucher");
    expect(x).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    expect(x).toContain("<inv:classificationVAT>");
    expect(x).toContain("Karadžičova");
  });
});
