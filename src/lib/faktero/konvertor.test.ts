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
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 5, zaklad: 20, dph: 1 },
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

  it("bločky: hotovosť ide do pokladne, karta ako interný doklad", () => {
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
    expect(xml).toContain("<int:intDoc");
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
