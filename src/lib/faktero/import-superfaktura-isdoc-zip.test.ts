import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { zipSync, strToU8 } from "fflate";

/*
  Celý import zo SuperFaktúry nad ZIP-om s viacerými ISDOC faktúrami —
  od rozbalenia cez mapovanie stĺpcov až po riadky, ktoré idú do databázy.
  Databáza je nahradená zapisovačom, aby bolo vidno presne, čo by sa uložilo.
*/
const zapisy: { t: string; data: any }[] = [];
function dotaz(t: string): any {
  const o: any = {
    select: () => o,
    eq: () => o,
    is: () => o,
    in: () => o,
    order: () => o,
    maybeSingle: async () => ({
      data: t === "companies" ? { vat_payer: true, country: "SK" } : null,
    }),
    single: async () => ({ data: { id: `${t}-${zapisy.length}` }, error: null }),
    insert: (data: any) => {
      zapisy.push({ t, data });
      return o;
    },
    update: () => o,
    delete: () => o,
    then: (r: any) => r({ data: [], error: null }),
  };
  return o;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => dotaz(t) },
}));
vi.mock("./kurz-dokladu.server", () => ({ doplnovacKurzov: () => async () => ({}) }));
vi.mock("./ciselne-rady-import.server", () => ({ rozpoznajRadyPoImporte: async () => [] }));

import { extractTables, detectMapping, runImport, druhDokladu } from "./import-superfaktura.server";

const riadok = (
  id: number,
  nazov: string,
  q: number,
  cena: number,
  zaklad: number,
  dan: number,
  sadzba: number,
  curr?: { zaklad: number; dan: number },
) => `
<InvoiceLine><ID>${id}</ID><InvoicedQuantity unitCode="ks">${q}</InvoicedQuantity>
${curr ? `<LineExtensionAmountCurr>${curr.zaklad}</LineExtensionAmountCurr>` : ""}<LineExtensionAmount>${zaklad}</LineExtensionAmount>
${curr ? `<LineExtensionAmountTaxInclusiveCurr>${curr.zaklad + curr.dan}</LineExtensionAmountTaxInclusiveCurr>` : ""}<LineExtensionAmountTaxInclusive>${(zaklad + dan).toFixed(2)}</LineExtensionAmountTaxInclusive>
<LineExtensionTaxAmount>${dan}</LineExtensionTaxAmount><UnitPrice>${cena}</UnitPrice><UnitPriceTaxInclusive>${(cena * (1 + sadzba / 100)).toFixed(4)}</UnitPriceTaxInclusive>
<ClassifiedTaxCategory><Percent>${sadzba}</Percent><VATCalculationMethod>0</VATCalculationMethod></ClassifiedTaxCategory>
<Item><Description>${nazov}</Description></Item></InvoiceLine>`;

const doc = (o: {
  typ: number;
  cislo: string;
  mena?: string;
  kurz?: string;
  riadky: string;
  zaklad: number;
  dan: number;
  curr?: { zaklad: number; dan: number };
}) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
<DocumentType>${o.typ}</DocumentType><ID>${o.cislo}</ID><UUID>00000000-0000-0000-0000-${o.cislo.padStart(12, "0")}</UUID>
<IssueDate>2026-10-01</IssueDate><TaxPointDate>2026-09-30</TaxPointDate><VATApplicable>true</VATApplicable><Note>Pozn ${o.cislo}</Note>
<LocalCurrencyCode>EUR</LocalCurrencyCode>${o.mena ? `<ForeignCurrencyCode>${o.mena}</ForeignCurrencyCode>` : ""}<CurrRate>${o.kurz ?? 1}</CurrRate><RefCurrRate>${o.mena ? 100 : 1}</RefCurrRate>
<AccountingSupplierParty><Party><PartyIdentification><ID>12345678</ID></PartyIdentification><PartyName><Name>Dodávateľ s.r.o.</Name></PartyName></Party></AccountingSupplierParty>
<AccountingCustomerParty><Party><PartyIdentification><ID>00012345</ID></PartyIdentification><PartyName><Name>Odberateľ ${o.cislo}</Name></PartyName>
<PostalAddress><StreetName>Hlavná</StreetName><BuildingNumber>1</BuildingNumber><CityName>Nitra</CityName><PostalZone>94901</PostalZone><Country><IdentificationCode>SK</IdentificationCode><Name>Slovensko</Name></Country></PostalAddress>
<PartyTaxScheme><CompanyID>SK2020123456</CompanyID><TaxScheme>VAT</TaxScheme></PartyTaxScheme></Party></AccountingCustomerParty>
<InvoiceLines>${o.riadky}</InvoiceLines>
<LegalMonetaryTotal><TaxExclusiveAmount>${o.zaklad}</TaxExclusiveAmount>${o.curr ? `<TaxExclusiveAmountCurr>${o.curr.zaklad}</TaxExclusiveAmountCurr>` : ""}
<TaxInclusiveAmount>${(o.zaklad + o.dan).toFixed(2)}</TaxInclusiveAmount>${o.curr ? `<TaxInclusiveAmountCurr>${(o.curr.zaklad + o.curr.dan).toFixed(2)}</TaxInclusiveAmountCurr>` : ""}
<PayableAmount>${(o.zaklad + o.dan).toFixed(2)}</PayableAmount></LegalMonetaryTotal>
<PaymentMeans><Payment><PaidAmount>0</PaidAmount><PaymentMeansCode>42</PaymentMeansCode><Details><PaymentDueDate>2026-10-15</PaymentDueDate><ID>1</ID><BankCode>1100</BankCode><VariableSymbol>${o.cislo}</VariableSymbol></Details></Payment></PaymentMeans>
</Invoice>`;

const SUBORY = {
  "2026001.isdoc": doc({
    typ: 1,
    cislo: "2026001",
    zaklad: 130,
    dan: 20.7,
    riadky:
      riadok(1, "Služba", 2, 50, 100, 23, 23) +
      riadok(2, "Export služby", 1, 40, 40, 0, 0) +
      riadok(3, "Zľava", 1, -10, -10, -2.3, 23),
  }),
  "2026002.isdoc": doc({
    typ: 1,
    cislo: "2026002",
    mena: "CZK",
    kurz: "4",
    zaklad: 40,
    dan: 9.2,
    curr: { zaklad: 1000, dan: 230 },
    riadky: riadok(1, "Licencia", 1, 40, 40, 9.2, 23, { zaklad: 1000, dan: 230 }),
  }),
  "2026003.isdoc": doc({
    typ: 2,
    cislo: "2026003",
    zaklad: 20,
    dan: 4.6,
    riadky: riadok(1, "Vrátenie", 1, 20, 20, 4.6, 23),
  }),
  "Z2026001.isdoc": doc({
    typ: 4,
    cislo: "Z2026001",
    zaklad: 100,
    dan: 23,
    riadky: riadok(1, "Záloha", 1, 100, 100, 23, 23),
  }),
};

async function importuj(subory: Record<string, string | Uint8Array>) {
  const zip = zipSync(
    Object.fromEntries(
      Object.entries(subory).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v]),
    ),
  );
  const [t] = await extractTables(zip, "export.zip");
  const { mapping } = detectMapping(t.headers, t.rows);
  const vysledok = await runImport({
    jobId: "j",
    companyId: "c",
    rows: t.rows,
    mapping,
    options: {},
  });
  const faktury = zapisy
    .filter((z) => z.t === "invoices")
    .map((z, i) => ({
      ...z.data,
      polozky: zapisy.filter((p) => p.t === "invoice_items")[i]?.data ?? [],
    }));
  return { vysledok, faktury };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

beforeEach(() => {
  zapisy.length = 0;
});

describe("import ZIP zo SuperFaktúry (ISDOC)", () => {
  it("štyri doklady: sadzby 23 % a 0 %, zľava, cudzia mena, dobropis, zálohová", async () => {
    const { vysledok, faktury } = await importuj(SUBORY);
    expect(vysledok).toMatchObject({ imported_invoices: 4, failed_rows: 0 });
    const f = Object.fromEntries(faktury.map((x) => [x.invoice_number, x]));

    // Zľava je záporný riadok — nesmie vypadnúť, inak súčet položiek nesedí.
    expect(f["2026001"]).toMatchObject({
      type: "regular",
      currency: "EUR",
      subtotal: 130,
      vat_total: 20.7,
      total: 150.7,
    });
    expect(
      f["2026001"].polozky.map((p: any) => [p.name, p.vat_rate, r2(p.subtotal), r2(p.vat_amount)]),
    ).toEqual([
      ["Služba", 23, 100, 23],
      ["Export služby", 0, 40, 0],
      ["Zľava", 23, -10, -2.3],
    ]);

    // Cudzia mena: sumy v mene faktúry (…Curr), nie prepočet do domácej.
    expect(f["2026002"]).toMatchObject({
      currency: "CZK",
      subtotal: 1000,
      vat_total: 230,
      total: 1230,
    });
    expect(f["2026002"].polozky[0]).toMatchObject({ unit_price: 1000, subtotal: 1000, unit: "ks" });

    // Dobropis: druh dokladu a záporné sumy ako z formulára.
    expect(f["2026003"]).toMatchObject({
      type: "credit_note",
      subtotal: -20,
      vat_total: -4.6,
      total: -24.6,
    });
    expect(f["2026003"].polozky[0]).toMatchObject({ quantity: -1, unit_price: 20, subtotal: -20 });

    // Zálohová faktúra nie je výnos — musí prísť ako zálohová.
    expect(f["Z2026001"]).toMatchObject({ type: "proforma", total: 123 });

    for (const x of faktury) {
      const s = x.polozky.reduce((a: number, p: any) => a + p.subtotal, 0);
      expect(r2(s)).toBe(x.subtotal);
    }
  });

  it("vzorový ISDOC v EUR s domácou CZK a odpočtom záloh", async () => {
    const isdoc = readFileSync(new URL("./__fixtures__/superfaktura.isdoc", import.meta.url));
    const { faktury } = await importuj({ "FV-111999.isdoc": new Uint8Array(isdoc) });
    expect(faktury[0]).toMatchObject({
      currency: "EUR",
      subtotal: 14,
      total: 15.8,
      // 14,70 € daňových záloh + 1 € nedaňový zálohový list
      advance_amount: 15.7,
    });
    expect(faktury[0].polozky.map((p: any) => [p.unit, r2(p.subtotal)])).toEqual([
      ["Ks", 4.3],
      ["Ks", 8.7],
      ["Ks", 1],
    ]);
  });
});

describe("druhDokladu", () => {
  it("kódy aj slová", () => {
    expect(druhDokladu("credit_note")).toBe("credit_note");
    expect(druhDokladu("Dobropis")).toBe("credit_note");
    expect(druhDokladu("Zálohová faktúra")).toBe("proforma");
    expect(druhDokladu("Daňový doklad k prijatej platbe")).toBe("advance_payment");
    expect(druhDokladu("Faktúra")).toBe("regular");
    expect(druhDokladu(undefined)).toBe("regular");
  });
});
