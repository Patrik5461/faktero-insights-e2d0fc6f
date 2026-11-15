import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  STLPCE_KONVERTORA,
  cisloZBunky,
  datumZBunky,
  prevedRiadky,
  sablonaKonvertora,
} from "./konvertor";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";

xmlRegisterFsInputProviders();

function chybySchemy(xml: string): string[] {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const schemy: Record<string, string> = {
    inv: "invoice.xsd",
    vch: "voucher.xsd",
    int: "intDoc.xsd",
  };
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    const url = new URL(`./schemy/pohoda/${schemy[prefix]}`, import.meta.url);
    const v = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      v.validate(doc);
    } catch (e: any) {
      chyby.push(
        `${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 300)}`,
      );
    } finally {
      doc.dispose();
      v.dispose();
    }
  }
  return chyby;
}

/** Riadok podľa hlavičky šablóny (s hviezdičkou pri povinných, ako v súbore). */
function riadok(druh: keyof typeof STLPCE_KONVERTORA, hodnoty: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const s of STLPCE_KONVERTORA[druh])
    o[s.povinny ? `${s.nazov} *` : s.nazov] = hodnoty[s.kluc] ?? "";
  return o;
}

const firma: any = { id: "c1", ico: "36123456", country: "SK" };

describe("konvertor — šablóna a bunky", () => {
  it("šablóna má hlavičku s hviezdičkou pri povinných a vzorový riadok", () => {
    const [h, vzor] = sablonaKonvertora("prijate");
    expect(h).toContain("Číslo faktúry dodávateľa *");
    expect(h).toContain("Dátum doručenia");
    expect(vzor).toHaveLength(h.length);
  });
  it("čísla a dátumy z Excelu", () => {
    expect(cisloZBunky("1 234,56")).toBe(1234.56);
    expect(cisloZBunky("1.234,56")).toBe(1234.56);
    expect(cisloZBunky("1,234.56")).toBe(1234.56);
    expect(cisloZBunky("")).toBeNull();
    expect(datumZBunky("1.10.2026")).toBe("2026-10-01");
    expect(datumZBunky("2026-10-01")).toBe("2026-10-01");
    expect(datumZBunky(46296)).toBe("2026-10-01");
    expect(datumZBunky("31.2.2026")).toBe("");
  });
});

describe("konvertor — prevod", () => {
  it("vydané faktúry: riadky s rovnakým číslom sú položky jednej faktúry", () => {
    const r = prevedRiadky("vydane", [
      riadok("vydane", {
        cislo: "2026001",
        vystavenie: "1.10.2026",
        partner: "Odberateľ",
        polozka: "A",
        mnozstvo: 2,
        cena: 50,
        sadzba: 23,
      }),
      riadok("vydane", {
        cislo: "2026001",
        vystavenie: "1.10.2026",
        partner: "Odberateľ",
        polozka: "B",
        mnozstvo: 1,
        cena: "10,5",
        sadzba: "5 %",
      }),
      riadok("vydane", {
        cislo: "2026002",
        vystavenie: "2026-10-02",
        partner: "Iný",
        polozka: "C",
        cena: 100,
        sadzba: 0.23,
      }),
      riadok("vydane", {}),
    ]);
    expect(r.chyby).toEqual([]);
    expect(r.faktury).toHaveLength(2);
    expect(r.faktury[0].items).toHaveLength(2);
    expect(r.faktury[0].invoice.total).toBe(134.03);
    expect(r.faktury[1].items[0].vat_rate).toBe(23);
    const xml = buildPohodaInvoiceXml({ company: firma, invoices: r.faktury as any });
    expect(xml).toContain("<typ:numberRequested>2026001</typ:numberRequested>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("prijaté faktúry: sadzby sa zložia do rozpisu, dátum doručenia ide do dokladu", () => {
    const r = prevedRiadky("prijate", [
      riadok("prijate", {
        cislo: "F-1",
        vystavenie: "2026-09-28",
        dorucenie: "2026-10-03",
        partner: "Dodávateľ",
        zaklad: 100,
        sadzba: 23,
      }),
      riadok("prijate", {
        cislo: "F-1",
        vystavenie: "2026-09-28",
        partner: "Dodávateľ",
        zaklad: 20,
        sadzba: 5,
        dph: 1,
      }),
    ]);
    expect(r.chyby).toEqual([]);
    expect(r.doklady).toHaveLength(1);
    expect(r.doklady[0].vat_breakdown).toEqual([
      { sadzba: 5, zaklad: 20, dph: 1 },
      { sadzba: 23, zaklad: 100, dph: 23 },
    ]);
    expect(r.doklady[0].total_amount).toBe(144);
    const xml = buildPohodaExpensesXml({
      company: { ...firma, uctovanie_nastavenia: { export: { datumZapisu: "dorucenie" } } },
      doklady: r.doklady as any,
      nastavenia: { predkontaciaPrijata: "1Fp" } as any,
    });
    expect(xml).toContain("<inv:invoiceType>receivedInvoice</inv:invoiceType>");
    expect(xml).toContain("<inv:date>2026-10-03</inv:date>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("bločky: hotovosť ide do pokladne, karta do Ostatných záväzkov", () => {
    const r = prevedRiadky("blocky", [
      riadok("blocky", {
        vystavenie: "2026-10-01",
        partner: "OMV",
        platba: "karta",
        zaklad: 40.65,
        sadzba: 23,
        dph: 9.35,
      }),
      riadok("blocky", {
        vystavenie: "2026-10-02",
        partner: "Potraviny",
        platba: "hotovosť",
        zaklad: 10,
        sadzba: 5,
        dph: 0.5,
      }),
    ]);
    expect(r.chyby).toEqual([]);
    expect(r.doklady).toHaveLength(2);
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: r.doklady as any,
      nastavenia: { blockyPodlaPlatby: true, pokladna: "HP" } as any,
    });
    expect(xml).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    expect(xml).toContain("<vch:voucher");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("chýbajúce povinné a zlé hodnoty sa nahlásia, doklad sa vynechá", () => {
    const r = prevedRiadky("prijate", [
      riadok("prijate", { cislo: "F-2", vystavenie: "2026-10-01", zaklad: 10 }),
      riadok("prijate", { cislo: "F-3", vystavenie: "zajtra", partner: "X", zaklad: 10 }),
      riadok("prijate", { cislo: "F-4", vystavenie: "2026-10-01", partner: "X", zaklad: "veľa" }),
    ]);
    expect(r.doklady).toHaveLength(0);
    expect(r.chyby).toHaveLength(3);
    expect(r.chyby[0]).toMatch(/Riadok 2: chýba „Dodávateľ"/);
    expect(r.chyby[1]).toMatch(/dátum vystavenia/);
    expect(r.chyby[2]).toMatch(/základ DPH nie je číslo/);
  });

  it("ten istý doklad dostane pri druhom prevode to isté id (kontrola duplicity v Pohode)", () => {
    const riadky = [
      riadok("blocky", {
        vystavenie: "2026-10-01",
        partner: "OMV",
        cislo: "B1",
        zaklad: 10,
        sadzba: 23,
      }),
    ];
    expect(prevedRiadky("blocky", riadky).doklady[0].id).toBe(
      prevedRiadky("blocky", riadky).doklady[0].id,
    );
  });
});

describe("konvertor — audit 14. 11. 2026 (V14, V15, S16)", () => {
  const platitel: any = {
    id: "c1",
    ico: "36123456",
    country: "SK",
    vat_payer: true,
    ic_dph: "SK2020123456",
  };
  const zaklad = { cislo: "2026010", vystavenie: "2026-10-01", partner: "Odberateľ", polozka: "A", cena: 100 };

  it("V14: prázdna sadzba pri tuzemskom plnení je chyba, nie 0 %", () => {
    const r = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, sadzba: "" })], { firma: platitel });
    expect(r.faktury).toHaveLength(0);
    expect(r.chyby[0]).toMatch(/chýba sadzba DPH/);
    // Výslovná 0 ostáva možná (oslobodené plnenie).
    const r0 = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, sadzba: 0 })], { firma: platitel });
    expect(r0.chyby).toEqual([]);
  });

  it("S16: sadzba, ktorá k dňu dodania neplatí, je chyba (20 % v 2026, 21 % na SK firme)", () => {
    for (const sadzba of [20, 21]) {
      const r = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, sadzba })], { firma: platitel });
      expect(r.chyby[0]).toMatch(/neplatí/);
    }
    // Historická 20 % k dodaniu v 2024 platí.
    const r = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, vystavenie: "2024-10-01", sadzba: 20 })], {
      firma: platitel,
    });
    expect(r.chyby).toEqual([]);
  });

  it("V14: odberateľ s IČ DPH z EÚ bez režimu sa nevyvezie ako tuzemské plnenie", () => {
    const r = prevedRiadky(
      "vydane",
      [riadok("vydane", { ...zaklad, icDph: "DE123456789", krajina: "DE", sadzba: 0 })],
      { firma: platitel },
    );
    expect(r.faktury).toHaveLength(0);
    expect(r.chyby[0]).toMatch(/vyplňte Režim DPH/);
  });

  it("V14: EÚ služba a vývoz dostanú režim a členenie ako faktúra vo Fakteri", () => {
    const r = prevedRiadky(
      "vydane",
      [
        riadok("vydane", { ...zaklad, icDph: "DE123456789", krajina: "DE", rezim: "EÚ služba" }),
        riadok("vydane", { ...zaklad, cislo: "2026011", krajina: "US", rezim: "vývoz" }),
      ],
      { firma: platitel },
    );
    expect(r.chyby).toEqual([]);
    const [eu, vyvoz] = r.faktury.map((f) => f.invoice);
    expect(eu).toMatchObject({ reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" });
    expect(vyvoz).toMatchObject({ reverse_charge: true, reverse_charge_type: "export" });
    expect(r.faktury[0].items[0]).toMatchObject({ vat_rate: 0, vat_amount: 0 });
    // Nie tuzemské UD — členenie podľa režimu.
    expect(eu.pohoda_clenenie_dph).toBeTruthy();
    expect(eu.pohoda_clenenie_dph).not.toBe("UD");
    expect(vyvoz.pohoda_clenenie_dph).not.toBe(eu.pohoda_clenenie_dph);
    const xml = buildPohodaInvoiceXml({ company: platitel, invoices: r.faktury as any });
    expect(xml).toContain(`<typ:ids>${eu.pohoda_clenenie_dph}</typ:ids>`);
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("V14: tuzemské prenesenie — príznak PDP a sadzba sa nevyžaduje", () => {
    const r = prevedRiadky(
      "vydane",
      [riadok("vydane", { ...zaklad, icDph: "SK2020999999", rezim: "prenesenie", pdpDruh: "j" })],
      { firma: platitel },
    );
    expect(r.chyby).toEqual([]);
    expect(r.faktury[0].invoice).toMatchObject({ reverse_charge: true, reverse_charge_type: "domestic_69", pdp_druh: "j" });
    const xml = buildPohodaInvoiceXml({ company: platitel, invoices: r.faktury as any });
    expect(xml).toContain("<inv:PDP>true</inv:PDP>");
    expect(chybySchemy(xml)).toEqual([]);
    // Sadzba pri prenesení je chyba (dodávateľ daň neúčtuje).
    const zle = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, rezim: "prenesenie", sadzba: 23 })], {
      firma: platitel,
    });
    expect(zle.chyby[0]).toMatch(/neúčtuje/);
  });

  it("V15: cudzia mena bez kurzu je chyba (nie kurz 0 po potvrdení), s kurzom ide kurz", () => {
    const bez = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, sadzba: 23, mena: "CZK" })], { firma: platitel });
    expect(bez.faktury).toHaveLength(0);
    expect(bez.chyby[0]).toMatch(/potrebuje kurz/);
    const prijata = prevedRiadky("prijate", [
      riadok("prijate", { cislo: "F", vystavenie: "2026-10-01", partner: "X", zaklad: 10, sadzba: 23, mena: "USD", kurz: 0 }),
    ]);
    expect(prijata.chyby[0]).toMatch(/potrebuje kurz/);
    const s = prevedRiadky("vydane", [riadok("vydane", { ...zaklad, sadzba: 23, mena: "CZK", kurz: "25,3" })], {
      firma: platitel,
    });
    expect(s.faktury[0].invoice.exchange_rate).toBe(25.3);
  });

  it("V15: dátum doručenia posunie odpočet (neskorší z DUZP a prijatia)", () => {
    const r = prevedRiadky(
      "prijate",
      [
        riadok("prijate", {
          cislo: "F-9",
          vystavenie: "2026-10-28",
          dodanie: "2026-10-28",
          dorucenie: "2026-11-03",
          partner: "Dodávateľ",
          icDph: "SK2021876543",
          zaklad: 100,
          sadzba: 23,
        }),
      ],
      { firma: platitel },
    );
    expect(r.chyby).toEqual([]);
    expect(r.doklady[0]._datumPrijatia).toBe("2026-11-03");
    const xml = buildPohodaExpensesXml({
      company: platitel,
      doklady: r.doklady as any,
      nastavenia: { predkontaciaPrijata: "1Fp" } as any,
    });
    expect(xml).toContain("<inv:dateTax>2026-11-03</inv:dateTax>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("V14: prijatá z EÚ — nadobudnutie samozdanené, bez režimu chyba", () => {
    const h = { cislo: "DE-1", vystavenie: "2026-10-05", partner: "GmbH", icDph: "DE123456789", krajina: "DE", zaklad: 200 };
    const bez = prevedRiadky("prijate", [riadok("prijate", { ...h, sadzba: 0 })], { firma: platitel });
    expect(bez.chyby[0]).toMatch(/vyplňte Režim DPH/);
    // Bez kódu v číselníku firmy sa členenie nadobudnutia určiť nedá — zastaví sa.
    const bezKodu = prevedRiadky("prijate", [riadok("prijate", { ...h, rezim: "nadobudnutie z EÚ" })], {
      firma: platitel,
    });
    expect(bezKodu.chyby[0]).toMatch(/členenie DPH/);
    const r = prevedRiadky("prijate", [riadok("prijate", { ...h, rezim: "nadobudnutie z EÚ" })], {
      firma: platitel,
      kontextPrijatych: {
        ciselnik: [{ druh: "clenenie_dph", kod: "PDnadob", popis: "Nadobudnutie tovaru z iného členského štátu", aktivne: true } as any],
      },
    });
    expect(r.chyby).toEqual([]);
    expect(r.doklady[0].pohoda_clenenie_dph).toBe("PDnadob");
    expect(r.doklady[0]._samozdanenie).toBe(true);
    expect(r.doklady[0].pohoda_clenenie_dph).toBeTruthy();
    const xml = buildPohodaExpensesXml({
      company: platitel,
      doklady: r.doklady as any,
      nastavenia: { predkontaciaPrijata: "1Fp" } as any,
    });
    expect(xml).toContain(`<typ:ids>${r.doklady[0].pohoda_clenenie_dph}</typ:ids>`);
    // Samozdanenie (POHODA SK, 15. 11. 2026): faktúra bez DPH, daň v interných dokladoch.
    expect(xml).toContain("<typ:priceNone>200.00");
    expect(xml).toContain("<int:classificationVAT><typ:ids>DDnadEU</typ:ids></int:classificationVAT>");
    expect(xml).toContain("<int:classificationKVDPH><typ:ids>B1</typ:ids></int:classificationKVDPH>");
    expect(chybySchemy(xml)).toEqual([]);
    // Tuzemské prenesenie na prijatej.
    const pdp = prevedRiadky(
      "prijate",
      [riadok("prijate", { ...h, icDph: "SK2021876543", krajina: "SK", rezim: "prenesenie" })],
      { firma: { ...platitel, pohoda_clenenie_dph_prijata_pdp: "PDpdp" } },
    );
    expect(pdp.chyby).toEqual([]);
    expect(pdp.doklady[0]._pdp).toBe(true);
    const xmlPdp = buildPohodaExpensesXml({
      company: platitel,
      doklady: pdp.doklady as any,
      nastavenia: { predkontaciaPrijata: "1Fp" } as any,
    });
    expect(xmlPdp).toContain("<typ:ids>PDpdp</typ:ids>");
    expect(chybySchemy(xmlPdp)).toEqual([]);
  });

  it("S16: VS z písmen, zálohová faktúra a zlé voliteľné dátumy sa nahlásia", () => {
    const r = prevedRiadky(
      "vydane",
      [
        riadok("vydane", { ...zaklad, sadzba: 23, vs: "EU-1" }),
        riadok("vydane", { ...zaklad, cislo: "Z1", sadzba: 23, typ: "zálohová" }),
        riadok("vydane", { ...zaklad, cislo: "D1", sadzba: 23, dodanie: "31.2.2026" }),
        riadok("vydane", { ...zaklad, cislo: "S1", sadzba: 23, splatnost: "zajtra" }),
      ],
      { firma: platitel },
    );
    expect(r.faktury).toHaveLength(0);
    expect(r.chyby).toHaveLength(4);
    expect(r.chyby[0]).toMatch(/variabilný symbol/);
    expect(r.chyby[1]).toMatch(/zálohovú/);
    expect(r.chyby[2]).toMatch(/Dátum dodania/);
    expect(r.chyby[3]).toMatch(/Dátum splatnosti/);
  });

  it("bloček bez sadzby je chyba", () => {
    const r = prevedRiadky("blocky", [riadok("blocky", { vystavenie: "2026-10-01", partner: "OMV", zaklad: 10 })], {
      firma: platitel,
    });
    expect(r.chyby[0]).toMatch(/chýba sadzba DPH/);
  });
});
