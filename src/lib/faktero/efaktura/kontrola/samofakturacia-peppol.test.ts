import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { skontrolujEfakturu } from "./index";

/*
 * Vzory zo špecifikácie Peppol BIS Self-Billing 3.0
 * (docs.peppol.eu/poacc/self-billing/3.0, BIS-SelfBilling-Examples.zip).
 * Kontrola ich kedysi odmietala: nepoznala ProfileID ani CustomizationID
 * samofakturácie a typ 389 púšťala len medzi dvoma nemeckými firmami.
 */
const vzor = (f: string) =>
  readFileSync(new URL(`./vzory-samofakturacia/${f}`, import.meta.url), "utf8");
const kody = (xml: string) =>
  skontrolujEfakturu(xml)
    .nalezy.filter((n) => n.zavaznost === "chyba")
    .map((n) => n.kod);

describe("Peppol BIS Self-Billing 3.0", () => {
  it("oficiálna samofaktúra (389) prejde bez chyby", () => {
    expect(kody(vzor("SB-base-example.xml"))).toEqual([]);
  });

  it("oficiálny samofakturovaný dobropis (261) prejde bez chyby", () => {
    expect(kody(vzor("SB-base-creditnote-correction.xml"))).toEqual([]);
  });

  it("samofaktúra s CustomizationID bežnej faktúry je chyba (R004)", () => {
    const xml = vzor("SB-base-example.xml").replace("poacc:selfbilling:3.0", "poacc:billing:3.0");
    expect(kody(xml)).toContain("PEPPOL-EN16931-R004");
  });

  it("bežný typ 380 v profile samofakturácie je chyba (P0100)", () => {
    const xml = vzor("SB-base-example.xml").replace(
      /<cbc:InvoiceTypeCode>\s*389\s*<\/cbc:InvoiceTypeCode>/,
      "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>",
    );
    expect(kody(xml)).toContain("PEPPOL-EN16931-P0100");
  });
});

describe("príjem samofaktúry", () => {
  it("389, 527 aj 261 sú samofaktúry; dobropis podľa koreňa", async () => {
    const { parseEfakturaEnvelope } = await import("../inbound.server");
    expect(parseEfakturaEnvelope(vzor("SB-base-example.xml")).documentKind).toBe("self_billing");
    expect(parseEfakturaEnvelope(vzor("SB-base-creditnote-correction.xml")).documentKind).toBe(
      "self_billing_credit_note",
    );
    const tarchopis = vzor("SB-base-example.xml").replace(
      /<cbc:InvoiceTypeCode>\s*389\s*<\/cbc:InvoiceTypeCode>/,
      "<cbc:InvoiceTypeCode>527</cbc:InvoiceTypeCode>",
    );
    expect(parseEfakturaEnvelope(tarchopis).documentKind).toBe("self_billing");
  });
});
