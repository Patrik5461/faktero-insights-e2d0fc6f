/*
  Zaokrúhlenie bločku (hotovosť na 5 centov) — čítanie, kontrola sumy a
  export do Pohody. Bloček: základ 10,00 + DPH 2,30 = 12,30, zaokrúhlenie
  −0,02, na úhradu 12,28 €.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  jePolozkaZaokruhlenia,
  kontrolaSumyBlocku,
  kontrolaUlozenehoBlocku,
  nastavZaokruhlenie,
  zaokruhlenieZPoloziek,
} from "./zaokruhlenie-blocku";
import { blocekZUdajov, kontrolaSumy, nacitajUdaje, rozdielPoloziek, udajeZAi } from "./nespracovane";
import { buildPohodaExpensesXml } from "./export.server";
import { rozuctovaniePolozkami } from "./rozuctovanie";
import { mapujFsDoklad } from "./ekasa";

xmlRegisterFsInputProviders();
const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
const validator = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 300)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const firma: any = {
  id: "c1",
  name: "Test s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
};

/** Bloček tak, ako ho prečíta AI z fotky. */
const ai = (extra: Record<string, unknown> = {}) => ({
  document_type: "faktura",
  document_subtype: "blocek",
  supplier_name: "Potraviny Jednota",
  supplier_ico: "31411801",
  invoice_number: "0042",
  issue_date: "2026-10-28",
  amount_without_vat: 10,
  vat_amount: 2.3,
  amount_total: 12.28,
  currency: "EUR",
  payment_method: "hotovost",
  items: [
    { name: "Káva zrnková", quantity: 1, unit_price: 8.61, vat_rate: 23, total: 8.61 },
    { name: "Mlieko", quantity: 3, unit_price: 1.23, vat_rate: 23, total: 3.69 },
  ],
  ...extra,
});

describe("kontrola sumy bločku", () => {
  it("základ + DPH + zaokrúhlenie = suma → sedí", () => {
    const k = kontrolaSumyBlocku({ celkom: 12.28, zaklad: 10, dph: 2.3, zaokruhlenie: -0.02, platba: "hotovost" });
    expect(k).toMatchObject({ sedi: true, rozdiel: 0, zRiadkov: 12.28 });
  });
  it("prepísaná suma, ktorá nesedí, ukáže rozdiel", () => {
    const k = kontrolaSumyBlocku({ celkom: 12.5, zaklad: 10, dph: 2.3, zaokruhlenie: -0.02, platba: "karta" });
    expect(k.sedi).toBe(false);
    expect(k.rozdiel).toBe(0.22);
    expect(k.navrhZaokruhlenia).toBeNull();
  });
  it("hotovosť bez zaokrúhlenia: rozdiel do 2 centov sa ponúkne ako zaokrúhlenie", () => {
    const k = kontrolaSumyBlocku({ celkom: 12.28, zaklad: 10, dph: 2.3, platba: "hotovost" });
    expect(k.sedi).toBe(false);
    expect(k.rozdiel).toBe(-0.02);
    expect(k.navrhZaokruhlenia).toBe(-0.02);
    // Po zapísaní zaokrúhlenia upozornenie zmizne.
    expect(kontrolaSumyBlocku({ celkom: 12.28, zaklad: 10, dph: 2.3, zaokruhlenie: -0.02 }).sedi).toBe(true);
  });
  it("väčší rozdiel nie je zaokrúhlenie ani pri hotovosti", () => {
    expect(kontrolaSumyBlocku({ celkom: 12.2, zaklad: 10, dph: 2.3, platba: "hotovost" }).navrhZaokruhlenia).toBeNull();
  });
  it("bez sumy alebo bez riadkov sa nekontroluje", () => {
    expect(kontrolaSumyBlocku({ celkom: null, zaklad: 10, dph: 2.3 }).sedi).toBe(true);
    expect(kontrolaSumyBlocku({ celkom: 5, zaklad: 0, dph: 0 }).sedi).toBe(true);
  });
});

describe("položka zaokrúhlenia", () => {
  it("spozná ju podľa názvu z pokladnice aj príznaku", () => {
    expect(jePolozkaZaokruhlenia({ name: "ZAOKRÚHLENIE" })).toBe(true);
    expect(jePolozkaZaokruhlenia({ name: "Zaokruhlenie hotovosti" })).toBe(true);
    expect(jePolozkaZaokruhlenia({ name: "Zaokrouhlení" })).toBe(true);
    expect(jePolozkaZaokruhlenia({ name: "x", zaokruhlenie: true })).toBe(true);
    expect(jePolozkaZaokruhlenia({ name: "Rožok" })).toBe(false);
  });
  it("nastavZaokruhlenie nahradí starú a nula ju odstráni", () => {
    const p = nastavZaokruhlenie([{ name: "A", total: 5 }, { name: "Zaokrúhlenie", total: 0.01 }], -0.02);
    expect(p).toHaveLength(2);
    expect(zaokruhlenieZPoloziek(p)).toBe(-0.02);
    expect(nastavZaokruhlenie(p, 0)).toEqual([{ name: "A", total: 5 }]);
  });
});

describe("bloček so zaokrúhlením −0,02 € z čítania", () => {
  it("pole „rounding“ → vlastný riadok, súčet sedí", () => {
    const u = udajeZAi(ai({ rounding: -0.02 }), "2026-11-02");
    expect(u.zaokruhlenie).toBe(-0.02);
    expect(u.rozpis).toEqual([{ sadzba: 23, zaklad: 10, dph: 2.3, vat_category: "standard" }]);
    expect(kontrolaSumy(u).sedi).toBe(true);
    expect(rozdielPoloziek(u)).toBeNull();
  });
  it("riadok „Zaokrúhlenie“ medzi položkami nejde do rozpisu ako 0 %", () => {
    const a = ai();
    (a.items as any[]).push({ name: "Zaokrúhlenie", quantity: 1, unit_price: -0.02, vat_rate: 0, total: -0.02 });
    const u = udajeZAi(a, "2026-11-02");
    expect(u.rozpis.map((r) => r.sadzba)).toEqual([23]);
    expect(u.polozky.map((p) => p.name)).toEqual(["Káva zrnková", "Mlieko"]);
    expect(u.zaokruhlenie).toBe(-0.02);
    expect(kontrolaSumy(u).sedi).toBe(true);
  });
  it("hotovosť bez uvedeného zaokrúhlenia: rozdiel do 2 centov sa prečíta ako zaokrúhlenie", () => {
    const u = udajeZAi(ai(), "2026-11-02");
    expect(u.zaokruhlenie).toBe(-0.02);
    expect(kontrolaSumy(u).sedi).toBe(true);
  });
  it("prepísaná suma, ktorá nesedí, sa ukáže; opravená zmizne", () => {
    const u = udajeZAi(ai({ rounding: -0.02 }), "2026-11-02");
    const zla = kontrolaSumy({ ...u, celkom: 12.3 });
    expect(zla).toMatchObject({ sedi: false, rozdiel: 0.02 });
    expect(kontrolaSumy({ ...u, celkom: 12.28 }).sedi).toBe(true);
  });
  it("vytvorený bloček nesie zaokrúhlenie ako položku bez DPH", () => {
    const u = udajeZAi(ai({ rounding: -0.02 }), "2026-11-02");
    const b = blocekZUdajov(u);
    expect(b).toMatchObject({ total_amount: 12.28, net_amount: 10, vat_amount: 2.3 });
    const z = (b.items as any[]).filter((p) => jePolozkaZaokruhlenia(p));
    expect(z).toEqual([expect.objectContaining({ name: "Zaokrúhlenie", vat_rate: 0, total: -0.02 })]);
    expect(kontrolaUlozenehoBlocku(b).sedi).toBe(true);
  });
  it("staré uložené údaje s položkou zaokrúhlenia sa rozdelia pri načítaní", () => {
    const u = nacitajUdaje({ polozky: [{ name: "A", total: 1 }, { name: "Zaokrúhlenie", total: 0.01 }] });
    expect(u.polozky).toHaveLength(1);
    expect(u.zaokruhlenie).toBe(0.01);
  });
});

describe("eKasa bloček zo Finančnej správy", () => {
  it("záporný základ zaokrúhlenia v súhrne nejde do základu", () => {
    const d = mapujFsDoklad({
      priceWithVat: 12.28,
      items: [
        { name: "Káva", quantity: 1, price: 12.3, vatRate: 23 },
        { name: "Zaokrúhlenie", quantity: 1, price: -0.02, vatRate: 0 },
      ],
      vatSummary: [
        { vatRate: 23, vatBase: 10, vatAmount: 2.3 },
        { vatRate: 0, vatBase: -0.02, vatAmount: 0 },
      ],
    });
    expect(d.zaklad).toBe(10);
    expect(d.sadzby).toEqual([{ sadzba: 23, zaklad: 10, dph: 2.3 }]);
    expect(zaokruhlenieZPoloziek(d.polozky)).toBe(-0.02);
  });
});

describe("export bločku so zaokrúhlením do Pohody", () => {
  const blocek = (): any => ({
    id: "b1",
    company_id: "c1",
    ...blocekZUdajov(udajeZAi(ai({ rounding: -0.02 }), "2026-11-02")),
    payment_method: "hotovost",
    pohoda_predkontacia: "5PHM",
    pohoda_clenenie_dph: "PD",
  });

  it("položky bločku: zaokrúhlenie nejde ako položka v 0 %, ale do round (priceRound)", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocek()], nastavenia: { polozkyBlockov: true } as any });
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).not.toContain("Zaokrúhlenie</");
    expect(xml).toContain("<typ:priceRound>-0.02</typ:priceRound>");
    // Súhrn: základ 10,00 a DPH 2,30 bez zaokrúhlenia.
    expect(xml).toContain("<typ:priceHigh>10.00</typ:priceHigh>");
    expect(xml).toContain("<typ:priceHighVAT>2.30</typ:priceHighVAT>");
    expect(xml).not.toContain("<inv:roundingDocument>none</inv:roundingDocument>");
  });

  it("s predkontáciou zaokrúhlenia ide jedna položka „Zaokrúhlenie“ a priceRound 0", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [blocek()],
      nastavenia: { polozkyBlockov: true, predkontaciaZaokruhlenie: "ZAOK" } as any,
    });
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml.match(/Zaokrúhlenie<\//g)).toHaveLength(1);
    expect(xml).toContain("<typ:ids>ZAOK</typ:ids>");
    expect(xml).toContain("<typ:priceRound>0.00</typ:priceRound>");
  });

  it("bez položiek: súhrn s priceRound -0.02 prejde schémou", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocek()] });
    expect(chybySchemy(xml)).toEqual([]);
    expect(xml).toContain("<typ:priceRound>-0.02</typ:priceRound>");
  });

  it("rozúčtovanie položkami ignoruje zaokrúhlenie (nie je sadzba 0 % dokladu)", () => {
    const b = blocek();
    const items = (b.items as any[]).map((p, i) => (i === 0 ? { ...p, predkontacia: "501" } : p));
    const r = rozuctovaniePolozkami(items, b.vat_breakdown, "5PHM", "PD");
    expect(r.length).toBeGreaterThan(0);
    expect(r.reduce((a, x) => a + x.zaklad, 0)).toBeCloseTo(10, 2);
  });
});
