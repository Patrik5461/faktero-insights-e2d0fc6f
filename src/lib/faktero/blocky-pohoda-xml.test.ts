/*
  XML pre Pohodu zo zoznamu bločkov — ten istý obsah pre pohoda.xml v ZIP-e
  aj pre samotný súbor na stiahnutie, a čo doňho nejde, musí povedať prečo.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { pohodaXmlBlockov } from "./blocky-pohoda-xml.server";
import { buildPohodaExpensesXml } from "./export.server";

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
/** Každý doklad z `dataPack` proti schéme jeho agendy. */
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
    if (!SCHEMY[prefix]) {
      chyby.push(`neznáma agenda ${prefix}`);
      continue;
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(`${prefix}: ${String(e?.message ?? e)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
});
const polozkyBalika = (xml: string) =>
  ([] as any[]).concat(parser.parse(xml).dataPack.dataPackItem ?? []);

const firma = { ico: "56607016", default_currency: "EUR", country: "SK" };
const blocek = {
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
};
const zaklad = { oznacit: false, datumZauctovania: null, obdobie: "2026-10" };

describe("pohodaXmlBlockov", () => {
  it("vráti ten istý pohoda.xml ako generátor a prejde schémou Pohody", () => {
    const nastavenia = { predkontaciaDoklady: "5PHM", clenenieDphDoklady: "PD" };
    const { subory, preskocene } = pohodaXmlBlockov({
      ...zaklad,
      firma,
      rows: [blocek],
      nastavenia,
    });
    expect(preskocene).toEqual([]);
    expect(subory).toHaveLength(1);
    expect(subory[0].nazov).toBe("pohoda.xml");
    expect(subory[0].fileName).toBe("pohoda-blocky-2026-10.xml");
    expect(subory[0].xml).toBe(
      buildPohodaExpensesXml({ company: firma, doklady: [blocek], nastavenia }),
    );
    expect(subory[0].xml).toMatch(/<dat:dataPack\b/);
    expect(chybySchemy(subory[0].xml)).toEqual([]);
  });

  it("hotovostný bloček bez pokladne do XML nejde a povie prečo", () => {
    const nastavenia = { blockyPodlaPlatby: true };
    const { subory, preskocene } = pohodaXmlBlockov({
      ...zaklad,
      firma,
      rows: [{ ...blocek, payment_method: "hotovost" }],
      nastavenia,
    });
    expect(subory).toEqual([]);
    expect(preskocene[0]).toMatch(/^11665 — hotovostný bloček bez pokladne/);
  });

  it("s pokladňou ide hotovostný bloček ako pokladničný doklad", () => {
    const nastavenia = { blockyPodlaPlatby: true, pokladna: "HP" };
    const { subory } = pohodaXmlBlockov({
      ...zaklad,
      firma,
      rows: [{ ...blocek, payment_method: "hotovost" }],
      nastavenia,
    });
    expect(polozkyBalika(subory[0].xml)[0].voucher).toBeDefined();
    expect(chybySchemy(subory[0].xml)).toEqual([]);
  });

  it("zmiešaný výber: XML má len doklady, ktoré prešli kontrolou", () => {
    const { subory, preskocene } = pohodaXmlBlockov({
      ...zaklad,
      firma,
      rows: [blocek, { ...blocek, id: "b2", document_number: "X1", currency: "CZK" }],
      nastavenia: {},
    });
    expect(subory[0].doklady.map((d) => d.id)).toEqual(["b1"]);
    expect(polozkyBalika(subory[0].xml)).toHaveLength(1);
    expect(preskocene).toHaveLength(1);
    expect(preskocene[0]).toMatch(/^X1 — bloček v mene CZK/);
  });

  it("pri označení ako odovzdané vynechá už odovzdané", () => {
    const { subory, preskocene } = pohodaXmlBlockov({
      ...zaklad,
      oznacit: true,
      firma,
      rows: [{ ...blocek, exported_at: "2026-10-01T00:00:00Z" }],
      nastavenia: {},
    });
    expect(subory).toEqual([]);
    expect(preskocene[0]).toMatch(/už je odovzdaný do Pohody/);
  });

  it("prelom rokov rozdelí do dvoch súborov, pevný dátum zaúčtovania nie", () => {
    const rows = [blocek, { ...blocek, id: "b0", issue_date: "2025-12-30" }];
    const podlaRoka = pohodaXmlBlockov({ ...zaklad, firma, rows, nastavenia: {} }).subory;
    expect(podlaRoka.map((s) => [s.nazov, s.fileName]).sort()).toEqual([
      ["pohoda-2025.xml", "pohoda-blocky-2025-2026-10.xml"],
      ["pohoda-2026.xml", "pohoda-blocky-2026-2026-10.xml"],
    ]);
    const pevny = pohodaXmlBlockov({
      ...zaklad,
      datumZauctovania: "2026-10-31",
      firma,
      rows,
      nastavenia: { datumZauctovaniaPevny: "2026-10-31" },
    }).subory;
    expect(pevny.map((s) => s.nazov)).toEqual(["pohoda.xml"]);
  });

  it("PHM pri vozidle s odpočtom 50 % je v XML rozúčtované", () => {
    const nastavenia = {
      predkontaciaDoklady: "5PHM",
      clenenieDphDoklady: "PD",
      odpocetVozidiel: {
        v1: {
          podiel: 50,
          nazov: "Auto (AA 000AA)",
          predkontaciaBezOdpoctu: "5PHMN",
          clenenieBezOdpoctu: "PN",
        },
      },
    };
    const { subory } = pohodaXmlBlockov({
      ...zaklad,
      firma,
      rows: [{ ...blocek, vehicle_id: "v1" }],
      nastavenia,
    });
    const inv = polozkyBalika(subory[0].xml)[0].invoice;
    expect(inv.invoiceHeader.accounting.ids).toBe("Rozúčtovať");
    const pol = ([] as any[]).concat(inv.invoiceDetail.invoiceItem);
    expect(pol.map((p) => [p.accounting.ids, p.classificationVAT.ids])).toEqual([
      ["5PHM", "PD"],
      ["5PHMN", "PN"],
    ]);
    expect(chybySchemy(subory[0].xml)).toEqual([]);
  });
});
