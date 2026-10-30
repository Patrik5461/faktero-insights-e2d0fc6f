/**
 * Výpis z platobnej brány celou cestou: CSV brány → pohyby → dávka pre
 * Pohodu (bank.xsd) aj camt.053 (ISO 20022). Unit testy brán kontrolujú
 * čítanie stĺpcov, tu ide o to, či z toho vznikne súbor, ktorý Pohoda prijme,
 * a či súčty sedia na cent so zmenou zostatku na bráne.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { citajVypisBrany } from "./vypis-brany";
import { buildPohodaBankXml } from "./export.server";
import { buildCamt053 } from "./bank-statements-own.server";
import { ucelCamt } from "./vypis-oznacenie";
import { zostatkyNaExport } from "./vypis-pohyby";

xmlRegisterFsInputProviders();

function validator(subor: string) {
  const url = new URL(subor, import.meta.url);
  return XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
}
const BANK = validator("./schemy/pohoda/bank.xsd");
const CAMT = validator("./schemy/camt.053.001.02.xsd");

/** Každý `bnk:bank` z dataPacku samostatne proti bank.xsd. */
function chybyPohody(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => m[0]))];
  const chyby: string[] = [];
  const kusy = [...xml.matchAll(/<bnk:bank\b[^>]*>[\s\S]*?<\/bnk:bank>/g)];
  if (!kusy.length) chyby.push("žiadny bnk:bank");
  for (const m of kusy) {
    const doc = XmlDocument.fromString(m[0].replace(/^<bnk:bank\b/, `<bnk:bank ${ns.join(" ")}`));
    try {
      BANK.validate(doc);
    } catch (e: any) {
      chyby.push(String(e?.message ?? e));
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

function chybaCamt(xml: string): string | null {
  const doc = XmlDocument.fromBuffer(Buffer.from(xml, "utf8"));
  try {
    CAMT.validate(doc);
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  } finally {
    doc.dispose();
  }
}

const company: any = {
  name: "Brána s.r.o.",
  ico: "12345678",
  street: "Hlavná 1",
  zip: "94901",
  city: "Nitra",
  country: "SK",
};

const VZORKY: Record<string, string> = {
  // Stripe → Reports → Balance → Itemized balance change from activity.
  stripe: [
    "balance_transaction_id,created_utc,available_on_utc,currency,gross,fee,net,reporting_category,description",
    "txn_1,2026-10-01 09:12:00,2026-10-03 00:00:00,eur,45.91,0.94,44.97,charge,Obchod - Order 1234",
    "txn_2,2026-10-01 11:00:00,2026-10-03 00:00:00,eur,19.00,0.52,18.48,charge,Obchod - Order 1235",
    "txn_3,2026-10-02 08:00:00,2026-10-02 08:00:00,eur,-19.00,0.00,-19.00,refund,REFUND FOR CHARGE (Obchod - Order 1235)",
    "txn_4,2026-10-03 06:00:00,2026-10-05 00:00:00,eur,-44.45,0.00,-44.45,payout,STRIPE PAYOUT",
  ].join("\n"),
  gopay: [
    "ID pohybu;Datum;Typ;Protistrana;Subjekt/E-mail;Bank.účet - prefix;Bank.účet - číslo;Bank.účet - kód banky;ID objednávky/VS;Částka;Počáteční stav;Koncový stav;Měna;ID referenčního pohybu",
    "3001;01.10.2026 10:00;Platba;Jan Novák & syn <s.r.o.>;jan@example.com;;;;2026101;500,00;0,00;500,00;EUR;",
    "3002;01.10.2026 10:00;Poplatek za platbu;GoPay;;;;;2026101;-11,50;500,00;488,50;EUR;3001",
    "3003;05.10.2026 06:00;Výplata na účet;;;;123456789;0800;;-488,50;488,50;0,00;EUR;",
  ].join("\r\n"),
  comgate: [
    "Merchant;Datum založení;Datum zaplacení;Datum převodu;ID ComGate;Metoda;Popis;E-mail plátce;Variabilní symbol platby;Variabilní symbol převodu;ID od klienta;Měna;Potvrzená částka;Převedená částka;Poplatek celkem",
    "123;01.10.2026;01.10.2026;03.10.2026;AB12-CD34-EF56;CARD;Objednávka 501;a@example.com;;9988;501;EUR;1000,00;985,00;15,00",
    "123;02.10.2026;02.10.2026;03.10.2026;GH78-IJ90-KL12;CARD;Objednávka 502;b@example.com;;9988;502;EUR;200,00;196,00;4,00",
  ].join("\n"),
  paypal: [
    '"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","To Email Address","Transaction ID","Reference Txn ID","Invoice Number","Balance"',
    '"10/01/2026","10:00:00","CEST","Eva Malá","Express Checkout Payment","Completed","EUR","120.00","-3.95","116.05","eva@example.com","shop@example.com","1AB","","WC-777","116.05"',
    '"10/03/2026","08:00:00","CEST","","General Withdrawal","Completed","EUR","-116.05","0.00","-116.05","","","2CD","","","0.00"',
  ].join("\n"),
};

describe("výpis brány do Pohody a camt.053", () => {
  for (const [meno, csv] of Object.entries(VZORKY)) {
    it(`${meno}: dávka pre Pohodu prejde bank.xsd a sumy sedia`, () => {
      const v = citajVypisBrany(csv);
      expect(v.brana).toBe(meno);
      expect(v.pohyby.length).toBeGreaterThan(1);
      const xml = buildPohodaBankXml({
        company,
        pohyby: v.pohyby,
        cisloVypisu: "2026/10",
        datumVypisu: "2026-10-31",
        nastavenia: {
          banka: meno.toUpperCase().slice(0, 4),
          predkontaciaBanka: "BV",
          predkontacieOznaceni: { poplatok: "568", prevod: "261" },
        } as any,
      });
      expect(chybyPohody(xml)).toEqual([]);
      // Príjmy mínus výdaje v dávke = súčet pohybov z brány na cent.
      const sumy = [...xml.matchAll(/<bnk:bankType>(\w+)<[\s\S]*?<typ:priceNone>([\d.]+)</g)];
      expect(sumy.length).toBe(v.pohyby.length);
      const obrat = sumy.reduce((s, m) => s + (m[1] === "receipt" ? 1 : -1) * Number(m[2]), 0);
      const ocakavany = v.pohyby.reduce((s, p) => s + (p.smer === "vydaj" ? -p.suma : p.suma), 0);
      expect(Math.round(obrat * 100)).toBe(Math.round(ocakavany * 100));
      // Poplatok dostane predkontáciu podľa označenia, platba spoločnú.
      expect(xml).toMatch(/Bankový poplatok/);
      expect(xml).toMatch(/<typ:ids>568<\/typ:ids>/);
    });

    it(`${meno}: camt.053 s účtom brány bez IBAN-u prejde schémou`, () => {
      const v = citajVypisBrany(csv);
      const zoradene = [...v.pohyby].sort((a, b) => a.datum.localeCompare(b.datum));
      const z = zostatkyNaExport(zoradene);
      const xml = buildCamt053({
        company,
        account: { iban: meno.toUpperCase(), account_name: null, currency: v.mena || "EUR" },
        periodStart: zoradene[0]!.datum,
        periodEnd: zoradene[zoradene.length - 1]!.datum,
        transactions: zoradene.map((p) => ({
          booking_date: p.datum,
          amount: p.smer === "vydaj" ? -p.suma : p.suma,
          currency: v.mena || "EUR",
          variable_symbol: p.vs ?? null,
          counterparty: p.protistrana ?? null,
          description: p.popis ?? null,
          transaction_reference: null,
          purpose: ucelCamt(p.oznacenie, p.smer),
        })),
        opening: z?.pociatocny ?? 0,
        closing: z?.konecny ?? 0,
        sequenceNumber: 10,
        note: "Prepis výpisu brány",
      } as any);
      expect(chybaCamt(xml)).toBeNull();
    });
  }
});
