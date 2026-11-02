/*
  Dátum prijatia prijatého dokladu (Patrik, 2. 11. 2026):
  predvyplnenie z mailu / nahratia, varovanie pri prijatí pred vystavením,
  obdobie odpočtu = neskorší z DUZP a prijatia — vo výkazoch DPH (priznanie,
  KV), v prehľade DPH aj v exporte do Pohody (dateTax, CZ dateKHDPH).
*/
import { describe, expect, it } from "vitest";
import {
  denOdpoctu,
  neskorsiDen,
  obdobieOdpoctu,
  predvolenyDatumPrijatia,
  prijatieSkorNezVystavenie,
} from "./datum-prijatia";
import { denOdpoctuPrijatej, vObdobi } from "./dph-prehlad";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, priznanie } from "./dph-vykazy";
import { buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { prijataZUdajov, prazdneUdaje } from "./nespracovane";

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

// Príklad zo zadania: DUZP 28. 8., prijatá 3. 9. → odpočet 09/2026.
const prijata = (o: Record<string, any> = {}): any => ({
  id: "p-aug",
  company_id: "c1",
  type: "regular",
  invoice_number: "FA-0828",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  supplier_country: "SK",
  issue_date: "2026-08-29",
  delivery_date: "2026-08-28",
  received_date: "2026-09-03",
  due_date: "2026-09-12",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  status: "booked",
  payment_method: "prevod",
  items: [{ name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});

describe("predvolený dátum prijatia", () => {
  it("mail: deň prijatia mailu v Bratislave, aj tesne po polnoci (v UTC ešte včera)", () => {
    // 2. 9. 22:30 UTC = 3. 9. 0:30 v Bratislave (letný čas).
    expect(predvolenyDatumPrijatia({ mailPrijaty: "2026-09-02T22:30:00Z", nahrane: "2026-09-05T10:00:00Z" })).toBe(
      "2026-09-03",
    );
    // Zimný čas: 31. 12. 23:30 UTC = 1. 1. 0:30.
    expect(predvolenyDatumPrijatia({ mailPrijaty: "2026-12-31T23:30:00Z" })).toBe("2027-01-01");
  });
  it("nahratie: deň nahratia; bez údajov dnešok", () => {
    expect(predvolenyDatumPrijatia({ nahrane: "2026-08-31T21:59:00Z" })).toBe("2026-08-31");
    expect(predvolenyDatumPrijatia({ nahrane: "2026-08-31T22:01:00Z" })).toBe("2026-09-01");
    expect(predvolenyDatumPrijatia({ teraz: new Date("2026-11-02T08:00:00Z") })).toBe("2026-11-02");
    expect(predvolenyDatumPrijatia({ mailPrijaty: "nezmysel", nahrane: "2026-10-10T08:00:00Z" })).toBe(
      "2026-10-10",
    );
  });
  it("vytvorenie z Nespracovaných: prázdny dátum prijatia = predvolený, zadaný sa nemení", () => {
    const u = { ...prazdneUdaje(), datumVystavenia: "2026-08-29" };
    expect(prijataZUdajov("faktura", u, "2026-11-02").received_date).toBe("2026-11-02");
    expect(prijataZUdajov("faktura", { ...u, datumPrijatia: "2026-09-03" }, "2026-11-02").received_date).toBe(
      "2026-09-03",
    );
  });
});

describe("validácia a obdobie odpočtu", () => {
  it("varovanie, keď je prijatie skôr než vystavenie", () => {
    expect(prijatieSkorNezVystavenie("2026-08-27", "2026-08-29")).toBe(true);
    expect(prijatieSkorNezVystavenie("2026-08-29", "2026-08-29")).toBe(false);
    expect(prijatieSkorNezVystavenie("2026-09-03", "2026-08-29")).toBe(false);
    expect(prijatieSkorNezVystavenie("", "2026-08-29")).toBe(false);
  });

  it("DUZP 28. 8., prijatá 3. 9. → odpočet 09/2026", () => {
    expect(denOdpoctu(prijata())).toBe("2026-09-03");
    expect(obdobieOdpoctu(prijata())).toBe("09/2026");
    expect(denOdpoctuPrijatej(prijata())).toBe("2026-09-03");
  });

  it("prijatá v tom istom mesiaci alebo skôr než DUZP → obdobie DUZP", () => {
    expect(obdobieOdpoctu(prijata({ received_date: "2026-08-31" }))).toBe("08/2026");
    expect(denOdpoctu(prijata({ delivery_date: "2026-09-10", received_date: "2026-09-03" }))).toBe("2026-09-10");
    // Bez dátumu prijatia ostáva DUZP, bez DUZP dátum vystavenia.
    expect(denOdpoctu(prijata({ received_date: null }))).toBe("2026-08-28");
    expect(denOdpoctu(prijata({ received_date: null, delivery_date: null }))).toBe("2026-08-29");
    expect(neskorsiDen("2026-12-31", "2027-01-02")).toBe("2027-01-02");
    expect(obdobieOdpoctu(prijata({ delivery_date: "2026-12-31", received_date: "2027-01-02" }))).toBe("01/2027");
  });

  it("samozdanenie ostáva na DUZP, dobropis ide podľa prijatia", () => {
    expect(denOdpoctu(prijata({ dph_rezim: "samozdanenie", vat_amount: 0 }))).toBe("2026-08-28");
    expect(denOdpoctu(prijata({ dph_rezim: "nadobudnutie", vat_amount: 0 }))).toBe("2026-08-28");
    expect(denOdpoctu(prijata({ reverse_charge: true, vat_amount: 0 }))).toBe("2026-08-28");
    // Príznak prenesenia na faktúre s daňou = zmiešaná faktúra, tuzemská časť ide podľa prijatia.
    expect(denOdpoctu(prijata({ reverse_charge: true }))).toBe("2026-09-03");
    expect(
      denOdpoctu(prijata({ opravuje_cislo: "FA-1", amount_total: -123, received_date: "2026-09-03" })),
    ).toBe("2026-09-03");
    // Dovoz: odpočet až s JCD — posúva sa ako tuzemská faktúra.
    expect(denOdpoctu(prijata({ dph_rezim: "dovoz" }))).toBe("2026-09-03");
  });
});

describe("výkazy DPH — faktúra DUZP 28. 8., prijatá 3. 9.", () => {
  const vstup = async (rok: number, mesiac: number, riadky: any[]) =>
    (
      await nacitajVstup(
        klient({ companies: [FIRMA], invoices: [], purchase_invoices: riadky, expense_documents: [] }) as any,
        "c1",
        { rok, mesiac, stvrtrok: null },
      )
    ).vstup;

  it("august: v odpočte ani KV nie je; september: priznanie r. 21 aj KV B.2", async () => {
    const aug = await vstup(2026, 8, [prijata()]);
    expect(aug.prijate).toHaveLength(0);
    const sep = await vstup(2026, 9, [prijata()]);
    expect(sep.prijate).toHaveLength(1);
    const p = priznanie(sep);
    expect(Number((p as any).r21 ?? (p as any).riadky?.r21)).toBe(23);
    const kv = kontrolnyVykaz(sep);
    const b2 = JSON.stringify(kv);
    expect(b2).toContain("FA-0828");
    expect(vObdobi(denOdpoctuPrijatej(prijata()), "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("prenesenie (samozdanenie) ostáva v auguste — daň aj odpočet spolu", async () => {
    const pdp = prijata({ dph_rezim: "samozdanenie", vat_amount: 0, amount_total: 100 });
    expect((await vstup(2026, 8, [pdp])).prijate).toHaveLength(1);
    expect((await vstup(2026, 9, [pdp])).prijate).toHaveLength(0);
  });
});

describe("export do Pohody — dateTax a CZ dateKHDPH", () => {
  const hodnota = (xml: string, el: string): string | null =>
    new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
  const firma: any = { ...FIRMA, name: "Test s.r.o.", ico: "36123456", street: "Hlavná 1", city: "Nitra", zip: "94901" };
  const nast: any = { predkontaciaPrijata: "1Fp", clenenieDphPrijata: "PD" };

  it("SK: dateTax = 3. 9. (prijatie), dateDelivery = 28. 8. (DUZP)", () => {
    const x = buildPohodaExpensesXml({ company: firma, nastavenia: nast, doklady: [prijataAkoDoklad(prijata())] });
    expect(hodnota(x, "inv:dateTax")).toBe("2026-09-03");
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-08-28");
    expect(hodnota(x, "inv:date")).toBe("2026-08-29");
  });

  it("SK: zadaný dátum zaúčtovania platí, len ak nepredbehne prijatie", () => {
    const neskor = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nast, datumZauctovaniaPevny: "2026-10-30" },
      doklady: [prijataAkoDoklad(prijata())],
    });
    expect(hodnota(neskor, "inv:dateTax")).toBe("2026-10-30");
    const skoro = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nast, datumZauctovaniaPevny: "2026-08-31" },
      doklady: [prijataAkoDoklad(prijata())],
    });
    expect(hodnota(skoro, "inv:dateTax")).toBe("2026-09-03");
    expect(hodnota(skoro, "inv:dateAccounting")).toBe("2026-08-31");
  });

  it("SK: prenesenie ostáva na DUZP", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nast, clenenieDphPdpPrijata: "PDp" },
      doklady: [prijataAkoDoklad(prijata({ dph_rezim: "samozdanenie", vat_amount: 0, amount_total: 100 }))],
    });
    expect(hodnota(x, "inv:dateTax")).toBe("2026-08-28");
  });

  it("CZ: dateKHDPH aj dateTax = obdobie odpočtu", () => {
    const cz: any = { ...firma, country: "CZ", ic_dph: "CZ12345678", dic: "CZ12345678" };
    const x = buildPohodaExpensesXml({
      company: cz,
      nastavenia: nast,
      doklady: [
        prijataAkoDoklad(
          prijata({ currency: "CZK", supplier_ic_dph: "CZ25097563", supplier_country: "CZ", vat_amount: 21, amount_total: 121 }),
        ),
      ],
    });
    expect(hodnota(x, "inv:dateKHDPH")).toBe("2026-09-03");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-09-03");
  });
});
