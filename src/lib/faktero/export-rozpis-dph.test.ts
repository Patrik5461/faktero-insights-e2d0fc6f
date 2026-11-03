/*
  Rozpis DPH po sadzbách vo všetkých exportoch okrem Pohody (3. 11. 2026):
  „Pri exportoch musí exportovať aj základ a aj rozpis DPH.“

  - priehradky sadzieb pre Omegu, Money a Flexi podľa sadzieb krajiny
    (dovtedy podľa poradia — bloček len s 19 % bol „základná“),
  - súpiska CSV: prenesenie sa nepočíta dvakrát, KV a domáca mena,
  - CSV so zaúčtovaním: riadky vzostupne a sumy v domácej mene,
  - súpisky v ZIP-e a Excel zoznamov: stĺpce po sadzbách,
  - ISDOC a Money S3 stále prechádzajú oficiálnou schémou.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildMoneyS3Xml, buildOmegaTxt } from "./export.server";
import { buildFlexiXml, buildUniverzalCsv } from "./export-dalsie";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import { buildCsvUctovanie, STLPCE_CSV_UCTOVANIA } from "./export-csv-uctovanie";
import { blocekNaUctovanie, vystavenaNaUctovanie } from "./zauctovanie-export";
import { buildIsdoc } from "./isdoc-export";
import {
  hodnotaStlpca,
  kodStlpca,
  nazovStlpca,
  priehradkySadzieb,
  rozpisVystavenej,
  stlpceRozpisu,
} from "./rozpis-dph-exportu";
import { rozpisBlocku } from "./rozuctovanie";
import { rozpisPrijatej } from "./prijate-do-pohody";
import { tabulka, stlpceRozpisuDph } from "./excel-zoznamu";

xmlRegisterFsInputProviders();

const company: any = {
  name: "Tobify s.r.o.",
  ico: "12345678",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
};

const hlavicka = (o: Record<string, unknown> = {}): any => ({
  id: "f1",
  type: "regular",
  invoice_number: "2026301",
  issue_date: "2026-11-02",
  delivery_date: "2026-11-02",
  due_date: "2026-11-16",
  currency: "EUR",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "44444444",
  customer_ic_dph: "SK2020000000",
  customer_country: "SK",
  ...o,
});

const polozka = (sadzba: number, zaklad: number, o: Record<string, unknown> = {}): any => ({
  name: `Tovar ${sadzba} %`,
  quantity: 1,
  unit: "ks",
  unit_price: zaklad,
  vat_rate: sadzba,
  subtotal: zaklad,
  vat_amount: Math.round(zaklad * sadzba) / 100,
  total: zaklad + Math.round(zaklad * sadzba) / 100,
  ...o,
});

/** Faktúra so všetkými slovenskými sadzbami: 0 / 5 / 19 / 23. */
const vsetkySadzby = {
  invoice: hlavicka({ subtotal: 400, vat_total: 47, total: 447 }),
  items: [polozka(23, 100), polozka(5, 100), polozka(0, 100), polozka(19, 100)],
};
/** Faktúra len s 19 %. */
const len19 = {
  invoice: hlavicka({ id: "f2", invoice_number: "2026302", subtotal: 100, vat_total: 19, total: 119 }),
  items: [polozka(19, 100)],
};
/** Faktúra len s 5 %. */
const len5 = {
  invoice: hlavicka({ id: "f3", invoice_number: "2026303", subtotal: 200, vat_total: 10, total: 210 }),
  items: [polozka(5, 200)],
};

describe("priehradky sadzieb podľa krajiny", () => {
  it("SK od 2025: 23 základná, 19 znížená, 5 druhá znížená — aj keď je na doklade sama", () => {
    const m = priehradkySadzieb([23, 19, 5, 0], "SK", "2026-11-02");
    expect(m.get(23)).toBe("zakladna");
    expect(m.get(19)).toBe("znizena");
    expect(m.get(5)).toBe("znizena2");
    expect(m.get(0)).toBe("nulova");
    expect(priehradkySadzieb([19], "SK", "2026-11-02").get(19)).toBe("znizena");
    expect(priehradkySadzieb([5], "SK", "2026-11-02").get(5)).toBe("znizena2");
  });
  it("historické 20 / 10 % podľa tabuľky, v ktorej platili; CZ 21 / 12", () => {
    const m = priehradkySadzieb([20, 10], "SK", "2024-06-01");
    expect(m.get(20)).toBe("zakladna");
    expect(m.get(10)).toBe("znizena");
    // Dobropis k plneniu z roku 2024 vystavený v roku 2026.
    expect(priehradkySadzieb([10], "SK", "2026-01-10").get(10)).toBe("znizena");
    const cz = priehradkySadzieb([21, 12], "CZ", "2026-11-02");
    expect(cz.get(21)).toBe("zakladna");
    expect(cz.get(12)).toBe("znizena");
  });
  it("dve sadzby do jednej priehradky (20 a 23) — druhá dostane voľnú", () => {
    const m = priehradkySadzieb([23, 20], "SK", "2026-11-02");
    expect(new Set(m.values()).size).toBe(3); // zakladna, iná, nulova
  });
});

describe("Omega TXT — sadzby do správnych stĺpcov", () => {
  const riadky = buildOmegaTxt({ company, invoices: [len19, len5, vsetkySadzby], preskocene: [] }).split("\r\n");
  const r01 = riadky.filter((r) => r.startsWith("R01")).map((r) => r.split("\t"));
  it("faktúra len s 19 % ide do „nižšej“ sadzby (st. 8, 12, 14), nie do vyššej", () => {
    const r = r01[0];
    expect(r[7]).toBe("100,00");
    expect(r[11]).toBe("19");
    expect(r[13]).toBe("19,00");
    expect(r[8]).toBe("0,00");
    expect(r[12] ?? "").toBe("");
    const r02 = riadky.filter((x) => x.startsWith("R02")).map((x) => x.split("\t"));
    expect(r02[0][5]).toBe("N");
  });
  it("faktúra len s 5 % ide do „znížená 2“ (st. 95–97)", () => {
    const r = r01[1];
    expect(r[94]).toBe("5");
    expect(r[95]).toBe("200,00");
    expect(r[96]).toBe("10,00");
    expect(r[7]).toBe("0,00");
    expect(r[8]).toBe("0,00");
  });
  it("všetky sadzby: 23 vyššia, 19 nižšia, 5 znížená 2, 0 nulová", () => {
    const r = r01[2];
    expect([r[7], r[8], r[9], r[11], r[12]]).toEqual(["100,00", "100,00", "100,00", "19", "23"]);
    expect([r[13], r[14]]).toEqual(["19,00", "23,00"]);
    expect([r[94], r[95], r[96]]).toEqual(["5", "100,00", "5,00"]);
  });
});

describe("Money S3 vystavené — hladiny sadzieb a schéma", () => {
  const SCHEMA = new URL("./__fixtures__/money-s3-uct-schemas/_Document.xsd", import.meta.url);
  const validator = XsdValidator.fromDoc(
    XmlDocument.fromBuffer(readFileSync(SCHEMA), { url: fileURLToPath(SCHEMA) }),
  );
  const { xml } = buildMoneyS3Xml({ company, invoices: [len19, vsetkySadzby] });
  const doklady = xml.split("<FaktVyd>").slice(1);
  it("faktúra len s 19 % má 19 ako zníženú sadzbu (SazbaDPH1, Zaklad5)", () => {
    expect(doklady[0]).toContain("<SazbaDPH1>19</SazbaDPH1>");
    expect(doklady[0]).not.toContain("<SazbaDPH2>");
    expect(doklady[0]).toMatch(/<Zaklad5>100\.00<\/Zaklad5>/);
    expect(doklady[0]).toMatch(/<Zaklad22>0\.00<\/Zaklad22>/);
  });
  it("všetky sadzby: 23 základná, 19 znížená, 5 v ďalších sadzbách, 0 v Zaklad0", () => {
    const d = doklady[1];
    expect(d).toContain("<SazbaDPH1>19</SazbaDPH1>");
    expect(d).toContain("<SazbaDPH2>23</SazbaDPH2>");
    expect(d).toMatch(/<Zaklad0>100\.00<\/Zaklad0>/);
    expect(d).toMatch(/<Sazba>5<\/Sazba>\s*<Zaklad>100\.00<\/Zaklad>\s*<DPH>5\.00<\/DPH>/);
  });
  it("prejde oficiálnou schémou Money S3", () => {
    const doc = XmlDocument.fromString(xml);
    try {
      expect(() => validator.validate(doc)).not.toThrow();
    } finally {
      doc.dispose();
    }
  });
});

describe("ABRA Flexi — priehradky sadzieb", () => {
  it("vystavená: 19 % snížená, 5 % 2. snížená, 23 % základní", () => {
    const { xml } = buildFlexiXml({ invoices: [vsetkySadzby], krajina: "SK" });
    const polozky = xml.split("<faktura-vydana-polozka>").slice(1);
    const typ = (p: string) => /<typSzbDphK>([^<]+)</.exec(p)?.[1];
    const szb = (p: string) => /<szbDph>([^<]+)</.exec(p)?.[1];
    const mapa = Object.fromEntries(polozky.map((p) => [szb(p), typ(p)]));
    expect(mapa).toEqual({
      "23.00": "typSzbDph.dphZakl",
      "5.00": "typSzbDph.dphSniz2",
      "0.00": "typSzbDph.dphOsv",
      "19.00": "typSzbDph.dphSniz",
    });
  });
  it("zaúčtovaný bloček len s 19 % ide do sumZklSniz, nie do základnej", () => {
    const d = blocekNaUctovanie(
      {
        id: "b1",
        document_number: "B-1",
        issue_date: "2026-11-02",
        total_amount: 119,
        vat_breakdown: [{ sadzba: 19, zaklad: 100, dph: 19 }],
        supplier_name: "Potraviny",
      },
      { predkontacia: "PD" } as never,
    );
    const { xml } = buildFlexiUctovanie({ firma: company, doklady: [d], kody: {} });
    expect(xml).toContain("<sumZklSniz>100.00</sumZklSniz>");
    expect(xml).toContain("<sumDphSniz>19.00</sumDphSniz>");
    expect(xml).not.toContain("<sumZklZakl>");
  });
});

describe("súpiska CSV vystavených", () => {
  const riadkyCsv = (csv: string) => csv.trim().split("\r\n").map((r) => r.split(";"));
  it("položka v prenesení so sadzbou 23 % nie je aj v „Základ 23 %“", () => {
    const f = {
      invoice: hlavicka({ subtotal: 1500, vat_total: 230, total: 1730, kv_clenenie: "A2" }),
      items: [polozka(23, 1000), polozka(23, 500, { prenesenie: true, vat_amount: 0, total: 500 })],
    };
    const [h, r] = riadkyCsv(buildUniverzalCsv({ invoices: [f], krajina: "SK" }));
    const v = (n: string) => r[h.indexOf(n)];
    expect(v("Základ 23 %")).toBe("1000,00");
    expect(v("DPH 23 %")).toBe("230,00");
    expect(v("Základ v prenesení")).toBe("500,00");
    expect(v("KV DPH")).toBe("A2");
  });
  it("tuzemské prenesenie celej faktúry ide do „Základ v prenesení“, nie do 0 %", () => {
    const f = {
      invoice: hlavicka({ subtotal: 500, vat_total: 0, total: 500, reverse_charge: true, reverse_charge_type: "domestic_69" }),
      items: [polozka(0, 500)],
    };
    const [h, r] = riadkyCsv(buildUniverzalCsv({ invoices: [f], krajina: "SK" }));
    expect(r[h.indexOf("Základ 0 %")]).toBe("0,00");
    expect(r[h.indexOf("Základ v prenesení")]).toBe("500,00");
  });
  it("cudzia mena: základ a DPH aj v EUR", () => {
    const f = {
      invoice: hlavicka({
        currency: "CZK",
        exchange_rate: 25,
        subtotal: 1000,
        vat_total: 230,
        total: 1230,
        subtotal_eur: 40,
        vat_total_eur: 9.2,
        total_eur: 49.2,
      }),
      items: [polozka(23, 1000)],
    };
    const [h, r] = riadkyCsv(buildUniverzalCsv({ invoices: [f], krajina: "SK" }));
    expect(r[h.indexOf("Základ v EUR")]).toBe("40,00");
    expect(r[h.indexOf("DPH v EUR")]).toBe("9,20");
    expect(r[h.indexOf("Základ 23 %")]).toBe("1000,00");
  });
});

describe("CSV so zaúčtovaním", () => {
  it("riadky po sadzbách vzostupne a pri cudzej mene aj v domácej mene", () => {
    const d = vystavenaNaUctovanie(
      { ...vsetkySadzby.invoice, currency: "USD", exchange_rate: 1.25 },
      vsetkySadzby.items,
      { predkontacia: "3FV" },
    );
    const csv = buildCsvUctovanie({ doklady: [d], kody: {}, krajina: "SK" }).trim().split("\r\n");
    const h = csv[0].split(";");
    const riadky = csv.slice(1).map((r) => r.split(";"));
    expect(riadky.map((r) => r[h.indexOf("sadzba")])).toEqual(["0", "5", "19", "23"]);
    const r23 = riadky[3];
    expect(r23[h.indexOf("mena_domaca")]).toBe("EUR");
    expect(r23[h.indexOf("zaklad_domaca")]).toBe("80,00");
    expect(r23[h.indexOf("dph_domaca")]).toBe("18,40");
    expect(h).toEqual(STLPCE_CSV_UCTOVANIA);
  });
});

describe("rozpis pre súpisky v ZIP-e a Excel zoznamov", () => {
  it("vystavená so zľavou na doklad: stĺpce sedia s hlavičkou", () => {
    const inv = hlavicka({ subtotal: 180, vat_total: 32.4, total: 212.4, discount_total: 20 });
    const r = rozpisVystavenej(inv, [polozka(23, 100), polozka(19, 100)]);
    const z = r.reduce((a, x) => a + x.zaklad, 0);
    const d = r.reduce((a, x) => a + x.dph, 0);
    expect(Math.round(z * 100) / 100).toBe(180);
    expect(Math.round(d * 100) / 100).toBe(32.4);
    expect(r.map((x) => x.sadzba)).toEqual([19, 23]);
  });
  it("záporne uložený dobropis má záporné stĺpce", () => {
    const inv = hlavicka({ type: "credit_note", subtotal: -100, vat_total: -23, total: -123 });
    expect(rozpisVystavenej(inv, [polozka(23, 100)])).toEqual([{ sadzba: 23, zaklad: -100, dph: -23 }]);
  });
  it("stĺpce len zo sadzieb dávky, vzostupne, 0 % bez DPH a prenesenie na konci", () => {
    const s = stlpceRozpisu([
      [{ sadzba: 23, zaklad: 100, dph: 23 }],
      [
        { sadzba: 0, zaklad: 50, dph: 0 },
        { sadzba: 5, zaklad: 10, dph: 0.5 },
        { sadzba: 23, zaklad: 70, dph: 0, pdp: true },
      ],
    ]);
    expect(s.map(nazovStlpca)).toEqual([
      "Základ 0 %",
      "Základ 5 %",
      "DPH 5 %",
      "Základ 23 %",
      "DPH 23 %",
      "Základ v prenesení 23 %",
    ]);
    expect(s.map(kodStlpca)).toEqual(["zaklad_0", "zaklad_5", "dph_5", "zaklad_23", "dph_23", "zaklad_pdp_23"]);
    expect(hodnotaStlpca([{ sadzba: 23, zaklad: 70, dph: 0, pdp: true }], s[3])).toBe(0);
  });
  it("bloček s rozpisom a prijatá faktúra s položkami dajú stĺpce v Exceli", () => {
    const blocek = {
      document_number: "B-7",
      vat_breakdown: [
        { sadzba: 23, zaklad: 10, dph: 2.3 },
        { sadzba: 5, zaklad: 20, dph: 1 },
      ],
    };
    expect(rozpisBlocku(blocek).map((r) => r.sadzba)).toEqual([5, 23]);
    const prijata = {
      amount_without_vat: 200,
      vat_amount: 42,
      amount_total: 242,
      items: [
        { name: "A", quantity: 1, unit_price: 100, vat_rate: 23, total: 123 },
        { name: "B", quantity: 1, unit_price: 100, vat_rate: 19, total: 119 },
      ],
    };
    const t = (k: string, p?: Record<string, string | number>) =>
      k.replace(/\{(\w+)\}/g, (_, x) => String(p?.[x] ?? ""));
    const data = tabulka([prijata], [{ nazov: "Číslo", hodnota: () => "1" }, ...stlpceRozpisuDph([prijata], rozpisPrijatej, t)]);
    expect(data[0]).toEqual(["Číslo", "Základ 19 %", "DPH 19 %", "Základ 23 %", "DPH 23 %"]);
    expect(data[1]).toEqual(["1", 100, 19, 100, 23]);
  });
});

describe("ISDOC — rekapitulácia vzostupne aj so sadzbou zálohy", () => {
  it("sadzba odpočtu, ktorá na faktúre nie je, sa zaradí podľa poradia a schéma platí", () => {
    const xml = buildIsdoc({
      invoice: {
        ...hlavicka({ subtotal: 200, vat_total: 42, total: 242 }),
        _odpocty: [
          {
            zaloha: "Z1",
            doklad: "DP1",
            vs: "1",
            suma: 10.5,
            riadky: [{ sadzba: 5, zaklad: 10, dph: 0.5 }],
          },
        ],
      } as any,
      items: [polozka(23, 100), polozka(19, 100)],
      company,
    });
    const percenta = [...xml.matchAll(/<TaxSubTotal>[\s\S]*?<Percent>([^<]+)<\/Percent>/g)].map((m) => m[1]);
    expect(percenta).toEqual(["5.00", "19.00", "23.00"]);
    const validator = XsdValidator.fromDoc(
      XmlDocument.fromBuffer(readFileSync(new URL("./schemy/isdoc-invoice-6.0.2.xsd", import.meta.url))),
    );
    const doc = XmlDocument.fromString(xml);
    try {
      expect(() => validator.validate(doc)).not.toThrow();
    } finally {
      doc.dispose();
    }
  });
});
