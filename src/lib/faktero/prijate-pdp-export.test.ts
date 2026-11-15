/*
  Prijatá faktúra v prenesení daňovej povinnosti (§ 69 ods. 12) vo všetkých
  exportoch — regresia QA-C-PF2 (test2, 13. 11. 2026): faktúra 1 000 €
  „Daň platím ja – § 69“ mala len `dph_rezim: "samozdanenie"` a rozpis
  `{ sadzba: 0, pdp: true }`. Do Pohody išla v `priceNone` (bez sadzby
  a dane), Money v `Zaklad0`, Flexi v `sumOsv` — samozdanenie 230 € chýbalo.

  Prenesenie sa pozná podľa jedného zdroja pravdy (`jePrenesenieCele`):
  režim DPH, `reverse_charge`, rozpis DPH s riadkami v prenesení alebo
  členenie DPH pre prenesenie na doklade bez režimu.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml } from "./export.server";
import { jePrenesenieCele, prijataAkoDoklad, sadzbaSamozdanenia } from "./prijate-do-pohody";
import { prijataNaUctovanie } from "./zauctovanie-export";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import { buildCsvUctovanie } from "./export-csv-uctovanie";
import { buildMrpUctovanie } from "./export-mrp-uctovanie";

xmlRegisterFsInputProviders();

const schema = (nazov: string) => {
  const url = new URL(`./schemy/pohoda/${nazov}`, import.meta.url);
  return XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
};
// Faktúra proti invoice.xsd, interné doklady samozdanenia proti intDoc.xsd.
const xsd: Record<string, XsdValidator> = { inv: schema("invoice.xsd"), int: schema("intDoc.xsd") };

/** Každý doklad balíka proti schéme svojej agendy. */
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const prvok = m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      xsd[/^<(\w+):/.exec(prvok)![1]].validate(doc);
    } catch (e: any) {
      chyby.push(String(e?.message ?? e));
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const hodnota = (xml: string, el: string) =>
  new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;

const firma: any = {
  id: "c1",
  name: "test2 s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
};
const nastavenia: any = { predkontaciaPrijata: "1Fp", clenenieDphPrijata: "PD", clenenieDphPdpPrijata: "PDpdp" };

/** QA-C-PF2 tak, ako je v DB (bez zbytočných stĺpcov). */
const qaPf2 = {
  id: "872407ec-ec1a-4cc2-bc3b-99e20b56bcb0",
  company_id: "c1",
  type: "regular",
  status: "booked",
  items: null,
  invoice_number: "QA-C-PF2",
  supplier_name: "QA-C Dodávateľ s.r.o.",
  supplier_ico: "51234567",
  supplier_ic_dph: "SK2120000123",
  issue_date: "2026-11-10",
  delivery_date: "2026-11-10",
  received_date: "2026-11-13",
  due_date: "2026-11-27",
  currency: "EUR",
  payment_method: "prevod",
  amount_without_vat: 1000,
  vat_amount: 0,
  amount_total: 1000,
  dph_rezim: "samozdanenie",
  reverse_charge: false,
  odpocet: true,
  kv_clenenie: "B1",
  pohoda_clenenie_dph: "PDsluz",
  pohoda_predkontacia: "1Fp",
  zauctovane_at: "2026-11-13T11:13:38.528+00:00",
  vat_breakdown: [{ dph: 0, pdp: true, sadzba: 0, zaklad: 1000, vat_category: "reverse_charge" }],
};

/** Prenesená faktúra bez príznakov — každý variant pridá len jeden. */
const holá = {
  ...qaPf2,
  id: "pdp-x",
  invoice_number: "PDP-X",
  dph_rezim: null,
  reverse_charge: false,
  kv_clenenie: null,
  pohoda_clenenie_dph: null,
  vat_breakdown: null,
};

const varianty: [string, any, string][] = [
  ["QA-C-PF2 (režim + rozpis so sadzbou 0)", qaPf2, "PDsluz"],
  ["len dph_rezim samozdanenie", { ...holá, dph_rezim: "samozdanenie" }, "PDpdp"],
  [
    "len rozpis DPH s riadkom v prenesení",
    { ...holá, vat_breakdown: [{ sadzba: 0, zaklad: 1000, dph: 0, pdp: true }] },
    "PDpdp",
  ],
  [
    "len rozpis DPH s kategóriou reverse_charge",
    { ...holá, vat_breakdown: [{ sadzba: 0, zaklad: 1000, dph: 0, vat_category: "reverse_charge" }] },
    "PDpdp",
  ],
  ["len členenie PDsluz", { ...holá, pohoda_clenenie_dph: "PDsluz" }, "PDsluz"],
];

describe("prijatá faktúra v prenesení — jeden zdroj pravdy", () => {
  it.each(varianty)("%s je celá v prenesení", (_n, p) => {
    expect(jePrenesenieCele(p)).toBe(true);
  });

  it("bežná faktúra bez DPH ani zvolený iný režim prenesením nie sú", () => {
    expect(jePrenesenieCele({ ...holá })).toBe(false);
    expect(jePrenesenieCele({ ...holá, pohoda_clenenie_dph: "PDsluz", dph_rezim: "bez_dane" })).toBe(false);
    // S daňou nie je celá v prenesení (zmiešanú riešia riadky).
    expect(jePrenesenieCele({ ...qaPf2, vat_amount: 23 })).toBe(false);
  });

  it("sadzba samozdanenia: prenesený riadok bez sadzby dostane základnú, uvedená ostáva", () => {
    const r = sadzbaSamozdanenia(
      [
        { sadzba: 0, zaklad: 10, dph: 0, pdp: true },
        { sadzba: 19, zaklad: 10, dph: 0, pdp: true },
        { sadzba: 0, zaklad: 10, dph: 0 },
      ],
      { cele: false, krajina: "SK", den: "2026-11-10" },
    );
    expect(r.map((x) => x.sadzba)).toEqual([23, 19, 0]);
    // Celé samozdanenie (nadobudnutie) — aj riadok bez príznaku, okrem oslobodeného.
    const c = sadzbaSamozdanenia(
      [
        { sadzba: 0, zaklad: 10, dph: 0 },
        { sadzba: 0, zaklad: 10, dph: 0, vat_category: "exempt" },
      ],
      { cele: true, krajina: "CZ", den: "2026-11-10" },
    );
    expect(c.map((x) => x.sadzba)).toEqual([21, 0]);
    // Pred rokom 2025 základná sadzba 20 %.
    expect(sadzbaSamozdanenia([{ sadzba: 0, dph: 0, pdp: true }], { cele: false, den: "2024-12-31" })[0].sadzba).toBe(20);
  });
});

/** Faktúra a interné doklady samozdanenia z balíka. */
const casti = (xml: string) => {
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  const podla = (re: RegExp) => polozky.find((m) => re.test(m[1]))?.[2] ?? "";
  return { faktura: podla(/^(?!.*-sam-)/), dan: podla(/-sam-dan$/), odp: podla(/-sam-odp$/), pocet: polozky.length };
};

/*
  Model overený v POHODE SK 14404.8 (PALIERA, 15. 11. 2026): faktúra
  v `priceNone` bez DPH s KV „KN“, daň v interných dokladoch Priznanie
  (DDsluz) a Odpočet DPH (PDsluz / členenie firmy) s KV B1. Predtým išla
  v `priceHigh` s DPH 0 — POHODA si 23 % dopočítala a na úhradu bolo o daň viac.
*/
describe("Pohoda: prenesená faktúra bez DPH a samozdanenie internými dokladmi", () => {
  it.each(varianty)("%s", (_n, p, clenenie) => {
    const xml = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(p) as any] });
    expect(chybySchemy(xml)).toEqual([]);
    const { faktura, dan, odp, pocet } = casti(xml);
    expect(pocet).toBe(3);
    expect(hodnota(faktura, "typ:priceNone")).toBe("1000.00");
    expect(hodnota(faktura, "typ:priceHigh")).toBe("0.00");
    expect(faktura).toContain(`<inv:classificationVAT><typ:ids>${clenenie}</typ:ids></inv:classificationVAT>`);
    expect(faktura).toContain("<inv:classificationKVDPH><typ:ids>KN</typ:ids></inv:classificationKVDPH>");
    expect(faktura).not.toContain("<typ:ids>B1</typ:ids>");
    expect(dan).toContain("<int:classificationVAT><typ:ids>DDsluz</typ:ids></int:classificationVAT>");
    expect(dan).toContain("<int:classificationKVDPH><typ:ids>B1</typ:ids></int:classificationKVDPH>");
    expect(hodnota(dan, "int:rateVAT")).toBe("high");
    expect(hodnota(dan, "typ:price")).toBe("1000.00");
    expect(hodnota(dan, "typ:priceVAT")).toBe("230.00");
    expect(odp).toContain("<int:classificationKVDPH><typ:ids>B1</typ:ids></int:classificationKVDPH>");
    expect(hodnota(odp, "typ:priceVAT")).toBe("230.00");
  });

  it("faktúra s položkou 23 % v prenesení: položka bez sadzby, sadzba 23 % v interných dokladoch", () => {
    const spravny = {
      ...holá,
      reverse_charge: true,
      items: [{ name: "Služba", quantity: 1, unit_price: 1000, vat_rate: 23, total: 1000 }],
    };
    const xml = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(spravny) as any] });
    expect(chybySchemy(xml)).toEqual([]);
    const { faktura, dan } = casti(xml);
    expect(hodnota(faktura, "typ:priceHigh")).toBe("0.00");
    expect(hodnota(faktura, "typ:priceNone")).toBe("1000.00");
    expect(hodnota(faktura, "inv:rateVAT")).toBe("none");
    expect(hodnota(dan, "int:rateVAT")).toBe("high");
    expect(hodnota(dan, "typ:priceVAT")).toBe("230.00");
  });

  it("položka v prenesení bez sadzby ide bez sadzby, interné doklady v základnej sadzbe", () => {
    const p = {
      ...holá,
      dph_rezim: "samozdanenie",
      items: [{ name: "Stavebné práce", quantity: 1, unit_price: 1000, vat_rate: 0, total: 1000 }],
    };
    const xml = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(p) as any] });
    expect(chybySchemy(xml)).toEqual([]);
    const { faktura, dan } = casti(xml);
    expect(hodnota(faktura, "inv:rateVAT")).toBe("none");
    expect(hodnota(faktura, "typ:priceNone")).toBe("1000.00");
    expect(faktura).toContain("<inv:classificationVAT><typ:ids>PDpdp</typ:ids></inv:classificationVAT>");
    expect(hodnota(dan, "int:rateVAT")).toBe("high");
  });

  it("zmiešaná faktúra 23 % + prenesenie: prenesená časť bez DPH, interné doklady len za ňu", () => {
    const p = {
      ...holá,
      id: "mix",
      invoice_number: "MIX-1",
      pohoda_clenenie_dph: "PD",
      amount_without_vat: 1100,
      vat_amount: 23,
      amount_total: 1123,
      vat_breakdown: [
        { sadzba: 23, zaklad: 100, dph: 23 },
        { sadzba: 0, zaklad: 1000, dph: 0, pdp: true },
      ],
    };
    expect(jePrenesenieCele(p)).toBe(false);
    const xml = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(p) as any] });
    expect(chybySchemy(xml)).toEqual([]);
    const { faktura, dan } = casti(xml);
    const polozky = [...faktura.matchAll(/<inv:invoiceItem>([\s\S]*?)<\/inv:invoiceItem>/g)].map((m) => m[1]);
    expect(polozky).toHaveLength(2);
    const pdp = polozky.find((x) => x.includes("PDpdp"))!;
    const tuzemska = polozky.find((x) => !x.includes("PDpdp"))!;
    expect(hodnota(pdp, "inv:rateVAT")).toBe("none");
    expect(hodnota(pdp, "typ:price")).toBe("1000.00");
    expect(hodnota(pdp, "typ:priceVAT")).toBe("0.00");
    expect(pdp).toContain("<inv:classificationKVDPH><typ:ids>KN</typ:ids></inv:classificationKVDPH>");
    expect(hodnota(tuzemska, "inv:rateVAT")).toBe("high");
    expect(hodnota(tuzemska, "typ:priceVAT")).toBe("23.00");
    expect(tuzemska).toContain("<inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>");
    expect(tuzemska).toContain("<inv:classificationKVDPH><typ:ids>B2</typ:ids></inv:classificationKVDPH>");
    // Hlavička zmiešanej faktúry ostáva PD / B2.
    expect(/<inv:invoiceHeader>[\s\S]*<inv:classificationKVDPH><typ:ids>B2<\/typ:ids>/.test(faktura)).toBe(true);
    expect(hodnota(faktura, "typ:priceNone")).toBe("1000.00");
    expect(hodnota(faktura, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(faktura, "typ:priceHighVAT")).toBe("23.00");
    expect(hodnota(dan, "typ:price")).toBe("1000.00");
    expect(hodnota(dan, "typ:priceVAT")).toBe("230.00");
  });
});

describe("ostatné účtovné programy: prenesená časť v základnej sadzbe", () => {
  const nastUct = { krajina: "SK", clenenieDphPrijataPdp: "PDpdp", predkontaciaPrijata: "1Fp" };

  it.each(varianty)("%s — riadok zaúčtovania 23 %, daň 0, prenesenie", (_n, p) => {
    const d = prijataNaUctovanie(p, nastUct);
    expect(d.prenesenieDph).toBe(true);
    expect(d.kv).toBe("B1");
    expect(d.riadky.map((r) => [r.sadzba, r.zaklad, r.dph])).toEqual([[23, 1000, 0]]);
  });

  it("Money S3: základ v Zaklad22, nie v Zaklad0", () => {
    const { xml } = buildMoneyS3Uctovanie({ firma, doklady: [prijataNaUctovanie(qaPf2, nastUct)], kody: {} });
    expect(hodnota(xml, "Zaklad0")).toBe("0.00");
    expect(hodnota(xml, "Zaklad22")).toBe("1000.00");
  });

  it("ABRA Flexi: základ nie je v sumOsv", () => {
    const { xml } = buildFlexiUctovanie({ firma, doklady: [prijataNaUctovanie(qaPf2, nastUct)], kody: {} });
    expect(hodnota(xml, "sumOsv") ?? "0.00").toBe("0.00");
    expect(xml).toContain("1000.00");
  });

  it("CSV: riadok so sadzbou 23", () => {
    const csv = buildCsvUctovanie({ doklady: [prijataNaUctovanie(qaPf2, nastUct)], kody: {}, krajina: "SK" });
    const [hlavicka, riadok] = csv.split(/\r?\n/);
    const i = hlavicka.split(";").indexOf("sadzba");
    expect(riadok.split(";")[i]).toBe("23");
  });

  it("MRP: daň príjemcu 230 €", () => {
    const r = buildMrpUctovanie({
      firma,
      doklady: [prijataNaUctovanie(qaPf2, nastUct)],
      nastavenia: { radPrijate: "FP", typDphPrijatePdp: "45" },
    });
    expect(r.preskocene).toEqual([]);
    expect(r.xml).toContain("230.00");
  });
});
