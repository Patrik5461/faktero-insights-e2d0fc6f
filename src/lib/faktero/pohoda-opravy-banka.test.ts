/*
  Opravy z auditu exportov do POHODY 14. 11. — banka a splátky (V7–V10, S11–S14, N7).

  Každé XML sa overí proti oficiálnym schémam Stormware (bank.xsd, invoice.xsd)
  a test skontroluje to, čo audit našiel: id pohybov a splátok jedinečné a
  stabilné, stály dataPack, cudzia mena s kurzom, rozúčtovanie splátky,
  členenie „nezahŕňať“, zastavenie neplatnej sadzby.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaBankXml, type VypisPohyb } from "./export.server";
import { idPohybovVypisu, symbolyZTextu } from "./banka-pohoda-id";
import {
  ID_BALIKA_SPLATOK,
  idSplatkyPohody,
  sadzbaPlatiKuDnu,
  xmlSplatokDoPohody,
  type SplatkaPreExport,
  type ZmluvaPreExport,
} from "./financovanie-pohoda";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = { bnk: "bank.xsd", inv: "invoice.xsd" };
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
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
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
      chyby.push(`${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}
const idPoloziek = (xml: string) => [...xml.matchAll(/<dat:dataPackItem id="([^"]+)"/g)].map((m) => m[1]);
const idBaliku = (xml: string) => /<dat:dataPack id="([^"]+)"/.exec(xml)?.[1];

const firmaSK: any = { id: "c1", name: "Firma s.r.o.", ico: "36123456", country: "SK" };
const firmaCZ: any = { id: "c2", name: "Firma s.r.o.", ico: "12345678", country: "CZ" };
const nastavenia: any = { banka: "TB", predkontaciaBanka: "BV" };

const pohyb = (o: Partial<VypisPohyb> = {}): VypisPohyb => ({
  datum: "2026-10-12",
  suma: 123,
  smer: "prijem",
  popis: "Úhrada FA1",
  protistrana: "Odberateľ",
  vs: "2026001",
  ...o,
});

describe("V7: id pohybov v „XML pre POHODU“", () => {
  it("pohyb z databázy má id podľa bank_transactions.id — iné v každom mesiaci a na každom účte", () => {
    const okt = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      datumVypisu: "2026-10-31",
      ucet: "SK3111000000002612345678",
      pohyby: [pohyb({ id: "0b6c9a40-1111-4c1a-9d2e-000000000001" }), pohyb({ id: "0b6c9a40-1111-4c1a-9d2e-000000000002" })],
    });
    const nov = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      datumVypisu: "2026-11-30",
      ucet: "SK3111000000002612345678",
      pohyby: [pohyb({ id: "0b6c9a40-1111-4c1a-9d2e-000000000003", datum: "2026-11-03" })],
    });
    expect(chybySchemy(okt)).toEqual([]);
    expect(chybySchemy(nov)).toEqual([]);
    expect(idPoloziek(okt)).toEqual([
      "BNK-0b6c9a40-1111-4c1a-9d2e-000000000001",
      "BNK-0b6c9a40-1111-4c1a-9d2e-000000000002",
    ]);
    expect(idPoloziek(nov)).toEqual(["BNK-0b6c9a40-1111-4c1a-9d2e-000000000003"]);
    // Nikde už `VYPIS-1`.
    expect(okt + nov).not.toMatch(/id="VYPIS/);
    // Balík je stály — kontrola duplicity stojí na dvojici dataPack + dataPackItem.
    expect(idBaliku(okt)).toBe("FAKTERO");
  });

  it("pohyb z PDF bez id: stabilný odtlačok, iný na inom účte, rovnaké pohyby sa rozlíšia poradím", () => {
    const p = [pohyb(), pohyb({ smer: "vydaj", suma: 2.5, popis: "Poplatok", vs: null }), pohyb()];
    const a = idPohybovVypisu(p, "SK31 1100 0000 0026 1234 5678");
    const b = idPohybovVypisu(p, "SK3111000000002612345678");
    const ine = idPohybovVypisu(p, "SK0809000000000123456789");
    expect(a).toEqual(b); // medzery v IBAN nemenia id
    expect(new Set(a).size).toBe(3);
    expect(a[2]).toBe(`${a[0]}-2`);
    expect(ine[0]).not.toBe(a[0]);
    for (const id of a) expect(id.length).toBeLessThanOrEqual(64);
    // Opakovaný export toho istého výpisu = tie isté id (POHODA ho odmietne ako duplicitu).
    expect(idPohybovVypisu(p, "SK3111000000002612345678")).toEqual(a);
    // Rovnaké číslo výpisu v inom roku: iný dátum → iné id.
    expect(idPohybovVypisu([pohyb({ datum: "2027-10-12" })], "SK3111000000002612345678")[0]).not.toBe(a[0]);
  });

  it("číslo výpisu ide do statementNumber s poradím pohybu", () => {
    const x = buildPohodaBankXml({ company: firmaSK, nastavenia, cisloVypisu: "11", pohyby: [pohyb({ id: "x1" })] });
    expect(x).toContain("<bnk:statementNumber>11</bnk:statementNumber>");
    expect(x).toContain("<bnk:numberMovement>1</bnk:numberMovement>");
    expect(chybySchemy(x)).toEqual([]);
  });
});

describe("V10: výpis v cudzej mene", () => {
  it("SK firma, CZK účet: foreignCurrency s menou a kurzom ECB (mena za 1 €), nie eurá", () => {
    const x = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      mena: "CZK",
      pohyby: [pohyb({ id: "a", suma: 1000, kurz: 25.346 }), pohyb({ id: "b", suma: 50, kurz: null })],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).not.toContain("<bnk:homeCurrency>");
    expect(x).toContain("<typ:currency><typ:ids>CZK</typ:ids></typ:currency>");
    expect(x).toContain("<typ:rate>25.346</typ:rate>");
    expect(x).toContain("<typ:amount>1</typ:amount>");
    expect(x).toContain("<typ:priceSum>1000.00</typ:priceSum>");
    // Bez kurzu ide len mena a suma — kurz doplní POHODA z kurzového lístka.
    const druhy = x.split("<dat:dataPackItem")[2];
    expect(druhy).not.toContain("<typ:rate>");
    expect(druhy).toContain("<typ:priceSum>50.00</typ:priceSum>");
  });

  it("CZ firma, EUR účet: kurz v zápise ČNB (Kč za 1 €)", () => {
    const x = buildPohodaBankXml({ company: firmaCZ, nastavenia, mena: "EUR", pohyby: [pohyb({ id: "a", kurz: 24.3 })] });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<typ:ids>EUR</typ:ids>");
    expect(x).toContain("<typ:rate>24.3</typ:rate>");
  });

  it("domáca mena ostáva homeCurrency", () => {
    const x = buildPohodaBankXml({ company: firmaSK, nastavenia, mena: "EUR", pohyby: [pohyb({ id: "a" })] });
    expect(x).toContain("<bnk:homeCurrency>");
    expect(x).not.toContain("foreignCurrency");
  });
});

describe("S13 a N7: členenie DPH, symboly a protiúčet v banke", () => {
  it("pohyb má členenie „nezahŕňať do DPH“ a zahraničný IBAN sa nestratí", () => {
    const x = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      pohyby: [pohyb({ id: "a", protiucet: "DE89370400440532013000", ks: "0308", ss: "77" })],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<typ:classificationVATType>nonSubsume</typ:classificationVATType>");
    expect(x).not.toContain("<bnk:paymentAccount>");
    expect(x).toContain("<bnk:intNote>Protiúčet: DE89370400440532013000</bnk:intNote>");
    expect(x).toContain("<bnk:symConst>0308</bnk:symConst>");
    expect(x).toContain("<bnk:symSpec>77</bnk:symSpec>");
  });

  it("KS a ŠS sa čítajú z textu platby", () => {
    expect(symbolyZTextu("/VS2026001/SS77/KS0308")).toEqual({ ks: "0308", ss: "77" });
    expect(symbolyZTextu("Platba KS: 0558, SS 123")).toEqual({ ks: "0558", ss: "123" });
    expect(symbolyZTextu("Úhrada faktúry")).toEqual({ ks: null, ss: null });
    // Číslice za slovom bez oddeľovača nie sú symbol.
    expect(symbolyZTextu("BKS1234 platba")).toEqual({ ks: null, ss: null });
  });
});

/* ------------------------------------------------------------- splátky */

const leasing: ZmluvaPreExport = {
  id: "z1",
  kind: "leasing",
  name: "Škoda Octavia",
  provider_name: "ČSOB Leasing, a.s.",
  contract_number: "UZF/26/80613",
  variable_symbol: "2680613",
  currency: "EUR",
  vat_rate: 0,
  term_months: 60,
  pohoda_predkontacia: "1Lz",
  pohoda_clenenie_dph: null,
  kv_clenenie: "X",
};
const s1: SplatkaPreExport = {
  id: "8f1d2c3b-0000-4000-8000-000000000001",
  number: 1,
  due_date: "2026-11-15",
  amount: 512.4,
  principal_part: 430.1,
  interest_part: 62.3,
  vat_amount: 0,
  insurance_part: 20,
};

describe("V8: splátky — stály balík a id splátky s verziou", () => {
  it("dataPack má stále id, položka id splátky; po vrátení id s verziou", () => {
    const a = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: leasing, splatky: [s1] });
    const b = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: leasing, splatky: [s1] });
    expect(chybySchemy(a.xml)).toEqual([]);
    expect(idBaliku(a.xml)).toBe(ID_BALIKA_SPLATOK);
    expect(idBaliku(a.xml)).toBe("FAKTERO");
    // Opakovaný export = ten istý súbor → POHODA s kontrolou duplicity nič nezdvojí.
    expect(a.xml).toBe(b.xml);
    expect(idPoloziek(a.xml)).toEqual([`SPL-${s1.id}`]);
    const vratena = xmlSplatokDoPohody({ zmluva: leasing, splatky: [{ ...s1, pohoda_verzia: 2 }] });
    expect(idPoloziek(vratena.xml)).toEqual([`SPL-${s1.id}-2`]);
    expect(idSplatkyPohody({ id: "x", pohoda_verzia: 0 })).toBe("SPL-x");
  });
});

describe("V9: rozúčtovanie splátky", () => {
  it("rôzne predkontácie položiek → hlavička „Rozúčtovať“, každá položka vlastný kód", () => {
    const z: ZmluvaPreExport = {
      ...leasing,
      pohoda_rozuctovanie: { istina: { predkontacia: "1Lz" }, urok: { predkontacia: "562" }, poistenie: { predkontacia: "548" } },
    };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: z, splatky: [s1] });
    expect(chybySchemy(r.xml)).toEqual([]);
    const hlavicka = r.xml.split("</inv:invoiceHeader>")[0];
    expect(hlavicka).toContain("<inv:accounting><typ:ids>Rozúčtovať</typ:ids></inv:accounting>");
    const polozky = r.xml.split("<inv:invoiceDetail>")[1];
    expect(polozky).toContain("<typ:ids>1Lz</typ:ids>");
    expect(polozky).toContain("<typ:ids>562</typ:ids>");
    expect(polozky).toContain("<typ:ids>548</typ:ids>");
  });

  it("vlastná predkontácia „Rozúčtovať“ firmy a CZ verzia", () => {
    const z: ZmluvaPreExport = { ...leasing, pohoda_rozuctovanie: { urok: { predkontacia: "562" } } };
    const vlastna = xmlSplatokDoPohody({ zmluva: z, splatky: [s1], predkontaciaRozuctovat: "ROZ" });
    expect(vlastna.xml.split("</inv:invoiceHeader>")[0]).toContain("<typ:ids>ROZ</typ:ids>");
    const cz = xmlSplatokDoPohody({ zmluva: { ...z, currency: "CZK" }, krajinaFirmy: "CZ", splatky: [s1] });
    expect(cz.xml.split("</inv:invoiceHeader>")[0]).toContain("<typ:ids>Rozúčtovat</typ:ids>");
    expect(chybySchemy(cz.xml)).toEqual([]);
  });

  it("rovnaký kód všetkých položiek ide do hlavičky bez rozúčtovania", () => {
    const r = xmlSplatokDoPohody({ zmluva: leasing, splatky: [s1] });
    const hlavicka = r.xml.split("</inv:invoiceHeader>")[0];
    expect(hlavicka).toContain("<inv:accounting><typ:ids>1Lz</typ:ids></inv:accounting>");
    expect(hlavicka).not.toContain("Rozúčtovať");
  });
});

describe("S12 a S13: sadzba, časti splátky, členenie", () => {
  it("sadzba 20 % so splatnosťou v 2026 sa nepreloží na 23 % — splátka nejde", () => {
    const op: ZmluvaPreExport = { ...leasing, vat_rate: 20 };
    const s = { ...s1, amount: 611.28, vat_amount: 98.88, insurance_part: 20 };
    const r = xmlSplatokDoPohody({ zmluva: op, splatky: [s] });
    expect(r.xml).toBe("");
    expect(r.vyhrady.join(" ")).toMatch(/20 % v deň splatnosti neplatí/);
    expect(sadzbaPlatiKuDnu(20, "2024-12-15", "SK")).toBe(true);
    expect(sadzbaPlatiKuDnu(20, "2026-01-15", "SK")).toBe(false);
    expect(sadzbaPlatiKuDnu(23, "2026-01-15", "SK")).toBe(true);
  });

  it("časti väčšie než splátka — splátka nejde, ostatné áno", () => {
    const s2 = { ...s1, id: "8f1d2c3b-0000-4000-8000-000000000002", number: 2, amount: 400 };
    const r = xmlSplatokDoPohody({ zmluva: leasing, splatky: [s1, s2] });
    expect(r.idSplatok).toEqual([s1.id]);
    expect(r.vyhrady.join(" ")).toMatch(/Splátka č\. 2 sa do Pohody neexportuje/);
  });

  it("splátka bez DPH bez členenia ide „nezahŕňať do DPH“ v hlavičke aj položkách", () => {
    const r = xmlSplatokDoPohody({ zmluva: leasing, splatky: [s1] });
    expect(chybySchemy(r.xml)).toEqual([]);
    const pocet = r.xml.match(/<typ:classificationVATType>nonSubsume<\/typ:classificationVATType>/g)?.length;
    expect(pocet).toBe(1 + 3); // hlavička + istina, úrok, poistenie
    expect(r.vyhrady.join(" ")).not.toMatch(/nemá členenie DPH/);
  });

  it("výslovné členenie má prednosť", () => {
    const r = xmlSplatokDoPohody({ zmluva: { ...leasing, pohoda_clenenie_dph: "PN" }, splatky: [s1] });
    expect(r.xml).not.toContain("nonSubsume");
    expect(r.xml).toContain("<inv:classificationVAT><typ:ids>PN</typ:ids></inv:classificationVAT>");
  });

  it("S11: splátky z viacerých rokov v jednom súbore dostanú výhradu", () => {
    const s2 = { ...s1, id: "8f1d2c3b-0000-4000-8000-000000000003", number: 3, due_date: "2027-01-15" };
    const r = xmlSplatokDoPohody({ zmluva: leasing, splatky: [s1, s2] });
    expect(r.vyhrady.join(" ")).toMatch(/z rokov 2026, 2027/);
  });
});
