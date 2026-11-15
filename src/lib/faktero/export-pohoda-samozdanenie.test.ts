/*
  Samozdanenie prijatej faktúry v slovenskej POHODE — faktúra bez DPH
  + interné doklady „Priznanie DPH“ a „Odpočet DPH“ (samozdanenie-pohoda.ts).

  Model podľa skutočných dát PALIERA s.r.o. v POHODE SK 14404.8 (15. 11. 2026):
  prijatá faktúra v `priceNone` s PDsluz/PDnadEU a KV „KN“, interný doklad
  rad 26sam, predkontácia aInt (priznanie) / bInt (odpočet), VS a číslo
  faktúry dodávateľa, položka high 417 / 95,91 / 512,91, KV B1.

  Každý doklad balíka ide proti schéme Stormware svojej agendy (invoice.xsd,
  intDoc.xsd) aj celý balík proti data.xsd.

  `POHODA_VZORKY=<adresár> npx vitest run export-pohoda-samozdanenie` uloží
  vzorky na skúšobný import do Pohody (firma IČO 54613124).
*/
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { prekazkaDokladu, varovanieKvPrijatej } from "./pohoda-kontrola";
import { cleneniaSamozdania, druhSamozdania, riadkySamozdania, textySamozdania } from "./samozdanenie-pohoda";
import { polozkyZDavky } from "./pohoda-konektor-davka";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = { inv: "invoice.xsd", int: "intDoc.xsd" };
const validatory = new Map<string, XsdValidator>();
function validator(prefix: string): XsdValidator {
  const v = validatory.get(prefix);
  if (v) return v;
  const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
  const novy = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  validatory.set(prefix, novy);
  return novy;
}

/** Každý doklad z `dataPack` samostatne proti schéme jeho agendy. */
function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
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
      chyby.push(`${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function overBalik(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY: S } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, S.pohoda);
}

const VZORKY = process.env.POHODA_VZORKY;
function uloz(nazov: string, xml: string) {
  if (!VZORKY) return;
  mkdirSync(VZORKY, { recursive: true });
  writeFileSync(`${VZORKY}/${nazov}.xml`, xml, "utf8");
}

const hodnota = (xml: string, el: string) => new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
const hodnoty = (xml: string, el: string) =>
  [...xml.matchAll(new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`, "g"))].map((m) => m[1]);
const kod = (xml: string, el: string) =>
  new RegExp(`<${el}>\\s*<typ:ids>([^<]*)</typ:ids>`).exec(xml)?.[1] ?? null;
const hlavicka = (xml: string, agenda: "inv:invoice" | "int:intDoc") =>
  new RegExp(`<${agenda}Header>([\\s\\S]*?)</${agenda}Header>`).exec(xml)?.[1] ?? "";
const polozkyDokladu = (xml: string, el: string) =>
  [...xml.matchAll(new RegExp(`<${el}>([\\s\\S]*?)</${el}>`, "g"))].map((m) => m[1]);

/** Položky balíka podľa id: faktúra, Priznanie DPH, Odpočet DPH. */
function casti(xml: string) {
  const vsetky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  const podla = (re: RegExp) => vsetky.find((m) => re.test(m[1]))?.[2] ?? "";
  return {
    ids: vsetky.map((m) => m[1]),
    faktura: podla(/^(?!.*-sam-)/),
    dan: podla(/-sam-dan$/),
    odp: podla(/-sam-odp$/),
  };
}

/* ------------------------------------------------------------- údaje */

const paliera: any = {
  id: "c-paliera",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  dic: "2121712345",
  ic_dph: "SK2121712345",
  vat_payer: true,
  country: "SK",
};

const nastavenia: any = {
  predkontaciaPrijata: "1",
  clenenieDphPrijata: "PD",
  predkontaciaSamozdanenieDan: "aInt",
  predkontaciaSamozdanenieOdpocet: "bInt",
  radSamozdanenie: "26sam",
};

const zaklad = {
  company_id: "c-paliera",
  type: "regular",
  status: "booked",
  issue_date: "2026-10-31",
  delivery_date: "2026-10-31",
  received_date: "2026-11-05",
  due_date: "2026-11-14",
  currency: "EUR",
  payment_method: "prevod",
  odpocet: true,
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
};

/** Tuzemské prenesenie § 69 ods. 12 — ako JD Stav s.r.o. FV2610057 v POHODE PALIERY. */
const tuzemske = {
  ...zaklad,
  id: "5a0e0001-0000-4000-8000-000000000001",
  invoice_number: "S2610057",
  variable_symbol: "2610057",
  supplier_name: "JD Stav s.r.o.",
  supplier_ico: "51234567",
  supplier_dic: "2120654321",
  supplier_ic_dph: "SK2120654321",
  supplier_street: "Hlavná 12",
  supplier_city: "Žilina",
  supplier_zip: "01001",
  supplier_country: "SK",
  amount_without_vat: 417,
  vat_amount: 0,
  amount_total: 417,
  reverse_charge: true,
  dph_rezim: "samozdanenie",
  items: [{ name: "Stavebné práce — murovanie", quantity: 1, unit: "ks", unit_price: 417, vat_rate: 23, total: 417 }],
};

/** Služba od zahraničnej osoby z Írska (§ 69 ods. 3), EUR. */
const sluzbaIE = {
  ...zaklad,
  id: "5a0e0001-0000-4000-8000-000000000002",
  invoice_number: "S5268411923",
  variable_symbol: "5268411923",
  supplier_name: "Google Ireland Limited",
  supplier_ic_dph: "IE6388047V",
  supplier_street: "Gordon House, Barrow Street",
  supplier_city: "Dublin 4",
  supplier_zip: "D04 E5W5",
  supplier_country: "IE",
  amount_without_vat: 125.4,
  vat_amount: 0,
  amount_total: 125.4,
  dph_rezim: "samozdanenie",
  items: [{ name: "Google Workspace — október 2026", quantity: 1, unit_price: 125.4, vat_rate: 0, total: 125.4 }],
};

/** Služba z USA v USD (§ 69 ods. 3, mimo EÚ, bez IČ DPH), kurz ECB 1,1612 USD/€. */
const sluzbaUS = {
  ...zaklad,
  id: "5a0e0001-0000-4000-8000-000000000003",
  invoice_number: "S-INV-77812",
  variable_symbol: "77812",
  supplier_name: "Anthropic, PBC",
  supplier_street: "548 Market Street",
  supplier_city: "San Francisco",
  supplier_zip: "94104",
  supplier_country: "US",
  currency: "USD",
  exchange_rate: 1.1612,
  amount_without_vat: 200,
  vat_amount: 0,
  amount_total: 200,
  dph_rezim: "samozdanenie",
  items: [{ name: "Claude Team — predplatné", quantity: 2, unit_price: 100, vat_rate: 0, total: 200 }],
};

/** Nadobudnutie tovaru z Nemecka. */
const tovarDE = {
  ...zaklad,
  id: "5a0e0001-0000-4000-8000-000000000004",
  invoice_number: "S-RE-2026-4411",
  variable_symbol: "20264411",
  supplier_name: "Würth Handelsgesellschaft mbH",
  supplier_ic_dph: "DE146283481",
  supplier_street: "Reinhold-Würth-Straße 12",
  supplier_city: "Künzelsau",
  supplier_zip: "74653",
  supplier_country: "DE",
  amount_without_vat: 864.2,
  vat_amount: 0,
  amount_total: 864.2,
  dph_rezim: "nadobudnutie",
  items: [
    { name: "Kotvy chemické", quantity: 20, unit: "ks", unit_price: 21.5, vat_rate: 0, total: 430 },
    { name: "Vrtáky SDS", quantity: 14, unit: "ks", unit_price: 31.0143, vat_rate: 0, total: 434.2 },
  ],
};

/** Tuzemské prenesenie bez nároku na odpočet. */
const bezNaroku = {
  ...tuzemske,
  id: "5a0e0001-0000-4000-8000-000000000005",
  invoice_number: "S2610099",
  variable_symbol: "2610099",
  amount_without_vat: 250,
  amount_total: 250,
  odpocet: false,
  items: [{ name: "Stavebné práce — rekreačné zariadenie", quantity: 1, unit_price: 250, vat_rate: 23, total: 250 }],
};

/** Zmiešaná faktúra — materiál s DPH 23 %, stavebné práce v prenesení (ako PALIERA 261100051). */
const zmiesana = {
  ...zaklad,
  id: "5a0e0001-0000-4000-8000-000000000006",
  invoice_number: "S261100051",
  variable_symbol: "261100051",
  supplier_name: "Stavmat Žilina s.r.o.",
  supplier_ico: "36412345",
  supplier_dic: "2021712345",
  supplier_ic_dph: "SK2021712345",
  supplier_country: "SK",
  amount_without_vat: 1500,
  vat_amount: 115,
  amount_total: 1615,
  items: [
    { name: "Materiál", quantity: 1, unit_price: 500, vat_rate: 23, total: 500 },
    { name: "Stavebné práce (PDP)", quantity: 1, unit_price: 1000, vat_rate: 23, total: 1000, pdp: true },
  ],
};

const xmlZ = (p: any, n: any = nastavenia, firma: any = paliera) =>
  buildPohodaExpensesXml({ company: firma, nastavenia: n, doklady: [prijataAkoDoklad(p) as any] });

async function overVsetko(nazov: string, xml: string) {
  uloz(nazov, xml);
  expect(chybySchemy(xml)).toEqual([]);
  expect(await overBalik(xml)).toBeNull();
}

/* ------------------------------------------------------------- testy */

describe("samozdanenie — čisté pravidlá", () => {
  it("druh podľa režimu a krajiny dodávateľa", () => {
    expect(druhSamozdania(tuzemske, "SK")).toBe("prenesenie");
    expect(druhSamozdania(sluzbaIE, "SK")).toBe("sluzba_zo_zahranicia");
    expect(druhSamozdania(sluzbaUS, "SK")).toBe("sluzba_zo_zahranicia");
    expect(druhSamozdania({ supplier_ic_dph: "ATU 12345678" }, "SK")).toBe("sluzba_zo_zahranicia");
    expect(druhSamozdania({ supplier_ic_dph: "SK2120654321" }, "SK")).toBe("prenesenie");
    expect(druhSamozdania({ supplier_ic_dph: "CZ12345678" }, "SK")).toBe("sluzba_zo_zahranicia");
    expect(druhSamozdania(tovarDE, "SK")).toBe("nadobudnutie");
  });

  it("členenia troch dokladov", () => {
    expect(cleneniaSamozdania("prenesenie")).toEqual({ faktura: "PDsluz", priznanie: "DDsluz", odpocet: "PDsluz" });
    expect(cleneniaSamozdania("sluzba_zo_zahranicia")).toEqual({ faktura: "PDsluz", priznanie: "DDsl§69", odpocet: "PDsluz" });
    expect(cleneniaSamozdania("nadobudnutie")).toEqual({ faktura: "PDnadEU", priznanie: "DDnadEU", odpocet: "PDnadEU" });
    // Bez nároku: Odpočet DPH sa nerobí, faktúra ostáva s PDsluz/PDnadEU (PB… majú firmy v POHODE vypnuté).
    expect(cleneniaSamozdania("prenesenie", { odpocet: false })).toEqual({ faktura: "PDsluz", priznanie: "DDsluz", odpocet: null });
    expect(cleneniaSamozdania("nadobudnutie", { odpocet: false })).toEqual({ faktura: "PDnadEU", priznanie: "DDnadEU", odpocet: null });
    // Nastavenie firmy pre prijaté prenesenie má prednosť pred systémovým kódom.
    expect(cleneniaSamozdania("prenesenie", { clenenieFirmy: "PDpdp" }).odpocet).toBe("PDpdp");
  });

  it("texty ako u účtovníčky", () => {
    expect(textySamozdania("prenesenie", "2610057")).toEqual({
      priznanie: "Priznanie DPH z nadobudnutia tovaru a služby, var.sym. 2610057",
      odpocet: "Odpočet DPH z nadobudnutia tovaru a služby, var.sym. 2610057",
    });
    expect(textySamozdania("nadobudnutie", "1").priznanie).toBe(
      "Priznanie DPH z nadobudnutia tovaru z iného štátu EÚ, var.sym. 1",
    );
  });

  it("riadky po sadzbách: bez sadzby základná k dňu dodania (aj historická 20 %), uvedená ostáva", () => {
    const rozpis = [
      { sadzba: 0, zaklad: 100, dph: 0, pdp: true },
      { sadzba: 19, zaklad: 50, dph: 0, pdp: true },
      { sadzba: 23, zaklad: 10, dph: 2.3 },
    ];
    expect(riadkySamozdania(rozpis, { cele: false, krajina: "SK", den: "2026-10-31" })).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 19, zaklad: 50, dph: 9.5 },
    ]);
    expect(riadkySamozdania([{ sadzba: 0, zaklad: 100, dph: 0 }], { cele: true, krajina: "SK", den: "2024-12-15" })).toEqual([
      { sadzba: 20, zaklad: 100, dph: 20 },
    ]);
  });
});

describe("Pohoda SK: prijatá faktúra so samozdanením — faktúra + Priznanie DPH + Odpočet DPH", () => {
  it("tuzemské prenesenie (§ 69 ods. 12), dodávateľ SK — ako PALIERA 26sam", async () => {
    const xml = xmlZ(tuzemske);
    await overVsetko("S01-tuzemske-prenesenie", xml);
    const { ids, faktura, dan, odp } = casti(xml);
    expect(ids).toEqual([tuzemske.id, `${tuzemske.id}-sam-dan`, `${tuzemske.id}-sam-odp`]);

    // Faktúra: bez DPH, PDsluz, KN, bežná predkontácia, na úhradu základ.
    expect(hodnota(faktura, "inv:rateVAT")).toBe("none");
    expect(hodnota(faktura, "typ:priceNone")).toBe("417.00");
    expect(hodnota(faktura, "typ:priceHigh")).toBe("0.00");
    expect(hodnota(faktura, "typ:priceHighVAT")).toBe("0.00");
    const hf = hlavicka(faktura, "inv:invoice");
    expect(kod(hf, "inv:accounting")).toBe("1");
    expect(kod(hf, "inv:classificationVAT")).toBe("PDsluz");
    expect(kod(hf, "inv:classificationKVDPH")).toBe("KN");
    expect(faktura).not.toContain("<typ:ids>B1</typ:ids>");

    // Priznanie DPH — presne ako interný doklad účtovníčky.
    const hd = hlavicka(dan, "int:intDoc");
    expect(kod(hd, "int:number")).toBe("26sam");
    expect(hodnota(hd, "int:symVar")).toBe("2610057");
    expect(hodnota(hd, "int:originalDocumentNumber")).toBe("S2610057");
    for (const el of ["int:date", "int:dateTax", "int:dateAccounting", "int:dateKVDPH", "int:dateDelivery"])
      expect(hodnota(hd, el)).toBe("2026-10-31");
    expect(hodnota(hd, "int:text")).toBe("Priznanie DPH z nadobudnutia tovaru a služby, var.sym. 2610057");
    expect(hodnota(hd, "typ:company")).toBe("JD Stav s.r.o.");
    expect(hodnota(hd, "typ:icDph")).toBe("SK2120654321");
    expect(kod(hd, "typ:country")).toBe("SK");
    expect(kod(hd, "int:accounting")).toBe("aInt");
    expect(kod(hd, "int:classificationVAT")).toBe("DDsluz");
    expect(kod(hd, "int:classificationKVDPH")).toBe("B1");
    const [pd] = polozkyDokladu(dan, "int:intDocItem");
    expect(hodnota(pd, "int:rateVAT")).toBe("high");
    expect([hodnota(pd, "typ:price"), hodnota(pd, "typ:priceVAT"), hodnota(pd, "typ:priceSum")]).toEqual([
      "417.00",
      "95.91",
      "512.91",
    ]);
    expect([kod(pd, "int:accounting"), kod(pd, "int:classificationVAT"), kod(pd, "int:classificationKVDPH")]).toEqual([
      "aInt",
      "DDsluz",
      "B1",
    ]);

    // Odpočet DPH — to isté s PDsluz a bInt.
    const ho = hlavicka(odp, "int:intDoc");
    expect(hodnota(ho, "int:text")).toBe("Odpočet DPH z nadobudnutia tovaru a služby, var.sym. 2610057");
    expect([kod(ho, "int:accounting"), kod(ho, "int:classificationVAT"), kod(ho, "int:classificationKVDPH")]).toEqual([
      "bInt",
      "PDsluz",
      "B1",
    ]);
    expect(hodnota(odp, "typ:priceVAT")).toBe("95.91");
  });

  it("služba z Írska (§ 69 ods. 3, EUR): DDsl§69 / PDsluz", async () => {
    const xml = xmlZ(sluzbaIE);
    await overVsetko("S02-sluzba-IE-eur", xml);
    const { faktura, dan, odp } = casti(xml);
    expect(hodnota(faktura, "typ:priceNone")).toBe("125.40");
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationVAT")).toBe("PDsluz");
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationKVDPH")).toBe("KN");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsl§69");
    expect(kod(hlavicka(odp, "int:intDoc"), "int:classificationVAT")).toBe("PDsluz");
    expect(hodnota(dan, "typ:priceVAT")).toBe("28.84");
    expect(kod(hlavicka(dan, "int:intDoc"), "typ:country")).toBe("IE");
    // Celá v domácej mene — cudzia mena nikde.
    expect(dan).not.toContain("foreignCurrency");
  });

  it("služba z USA v USD (mimo EÚ): interné doklady v USD s kurzom faktúry aj v eurách", async () => {
    const xml = xmlZ(sluzbaUS);
    await overVsetko("S03-sluzba-US-usd", xml);
    const { faktura, dan, odp } = casti(xml);
    expect(faktura).toContain("<typ:ids>USD</typ:ids>");
    expect(hodnota(faktura, "inv:rateVAT")).toBe("none");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsl§69");
    const [pd] = polozkyDokladu(dan, "int:intDocItem");
    // 200 USD / 1,1612 = 172,24 € → DPH 39,62 €; v USD 200 / 46,00.
    const domaca = /<int:homeCurrency>([\s\S]*?)<\/int:homeCurrency>/.exec(pd)![1];
    const cudzia = /<int:foreignCurrency>([\s\S]*?)<\/int:foreignCurrency>/.exec(pd)![1];
    expect([hodnota(domaca, "typ:price"), hodnota(domaca, "typ:priceVAT")]).toEqual(["172.24", "39.62"]);
    expect([hodnota(cudzia, "typ:price"), hodnota(cudzia, "typ:priceVAT"), hodnota(cudzia, "typ:priceSum")]).toEqual([
      "200.00",
      "46.00",
      "246.00",
    ]);
    const suhrn = /<int:intDocSummary>([\s\S]*?)<\/int:intDocSummary>/.exec(dan)![1];
    expect(kod(suhrn, "typ:currency")).toBe("USD");
    expect(hodnota(suhrn, "typ:rate")).toBe("1.1612");
    expect(hodnota(/<int:foreignCurrency>([\s\S]*?)<\/int:foreignCurrency>/.exec(odp)![1], "typ:priceSum")).toBe("246.00");
    // Dodávateľ mimo EÚ IČ DPH nemá — KV upozornenie sa preň nehlási.
    expect(varovanieKvPrijatej(prijataAkoDoklad(sluzbaUS), paliera)).toBeNull();
  });

  it("tovar z Nemecka (nadobudnutie): PDnadEU na faktúre, DDnadEU / PDnadEU s textom o tovare z EÚ", async () => {
    const xml = xmlZ(tovarDE);
    await overVsetko("S04-tovar-DE", xml);
    const { faktura, dan, odp } = casti(xml);
    expect(hodnoty(faktura, "inv:rateVAT")).toEqual(["none", "none"]);
    expect(hodnota(faktura, "typ:priceNone")).toBe("864.20");
    expect(new Set(hodnoty(faktura, "typ:ids").filter((k) => /^P|^KN|^B/.test(k)))).toEqual(new Set(["PDnadEU", "KN"]));
    const hd = hlavicka(dan, "int:intDoc");
    expect(kod(hd, "int:classificationVAT")).toBe("DDnadEU");
    expect(hodnota(hd, "int:text")).toBe("Priznanie DPH z nadobudnutia tovaru z iného štátu EÚ, var.sym. 20264411");
    expect(kod(hlavicka(odp, "int:intDoc"), "int:classificationVAT")).toBe("PDnadEU");
    expect(hodnota(odp, "int:text")).toBe("Odpočet DPH z nadobudnutia tovaru z iného štátu EÚ, var.sym. 20264411");
    expect(hodnota(dan, "typ:price")).toBe("864.20");
    expect(hodnota(dan, "typ:priceVAT")).toBe("198.77");
  });

  it("bez nároku na odpočet: faktúra PDsluz/KN a len Priznanie DPH (DDsluz), Odpočet DPH nejde", async () => {
    const xml = xmlZ(bezNaroku);
    await overVsetko("S05-bez-naroku", xml);
    const { faktura, dan, odp } = casti(xml);
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationVAT")).toBe("PDsluz");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsluz");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationKVDPH")).toBe("B1");
    expect(hodnota(dan, "typ:priceVAT")).toBe("57.50");
    expect(odp).toBeFalsy();
    expect(xml).not.toContain("-sam-odp");
  });

  it("zmiešaná faktúra: materiál PD/B2 s DPH, práce v PDP bez DPH, interné doklady len za prenesenú časť", async () => {
    const xml = xmlZ(zmiesana);
    await overVsetko("S06-zmiesana", xml);
    const { faktura, dan, odp } = casti(xml);
    const hf = hlavicka(faktura, "inv:invoice");
    expect(kod(hf, "inv:classificationVAT")).toBe("PD");
    expect(kod(hf, "inv:classificationKVDPH")).toBe("B2");
    const [mat, prace] = polozkyDokladu(faktura, "inv:invoiceItem");
    expect([hodnota(mat, "inv:rateVAT"), hodnota(mat, "typ:priceVAT"), kod(mat, "inv:classificationVAT"), kod(mat, "inv:classificationKVDPH")]).toEqual([
      "high",
      "115.00",
      "PD",
      "B2",
    ]);
    expect([hodnota(prace, "inv:rateVAT"), hodnota(prace, "typ:priceVAT"), kod(prace, "inv:classificationVAT"), kod(prace, "inv:classificationKVDPH")]).toEqual([
      "none",
      "0.00",
      "PDsluz",
      "KN",
    ]);
    expect(hodnota(faktura, "typ:priceNone")).toBe("1000.00");
    expect(hodnota(faktura, "typ:priceHigh")).toBe("500.00");
    expect(hodnota(faktura, "typ:priceHighVAT")).toBe("115.00");
    expect([hodnota(dan, "typ:price"), hodnota(dan, "typ:priceVAT")]).toEqual(["1000.00", "230.00"]);
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsluz");
    expect(kod(hlavicka(odp, "int:intDoc"), "int:classificationVAT")).toBe("PDsluz");
  });
});

describe("samozdanenie — okolie", () => {
  it("bez nastavení firmy: systémové kódy, bez predkontácie a radu; kontrola doklad nezastaví", () => {
    const d = prijataAkoDoklad(tuzemske);
    expect(prekazkaDokladu(d, paliera, {})).toBeNull();
    const xml = xmlZ(tuzemske, {});
    expect(chybySchemy(xml)).toEqual([]);
    const { faktura, dan } = casti(xml);
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationVAT")).toBe("PDsluz");
    expect(dan).not.toContain("<int:number>");
    expect(dan).not.toContain("<int:accounting>");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsluz");
  });

  it("oprava po vrátení z Pohody: interné doklady s verziou ako faktúra; konektor ich priradí k faktúre", () => {
    const xml = xmlZ({ ...tuzemske, pohoda_verzia: 2 });
    const { ids } = casti(xml);
    expect(ids).toEqual([`${tuzemske.id}-2`, `${tuzemske.id}-2-sam-dan`, `${tuzemske.id}-2-sam-odp`]);
    const polozky = polozkyZDavky(xml, { prijate: [{ id: tuzemske.id, verzia: 2 }] }, "2026-11-15T10:00:00Z");
    expect(polozky.map((p) => [p.polozka_id, p.druh, p.zaznam_id])).toEqual(ids.map((id) => [id, "prijata", tuzemske.id]));
  });

  it("bežná tuzemská faktúra interné doklady nedostane", () => {
    const xml = xmlZ({ ...zmiesana, items: [zmiesana.items[0]], amount_without_vat: 500, amount_total: 615 });
    expect(casti(xml).ids).toHaveLength(1);
  });

  it("česká firma ostáva pri DDpdp na faktúre (bez interných dokladov)", () => {
    const xml = xmlZ({ ...tuzemske, currency: "CZK" }, {}, { ...paliera, country: "CZ", ico: "27123456" });
    expect(casti(xml).ids).toHaveLength(1);
    expect(xml).toContain("<typ:ids>DDpdp</typ:ids>");
  });

  it("starší deň dodania (2024): Priznanie DPH v sadzbe 20 %", () => {
    const xml = xmlZ({
      ...tuzemske,
      id: "5a0e0001-0000-4000-8000-000000000007",
      invoice_number: "S2412001",
      issue_date: "2024-12-10",
      delivery_date: "2024-12-10",
      received_date: "2024-12-12",
      items: [{ name: "Stavebné práce", quantity: 1, unit_price: 417, vat_rate: 0, total: 417 }],
    });
    expect(chybySchemy(xml)).toEqual([]);
    const { dan } = casti(xml);
    expect(hodnota(dan, "int:rateVAT")).toBe("high");
    expect(hodnota(dan, "typ:priceVAT")).toBe("83.40");
  });
});

/* ---------------------------------------------- prijatý dobropis (SK) */

/*
  Prijatý dobropis k faktúre so samozdanením: dobropis s kladnými sumami
  v `priceNone` (PDsluz/PDnadEU, KV „KN“) a interné doklady „Oprava
  priznania DPH … (dobropis)“ a „Oprava odpočtu DPH … (dobropis)“ so
  ZÁPORNÝM základom a daňou, KV B1. Id a čísla podľa `BEH` (opakované
  skúšobné importy do tej istej kópie POHODY sa nesmú zraziť).
*/
const BEH = String(process.env.BEH ?? "").trim();
const behHex = Buffer.from(BEH, "utf8").toString("hex").slice(0, 4).padStart(4, "0");
const idDobropisu = (n: number) => `5a0e0002-${behHex}-4000-8000-${String(n).padStart(12, "0")}`;
const cisloDobropisu = (n: string) => `SD${BEH}${n}`;

/** Dobropis k tuzemskému preneseniu (zľava 100 € z murovania), doručený v novembri. */
const dobropisTuzemske = {
  ...tuzemske,
  id: idDobropisu(1),
  invoice_number: cisloDobropisu("2611001"),
  variable_symbol: `${BEH.replace(/\D/g, "")}2611001`,
  opravuje_cislo: tuzemske.invoice_number,
  issue_date: "2026-11-10",
  delivery_date: "2026-11-10",
  received_date: "2026-11-12",
  due_date: "2026-11-24",
  amount_without_vat: -100,
  vat_amount: 0,
  amount_total: -100,
  items: [{ name: "Zľava — murovanie", quantity: 1, unit: "ks", unit_price: -100, vat_rate: 23, total: -100 }],
};

/** Dobropis k nadobudnutiu tovaru z Nemecka (vrátené kotvy). */
const dobropisDE = {
  ...tovarDE,
  id: idDobropisu(2),
  invoice_number: cisloDobropisu("-GS-4411"),
  variable_symbol: `${BEH.replace(/\D/g, "")}20264412`,
  opravuje_cislo: tovarDE.invoice_number,
  issue_date: "2026-11-09",
  delivery_date: "2026-11-09",
  received_date: "2026-11-11",
  amount_without_vat: -86,
  vat_amount: 0,
  amount_total: -86,
  items: [{ name: "Vrátené kotvy chemické", quantity: 4, unit: "ks", unit_price: -21.5, vat_rate: 0, total: -86 }],
};

describe("Pohoda SK: prijatý dobropis so samozdanením — dobropis + Oprava priznania + Oprava odpočtu DPH", () => {
  it("tuzemské prenesenie: dobropis kladný v priceNone/PDsluz/KN, interné doklady záporné s KV B1", async () => {
    const xml = xmlZ(dobropisTuzemske);
    await overVsetko("S07-dobropis-prenesenie", xml);
    const { ids, faktura, dan, odp } = casti(xml);
    expect(ids).toEqual([dobropisTuzemske.id, `${dobropisTuzemske.id}-sam-dan`, `${dobropisTuzemske.id}-sam-odp`]);

    // Dobropis: kladné sumy (typ rozhoduje), bez DPH, nič v priceHigh, KN — žiadne B1.
    expect(faktura).toContain("<inv:invoiceType>receivedCreditNotice</inv:invoiceType>");
    expect(hodnota(faktura, "inv:rateVAT")).toBe("none");
    expect(hodnota(faktura, "typ:priceNone")).toBe("100.00");
    expect(hodnota(faktura, "typ:priceHigh")).toBe("0.00");
    expect(hodnota(faktura, "typ:priceHighVAT")).toBe("0.00");
    const hf = hlavicka(faktura, "inv:invoice");
    expect(kod(hf, "inv:classificationVAT")).toBe("PDsluz");
    expect(kod(hf, "inv:classificationKVDPH")).toBe("KN");
    expect(hodnota(hf, "inv:originalDocumentNumber")).toBe("S2610057");
    expect(hodnota(hf, "inv:dateApplicationVAT")).toBe("2026-11-12");
    expect(faktura).not.toContain("<typ:ids>B1</typ:ids>");
    const [pf] = polozkyDokladu(faktura, "inv:invoiceItem");
    expect([hodnota(pf, "typ:price"), hodnota(pf, "typ:priceVAT"), kod(pf, "inv:classificationKVDPH")]).toEqual([
      "100.00",
      "0.00",
      "KN",
    ]);

    // Oprava priznania DPH: záporný základ aj daň, DDsluz, B1, číslo dobropisu od dodávateľa.
    const hd = hlavicka(dan, "int:intDoc");
    expect(hodnota(hd, "int:text")).toBe(
      `Oprava priznania DPH z nadobudnutia tovaru a služby (dobropis), var.sym. ${dobropisTuzemske.variable_symbol}`,
    );
    expect(hodnota(hd, "int:originalDocumentNumber")).toBe(dobropisTuzemske.invoice_number);
    expect(hodnota(hd, "int:symVar")).toBe(dobropisTuzemske.variable_symbol);
    // Oprava v období prijatia dobropisu (ako jeho dateApplicationVAT a výkazy Faktera).
    for (const el of ["int:date", "int:dateTax", "int:dateKVDPH"]) expect(hodnota(hd, el)).toBe("2026-11-12");
    expect([kod(hd, "int:accounting"), kod(hd, "int:classificationVAT"), kod(hd, "int:classificationKVDPH")]).toEqual([
      "aInt",
      "DDsluz",
      "B1",
    ]);
    const [pd] = polozkyDokladu(dan, "int:intDocItem");
    expect(hodnota(pd, "int:rateVAT")).toBe("high");
    expect([hodnota(pd, "typ:price"), hodnota(pd, "typ:priceVAT"), hodnota(pd, "typ:priceSum")]).toEqual([
      "-100.00",
      "-23.00",
      "-123.00",
    ]);
    expect([hodnota(dan, "typ:priceHigh"), hodnota(dan, "typ:priceHighVAT")]).toEqual(["-100.00", "-23.00"]);

    // Oprava odpočtu DPH: to isté s PDsluz a bInt.
    const ho = hlavicka(odp, "int:intDoc");
    expect(hodnota(ho, "int:text")).toBe(
      `Oprava odpočtu DPH z nadobudnutia tovaru a služby (dobropis), var.sym. ${dobropisTuzemske.variable_symbol}`,
    );
    expect([kod(ho, "int:accounting"), kod(ho, "int:classificationVAT"), kod(ho, "int:classificationKVDPH")]).toEqual([
      "bInt",
      "PDsluz",
      "B1",
    ]);
    expect([hodnota(odp, "typ:priceHigh"), hodnota(odp, "typ:priceHighVAT")]).toEqual(["-100.00", "-23.00"]);
  });

  it("tovar z Nemecka: PDnadEU/KN na dobropise, Oprava priznania DDnadEU a odpočtu PDnadEU so zápornými sumami", async () => {
    const xml = xmlZ(dobropisDE);
    expect(chybySchemy(xml)).toEqual([]);
    expect(await overBalik(xml)).toBeNull();
    const { faktura, dan, odp } = casti(xml);
    expect(hodnota(faktura, "typ:priceNone")).toBe("86.00");
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationVAT")).toBe("PDnadEU");
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationKVDPH")).toBe("KN");
    const hd = hlavicka(dan, "int:intDoc");
    expect(kod(hd, "int:classificationVAT")).toBe("DDnadEU");
    expect(hodnota(hd, "int:text")).toMatch(/^Oprava priznania DPH z nadobudnutia tovaru z iného štátu EÚ \(dobropis\)/);
    expect(kod(hlavicka(odp, "int:intDoc"), "int:classificationVAT")).toBe("PDnadEU");
    // 86 × 23 % = 19,78
    expect([hodnota(dan, "typ:price"), hodnota(dan, "typ:priceVAT")]).toEqual(["-86.00", "-19.78"]);
    expect([hodnota(odp, "typ:price"), hodnota(odp, "typ:priceVAT")]).toEqual(["-86.00", "-19.78"]);
  });

  it("bez nároku na odpočet: len Oprava priznania DPH, Oprava odpočtu nejde", () => {
    const xml = xmlZ({ ...dobropisTuzemske, id: idDobropisu(3), invoice_number: cisloDobropisu("2611003"), odpocet: false });
    expect(chybySchemy(xml)).toEqual([]);
    const { ids, dan, odp } = casti(xml);
    expect(ids).toHaveLength(2);
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsluz");
    expect(hodnota(dan, "typ:priceVAT")).toBe("-23.00");
    expect(odp).toBeFalsy();
  });

  it("kontrola dobropis v prenesení bez nastavenia firmy nezastaví (systémové PDsluz/DDsluz)", () => {
    const d = prijataAkoDoklad(dobropisTuzemske);
    expect(d._typPohody).toBe("receivedCreditNotice");
    expect(prekazkaDokladu(d, paliera, {})).toBeNull();
    const { faktura, dan } = casti(xmlZ(dobropisTuzemske, {}));
    expect(kod(hlavicka(faktura, "inv:invoice"), "inv:classificationVAT")).toBe("PDsluz");
    expect(kod(hlavicka(dan, "int:intDoc"), "int:classificationVAT")).toBe("DDsluz");
  });

  it("česká firma: dobropis ostáva opravným daňovým dokladom bez interných dokladov", () => {
    const xml = xmlZ({ ...dobropisTuzemske, currency: "CZK" }, {}, { ...paliera, country: "CZ", ico: "27123456" });
    expect(casti(xml).ids).toHaveLength(1);
    expect(xml).toContain("<inv:invoiceType>receivedCorrectiveTax</inv:invoiceType>");
  });
});
