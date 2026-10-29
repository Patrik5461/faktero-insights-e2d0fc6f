import { afterEach, describe, expect, it, vi } from "vitest";
import {
  referenciaKupujuceho,
  skontrolujFakturuPredOdoslanim,
  skontrolujSamofakturuPredOdoslanim,
  xmlFakturyNaKontrolu,
} from "./kontrola-odoslania.server";
import {
  ChybaKontrolyEfaktury,
  LEN_VAROVANIE_PRI_ODOSLANI,
  spravaOdmietnutia,
  textNalezu,
  vyhodnotNaOdoslanie,
} from "./kontrola-odoslania";
import { skontrolujEfakturu } from "./kontrola";

/* Rovnaké údaje ako v kontrola.test.ts — tie overil validátor ePoštáka. */
const firma: any = {
  id: "f1",
  name: "Test s.r.o.",
  ico: "86179504",
  dic: "4286179504",
  ic_dph: "SK4286179504",
  street: "Hlavná 1",
  city: "Bratislava",
  zip: "81101",
  country: "SK",
  iban: "SK3112000000198742637541",
  vat_payer: true,
};
const faktura = (o: any = {}): any => ({
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "f1",
  invoice_number: "FA2026001",
  type: "regular",
  issue_date: "2026-10-08",
  due_date: "2026-10-22",
  currency: "EUR",
  variable_symbol: "2026001",
  subtotal: 1000,
  vat_total: 230,
  total: 1230,
  customer_name: "test2 s.r.o.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_country: "SK",
  ...o,
});
const polozka = (o: any = {}): any => ({
  id: "p1",
  position: 1,
  name: "Služba",
  quantity: 1,
  unit: "ks",
  unit_price: 1000,
  vat_rate: 23,
  subtotal: 1000,
  vat_amount: 230,
  total: 1230,
  ...o,
});
const kontroluj = (inv: any = {}, items = [polozka()], company = firma, extra: any = {}) =>
  skontrolujFakturuPredOdoslanim({ company, invoice: faktura(inv), items, ...extra });

describe("kontrola pred odoslaním", () => {
  it("správna faktúra prejde bez chyby aj varovania", () => {
    const k = kontroluj();
    expect(k.mozno).toBe(true);
    expect(k.chyby).toEqual([]);
    expect(k.varovania).toEqual([]);
  });

  it("faktúra s chybou je odmietnutá — záporná cena a prázdny názov položky", () => {
    const k = kontroluj(
      {},
      [
        polozka(),
        polozka({
          position: 2,
          name: "",
          unit_price: -10,
          subtotal: -10,
          vat_amount: -2.3,
          total: -12.3,
        }),
      ],
      firma,
    );
    expect(k.mozno).toBe(false);
    expect(k.chyby.map((n) => n.kod)).toEqual(expect.arrayContaining(["BR-27", "BR-25"]));
  });

  it("suma eFaktúry iná ako na faktúre — nad 1 € chyba, halier len varovanie", () => {
    // ePošták počíta daň z položiek (1000 × 23 % = 230), faktúra tvrdí 200.
    const k = kontroluj({ vat_total: 200, total: 1200 });
    expect(k.mozno).toBe(false);
    expect(k.chyby.map((n) => n.kod)).toEqual(["FAKTERO-ODOSLANIE-01"]);
    // Súčty eFaktúry sa prepočítajú z položiek — BR-CO-14 v nej nevznikne.
    expect(k.chyby.map((n) => n.kod)).not.toContain("BR-CO-14");
    const sprava = spravaOdmietnutia(k.chyby);
    expect(sprava).toMatch(/neprešla kontrolou/);
    expect(sprava).toContain(
      "FAKTERO-ODOSLANIE-01: Suma s DPH podľa položiek je 1230.00 EUR, na faktúre 1200.00 EUR",
    );
    // Popis má doplnené hodnoty, nie `{x}`.
    expect(sprava).not.toMatch(/\{\w+\}/);
    expect(new ChybaKontrolyEfaktury(k).message).toBe(sprava);

    // Zaokrúhlenie DPH po riadkoch (2,63 vs. 2,64) odoslanie nezastaví.
    const halier = kontroluj({ subtotal: 11.46, vat_total: 2.63, total: 14.09 }, [
      polozka({ unit_price: 11.46, subtotal: 11.46, vat_amount: 2.63, total: 14.09 }),
    ]);
    expect(halier.mozno).toBe(true);
    expect(halier.varovania.map((n) => n.kod)).toEqual(["FAKTERO-ODOSLANIE-01"]);
  });

  it("údaje strán dopĺňa ePošták — chyby v nich len varujú", () => {
    const k = kontroluj({ customer_country: "Slovensko", customer_ic_dph: "5843291067" });
    expect(k.mozno).toBe(true);
    expect(k.varovania.filter((n) => n.preradene).map((n) => n.kod)).toEqual(
      expect.arrayContaining(["BR-CL-14", "BR-CO-09"]),
    );
    // Elektronická adresa kupujúceho ide ePoštákovi — jej chyba blokuje.
    const zla = kontroluj({ customer_peppol_id: "0245:58432910" });
    expect(zla.chyby.map((n) => n.kod)).toContain("FAKTERO-SK-03");
  });

  it("bez IBAN sa neozve BR-61 — účet ePoštákovi neposielame", () => {
    const k = kontroluj({}, [polozka()], { ...firma, iban: null });
    expect(k.chyby).toEqual([]);
    expect(k.mozno).toBe(true);
  });

  it("varovanie neblokuje — IBAN s chybným kontrolným súčtom", () => {
    const k = kontroluj({}, [polozka()], { ...firma, iban: "SK3112000000198742637542" });
    expect(k.mozno).toBe(true);
    expect(k.chyby).toEqual([]);
    expect(k.varovania.map((n) => n.kod)).toContain("FAKTERO-SK-09");
  });

  it("chýbajúca adresa predávajúceho (R020) len varuje — dopĺňa ju ePošták", () => {
    const v = skontrolujEfakturu(
      xmlFakturyNaKontrolu({
        company: { ...firma, dic: null, ic_dph: null },
        invoice: faktura(),
        items: [polozka()],
      }),
    );
    expect(v.nalezy.find((n) => n.kod === "PEPPOL-EN16931-R020")?.zavaznost).toBe("chyba");
    const k = vyhodnotNaOdoslanie(v);
    expect(LEN_VAROVANIE_PRI_ODOSLANI.has("PEPPOL-EN16931-R020")).toBe(true);
    expect(k.chyby.map((n) => n.kod)).not.toContain("PEPPOL-EN16931-R020");
    expect(k.varovania.find((n) => n.kod === "PEPPOL-EN16931-R020")).toMatchObject({
      zavaznost: "varovanie",
      preradene: true,
    });
  });

  it("referencia kupujúceho ako pri odoslaní — aj bez variabilného symbolu", () => {
    expect(referenciaKupujuceho({ invoice_number: "FA1", order_number: "OBJ-7" })).toBe("OBJ-7");
    const k = kontroluj({ variable_symbol: null });
    expect(k.chyby.map((n) => n.kod)).not.toContain("PEPPOL-EN16931-R003");
    expect(k.mozno).toBe(true);
  });

  it("dobropis, ťarchopis a doklad k prijatej platbe majú typ ako u ePoštáka", () => {
    const povodna = { cislo: "FA2026000", vystavena: "2026-10-01" };
    const dobropis = { type: "credit_note", subtotal: -1000, vat_total: -230, total: -1230 };
    const zaporne = [polozka({ quantity: -1, subtotal: -1000, vat_amount: -230, total: -1230 })];
    const xmlD = xmlFakturyNaKontrolu({
      company: firma,
      invoice: faktura(dobropis),
      items: zaporne,
      povodnaFaktura: povodna,
    });
    expect(xmlD).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(kontroluj(dobropis, zaporne, firma, { povodnaFaktura: povodna }).chyby).toEqual([]);

    // Dobropis bez pôvodnej faktúry je chyba (BT-25).
    expect(kontroluj(dobropis, zaporne).mozno).toBe(false);

    const xmlT = xmlFakturyNaKontrolu({
      company: firma,
      invoice: faktura({ type: "credit_note" }),
      items: [polozka()],
      povodnaFaktura: povodna,
    });
    expect(xmlT).toContain("<cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>");

    const k = kontroluj({ type: "advance_payment" });
    expect(
      xmlFakturyNaKontrolu({
        company: firma,
        invoice: faktura({ type: "advance_payment" }),
        items: [polozka()],
      }),
    ).toContain("<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>");
    expect(k.chyby).toEqual([]);
  });

  it("zálohová faktúra (proforma) sa neposiela vôbec", () => {
    expect(() => kontroluj({ type: "proforma" })).toThrow(/nie je daňový doklad/);
  });

  it("textNalezu doplní parametre aj kategóriu", () => {
    expect(
      textNalezu({ popis: "Kategória {kat} a {x}", parametre: { x: 5 }, kategoria: "AE" }),
    ).toBe("Kategória AE (prenesenie daňovej povinnosti) a 5");
  });
});

describe("samofaktúra — orientačná kontrola", () => {
  const sf: any = {
    id: "s1",
    invoice_number: "SF2026001",
    issue_date: "2026-10-08",
    due_date: "2026-10-22",
    currency: "EUR",
    variable_symbol: "2026001",
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    supplier_name: "test2 s.r.o.",
    supplier_ico: "43291067",
    supplier_dic: "5843291067",
    supplier_ic_dph: "SK5843291067",
    supplier_country: "SK",
    supplier_iban: "SK3112000000198742637541",
  };
  const pol = [{ name: "Výkup", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 }];

  it("profil Self-Billing, typ 389, bez blokujúcej chyby", () => {
    const k = skontrolujSamofakturuPredOdoslanim(sf, firma, pol);
    expect(k.orientacna).toBe(true);
    expect(k.mozno).toBe(true);
    expect(k.varovania.filter((n) => n.preradene)).toEqual([]);
  });

  it("nález sa nikdy nezmení na blokujúcu chybu", () => {
    const k = skontrolujSamofakturuPredOdoslanim(
      { ...sf, vat_amount: 10, amount_total: 110 },
      firma,
      pol,
    );
    expect(k.mozno).toBe(true);
    expect(k.varovania.some((n) => n.preradene)).toBe(true);
  });
});

/*
  Odoslanie cez `sendEfaktura`: faktúra s chybou neodíde — na ePoštáka sa
  nezavolá vôbec. Databázu nahrádza jednoduchý falošný klient.
*/
describe("sendEfaktura odmietne faktúru s chybou", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("vyhodí ChybaKontrolyEfaktury a nevolá ePoštáka", async () => {
    const data: Record<string, any> = {
      invoices: faktura({ vat_total: 200, total: 1200 }),
      invoice_items: [polozka()],
      companies: firma,
      efaktura_profiles: null,
    };
    const dotaz = (tabulka: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: data[tabulka] ?? null, error: null }),
        single: async () => ({ data: data[tabulka] ?? null, error: null }),
        then: (ok: any) => ok({ data: data[tabulka] ?? [], error: null }),
      };
      return q;
    };
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: { from: dotaz },
    }));
    vi.doMock("../schvalovanie.server", () => ({ overOdoslanie: async () => {} }));
    vi.doMock("../datum-vystavenia.server", () => ({ overDatumPredOdoslanim: async () => {} }));
    vi.doMock("../zalohy-odpocty.server", () => ({ nacitajOdpocty: async () => ({}) }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendEfaktura } = await import("./epostak.server");
    const { ChybaKontrolyEfaktury: Chyba } = await import("./kontrola-odoslania");
    const e = await sendEfaktura(faktura().id, "firma-epostak").catch((x) => x);
    expect(e).toBeInstanceOf(Chyba);
    expect(e.message).toContain("FAKTERO-ODOSLANIE-01");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
