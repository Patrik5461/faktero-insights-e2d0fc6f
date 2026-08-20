/**
 * Overenie camt.053 proti oficiálnej schéme ISO 20022.
 *
 * Ostatné testy kontrolujú obsah — že v súbore je tá suma a ten IBAN. Toto
 * kontroluje niečo iné: či súbor vôbec zodpovedá schéme. POHODA ho totiž pri
 * načítaní výpisov validuje a keď nesedí čokoľvek, odpovie jedinou vetou
 * („súbor nezodpovedá stanovenej štruktúre formátu SEPA XML") a nepovie, čo.
 *
 * Presne takto sa našlo, že `MsgId` mal 39 znakov, kým schéma pripúšťa 35 —
 * súbor sa roky tváril v poriadku a žiadny test to nechytil.
 *
 * Schéma je v `schemy/camt.053.001.02.xsd` (z www.iso20022.org, jeden súbor
 * bez ďalších odkazov, takže netreba prístup na disk pre wasm).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { buildCamt053, type OwnStatementInput } from "./bank-statements-own.server";

const SCHEMA = new URL("./schemy/camt.053.001.02.xsd", import.meta.url);

function overSchemou(xml: string): string | null {
  const xsd = XmlDocument.fromBuffer(readFileSync(SCHEMA));
  const validator = XsdValidator.fromDoc(xsd);
  const doc = XmlDocument.fromBuffer(Buffer.from(xml, "utf8"));
  try {
    validator.validate(doc);
    return null;
  } catch (e) {
    return String((e as Error)?.message ?? e);
  } finally {
    doc.dispose();
    validator.dispose();
    xsd.dispose();
  }
}

const vstup = (zmeny: Partial<OwnStatementInput> = {}): OwnStatementInput => ({
  company: {
    name: "Ukážková firma s.r.o.",
    ico: "12345678",
    street: "Športová 707/43",
    zip: "919 26",
    city: "Zavar",
    country: "SK",
  },
  account: { iban: "SK0375000000004032809427", account_name: "Bežný účet", currency: "EUR" },
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  opening: 21831.98,
  closing: 33.54,
  createdAt: "2026-08-01T09:21:15.000Z",
  transactions: [
    {
      booking_date: "2026-07-01",
      amount: -1000,
      currency: "EUR",
      variable_symbol: "9999",
      counterparty: "MaxiTicket s.r.o.",
      description: "Odoslaná okamžitá platba /VS9999",
      transaction_reference: null,
    },
    {
      booking_date: "2026-07-24",
      amount: 10000,
      currency: "EUR",
      variable_symbol: null,
      counterparty: "PALIERA s.r.o.",
      description: "Prijatá platba",
      transaction_reference: null,
    },
  ],
  ...zmeny,
});

describe("camt.053 proti schéme", () => {
  it("bežný výpis schéme zodpovedá", () => {
    expect(overSchemou(buildCamt053(vstup()))).toBeNull();
  });

  it("dlhý IBAN identifikátory nepretiahne", () => {
    // Maltský IBAN má 31 znakov — s predponou a obdobím by `MsgId` prerástol 35.
    const i = vstup();
    const xml = buildCamt053({
      ...i,
      account: { ...i.account, iban: "MT84MALT011000012345MTLCAST001S" },
    });
    expect(overSchemou(xml)).toBeNull();
  });

  it("dlhý popis a názov protistrany prejdú tiež", () => {
    const i = vstup();
    const xml = buildCamt053({
      ...i,
      transactions: [
        {
          ...i.transactions[0],
          description: "Platba kartou ".repeat(30),
          counterparty: "Veľmi dlhý názov protistrany ".repeat(10),
        },
      ],
    });
    expect(overSchemou(xml)).toBeNull();
  });

  it("krajina zapísaná slovom sa nahradí kódom", () => {
    const i = vstup();
    const xml = buildCamt053({ ...i, company: { ...i.company, country: "Slovensko" } });
    expect(xml).toContain("<Ctry>SK</Ctry>");
    expect(overSchemou(xml)).toBeNull();
  });

  it("výpis bez pohybov a bez IBAN-u ostáva platný", () => {
    const i = vstup();
    const xml = buildCamt053({
      ...i,
      account: { ...i.account, iban: null },
      transactions: [],
      opening: 0,
      closing: 0,
    });
    expect(overSchemou(xml)).toBeNull();
  });
});
