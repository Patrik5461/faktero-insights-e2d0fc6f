/*
  Pripomienky účtovníčky 2. 11. 2026:
  1. bloček platený kartou má ísť do Ostatných záväzkov (invoice.xsd,
     invoiceType „commitment" = agenda Ostatné záväzky), nie do Interných dokladov,
  2. pri exporte sa majú dať poslať aj položky dokladu (voľba firmy,
     predvolene vypnutá) — s textom, množstvom, jednotkovou cenou, sadzbou
     DPH, predkontáciou a členením.
  Každé XML musí prejsť schémou Stormware.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, polozkyBlockuPrePohodu } from "./export.server";
import { agendyDokladu } from "./uctovanie-agenda";
import { PREDVOLENE } from "./predkontacie";

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
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
});
const balik = (xml: string) => ([] as any[]).concat(parser.parse(xml).dataPack.dataPackItem ?? []);

const firma: any = {
  id: "c1",
  name: "Firma s.r.o.",
  ico: "36123456",
  country: "SK",
  vat_payer: true,
};
/** Bloček z Kauflandu: dve sadzby, položky v cenách s DPH, ako ich vyčíta AI. */
const blocek: any = {
  id: "bl-1",
  supplier_name: "Kaufland Slovenská republika v.o.s.",
  supplier_ico: "35790164",
  supplier_ic_dph: "SK2020234216",
  supplier_city: "Bratislava",
  supplier_street: "Trnavská cesta 41/A",
  supplier_zip: "83104",
  document_number: "0123-45",
  issue_date: "2026-10-20",
  created_at: "2026-10-21T08:00:00Z",
  currency: "EUR",
  payment_method: "karta",
  // 24,60 + 4,76 = 29,36 = 24,00 + 5,36
  total_amount: 29.36,
  vat_amount: 5.36,
  net_amount: 24,
  vat_breakdown: [
    { sadzba: 23, zaklad: 20, dph: 4.6 },
    { sadzba: 19, zaklad: 4, dph: 0.76 },
  ],
  items: [
    { name: "Čistiaci prostriedok", quantity: 2, unit_price: 6.15, total: 12.3, vat_rate: 23 },
    { name: "Papier A4", quantity: 1, unit_price: 12.3, total: 12.3, vat_rate: 23 },
    { name: "Káva", quantity: 1, unit_price: 4.76, total: 4.76, vat_rate: 19 },
  ],
  pohoda_predkontacia: "1Pv",
  pohoda_clenenie_dph: "PD",
};
const podlaPlatby = {
  blockyPodlaPlatby: true,
  pokladna: "HP",
  radInterne: "26ID",
  radDoklady: "26FPB",
};

describe("bloček kartou → Ostatné záväzky", () => {
  it("ide ako faktúra typu commitment s úhradou kartou a prejde invoice.xsd", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [blocek],
      nastavenia: podlaPlatby,
    });
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).not.toContain("<int:intDoc");
    const h = balik(xml)[0].invoice.invoiceHeader;
    expect(h.invoiceType).toBe("commitment");
    expect(h.paymentType.paymentType).toBe("creditcard");
    expect(h.accounting.ids).toBe("1Pv");
    expect(h.classificationVAT.ids).toBe("PD");
    expect(String(h.originalDocument)).toBe("0123-45");
    expect(h.partnerIdentity.address.company).toBe("Kaufland Slovenská republika v.o.s.");
    // Rad interných dokladov ani prijatých faktúr do záväzkov nepatrí — Pohoda dá predvolený.
    expect(h.number).toBeUndefined();
    // Súhrn po sadzbách ostáva (položky sú vypnuté).
    expect(balik(xml)[0].invoice.invoiceDetail).toBeUndefined();
    const s = balik(xml)[0].invoice.invoiceSummary.homeCurrency;
    expect([
      Number(s.priceHigh),
      Number(s.priceHighVAT),
      Number(s.priceLow),
      Number(s.priceLowVAT),
    ]).toEqual([20, 4.6, 4, 0.76]);
  });

  it("vlastný rad dokladu sa pošle; bez voľby „podľa platby“ ostáva prijatá faktúra", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [{ ...blocek, pohoda_rad: "26OZ" }],
      nastavenia: podlaPlatby,
    });
    expect(balik(xml)[0].invoice.invoiceHeader.number.ids).toBe("26OZ");
    const fa = buildPohodaExpensesXml({ company: firma, doklady: [blocek], nastavenia: {} });
    expect(balik(fa)[0].invoice.invoiceHeader.invoiceType).toBe("receivedInvoice");
  });

  it("bloček z vyúčtovania výdavkov (zaplatil zamestnanec) ostáva interným dokladom", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [{ ...blocek, vyuctovanie_id: "v1" }],
      nastavenia: podlaPlatby,
    });
    expect(xml).toContain("<int:intDoc");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("predkontácie pre bloček kartou sa hľadajú najprv v agende Ostatné záväzky", () => {
    expect(agendyDokladu({ agenda: "doklad", druh: "faktura", forma: "interny" })[0]).toBe(
      "commitment",
    );
    expect(PREDVOLENE.find((p) => p.kluc === "doklady")?.agendy).toContain("commitment");
  });
});

describe("položky dokladu do Pohody (voľba firmy)", () => {
  it("predvolene vypnuté — súbor ostáva súhrnom", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [blocek],
      nastavenia: podlaPlatby,
    });
    expect(xml).not.toContain("<inv:invoiceItem>");
  });

  it("zapnuté: text, množstvo, cena bez DPH, sadzba, predkontácia a členenie pri každej položke", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [blocek],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    expect(chybySchemy(xml)).toEqual([]);
    const inv = balik(xml)[0].invoice;
    expect(inv.invoiceHeader.invoiceType).toBe("commitment");
    const pol = inv.invoiceDetail.invoiceItem;
    expect(pol).toHaveLength(3);
    expect(pol[0]).toMatchObject({
      text: "Čistiaci prostriedok",
      quantity: 2,
      payVAT: false,
      rateVAT: "high",
    });
    expect(Number(pol[0].homeCurrency.unitPrice)).toBe(5);
    expect(Number(pol[0].homeCurrency.price)).toBe(10);
    expect(Number(pol[0].homeCurrency.priceVAT)).toBe(2.3);
    expect(pol[0].accounting.ids).toBe("1Pv");
    expect(pol[0].classificationVAT.ids).toBe("PD");
    expect(pol[2]).toMatchObject({ text: "Káva", rateVAT: "low" });
    expect(Number(pol[2].homeCurrency.price)).toBe(4);
    expect(Number(pol[2].homeCurrency.priceVAT)).toBe(0.76);
    // Položky po sadzbách sedia so súhrnom na cent.
    const spolu = (r: string) =>
      Math.round(
        pol
          .filter((p: any) => p.rateVAT === r)
          .reduce((a: number, p: any) => a + Number(p.homeCurrency.price), 0) * 100,
      ) / 100;
    expect([spolu("high"), spolu("low")]).toEqual([20, 4]);
  });

  it("hotovosť (pokladňa) aj prevod (prijatá faktúra) dostanú položky tiež a prejdú schémou", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [
        { ...blocek, id: "h", payment_method: "hotovost" },
        { ...blocek, id: "p", payment_method: "prevod" },
      ],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    expect(chybySchemy(xml)).toEqual([]);
    const [h, p] = balik(xml);
    expect(h.voucher.voucherDetail.voucherItem).toHaveLength(3);
    expect(h.voucher.voucherDetail.voucherItem[1].classificationVAT.ids).toBe("PD");
    expect(p.invoice.invoiceDetail.invoiceItem).toHaveLength(3);
  });

  it("položky, ktoré so sumou nesedia, sa nepošlú — doklad ide súhrnom", () => {
    const zle = {
      ...blocek,
      items: [{ name: "Niečo", quantity: 1, unit_price: 5, total: 5, vat_rate: 23 }],
    };
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [zle],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    expect(xml).not.toContain("<inv:invoiceItem>");
    expect(chybySchemy(xml)).toEqual([]);
  });

  it("riadok zaokrúhlenia z bločku sa vynechá, položka bez sadzby dostane jedinú sadzbu dokladu", () => {
    const d = {
      vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
      items: [
        { name: "Tovar", quantity: 1, unit_price: 12.3, total: 12.3, vat_rate: null },
        { name: "Zaokrúhlenie", quantity: 1, unit_price: 0.01, total: 0.01, vat_rate: 0 },
      ],
    };
    const p = polozkyBlockuPrePohodu(d, [{ sadzba: 23, zaklad: 10, dph: 2.3 }] as any, "1Pv", "PD");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      nazov: "Tovar",
      sadzba: 23,
      zaklad: 10,
      dph: 2.3,
      cena: 10,
      predkontacia: "1Pv",
      clenenie: "PD",
    });
  });

  it("vlastná predkontácia položky ostáva, doklad sa rozúčtuje", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [
        {
          ...blocek,
          items: blocek.items.map((x: any, i: number) =>
            i === 2 ? { ...x, predkontacia: "5Rep" } : x,
          ),
        },
      ],
      nastavenia: { ...podlaPlatby, polozkyBlockov: true },
    });
    expect(chybySchemy(xml)).toEqual([]);
    const inv = balik(xml)[0].invoice;
    expect(inv.invoiceHeader.accounting.ids).toBe("Rozúčtovať");
    const pol = inv.invoiceDetail.invoiceItem;
    expect(pol.map((x: any) => x.accounting?.ids)).toContain("5Rep");
  });
});
