import { describe, expect, it } from "vitest";
import {
  cisloVydanej,
  cisloZNazvuSuboru,
  fakturaZDokladu,
  navrhVydanej,
  NECITATELNY,
  nazovPrilohy,
  rozhodnutiePriradenia,
  textPriradenia,
  zhodaVydanej,
} from "./nespracovane-vydana";
import { nacitajUdaje, navrhDruhu, udajeZAi } from "./nespracovane";
import { dovodNevytvorenia } from "./nespracovane-hromadne";

const FIRMA = { strana: { nazov: "RHJ s. r. o.", ico: "57348324", dic: "2122676809", icDph: null } };
const VYDANE = [
  { id: "f18", invoice_number: "2026018", type: "regular", total: 686, customer_name: "Domov sociálnych služieb" },
  { id: "f21", invoice_number: "2026021", type: "regular", total: 823.9 },
  { id: "f22", invoice_number: "2026022", type: "credit_note", total: -535 },
];
/** Riadok z migrácie z Doklada: bez AI, partner v „dodávateľovi“, len suma. */
const zDoklada = (celkom: number) =>
  nacitajUdaje({ mena: "EUR", celkom, dodavatel: { nazov: "Domov sociálnych služieb pre dospelých v Zavare" } });

describe("číslo z názvu súboru", () => {
  it("Doklado: fa_<Firma>_<číslo>, dob_<Firma>_<číslo>, s príponou aj bez", () => {
    expect(cisloZNazvuSuboru("fa_RHJsro_2026018")).toEqual({ cislo: "2026018", dobropis: false });
    expect(cisloZNazvuSuboru("dob_RHJsro_2026022.pdf")).toEqual({ cislo: "2026022", dobropis: true });
    expect(cisloZNazvuSuboru("firma/0-fa_Tobify_s_r_o_FA-2026-7.pdf")?.cislo).toBe("FA-2026-7");
  });

  it("iné názvy číslo nedajú", () => {
    expect(cisloZNazvuSuboru("2026-11-10_01-40-52_RHJsro_iPhone182")).toBeNull();
    expect(cisloZNazvuSuboru("faktura.pdf")).toBeNull();
    expect(cisloZNazvuSuboru("fa_RHJsro_bezcisla")).toBeNull();
    expect(cisloZNazvuSuboru(null)).toBeNull();
  });

  it("číslo z údajov má prednosť, potom AI, potom súbor", () => {
    expect(cisloVydanej(nacitajUdaje({ cislo: "X1" }), { invoice_number: "X2" }, "fa_A_X3")).toBe("X1");
    expect(cisloVydanej(nacitajUdaje({}), { invoice_number: "X2" }, "fa_A_X3")).toBe("X2");
    expect(cisloVydanej(nacitajUdaje({}), null, "fa_A_X3")).toBe("X3");
  });
});

describe("zhoda s vystavenou faktúrou", () => {
  it("len presné číslo (bez medzier a veľkosti písmen); suma bez ohľadu na znamienko", () => {
    expect(zhodaVydanej(VYDANE, "2026018", 686)).toEqual({ faktura: VYDANE[0], sumaSedi: true });
    expect(zhodaVydanej(VYDANE, " 2026 022 ", 535)?.sumaSedi).toBe(true);
    expect(zhodaVydanej(VYDANE, "2026018", 700)?.sumaSedi).toBe(false);
    expect(zhodaVydanej(VYDANE, "2026018", null)?.sumaSedi).toBeNull();
    expect(zhodaVydanej(VYDANE, "202601", 686)).toBeNull();
    expect(zhodaVydanej(VYDANE, "", 686)).toBeNull();
  });

  it("pri dvoch faktúrach s rovnakým číslom vyhrá tá so sumou", () => {
    const dve = [
      { id: "a", invoice_number: "1", total: 10 },
      { id: "b", invoice_number: "1", total: 20 },
    ];
    expect(zhodaVydanej(dve, "1", 20)?.faktura.id).toBe("b");
  });
});

describe("návrh „Vydaná faktúra“", () => {
  it("RHJ z Doklada: súbor fa_…_2026018 a suma 686 sedia na vystavenú → návrh so zhodou", () => {
    const n = navrhVydanej({ udaje: zDoklada(686), nazovSuboru: "fa_RHJsro_2026018", firma: FIRMA, kandidati: VYDANE });
    expect(n.navrh).toBe(true);
    expect(n.cislo).toBe("2026018");
    expect(n.zhoda?.faktura.id).toBe("f18");
    expect(n.dovody[0]!.text).toContain("Názov súboru aj suma");
  });

  it("dobropis dob_…_2026022 so zápornou sumou", () => {
    const n = navrhVydanej({ udaje: zDoklada(-535), nazovSuboru: "dob_RHJsro_2026022", firma: FIRMA, kandidati: VYDANE });
    expect(n.navrh).toBe(true);
    expect(n.zhoda?.faktura.id).toBe("f22");
  });

  it("samotný názov súboru nestačí — bez faktúry alebo s inou sumou nič nenavrhne", () => {
    expect(navrhVydanej({ udaje: zDoklada(686), nazovSuboru: "fa_RHJsro_2026099", firma: FIRMA, kandidati: VYDANE }).navrh).toBe(false);
    const ina = navrhVydanej({ udaje: zDoklada(999), nazovSuboru: "fa_RHJsro_2026018", firma: FIRMA, kandidati: VYDANE });
    expect(ina.navrh).toBe(false);
    // Zhoda čísla ostáva — v detaile ju človek vidí predvolenú, ak druh zmení sám.
    expect(ina.zhoda?.sumaSedi).toBe(false);
  });

  it("dodávateľ = firma podľa IČO (RHJ 2026021 prečítaná AI)", () => {
    const u = nacitajUdaje({ cislo: "2026021", celkom: 823.9, dodavatel: { nazov: "Domov…", ico: "57348324" } });
    const n = navrhVydanej({ udaje: u, nazovSuboru: "fa_RHJsro_2026021", firma: FIRMA, kandidati: VYDANE });
    expect(n.navrh).toBe(true);
    expect(n.dovody.map((d) => d.text)).toContain("Dodávateľ na doklade je vaša firma (IČO / DIČ / IČ DPH).");
    expect(n.zhoda?.faktura.id).toBe("f21");
  });

  it("firma je dodávateľ aj odberateľ (zle prečítané) → bez návrhu podľa IČO", () => {
    const ai = { supplier_ico: "57348324", buyer_ico: "57348324", invoice_number: "1" };
    expect(navrhVydanej({ udaje: null, ai, firma: FIRMA, kandidati: [] }).navrh).toBe(false);
  });

  it("IBAN príjemcu je firemný účet", () => {
    const firma = { ...FIRMA, ucty: [{ iban: "SK31 1200 0000 1987 4263 7541" }] };
    const ai = { supplier_name: "X", supplier_iban: "SK3112000000198742637541" };
    const n = navrhVydanej({ udaje: null, ai, firma, kandidati: [] });
    expect(n.navrh).toBe(true);
    expect(n.dovody[0]).toEqual({ text: "IBAN {iban} na doklade je váš.", params: { iban: "SK31 1200 0000 1987 4263 7541" } });
  });

  it("cudzí dodávateľ — prijatá faktúra", () => {
    const ai = { supplier_name: "METRO", supplier_ico: "35725664", buyer_ico: "57348324", invoice_number: "2026018" };
    expect(navrhVydanej({ udaje: null, ai, firma: FIRMA, kandidati: VYDANE }).navrh).toBe(false);
  });

  it("navrhDruhu: s firmou rozpozná vlastnú faktúru, bez nej ostáva prijatá", () => {
    const ai = { supplier_name: "RHJ s. r. o.", supplier_ico: "57348324", buyer_name: "Domov", buyer_ico: "00611930", amount_total: 100 };
    expect(navrhDruhu(ai, null, FIRMA)).toBe("vydana");
    expect(navrhDruhu(ai, null)).toBe("faktura");
    expect(navrhDruhu({ ...ai, document_subtype: "blocek" }, null, FIRMA)).toBe("blocek");
  });
});

describe("hromadné priradenie", () => {
  const n = (x: Partial<ReturnType<typeof navrhVydanej>> = {}) => ({
    ...navrhVydanej({ udaje: zDoklada(686), nazovSuboru: "fa_RHJsro_2026018", firma: FIRMA, kandidati: VYDANE }),
    ...x,
  });

  it("návrh so zhodou → priradí sa", () => {
    expect(rozhodnutiePriradenia({ druh: null, maSubor: true, navrh: n() })).toEqual({ invoiceId: "f18" });
  });

  it("druh Vydaná faktúra stačí aj bez návrhu", () => {
    expect(rozhodnutiePriradenia({ druh: "vydana", maSubor: true, navrh: n({ navrh: false }) })).toEqual({ invoiceId: "f18" });
  });

  it("preskočí: číta sa, bez súboru, nie je vydaná, bez čísla, bez faktúry, iná suma", () => {
    const d = (x: any) => ("dovod" in x ? x.dovod.text : null);
    expect(d(rozhodnutiePriradenia({ druh: null, stav: "cita", maSubor: true, navrh: n() }))).toBe("Doklad sa ešte číta");
    expect(d(rozhodnutiePriradenia({ druh: null, maSubor: false, navrh: n() }))).toContain("nemá súbor");
    expect(d(rozhodnutiePriradenia({ druh: "faktura", maSubor: true, navrh: n({ navrh: false }) }))).toContain(
      "Nevyzerá ako vaša vystavená faktúra",
    );
    expect(d(rozhodnutiePriradenia({ druh: "vydana", maSubor: true, navrh: n({ cislo: "", zhoda: null }) }))).toBe(
      "Na doklade nie je číslo faktúry",
    );
    expect(d(rozhodnutiePriradenia({ druh: "vydana", maSubor: true, navrh: n({ zhoda: null }) }))).toContain("sa nenašla");
    const inaSuma = n({ zhoda: { faktura: VYDANE[0]!, sumaSedi: false } });
    expect(d(rozhodnutiePriradenia({ druh: "vydana", maSubor: true, navrh: inaSuma }))).toContain("Suma nesedí");
  });

  it("súhrn", () => {
    expect(textPriradenia(5, 0)).toEqual({ text: "Priradené k vystaveným faktúram: {n}", params: { n: 5 } });
    expect(textPriradenia(3, 2)).toEqual({ text: "Priradené {ok}, preskočené {n}", params: { ok: 3, n: 2 } });
    expect(textPriradenia(0, 0).text).toBe("Nebolo čo priradiť");
  });

  it("hromadné Vytvoriť vydanú faktúru nezaloží ako prijatú", () => {
    expect(dovodNevytvorenia({ druh: "vydana", udaje: zDoklada(686) })?.text).toBe(
      "Vydaná faktúra — použite Priradiť k vystaveným faktúram",
    );
  });

  it("názov prílohy dostane príponu", () => {
    expect(nazovPrilohy("fa_RHJsro_2026018", "2026018", "pdf")).toBe("fa_RHJsro_2026018.pdf");
    expect(nazovPrilohy("sken.PDF", "1", "pdf")).toBe("sken.PDF");
    expect(nazovPrilohy(null, "7", "jpg")).toBe("Doklad 7.jpg");
  });
});

describe("vystavená faktúra z dokladu", () => {
  const ai = {
    supplier_name: "RHJ s. r. o.",
    supplier_ico: "57348324",
    buyer_name: "Domov sociálnych služieb",
    buyer_ico: "00611930",
    buyer_city: "Zavar",
    invoice_number: "2026030",
    issue_date: "2026-11-02",
    delivery_date: "2026-11-01",
    due_date: "2026-11-16",
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    vat_breakdown: [{ rate: 23, base: 100, vat: 23 }],
    items: [
      { name: "Práca", quantity: 2, unit: "hod", unit_price: 30, vat_rate: 23, total: 60 },
      { name: "Materiál", quantity: 1, unit: "ks", unit_price: 40, vat_rate: 23, total: 40 },
    ],
  };

  it("z AI: odberateľ z buyer_*, číslo a dátumy z dokladu, položky sedia s rozpisom", () => {
    const u = udajeZAi(ai, "2026-11-16", { krajina: "SK" });
    const f = fakturaZDokladu({ udaje: u, ai, firma: FIRMA.strana });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.faktura).toMatchObject({
      invoice_number: "2026030",
      type: "regular",
      issue_date: "2026-11-02",
      delivery_date: "2026-11-01",
      due_date: "2026-11-16",
      subtotal: 100,
      vat_total: 23,
      total: 123,
      customer: { name: "Domov sociálnych služieb", ico: "00611930", city: "Zavar" },
    });
    expect(f.polozky.map((p) => [p.name, p.quantity, p.unit_price, p.subtotal, p.vat_amount])).toEqual([
      ["Práca", 2, 30, 60, 13.8],
      ["Materiál", 1, 40, 40, 9.2],
    ]);
  });

  it("položky, ktoré nesedia s rozpisom, nahradí jedna položka na sadzbu", () => {
    const u = udajeZAi({ ...ai, items: [{ name: "X", quantity: 1, unit_price: 50, vat_rate: 23 }] }, "2026-11-16", {
      krajina: "SK",
    });
    u.polozky = [{ name: "X", quantity: 1, unit: "ks", unit_price: 50, vat_rate: 23, total: 50 }];
    const f = fakturaZDokladu({ udaje: u, ai, firma: FIRMA.strana });
    expect(f.ok && f.polozky).toEqual([
      expect.objectContaining({ name: "Plnenie podľa dokladu 2026030", quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23 }),
    ]);
  });

  it("dobropis (dob_…, záporná suma): typ credit_note, sumy záporné, množstvo −1", () => {
    const u = nacitajUdaje({
      cislo: "2026022",
      datumVystavenia: "2026-11-09",
      celkom: -535,
      dodavatel: { nazov: "Domov sociálnych služieb pre dospelých v Zavare", ico: "00611930" },
      rozpis: [{ sadzba: 0, zaklad: -535, dph: 0 }],
    });
    const f = fakturaZDokladu({ udaje: u, nazovSuboru: "dob_RHJsro_2026022", firma: FIRMA.strana });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    // Partner z Doklada je v „dodávateľovi“ — pri vlastnej faktúre je to odberateľ.
    expect(f.faktura.customer.name).toBe("Domov sociálnych služieb pre dospelých v Zavare");
    expect(f.faktura).toMatchObject({ type: "credit_note", subtotal: -535, vat_total: 0, total: -535 });
    expect(f.polozky[0]).toMatchObject({ quantity: -1, unit_price: 535, subtotal: -535, total: -535 });
  });

  it("málo údajov (RHJ z Doklada: len suma a partner) → odmietne s dôvodom", () => {
    const f = fakturaZDokladu({ udaje: zDoklada(686), nazovSuboru: "fa_RHJsro_2026018", firma: FIRMA.strana });
    expect(f).toEqual({ ok: false, dovod: NECITATELNY });
  });

  it("rozpis nesedí so sumou dokladu → odmietne", () => {
    const u = udajeZAi(ai, "2026-11-16", { krajina: "SK" });
    u.celkomDokladu = 150;
    const f = fakturaZDokladu({ udaje: u, ai, firma: FIRMA.strana });
    expect(f.ok).toBe(false);
  });

  it("odberateľ chýba (firma je dodávateľ, AI odberateľa neprečítala) → odmietne", () => {
    const bez = { ...ai, buyer_name: null, buyer_ico: null };
    const u = udajeZAi(bez, "2026-11-16", { krajina: "SK" });
    expect(fakturaZDokladu({ udaje: u, ai: bez, firma: FIRMA.strana })).toEqual({ ok: false, dovod: NECITATELNY });
  });
});
