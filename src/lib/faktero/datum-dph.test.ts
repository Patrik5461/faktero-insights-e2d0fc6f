/*
  Dátum daňovej povinnosti (`datum_dph`, 18. 11. 2026): výslovný dátum na
  doklade určuje obdobie DPH (prehľad, priznanie, KV) aj dátum DPH v exporte
  do Pohody. Bez neho platí doterajšie pravidlo — staré doklady sa nemenia.

  Príklad účtovníčky: faktúra SFC s DUZP 31. 10., vystavená a doručená
  2. 11. — patrí do októbra.
*/
import { describe, expect, it } from "vitest";
import {
  datumDphDokladu,
  datumDphPoZmeneDodania,
  datumDphSaLisiOdDodania,
  normalizujDatumDph,
  obdobieDph,
  predvolenyDatumDph,
} from "./datum-dph";
import { denDaneVystavenej, denOdpoctuPrijatej } from "./dph-prehlad";
import { denZamku } from "./zamok-obdobia";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, priznanie } from "./dph-vykazy";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { prijataNaUctovanie, vystavenaNaUctovanie } from "./zauctovanie-export";
import { buildMoneyS3Uctovanie } from "./export-money-uctovanie";
import { buildCsvUctovanie } from "./export-csv-uctovanie";

function klient(tabulky: Record<string, any[]>) {
  return {
    from(t: string) {
      const riadky = tabulky[t] ?? [];
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        gte: () => q,
        lte: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        then: (ok: any, zle: any) => Promise.resolve({ data: riadky, error: null }).then(ok, zle),
      };
      return q;
    },
  };
}

const FIRMA = { id: "c1", country: "SK", vat_payer: true, ic_dph: "SK2020123456", dic: "2020123456" };

// SFC: DUZP 31. 10., vystavená aj prijatá 2. 11.
const prijata = (o: Record<string, any> = {}): any => ({
  id: "p-sfc",
  company_id: "c1",
  type: "regular",
  invoice_number: "SFC-2611",
  supplier_name: "SFC s.r.o.",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  supplier_country: "SK",
  issue_date: "2026-11-02",
  delivery_date: "2026-10-31",
  received_date: "2026-11-02",
  due_date: "2026-11-16",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  status: "booked",
  payment_method: "prevod",
  items: [{ name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});

const vystavena = (o: Record<string, any> = {}): any => ({
  id: "f1",
  company_id: "c1",
  invoice_number: "FA2026001",
  type: "regular",
  status: "sent",
  issue_date: "2026-11-02",
  delivery_date: "2026-10-31",
  due_date: "2026-11-16",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "36123456",
  customer_dic: "2020202020",
  customer_ic_dph: "SK2020202020",
  customer_country: "SK",
  invoice_items: [{ vat_rate: 23, subtotal: 100, vat_amount: 23, quantity: 1, unit_price: 100 }],
  ...o,
});

describe("datumDphDokladu — jedno pravidlo", () => {
  it("prijatá: výslovný dátum má prednosť, bez neho neskorší z DUZP a prijatia", () => {
    expect(datumDphDokladu(prijata(), "prijata")).toBe("2026-11-02");
    expect(datumDphDokladu(prijata({ datum_dph: "2026-10-31" }), "prijata")).toBe("2026-10-31");
    expect(obdobieDph(prijata({ datum_dph: "2026-10-31" }), "prijata")).toBe("10/2026");
    // denOdpoctu (výkazy, zámok) dáva to isté.
    expect(denOdpoctuPrijatej(prijata({ datum_dph: "2026-10-31" }))).toBe("2026-10-31");
  });

  it("prijatá: výslovný dátum platí aj pri samozdanení a dobropise", () => {
    const pdp = prijata({ dph_rezim: "samozdanenie", vat_amount: 0, amount_total: 100 });
    expect(datumDphDokladu(pdp, "prijata")).toBe("2026-10-31");
    expect(datumDphDokladu({ ...pdp, datum_dph: "2026-11-05" }, "prijata")).toBe("2026-11-05");
    const dobropis = prijata({ opravuje_cislo: "SFC-1", amount_total: -123, received_date: "2026-11-04" });
    expect(datumDphDokladu(dobropis, "prijata")).toBe("2026-11-04");
    expect(datumDphDokladu({ ...dobropis, datum_dph: "2026-11-03" }, "prijata")).toBe("2026-11-03");
  });

  it("vystavená: výslovný dátum má prednosť, bez neho DUZP, opravná faktúra vyhotovenie", () => {
    expect(datumDphDokladu(vystavena(), "vystavena")).toBe("2026-10-31");
    expect(datumDphDokladu(vystavena({ datum_dph: "2026-11-01" }), "vystavena")).toBe("2026-11-01");
    expect(denDaneVystavenej(vystavena({ datum_dph: "2026-11-01" }))).toBe("2026-11-01");
    expect(datumDphDokladu(vystavena({ type: "credit_note" }), "vystavena")).toBe("2026-11-02");
  });

  it("neplatný alebo prázdny datum_dph sa ignoruje (staré pravidlo)", () => {
    expect(datumDphDokladu(prijata({ datum_dph: "" }), "prijata")).toBe("2026-11-02");
    expect(datumDphDokladu(prijata({ datum_dph: "31.10.2026" }), "prijata")).toBe("2026-11-02");
    expect(normalizujDatumDph("2026-10-31T00:00:00Z")).toBe("2026-10-31");
    expect(normalizujDatumDph("")).toBeNull();
  });

  it("zámok obdobia počíta s datum_dph", () => {
    expect(denZamku("purchase_invoices", prijata({ datum_dph: "2026-10-31" }))).toBe("2026-10-31");
    expect(denZamku("purchase_invoices", prijata())).toBe("2026-11-02");
    // Vystavená: skorší z vystavenia a dňa dane.
    expect(denZamku("invoices", vystavena({ datum_dph: "2026-10-20" }))).toBe("2026-10-20");
  });
});

describe("predvolený dátum daňovej povinnosti nového dokladu", () => {
  it("prijatá: DUZP, bez neho vystavenie; dobropis prijatie", () => {
    expect(predvolenyDatumDph(prijata(), "prijata")).toBe("2026-10-31");
    expect(predvolenyDatumDph(prijata({ delivery_date: null }), "prijata")).toBe("2026-11-02");
    expect(
      predvolenyDatumDph(prijata({ amount_total: -123, received_date: "2026-11-04" }), "prijata"),
    ).toBe("2026-11-04");
    // Uložený datum_dph predvolený deň neovplyvní.
    expect(predvolenyDatumDph(prijata({ datum_dph: "2026-12-01" }), "prijata")).toBe("2026-10-31");
  });

  it("vystavená: DUZP; dobropis vyhotovenie; doklad k prijatej platbe deň platby", () => {
    expect(predvolenyDatumDph(vystavena(), "vystavena")).toBe("2026-10-31");
    expect(predvolenyDatumDph(vystavena({ type: "credit_note" }), "vystavena")).toBe("2026-11-02");
    expect(
      predvolenyDatumDph(
        vystavena({ type: "advance_payment", delivery_date: null, payment_date: "2026-10-29" }),
        "vystavena",
      ),
    ).toBe("2026-10-29");
  });

  it("pole nasleduje DUZP, kým ho používateľ nezmení", () => {
    expect(datumDphPoZmeneDodania("2026-10-31", "2026-10-31", "2026-10-30")).toBe("2026-10-30");
    expect(datumDphPoZmeneDodania("", "2026-10-31", "2026-10-30")).toBe("2026-10-30");
    expect(datumDphPoZmeneDodania("2026-11-05", "2026-10-31", "2026-10-30")).toBe("2026-11-05");
  });

  it("nápoveda pri rozdiele od DUZP", () => {
    expect(datumDphSaLisiOdDodania("2026-10-31", "2026-10-31")).toBe(false);
    expect(datumDphSaLisiOdDodania("2026-11-02", "2026-10-31")).toBe(true);
    expect(datumDphSaLisiOdDodania("", "2026-10-31")).toBe(false);
  });
});

describe("výkazy DPH — obdobie podľa datum_dph", () => {
  const vstup = async (mesiac: number, tab: { invoices?: any[]; purchase_invoices?: any[] }) =>
    (
      await nacitajVstup(
        klient({
          companies: [FIRMA],
          invoices: tab.invoices ?? [],
          purchase_invoices: tab.purchase_invoices ?? [],
          expense_documents: [],
        }) as any,
        "c1",
        { rok: 2026, mesiac, stvrtrok: null },
      )
    ).vstup;

  it("prijatá SFC: bez datum_dph november (prijatie), s datum_dph 31. 10. október", async () => {
    expect((await vstup(10, { purchase_invoices: [prijata()] })).prijate).toHaveLength(0);
    expect((await vstup(11, { purchase_invoices: [prijata()] })).prijate).toHaveLength(1);

    const s = prijata({ datum_dph: "2026-10-31" });
    const okt = await vstup(10, { purchase_invoices: [s] });
    expect(okt.prijate).toHaveLength(1);
    expect((await vstup(11, { purchase_invoices: [s] })).prijate).toHaveLength(0);
    const p = priznanie(okt) as any;
    expect(Number(p.r21 ?? p.riadky?.r21)).toBe(23);
    // KV B.2 „Den“ = dátum daňovej povinnosti.
    const kv = kontrolnyVykaz(okt) as any;
    expect(kv.b2).toHaveLength(1);
    expect(kv.b2[0].den).toBe("2026-10-31");
  });

  it("vystavená: datum_dph posunie faktúru do iného obdobia aj v KV", async () => {
    const f = vystavena({ datum_dph: "2026-11-02" });
    expect((await vstup(10, { invoices: [f] })).vystavene).toHaveLength(0);
    const nov = await vstup(11, { invoices: [f] });
    expect(nov.vystavene).toHaveLength(1);
    expect(JSON.stringify(kontrolnyVykaz(nov))).toContain("2026-11-02");
    // Bez datum_dph ostáva na DUZP (október).
    expect((await vstup(10, { invoices: [vystavena()] })).vystavene).toHaveLength(1);
  });
});

describe("export do Pohody — dateTax z datum_dph", () => {
  const hodnota = (xml: string, el: string): string | null =>
    new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
  const firma: any = { ...FIRMA, name: "Test s.r.o.", ico: "36123456", street: "Hlavná 1", city: "Nitra", zip: "94901" };
  const nast: any = { predkontaciaPrijata: "1Fp", clenenieDphPrijata: "PD" };

  it("prijatá: bez datum_dph dateTax = prijatie (doterajšie pravidlo)", () => {
    const x = buildPohodaExpensesXml({ company: firma, nastavenia: nast, doklady: [prijataAkoDoklad(prijata())] });
    expect(hodnota(x, "inv:dateTax")).toBe("2026-11-02");
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-10-31");
  });

  it("prijatá: s datum_dph dateTax = 31. 10., aj pri pevnom dátume zaúčtovania", () => {
    const d = prijataAkoDoklad(prijata({ datum_dph: "2026-10-31" }));
    const x = buildPohodaExpensesXml({ company: firma, nastavenia: nast, doklady: [d] });
    expect(hodnota(x, "inv:dateTax")).toBe("2026-10-31");
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-10-31");
    const pevny = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nast, datumZauctovaniaPevny: "2026-11-30" },
      doklady: [d],
    });
    expect(hodnota(pevny, "inv:dateTax")).toBe("2026-10-31");
    expect(hodnota(pevny, "inv:dateAccounting")).toBe("2026-11-30");
  });

  it("prijatý dobropis: dateApplicationVAT = datum_dph", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: nast,
      doklady: [
        prijataAkoDoklad(
          prijata({
            opravuje_cislo: "SFC-1",
            amount_without_vat: -100,
            vat_amount: -23,
            amount_total: -123,
            received_date: "2026-11-04",
            datum_dph: "2026-11-03",
          }),
        ),
      ],
    });
    expect(hodnota(x, "inv:dateTax")).toBe("2026-11-03");
    expect(hodnota(x, "inv:dateApplicationVAT")).toBe("2026-11-03");
  });

  it("prijatý daňový doklad k platbe (intDoc): dateTax aj dateKVDPH = datum_dph", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: nast,
      doklady: [
        prijataAkoDoklad(
          prijata({ type: "advance_payment", payment_date: "2026-10-30", delivery_date: null, datum_dph: "2026-10-30" }),
        ),
      ],
    });
    expect(hodnota(x, "int:dateTax")).toBe("2026-10-30");
    expect(hodnota(x, "int:dateKVDPH")).toBe("2026-10-30");
  });

  it("vystavená: dateTax = datum_dph, bez neho DUZP", () => {
    const pol = { name: "Služba", quantity: 1, unit_price: 100, subtotal: 100, vat_rate: 23, vat_amount: 23, total: 123 };
    const s = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: vystavena({ datum_dph: "2026-11-02" }), items: [pol] as any }],
    });
    expect(hodnota(s, "inv:dateTax")).toBe("2026-11-02");
    const bez = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: vystavena(), items: [pol] as any }] });
    expect(hodnota(bez, "inv:dateTax")).toBe("2026-10-31");
  });
});

describe("ostatné účtovné programy — dátum DPH z datum_dph", () => {
  const nast: any = { krajina: "SK" };
  const pol = [{ name: "Služba", quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23, vat_rate: 23 }];

  it("model dokladu: prijatá má datumDph a dátum odpočtu z neho, bez neho staré pravidlo", () => {
    const s = prijataNaUctovanie(prijata({ datum_dph: "2026-10-31" }), nast);
    expect(s.datumDph).toBe("2026-10-31");
    expect(s.datumOdpoctu).toBe("2026-10-31");
    const bez = prijataNaUctovanie(prijata(), nast);
    expect(bez.datumDph).toBeNull();
    expect(bez.datumOdpoctu).toBe("2026-11-02");
  });

  it("Money S3: PlnenoDPH vystavenej = datum_dph, bez neho DUZP", () => {
    const firma = { country: "SK", ico: "36123456", name: "Test" };
    const s = buildMoneyS3Uctovanie({
      firma,
      doklady: [vystavenaNaUctovanie(vystavena({ datum_dph: "2026-11-02" }), pol, nast)],
      kody: {},
    }).xml;
    expect(s).toContain("<PlnenoDPH>2026-11-02</PlnenoDPH>");
    const bez = buildMoneyS3Uctovanie({ firma, doklady: [vystavenaNaUctovanie(vystavena(), pol, nast)], kody: {} }).xml;
    expect(bez).toContain("<PlnenoDPH>2026-10-31</PlnenoDPH>");
  });

  it("CSV: posledný stĺpec datum_dph", () => {
    const csv = buildCsvUctovanie({
      doklady: [vystavenaNaUctovanie(vystavena({ datum_dph: "2026-11-02" }), pol, nast)],
      kody: {},
      krajina: "SK",
    });
    const [hlavicka, riadok] = csv.trim().split("\r\n");
    expect(hlavicka.split(";").at(-1)).toBe("datum_dph");
    expect(riadok.split(";").at(-1)).toBe("2026-11-02");
  });
});
