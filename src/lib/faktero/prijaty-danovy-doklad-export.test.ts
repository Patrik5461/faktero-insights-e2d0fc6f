/*
  Prijatý daňový doklad k prijatej platbe (purchase_invoices.type
  advance_payment) v exportoch: Pohoda ako interný doklad s odpočtom DPH,
  ostatné programy ako prijatá faktúra bez nákladovej predkontácie.
*/
import { describe, expect, it } from "vitest";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { buildPohodaExpensesXml } from "./export.server";
import { prekazkaDokladu, varovanieDokladu, VAROVANIE_DANOVY_BEZ_PREDKONTACIE } from "./pohoda-kontrola";
import { prijataNaUctovanie } from "./zauctovanie-export";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import { buildOmegaUctovanie } from "./export-omega-uctovanie";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import { buildCsvUctovanie } from "./export-csv-uctovanie";
import { TYP_POHODY_PRIJATY_DANOVY } from "./prijaty-danovy-doklad";
import { isAccountingDocument } from "./uctovny-doklad";

const firmaSK: any = { id: "c1", name: "Firma s.r.o.", ico: "36123456", dic: "2020123456", ic_dph: "SK2020123456", vat_payer: true, country: "SK" };
const firmaCZ: any = { ...firmaSK, ico: "27123456", dic: "CZ27123456", ic_dph: null, country: "CZ" };
const nastavenia: any = { predkontaciaPrijata: "1Fp", clenenieDphPrijata: "PD", stredisko: "BA", radInterne: "ID" };

const ddp = (o: any = {}) => ({
  id: "ddp-1",
  company_id: "c1",
  type: "advance_payment",
  status: "paid",
  invoice_number: "DD2026015",
  variable_symbol: "2026015",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  supplier_country: "SK",
  supplier_iban: "SK8975000000000012345671",
  issue_date: "2026-10-09",
  delivery_date: "2026-10-08",
  received_date: "2026-10-12",
  payment_date: "2026-10-08",
  due_date: "2026-10-09",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  advance_amount: null,
  advance_invoice_id: "zf-1",
  vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
  payment_method: "prevod",
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  zauctovane_at: "2026-10-12T10:00:00Z",
  ...o,
});

describe("prijatý daňový doklad k platbe — Pohoda", () => {
  it("prijataAkoDoklad: interný doklad bez splatnosti, účtu a odpočtu zálohy", () => {
    const d: any = prijataAkoDoklad(ddp({ advance_amount: 50 }));
    expect(d._agenda).toBe("int");
    expect(d._typPohody).toBe(TYP_POHODY_PRIJATY_DANOVY);
    expect(d._text).toBe("Daňový doklad k prijatej platbe DD2026015");
    expect(d._splatnost).toBeNull();
    expect(d._ucetDodavatela).toBeNull();
    expect(d._odpocetZalohy).toBeNull();
    expect(d._datumDph).toBe("2026-10-08");
    expect(d.vat_breakdown).toEqual([{ sadzba: 23, zaklad: 100, dph: 23 }]);
    expect(isAccountingDocument(d._typPohody)).toBe(true);
  });

  it("DUZP bez dátumu dodania = deň platby", () => {
    const d: any = prijataAkoDoklad(ddp({ delivery_date: null }));
    expect(d._datumDph).toBe("2026-10-08");
    const e: any = prijataAkoDoklad(ddp({ delivery_date: null, payment_date: null }));
    expect(e._datumDph).toBe("2026-10-09");
  });

  it("bežná prijatá a zálohová sa nemenia", () => {
    expect((prijataAkoDoklad(ddp({ type: "regular" })) as any)._typPohody).toBe("receivedInvoice");
    expect((prijataAkoDoklad(ddp({ type: "proforma" })) as any)._typPohody).toBe("receivedAdvanceInvoice");
  });

  it("XML: bez vlastnej predkontácie ide bez <int:accounting> (nie nákladová 1Fp), s PD a B2", () => {
    const xml = buildPohodaExpensesXml({ company: firmaSK, nastavenia, doklady: [prijataAkoDoklad(ddp()) as any] });
    expect(xml).toContain("<int:intDoc ");
    expect(xml).not.toContain("1Fp");
    expect(xml).not.toContain("<int:accounting>");
    expect(xml).toContain("<int:classificationVAT><typ:ids>PD</typ:ids></int:classificationVAT>");
    expect(xml).toContain("<int:classificationKVDPH><typ:ids>B2</typ:ids></int:classificationKVDPH>");
    // Odpočet neskôr z DUZP (8. 10.) a prijatia (12. 10.).
    expect(xml).toContain("<int:dateTax>2026-10-12</int:dateTax>");
    expect(xml).toContain("<int:dateDelivery>2026-10-08</int:dateDelivery>");
    expect(xml).toContain("<int:dateKVDPH>2026-10-12</int:dateKVDPH>");
    expect(xml).toContain("<int:number><typ:ids>ID</typ:ids></int:number>");
    expect(xml).not.toContain("paymentAccount");
    expect(xml).not.toContain("dateDue");
  });

  it("XML CZ firma: dateKHDPH = deň odpočtu, bez KV", () => {
    const xml = buildPohodaExpensesXml({
      company: firmaCZ,
      nastavenia,
      doklady: [prijataAkoDoklad(ddp({ currency: "CZK", vat_breakdown: [{ sadzba: 21, zaklad: 100, dph: 21 }], vat_amount: 21, amount_total: 121 })) as any],
    });
    expect(xml).toContain("<int:dateKHDPH>2026-10-12</int:dateKHDPH>");
    expect(xml).not.toContain("classificationKVDPH");
    expect(xml).toContain("<int:text>Daňový doklad k přijaté platbě DD2026015</int:text>");
  });

  it("kontrola: zaúčtovaný bez vlastnej predkontácie sa nezastaví, len upozorní", () => {
    const d = prijataAkoDoklad(ddp()) as any;
    expect(prekazkaDokladu(d, firmaSK, nastavenia)).toBeNull();
    expect(varovanieDokladu(d, nastavenia, firmaSK)).toContain(VAROVANIE_DANOVY_BEZ_PREDKONTACIE);
    const s = prijataAkoDoklad(ddp({ pohoda_predkontacia: "1Zp" })) as any;
    expect(varovanieDokladu(s, nastavenia, firmaSK)).toBeNull();
  });
});

describe("prijatý daňový doklad k platbe — ostatné programy", () => {
  const nastU: any = { predkontaciaPrijata: "1Fp", clenenieDphPrijata: "PD", krajina: "SK" };

  it("prijataNaUctovanie: bez nákladovej predkontácie, text, bez odpočtu zálohy, doklad k platbe", () => {
    const d = prijataNaUctovanie(ddp({ advance_amount: 40, category: "x" }), nastU);
    expect(d.predkontacia).toBeNull();
    expect(d.clenenie).toBe("PD");
    expect(d.text).toBe("Daňový doklad k prijatej platbe DD2026015");
    expect(d.odpocetZalohy).toBe(0);
    expect(d.dokladKPlatbe).toBe(true);
    expect(d.druh).toBe("faktura");
    expect(d.dph).toBe(23);
    expect(prijataNaUctovanie(ddp({ type: "regular" }), nastU).predkontacia).toBe("1Fp");
  });

  it("Money, Omega, Flexi a CSV doklad spracujú bez chyby", () => {
    const kody = { "1Zp": { kod: "1Zp", popis: "DPH zo zálohy", ucetMd: "343", ucetD: "314" } };
    const doklady = [prijataNaUctovanie(ddp({ pohoda_predkontacia: "1Zp" }), nastU), prijataNaUctovanie(ddp(), nastU)];
    const money = buildMoneyS3Uctovanie({ firma: firmaSK, doklady, kody });
    expect(money.xml).toContain("<Druh>D</Druh>");
    expect(() => buildOmegaUctovanie({ firma: firmaSK, doklady, kody })).not.toThrow();
    expect(() => buildFlexiUctovanie({ firma: firmaSK, doklady, kody })).not.toThrow();
    expect(buildCsvUctovanie({ doklady, kody, krajina: "SK" })).toContain("DD2026015");
  });
});
