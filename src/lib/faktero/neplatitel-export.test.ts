/*
  Prijaté doklady neplatiteľa DPH v účtovných exportoch (`neplatitel-export.ts`):
  celá suma ako základ bez DPH, členenie PN, bez KV; platiteľ a prenesenie
  ostávajú bezo zmeny.
*/
import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
  clenenieNeplatitela,
  dokladBezDphNeplatitela,
  dokladVPreneseni,
  uctovanieBezDphNeplatitela,
} from "./neplatitel-export";
import { blocekNaUctovanie, prijataNaUctovanie, type NastaveniaUctovania } from "./zauctovanie-export";
import { buildOmegaUctovanie } from "./export-omega-uctovanie";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import { prijataAkoDoklad } from "./prijate-do-pohody";

const neplatitel = { country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" };
const sk7 = { country: "SK", vat_payer: false, vat_scheme: "sk_7", ic_dph: "SK2122358579" };
const platitel = { country: "SK", vat_payer: true, vat_scheme: "sk_4", ic_dph: "SK2020123456" };
const czNeplatce = { country: "CZ", vat_payer: false, vat_scheme: "cz_neplatce" };

/* Bloček 23 % + 19 % so zaokrúhlením −0,01 € (súčet rozpisu 29,36, zaplatené 29,35). */
const blocek: any = {
  id: "b1",
  document_number: "0123-45",
  issue_date: "2026-10-20",
  payment_method: "hotovost",
  supplier_name: "Kaufland",
  total_amount: 29.35,
  net_amount: 24,
  vat_amount: 5.36,
  vat_breakdown: [
    { sadzba: 23, zaklad: 20, dph: 4.6 },
    { sadzba: 19, zaklad: 4, dph: 0.76 },
  ],
  items: [
    { name: "Papier", quantity: 2, unit_price: 6.15, total: 12.3, vat_rate: 23, clenenie: "PD" },
    { name: "Toner", quantity: 1, unit_price: 12.3, total: 12.3, vat_rate: 23 },
    { name: "Káva", quantity: 1, unit_price: 4.76, total: 4.76, vat_rate: 19 },
  ],
  pohoda_predkontacia: "1Pv",
  pohoda_clenenie_dph: "PD",
  kv_clenenie: "B3",
  odpocet: false,
};

const prijata: any = {
  id: "p1",
  invoice_number: "FA-77",
  issue_date: "2026-09-10",
  delivery_date: "2026-09-10",
  supplier_name: "Dodávateľ",
  supplier_country: "SK",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  pohoda_clenenie_dph: "PD",
  kv_clenenie: "B2",
  odpocet: false,
  items: [{ name: "Materiál", quantity: 2, unit_price: 50, vat_rate: 23, total: 100 }],
};

describe("clenenieNeplatitela", () => {
  it("prvé „nezahŕňať“ z kandidátov, inak PN", () => {
    expect(clenenieNeplatitela("PD", null, "PD")).toBe("PN");
    expect(clenenieNeplatitela("PD", "PNx")).toBe("PNx");
    expect(clenenieNeplatitela(null, "", "PN")).toBe("PN");
    expect(clenenieNeplatitela("PB")).toBe("PN");
  });
});

describe("dokladBezDphNeplatitela (Pohoda)", () => {
  it("platiteľ — ten istý objekt", () => {
    expect(dokladBezDphNeplatitela(blocek, platitel)).toBe(blocek);
    expect(dokladBezDphNeplatitela(blocek, null)).toBe(blocek);
    // Firma z prenosu bez režimu — nevieme, nič sa nemení.
    expect(dokladBezDphNeplatitela(blocek, { country: "SK", vat_payer: false })).toBe(blocek);
  });

  it("bloček neplatiteľa: celá suma v nulovej sadzbe, PN, bez KV, položky s DPH v cene", () => {
    const d = dokladBezDphNeplatitela(blocek, neplatitel);
    expect(d.vat_breakdown).toEqual([{ sadzba: 0, zaklad: 29.35, dph: 0 }]);
    expect(d.net_amount).toBe(29.35);
    expect(d.vat_amount).toBe(0);
    expect(d.pohoda_clenenie_dph).toBe("PN");
    expect(d.kv_clenenie).toBeNull();
    expect(d.items.map((x: any) => [x.vat_rate, x.total, x.clenenie])).toEqual([
      [0, 12.3, null],
      [0, 12.3, null],
      [0, 4.76, null],
    ]);
    // Uložený doklad sa nemení.
    expect(blocek.vat_breakdown).toHaveLength(2);
  });

  it("§ 7 / § 7a (registrovaná osoba) je tiež neplatiteľ", () => {
    expect(dokladBezDphNeplatitela(blocek, sk7).vat_breakdown).toEqual([{ sadzba: 0, zaklad: 29.35, dph: 0 }]);
  });

  it("CZ neplátce: rovnako, členenie PN", () => {
    const d = dokladBezDphNeplatitela(blocek, czNeplatce);
    expect(d.vat_breakdown).toEqual([{ sadzba: 0, zaklad: 29.35, dph: 0 }]);
    expect(d.pohoda_clenenie_dph).toBe("PN");
  });

  it("predvolené „nezahŕňať“ firmy má prednosť pred PN", () => {
    expect(dokladBezDphNeplatitela({ ...blocek, pohoda_clenenie_dph: null }, neplatitel, ["PD", "PNneplat"]).pohoda_clenenie_dph).toBe(
      "PNneplat",
    );
  });

  it("prijatá faktúra: položky v nulovej sadzbe s cenou s DPH, rozúčtovanie so sumami", () => {
    const d = dokladBezDphNeplatitela(
      prijataAkoDoklad({
        ...prijata,
        rozuctovanie: [
          { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 60, dph: 13.8, kv: "B2" },
          { predkontacia: "2Fp", clenenie: "PD", sadzba: 23, zaklad: 40, dph: 9.2 },
        ],
      }) as any,
      neplatitel,
    );
    expect(d.vat_breakdown).toEqual([{ sadzba: 0, zaklad: 123, dph: 0 }]);
    expect(d._polozkyPrijatej).toMatchObject([{ sadzba: 0, zaklad: 123, dph: 0, cena: 61.5, clenenie: null }]);
    expect(d.rozuctovanie.map((r: any) => [r.sadzba, r.zaklad, r.dph, r.clenenie, r.kv])).toEqual([
      [0, 73.8, 0, null, null],
      [0, 49.2, 0, null, null],
    ]);
  });

  it("prenesenie, samozdanenie a nadobudnutie ostávajú", () => {
    const rc = prijataAkoDoklad({ ...prijata, vat_amount: 0, amount_total: 100, reverse_charge: true, items: [] });
    expect(dokladVPreneseni(rc)).toBe(true);
    expect(dokladBezDphNeplatitela(rc, neplatitel)).toBe(rc);
    const sam = prijataAkoDoklad({ ...prijata, vat_amount: 0, amount_total: 100, dph_rezim: "samozdanenie", items: [] });
    expect(dokladBezDphNeplatitela(sam, neplatitel)).toBe(sam);
    const nad = prijataAkoDoklad({ ...prijata, vat_amount: 0, amount_total: 100, dph_rezim: "nadobudnutie", items: [] });
    expect(dokladBezDphNeplatitela(nad, neplatitel)).toBe(nad);
  });

  it("zálohová faktúra ostáva", () => {
    const z = prijataAkoDoklad({ ...prijata, type: "proforma" });
    expect(dokladBezDphNeplatitela(z, neplatitel)).toBe(z);
  });
});

const nast: NastaveniaUctovania = {
  predkontaciaPrijata: "1Fp",
  predkontaciaDoklady: "1Pv",
  clenenieDphPrijata: "PD",
  blockyPodlaPlatby: true,
};

describe("uctovanieBezDphNeplatitela (Omega, Money, Flexi, MRP, DATEV, CSV)", () => {
  it("platiteľ — ten istý objekt", () => {
    const d = blocekNaUctovanie(blocek, nast);
    expect(uctovanieBezDphNeplatitela(d, platitel)).toBe(d);
  });

  it("bloček: jeden riadok 0 % so sumou dokladu, zaokrúhlenie v základe, PN, bez KV a odpočtu", () => {
    const d = uctovanieBezDphNeplatitela(blocekNaUctovanie(blocek, nast), neplatitel);
    expect(d.riadky).toEqual([
      expect.objectContaining({ sadzba: 0, zaklad: 29.35, dph: 0, clenenie: "PN", kv: null, odpocet: false }),
    ]);
    expect([d.zaklad, d.dph, d.celkom, d.zaokruhlenie]).toEqual([29.35, 0, 29.35, 0]);
    expect([d.clenenie, d.kv, d.rozuctovany]).toEqual(["PN", null, false]);
  });

  it("prijatá: položky 0 % s cenou s DPH", () => {
    const d = uctovanieBezDphNeplatitela(prijataNaUctovanie(prijata, nast), neplatitel);
    expect(d.riadky).toHaveLength(1);
    expect(d.riadky[0]).toMatchObject({ sadzba: 0, zaklad: 123, dph: 0, clenenie: "PN" });
    expect(d.polozky).toEqual([expect.objectContaining({ sadzba: 0, zaklad: 123, dph: 0, cena: 61.5 })]);
  });

  it("prenesenie ostáva", () => {
    const d = prijataNaUctovanie({ ...prijata, vat_amount: 0, amount_total: 100, reverse_charge: true, items: [] }, nast);
    expect(uctovanieBezDphNeplatitela(d, neplatitel)).toBe(d);
  });
});

describe("výstup programov pre neplatiteľa", () => {
  const omegaKody = {
    "1Fp": { kod: "1Fp", popis: "Materiál", ucetMd: "501", ucetD: "321" },
    "1Pv": { kod: "1Pv", popis: "Pokladňa", ucetMd: "501", ucetD: "211" },
  };
  const evidencie = Object.fromEntries(
    ["OF", "OD", "OPF", "DF", "DD", "DPF", "PD", "ID"].map((k) => [k, { evidencia: k, rad: k }]),
  );
  const zapisy = (obsah: string) =>
    obsah
      .trimEnd()
      .split("\r\n")
      .map((r) => r.split("\t"))
      .filter((r) => r[0] === "R02");

  it("Omega: celá suma na 501, žiadny zápis na 343 ani KV", () => {
    const doklady = [
      uctovanieBezDphNeplatitela(prijataNaUctovanie(prijata, nast), neplatitel),
      uctovanieBezDphNeplatitela(blocekNaUctovanie(blocek, nast), neplatitel),
    ];
    const { obsah, preskocene } = buildOmegaUctovanie({
      firma: { name: "Neplatiteľ s.r.o.", ico: "12345678" },
      doklady,
      kody: omegaKody,
      nastavenia: { evidencie },
    });
    expect(preskocene).toEqual([]);
    const z = zapisy(obsah);
    expect(z.map((x) => [x[2], x[4], x[6]])).toEqual([
      ["501", "321", "123,00"],
      ["501", "211", "29,35"],
    ]);
    expect(z.some((x) => x[2] === "343" || x[4] === "343")).toBe(false);
    expect(z.every((x) => !String(x[25] ?? "").trim())).toBe(true);
    // Platiteľ s tým istým dokladom má DPH zvlášť (343).
    const plat = buildOmegaUctovanie({
      firma: { name: "Platiteľ s.r.o.", ico: "12345678" },
      doklady: [uctovanieBezDphNeplatitela(prijataNaUctovanie({ ...prijata, odpocet: true, kv_clenenie: null }, nast), platitel)],
      kody: omegaKody,
      nastavenia: { evidencie },
    });
    expect(zapisy(plat.obsah).some((x) => x[2] === "343")).toBe(true);
  });

  it("Money S3: súhrn bez DPH (Zaklad0), členenie PN, položka bez sadzby", () => {
    const parser = new XMLParser({
      parseTagValue: false,
      isArray: (n) => ["Polozka", "FaktPrij", "PokDokl", "IntDokl"].includes(n),
    });
    const { xml, preskocene } = buildMoneyS3Uctovanie({
      firma: { name: "Neplatiteľ s.r.o.", ico: "12345678", default_currency: "EUR" },
      doklady: [
        uctovanieBezDphNeplatitela(prijataNaUctovanie(prijata, nast), neplatitel),
        uctovanieBezDphNeplatitela(blocekNaUctovanie(blocek, nast), neplatitel),
      ],
      kody: {},
      nastavenia: { pokladna: "HP" },
    });
    expect(preskocene).toEqual([]);
    const data = parser.parse(xml).MoneyData;
    const fp = data.SeznamFaktPrij.FaktPrij[0];
    expect(fp.SouhrnDPH.Zaklad0).toBe("123.00");
    expect(Number(fp.SouhrnDPH.Zaklad22 ?? 0)).toBe(0);
    expect(Number(fp.SouhrnDPH.DPH22 ?? 0)).toBe(0);
    expect(fp.Celkem).toBe("123.00");
    expect(fp.SeznamPolozek.Polozka[0].SazbaDPH).toBe("0");
    const pd = data.SeznamPokDokl.PokDokl[0];
    expect(pd.Cleneni).toBe("PN");
    expect(pd.SouhrnDPH.Zaklad0).toBe("29.35");
    expect(Number(pd.SouhrnDPH.Zaklad22 ?? 0)).toBe(0);
  });
});
