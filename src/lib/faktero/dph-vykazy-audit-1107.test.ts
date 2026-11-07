import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import {
  kontrolnyVykaz,
  priznanie,
  VYTKA_ODPOCET_BEZ_KV,
  VYTKA_PLATITEL_BEZ_DPH,
  VYTKA_VLASTNA_FAKTURA,
} from "./dph-vykazy";
import {
  blokatory,
  aktualnyNavrh,
  dodavatelJeFirma,
  odvodClenenia,
  znakyPreneseniaPrijatej,
  type NavrhZauctovania,
} from "./auto-uctovanie";
import { resolveVatClassificationPrijatej } from "./clenenie-prijatych";
import { kvAutoPrijatej } from "./kv-auto";

/*
  Opravy z 2. kola auditu 7. 11. 2026 (pred podaním DPH za 10/2026): koncepty
  a stornované prijaté vo výkaze, automatické „PN“ pre SK platiteľa bez dane,
  odpočet z vlastnej faktúry, prázdne automatické KV pri prenesení, odpočet
  bez riadku KV a DPH vystavených podľa uloženej sumy.
*/

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
        neq: () => q,
        gte: () => q,
        lte: () => q,
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

const oktober = { rok: 2026, mesiac: 10 };
const august = { rok: 2026, mesiac: 8 };

const prijata = (x: Record<string, unknown>) => ({
  id: String(x.invoice_number),
  currency: "EUR",
  type: "regular",
  status: "received",
  odpocet: true,
  items: [],
  ...x,
});

describe("1. koncept a stornovaná prijatá faktúra do výkazu nejdú", () => {
  it("MaxiTicket 08/2026: koncepty 26800001 a 8392585681 (2×) vypadnú z priznania aj KV", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "26800001", status: "draft", supplier_ic_dph: "SK2121733614", issue_date: "2026-05-19", received_date: "2026-08-20", amount_without_vat: 18699.81, vat_amount: 4300.96, amount_total: 23000.77, due_date: "2026-05-01" }),
          prijata({ id: "a", invoice_number: "8392585681", status: "draft", supplier_ic_dph: "SK2020273893", issue_date: "2026-08-01", received_date: "2026-08-20", amount_without_vat: 15.42, vat_amount: 3.55, amount_total: 18.97 }),
          prijata({ id: "b", invoice_number: "8392585681", status: "draft", supplier_ic_dph: "SK2020273893", issue_date: "2026-08-01", received_date: "2026-08-20", amount_without_vat: 15.42, vat_amount: 3.55, amount_total: 18.97 }),
          prijata({ invoice_number: "STORNO", status: "cancelled", supplier_ic_dph: "SK2020273893", issue_date: "2026-08-02", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
          prijata({ invoice_number: "OSTRA", status: "paid", supplier_ic_dph: "SK2020273893", issue_date: "2026-08-03", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
        ],
      }) as any,
      "f",
      august,
    );
    expect(vstup.prijate.map((p) => p.cislo)).toEqual(["OSTRA"]);
    expect(vstup.opravy53b ?? []).toHaveLength(0);
    expect(priznanie(vstup).r21).toBe(23);
    expect(kontrolnyVykaz(vstup).b2.map((r) => r.f)).toEqual(["OSTRA"]);
  });
});

describe("2. SK platiteľ bez dane — automatika nedá PN", () => {
  const sk = { smer: "prijate" as const, krajinaFirmy: "SK", firmaPlatitel: true, dph: 0 };
  it("bez znakov prenesenia: bez členenia, bez KV, blokátor", () => {
    const c = odvodClenenia({ ...sk, partnerIcDph: "SK2020061065", zaklad: 12658.79 });
    expect([c.rezim, c.clenenieDph, c.kvClenenie]).toEqual(["bez_dph_platitel", null, null]);
    expect(blokatory({ rezim: c.rezim, clenenieDph: c.clenenieDph, predkontacia: "518/321" })).toEqual([
      "platitel_bez_dph",
      "clenenie",
    ]);
  });
  it("so znakmi prenesenia → prenesenie (B1), nulový základ či neplatiteľ → PN ako doteraz", () => {
    expect(odvodClenenia({ ...sk, partnerIcDph: "SK2020061065", zaklad: 100, znakyPrenesenia: true }).rezim).toBe(
      "pdp_tuzemsko",
    );
    expect(odvodClenenia({ ...sk, partnerIcDph: "SK2020061065", zaklad: 0 }).clenenieDph).toBe("PN");
    // Bez IČ DPH (neplatiteľ) — doklad bez DPH je v poriadku.
    expect(odvodClenenia({ ...sk, partnerIcDph: null, zaklad: 100 }).clenenieDph).toBe("PN");
  });
  it("znaky prenesenia: položka, rozpis, text", () => {
    expect(znakyPreneseniaPrijatej({ items: [{ name: "Oceľ", pdp: true }] })).toBe(true);
    expect(znakyPreneseniaPrijatej({ vat_breakdown: [{ vat_category: "reverse_charge" }] })).toBe(true);
    expect(znakyPreneseniaPrijatej({ note: "Prenesenie daňovej povinnosti podľa § 69 ods. 12" })).toBe(true);
    expect(znakyPreneseniaPrijatej({ items: [{ name: "Daň odvedie príjemca plnenia" }] })).toBe(true);
    expect(znakyPreneseniaPrijatej({ note: "Ďakujeme za objednávku", items: [{ name: "Montáž" }] })).toBe(false);
  });
  it("resolveVatClassificationPrijatej: BÝVAJLEPŠIE 26090019 / F22026073 / 2026029 už nie PN", () => {
    const firma = { country: "SK", vat_payer: true };
    for (const [cislo, ic, zaklad] of [
      ["26090019", "SK2020061065", 12658.79],
      ["F22026073", "SK2020008331", 76.5],
      ["2026029", "SK2022829633", 9469],
    ] as const) {
      const v = resolveVatClassificationPrijatej(firma, "prijata", {
        invoice_number: cislo,
        type: "regular",
        supplier_ic_dph: ic,
        amount_without_vat: zaklad,
        amount_total: zaklad,
        vat_amount: 0,
        odpocet: true,
        items: [],
      });
      expect(v.pohoda_clenenie_dph).not.toBe("PN");
      expect(v.kv_clenenie).not.toBe("X");
    }
  });
  it("výtka vznikne aj pri automatickom PN a pri rozpise „na kontrolu“; ručné PN ju potlačí", async () => {
    const zaklad = { supplier_ic_dph: "SK2020251321", issue_date: "2026-10-30", delivery_date: "2026-10-30", amount_without_vat: 170, vat_amount: 0, amount_total: 170 };
    const { vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          // bager expres 6002609447: rozpis 0 % „needs_review“, bez členenia.
          prijata({ invoice_number: "6002609447", ...zaklad, items: [{ name: "Splátka", total: 170, vat_rate: 0, vat_category: "needs_review" }] }),
          prijata({ invoice_number: "AUTO-PN", ...zaklad, pohoda_clenenie_dph: "PN", clenenie_zdroj: "auto", kv_clenenie: "X", kv_zdroj: "auto" }),
          prijata({ invoice_number: "RUCNE-PN", ...zaklad, pohoda_clenenie_dph: "PN", clenenie_zdroj: "rucne" }),
          prijata({ invoice_number: "OSLOB", ...zaklad, items: [{ name: "Poistné", total: 170, vat_rate: 0, vat_category: "exempt" }] }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vytky.filter((v) => v.text === VYTKA_PLATITEL_BEZ_DPH).map((v) => v.doklad).sort()).toEqual([
      "6002609447",
      "AUTO-PN",
    ]);
  });
  it("človek členenie zvolil → blokátor zmizne", () => {
    const n = {
      predkontacia: "518/321",
      clenenieDph: null,
      kvClenenie: null,
      stredisko: null,
      cinnost: null,
      zdroj: "zvyk",
      istota: 100,
      zdovodnenie: "",
      blokatory: ["platitel_bez_dph", "clenenie"],
    } as NavrhZauctovania;
    expect(aktualnyNavrh(n, { pohoda_clenenie_dph: "PDsluz" }).blokatory).toEqual([]);
  });
});

describe("3. faktúra od samotnej firmy", () => {
  it("dodavatelJeFirma podľa IČ DPH aj IČO", () => {
    const firma = { ic_dph: "SK2122463651", ico: "56840438" };
    expect(dodavatelJeFirma({ supplier_ic_dph: "SK 2122463651" }, firma)).toBe(true);
    expect(dodavatelJeFirma({ supplier_ico: "56840438" }, firma)).toBe(true);
    expect(dodavatelJeFirma({ supplier_ic_dph: "SK2020061065", supplier_ico: "36202762" }, firma)).toBe(false);
    expect(dodavatelJeFirma({}, { ic_dph: null, ico: null })).toBe(false);
    expect(blokatory({ vlastnaFaktura: true, clenenieDph: "PD", predkontacia: "x" })).toEqual(["vlastna_faktura"]);
  });
  it("BÝVAJLEPŠIE 2026006: výtka vo výkaze", async () => {
    const { vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK", ic_dph: "SK2122463651", ico: "56840438" }],
        purchase_invoices: [
          prijata({ invoice_number: "2026006", supplier_ic_dph: "SK2122463651", supplier_ico: "56840438", issue_date: "2026-09-10", received_date: "2026-10-12", amount_without_vat: 3252.03, vat_amount: 747.97, amount_total: 4000 }),
          prijata({ invoice_number: "CUDZIA", supplier_ic_dph: "SK2020061065", issue_date: "2026-10-10", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vytky.filter((v) => v.text === VYTKA_VLASTNA_FAKTURA).map((v) => v.doklad)).toEqual(["2026006"]);
  });
});

describe("4. automatické KV pri prenesení", () => {
  it("reverse_charge, položky v prenesení a členenie prenesenia → B1 / B1-0", () => {
    const r = { type: "regular", amount_total: 100, vat_amount: 0, odpocet: true };
    expect(kvAutoPrijatej({ ...r, reverse_charge: true })).toBe("B1");
    expect(kvAutoPrijatej({ ...r, items: [{ pdp: true }, { reverse_charge: true }] })).toBe("B1");
    expect(kvAutoPrijatej(r, { clenenie: "PDsluz" })).toBe("B1");
    expect(kvAutoPrijatej(r, { clenenie: "DDsluz" })).toBe("B1");
    expect(kvAutoPrijatej(r, { clenenie: "PBsluz" })).toBe("B1-0");
    expect(kvAutoPrijatej({ ...r, dph_rezim: "samozdanenie" })).toBe("B1");
    // Bez znakov prenesenia ostáva, ako bolo.
    expect(kvAutoPrijatej(r)).toBe("");
    expect(kvAutoPrijatej({ ...r, vat_amount: 23, amount_total: 123 })).toBe("B2");
  });
});

describe("5. odpočet bez riadku KV", () => {
  it("BÝVAJLEPŠIE 26090001: tuzemská časť zmiešanej faktúry s KV X → výtka 132,80 €", async () => {
    const polozky = [
      { name: "Oceľ sieť", pdp: true, total: 1008, quantity: 21, unit_price: 48, vat_rate: 0, vat_category: "reverse_charge" },
      { name: "Oceľ 6 mm", pdp: true, total: 42.5, quantity: 25, unit_price: 1.7, vat_rate: 0, vat_category: "reverse_charge" },
      { name: "Oceľ 8 mm", pdp: true, total: 66.3, quantity: 17, unit_price: 3.9, vat_rate: 0, vat_category: "reverse_charge" },
      { name: "Tvárnice", total: 266.91, quantity: 140, unit_price: 1.55, vat_rate: 23, vat_category: "standard" },
      { name: "XPS", total: 320.29, quantity: 42, unit_price: 6.2, vat_rate: 23, vat_category: "standard" },
      { name: "Pena", total: 43.05, quantity: 7, unit_price: 5, vat_rate: 23, vat_category: "standard" },
      { name: "Fólia", total: 18.45, quantity: 1, unit_price: 15, vat_rate: 23, vat_category: "standard" },
      { name: "Doprava", total: 27.06, quantity: 1, unit_price: 22, vat_rate: 23, vat_category: "standard" },
      { name: "Vykládka", total: 34.44, quantity: 4, unit_price: 7, vat_rate: 23, vat_category: "standard" },
    ];
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "26090001", supplier_ic_dph: "SK2020061065", issue_date: "2026-10-03", received_date: "2026-10-12", amount_without_vat: 1694.2, vat_amount: 132.8, amount_total: 1827, pohoda_clenenie_dph: "PDsluz", kv_clenenie: "X", items: polozky }),
          // Ručné X na faktúre bez odpočtu výtku nedá.
          prijata({ invoice_number: "BEZ-ODP", supplier_ic_dph: "SK2020000001", issue_date: "2026-10-03", amount_without_vat: 100, vat_amount: 23, amount_total: 123, kv_clenenie: "X", odpocet: false }),
        ],
      }) as any,
      "f",
      oktober,
    );
    const kv = kontrolnyVykaz(vstup);
    const text = VYTKA_ODPOCET_BEZ_KV.replace("{suma}", "132,80");
    expect(kv.vytky.filter((v) => v.text.startsWith("Z prijatej faktúry sa odpočítava"))).toEqual([
      { doklad: "26090001", text },
    ]);
  });
});

describe("6. DPH vystavených podľa uloženej sumy", () => {
  it("BÝVAJLEPŠIE DDP20260001: 6 504,07 × 23 % = 1 495,94, na doklade 1 495,93 → výkaz 1 495,93", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        invoices: [
          {
            id: "ddp",
            invoice_number: "DDP20260001",
            type: "advance_payment",
            status: "paid",
            issue_date: "2026-10-20",
            delivery_date: "2026-10-20",
            currency: "EUR",
            customer_name: "Fyzická osoba",
            subtotal: 6504.07,
            vat_total: 1495.93,
            total: 8000,
            discount_total: 0,
            invoice_items: [{ vat_rate: 23, subtotal: 6504.07, vat_amount: 1495.93, quantity: 1, unit_price: 6504.07 }],
          },
          {
            id: "zla",
            invoice_number: "ZLA-DPH",
            type: "regular",
            status: "sent",
            issue_date: "2026-10-21",
            delivery_date: "2026-10-21",
            currency: "EUR",
            customer_name: "Iná osoba",
            subtotal: 100,
            vat_total: 0,
            total: 100,
            discount_total: 0,
            // Uložená DPH nesedí so sadzbou (stará chyba) — platí prepočet.
            invoice_items: [{ vat_rate: 23, subtotal: 100, vat_amount: 0, quantity: 1, unit_price: 100 }],
          },
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vstup.vystavene.find((f) => f.cislo === "DDP20260001")?.riadky).toEqual([
      { sadzba: 23, zaklad: 6504.07, dan: 1495.93 },
    ]);
    expect(vstup.vystavene.find((f) => f.cislo === "ZLA-DPH")?.riadky[0]?.dan).toBe(23);
  });
});
