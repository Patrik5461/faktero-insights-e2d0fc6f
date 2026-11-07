/*
  Kontrola pred odovzdaním do Pohody a oprava generátora (audit 22. 10. 2026):
  prenesenie daňovej povinnosti (členenie, KV A.2 / B.1, IČ DPH), DPH
  nesediaca so základom, zaúčtovanie bez kódov, hotovosť bez pokladne,
  prijatá faktúra so zápornými zľavami (Telekom) a rozdiely oproti Pohode.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml, POHODA_XML } from "./export.server";
import {
  jeTuzemskePdp,
  prekazkaDokladu,
  prekazkaVydanej,
  prekazkaPoliPrijateho,
  prekazkaPoliVydanej,
  varovanieKvPrijatej,
  varovanieKvVydanej,
  PREDVOLENE_CLENENIE_PDP_VYDANE,
} from "./pohoda-kontrola";
import { polozkyPrijatej, prijataAkoDoklad, rozpisPrijatej } from "./prijate-do-pohody";
import { poliaDokladovXml, rozdielyPoli } from "./pohoda-rozdiely";

xmlRegisterFsInputProviders();
const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
const xsd = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
function platne(xml: string): boolean {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      xsd.validate(doc);
    } finally {
      doc.dispose();
    }
  }
  return true;
}

const firma = { ico: "12345678", country: "SK" };

/** Faktúra v tuzemskom prenesení — podľa BÝVAJLEPŠIE 20260010 (anonymizované). */
const pdpFaktura = {
  id: "f-pdp",
  invoice_number: "20260010",
  type: "regular",
  status: "sent",
  issue_date: "2026-10-08",
  delivery_date: "2026-10-01",
  due_date: "2026-10-15",
  customer_name: "Odberateľ s. r. o.",
  customer_country: "SK",
  customer_ico: "11111111",
  customer_dic: "2111111111",
  customer_ic_dph: "SK2111111111",
  reverse_charge: true,
  reverse_charge_type: "domestic_69",
  // Druh prenesenia: písm. j) stavebné práce → KV A2SP.
  pdp_druh: "j",
  subtotal: 4000,
  vat_total: 0,
  total: 4000,
  currency: "EUR",
};
const pdpPolozky = [
  {
    name: "Rezervačný poplatok",
    quantity: 1,
    unit: "ks",
    unit_price: 4000,
    vat_rate: 0,
    subtotal: 4000,
    vat_amount: 0,
    total: 4000,
  },
];

describe("vydaná faktúra v prenesení daňovej povinnosti", () => {
  it("bez nastavenia firmy dostane členenie UDpdp a KV A.2", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: pdpFaktura, items: pdpPolozky }],
    });
    expect(xml).toContain(
      `<inv:classificationVAT><typ:ids>${PREDVOLENE_CLENENIE_PDP_VYDANE}</typ:ids></inv:classificationVAT>`,
    );
    expect(xml).toContain(
      "<inv:classificationKVDPH><typ:ids>A2SP</typ:ids></inv:classificationKVDPH>",
    );
    expect(xml).toContain("<typ:priceNone>4000.00</typ:priceNone>");
    expect(xml).toContain("<typ:priceHighVAT>0.00</typ:priceHighVAT>");
    expect(platne(xml)).toBe(true);
  });

  it("KV A.2 bez písmena § 69 ods. 12 sa zastaví — Pohoda všeobecné A2 nepozná", () => {
    const bez = { ...pdpFaktura, pdp_druh: null };
    expect(prekazkaVydanej(bez, pdpPolozky, firma)).toMatch(
      /^20260010 — doplňte druh prenesenia \(písmeno § 69 ods\. 12\) — KV A\.2 vyžaduje podkód/,
    );
    // Ručné všeobecné A2 tiež; ručný podkód alebo „nezahŕňať“ prejde.
    expect(prekazkaVydanej({ ...bez, kv_clenenie: "A2" }, pdpPolozky, firma)).toMatch(/KV A\.2 vyžaduje podkód/);
    expect(prekazkaVydanej({ ...bez, kv_clenenie: "A2SP" }, pdpPolozky, firma)).toBeNull();
    expect(prekazkaVydanej({ ...bez, kv_clenenie: "X" }, pdpPolozky, firma)).toBeNull();
    // Česká firma KV A.2 nemá.
    expect(String(prekazkaVydanej(bez, pdpPolozky, { ...firma, country: "CZ" }))).not.toMatch(/podkód/);
    // Colné kódy položiek určia písmeno: kapitola 72 → A2CN, 8542 → A2IO, 851713 → A2MT.
    for (const [kn, kv] of [["72083900", "A2CN"], ["10019900", "A2CN"], ["85423100", "A2IO"], ["85171300", "A2MT"]]) {
      const it = [{ ...pdpPolozky[0], colny_kod: kn }];
      expect(prekazkaVydanej(bez, it, firma)).toBeNull();
      const xml = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: bez, items: it }] });
      expect(xml).toContain(`<inv:classificationKVDPH><typ:ids>${kv}</typ:ids></inv:classificationKVDPH>`);
      expect(platne(xml)).toBe(true);
    }
    // Kód mimo písmen f) až i) (7401 meď) — písmeno sa neodhadne (PALIERA FA20260005).
    const zmes = [
      { ...pdpPolozky[0], colny_kod: "72161000" },
      { ...pdpPolozky[0], colny_kod: "74010000" },
    ];
    expect(prekazkaVydanej(bez, zmes, firma)).toMatch(/KV A\.2 vyžaduje podkód/);
    const r = POHODA_XML.build({ company: firma, invoices: [{ invoice: bez, items: zmes }, { invoice: { ...pdpFaktura, id: "f9", invoice_number: "20260011" }, items: pdpPolozky }] }) as any;
    expect(r.preskocene).toHaveLength(1);
    expect(r.content).not.toContain("<typ:ids>A2</typ:ids>");
  });

  it("druh prenesenia určí podkód A.2; písm. a) až e) do KV dodávateľa nepatria", () => {
    for (const [d, kv] of [["f", "A2CN"], ["g", "A2CN"], ["h", "A2MT"], ["i", "A2IO"], ["j", "A2SP"]]) {
      const xml = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: { ...pdpFaktura, pdp_druh: d }, items: pdpPolozky }] });
      expect(xml).toContain(`<inv:classificationKVDPH><typ:ids>${kv}</typ:ids></inv:classificationKVDPH>`);
    }
    const srot = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: { ...pdpFaktura, pdp_druh: "a" }, items: pdpPolozky }] });
    expect(srot).not.toContain("classificationKVDPH");
    // Ručné všeobecné A2 dostane podkód tiež.
    const rucne = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: { ...pdpFaktura, kv_clenenie: "A2" }, items: pdpPolozky }] });
    expect(rucne).toContain("<typ:ids>A2SP</typ:ids>");
    expect(rucne).not.toContain("<typ:ids>A2</typ:ids>");
  });

  it("položka v prenesení na bežnej faktúre: podkód z jej colného kódu, bez neho prekážka", () => {
    const f = { ...pdpFaktura, reverse_charge: false, reverse_charge_type: null, pdp_druh: null, vat_total: 23, subtotal: 200, total: 223 };
    const bezna = { name: "Iné", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 };
    const mobil = { ...pdpPolozky[0], unit_price: 100, subtotal: 100, total: 100, prenesenie: true, colny_kod: "85171300" };
    expect(prekazkaVydanej(f, [bezna, mobil], firma)).toBeNull();
    const xml = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: f, items: [bezna, mobil] }] });
    expect(xml).toContain("<typ:ids>A2MT</typ:ids>");
    expect(xml).not.toContain("<typ:ids>A2</typ:ids>");
    expect(prekazkaVydanej(f, [bezna, { ...mobil, colny_kod: null }], firma)).toMatch(/KV A\.2 vyžaduje podkód/);
  });

  it("opravná faktúra v prenesení: C1CN/C1MT/C1IO podľa písmena, bez neho upozornenie", () => {
    const dob = { ...pdpFaktura, type: "credit_note", pdp_druh: "g", subtotal: -4000, total: -4000 };
    const pol = [{ ...pdpPolozky[0], unit_price: -4000, subtotal: -4000, total: -4000 }];
    expect(buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: dob, items: pol }] })).toContain("<typ:ids>C1CN</typ:ids>");
    expect(buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: { ...dob, pdp_druh: "j" }, items: pol }] })).toContain("<typ:ids>C1</typ:ids>");
    expect(varovanieKvVydanej(dob, pol, firma)).toBeNull();
    expect(varovanieKvVydanej({ ...dob, pdp_druh: null }, pol, firma)).toMatch(/ide do KV ako C1/);
    expect(prekazkaVydanej({ ...dob, pdp_druh: null }, pol, firma)).toBeNull();
  });

  it("členenie firmy a vlastné KV majú prednosť", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...pdpFaktura, kv_clenenie: "X" }, items: pdpPolozky }],
      nastavenia: { clenenieDphPdp: "UDpdpS" },
    });
    expect(xml).toContain("<typ:ids>UDpdpS</typ:ids>");
    expect(xml).not.toContain("classificationKVDPH");
  });

  it("dodanie do EÚ nie je tuzemské prenesenie — žiadne A.2 ani UDpdp", () => {
    const eu = {
      ...pdpFaktura,
      reverse_charge_type: "eu_b2b",
      customer_country: "CZ",
      customer_ic_dph: "CZ12345678",
    };
    expect(jeTuzemskePdp(eu, firma)).toBe(false);
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: eu, items: pdpPolozky }],
    });
    expect(xml).not.toContain("UDpdp");
    expect(xml).not.toContain("<typ:ids>A2</typ:ids>");
  });

  it("staršia faktúra bez typu je tuzemská, keď je odberateľ z krajiny firmy", () => {
    expect(jeTuzemskePdp({ ...pdpFaktura, reverse_charge_type: null }, firma)).toBe(true);
    expect(
      jeTuzemskePdp({ ...pdpFaktura, reverse_charge_type: null, customer_country: "AT" }, firma),
    ).toBe(false);
  });

  it("bez IČ DPH odberateľa sa zastaví (KV A.2 ho potrebuje)", () => {
    const bez = { ...pdpFaktura, customer_ic_dph: null };
    expect(prekazkaVydanej(bez, pdpPolozky, firma)).toMatch(
      /^20260010 — prenesenie daňovej povinnosti bez IČ DPH/,
    );
    const r = POHODA_XML.build({
      company: firma,
      invoices: [
        { invoice: bez, items: pdpPolozky },
        { invoice: { ...pdpFaktura, id: "f2", invoice_number: "20260011" }, items: pdpPolozky },
      ],
    }) as any;
    expect(r.preskocene).toHaveLength(1);
    expect(r.content).not.toContain(">20260010<");
    expect(r.content).toContain(">20260011<");
  });

  it("položka v prenesení na bežnej faktúre tiež potrebuje IČ DPH", () => {
    const f = {
      ...pdpFaktura,
      reverse_charge: false,
      reverse_charge_type: null,
      customer_ic_dph: "",
    };
    expect(prekazkaVydanej(f, [{ ...pdpPolozky[0], prenesenie: true }], firma)).toMatch(
      /bez IČ DPH/,
    );
  });
});

describe("kontrola vydanej faktúry", () => {
  const f = {
    invoice_number: "2026040",
    type: "regular",
    subtotal: 450,
    vat_total: 450,
    total: 450,
    customer_ic_dph: "SK1",
  };
  it("DPH rovná základu sa zastaví (Tobify 2026040)", () => {
    const zle = [{ name: "x", vat_rate: 23, subtotal: 450, vat_amount: 450, total: 450 }];
    expect(prekazkaVydanej(f, zle, firma)).toMatch(
      /DPH 450.00 nesedí so základom 450.00 pri sadzbe 23 %/,
    );
  });
  it("zaokrúhlenie po položkách prejde", () => {
    const ok = [
      { name: "a", vat_rate: 23, subtotal: 10.01, vat_amount: 2.3, total: 12.31 },
      { name: "b", vat_rate: 23, subtotal: 10.01, vat_amount: 2.3, total: 12.31 },
    ];
    expect(prekazkaVydanej({ ...f, vat_total: 4.6 }, ok, firma)).toBeNull();
  });
  it("zaúčtovaná bez členenia sa zastaví, s predvoleným nie", () => {
    const ok = [{ name: "a", vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 }];
    const z = { ...f, vat_total: 23, zauctovane_at: "2026-10-06", pohoda_predkontacia: "3Fv" };
    expect(prekazkaVydanej(z, ok, firma)).toMatch(/zaúčtovaná bez členenia DPH/);
    expect(prekazkaVydanej(z, ok, firma, { clenenieDph: "UD" })).toBeNull();
    expect(prekazkaVydanej({ ...z, pohoda_predkontacia: null }, ok, firma)).toMatch(
      /bez predkontácie/,
    );
  });
  it("členenie pre prenesenie na faktúre s DPH sa zastaví (Testovacia firma FA20260001)", () => {
    const ok = [{ name: "a", vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 }];
    expect(
      prekazkaVydanej(
        { ...f, vat_total: 23, pohoda_clenenie_dph: "UKpdp", kv_clenenie: "A2" },
        ok,
        firma,
      ),
    ).toMatch(/členenie pre prenesenie daňovej povinnosti \(UKpdp\), ale faktúra má DPH/);
  });
});

/** Telekom 1612869951 (anonymizované): 70,81 € pri 23 % a 8,50 € pri 0 %, záporné zľavy. */
const telekom = {
  id: "p-tel",
  company_id: "c",
  invoice_number: "1612869951",
  supplier_name: "Operátor a. s.",
  issue_date: "2026-09-20",
  delivery_date: "2026-09-20",
  due_date: "2026-10-05",
  amount_without_vat: 79.31,
  vat_amount: 16.29,
  amount_total: 95.6,
  currency: "EUR",
  reverse_charge: false,
  items: [
    {
      name: "Poplatky za Extra balíčky a ďalšie služby",
      total: 10.0162,
      vat_rate: 23,
      unit_price: 10.0162,
    },
    { name: "Mesačné poplatky", total: 94.813, vat_rate: 23, unit_price: 94.813 },
    { name: "Hlasové služby (volania)", total: 1.439, vat_rate: 23, unit_price: 1.439 },
    { name: "Nehlasové služby (SMS, MMS, dáta)", total: 0.065, vat_rate: 23, unit_price: 0.065 },
    { name: "Služby tretích strán", total: 1.2032, vat_rate: 23, unit_price: 1.2032 },
    { name: "Splátka za zariadenia", total: 8.5, vat_rate: 0, unit_price: 8.5 },
    { name: "Zľava na služby za zariadenia", total: -5.2033, vat_rate: 23, unit_price: -5.2033 },
    { name: "Bonusy", total: -13.008, vat_rate: 23, unit_price: -13.008 },
    { name: "Zľavy", total: -18.5121, vat_rate: 23, unit_price: -18.5121 },
  ],
};

describe("prijatá faktúra so zápornými zľavami (Telekom)", () => {
  it("položky sa sčítajú so znamienkom a sedia s faktúrou", () => {
    const p = polozkyPrijatej(telekom)!;
    expect(p).not.toBeNull();
    const sucet = (s: number, pole: "zaklad" | "dph") =>
      Math.round(p.filter((x) => x.sadzba === s).reduce((a, x) => a + x[pole], 0) * 100) / 100;
    expect(sucet(23, "zaklad")).toBe(70.81);
    expect(sucet(23, "dph")).toBe(16.29);
    expect(sucet(0, "zaklad")).toBe(8.5);
    expect(p.find((x) => x.nazov === "Zľavy")!.zaklad).toBeLessThan(0);
  });

  it("rozpis DPH po sadzbách — žiadna vymyslená sadzba 20,54 %", () => {
    expect(rozpisPrijatej(telekom)).toEqual([
      { sadzba: 0, zaklad: 8.5, dph: 0 },
      { sadzba: 23, zaklad: 70.81, dph: 16.29 },
    ]);
  });

  it("do Pohody ide základ 70,81 + DPH 16,29 v základnej sadzbe a 8,50 bez DPH", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijataAkoDoklad(telekom) as any],
    });
    expect(xml).toContain("<typ:priceHigh>70.81</typ:priceHigh>");
    expect(xml).toContain("<typ:priceHighVAT>16.29</typ:priceHighVAT>");
    expect(xml).toContain("<typ:priceNone>8.50</typ:priceNone>");
    expect(xml).toContain("<typ:priceRound>0.00</typ:priceRound>");
  });

  it("bez položiek: DPH, ktorá nesedí so žiadnou sadzbou, doklad zastaví", () => {
    const suhrn = prijataAkoDoklad({ ...telekom, items: [] });
    expect(prekazkaDokladu(suhrn, firma)).toMatch(
      /^1612869951 — Rozpis DPH je na kontrole — skontrolujte ho a potvrďte \(DPH sa nedá priradiť k sadzbe, vychádza 20.54 %\)/,
    );
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [suhrn as any] });
    expect(xml).not.toContain("dataPackItem");
  });

  it("dobropis s kladnými položkami sa otočí podľa faktúry", () => {
    const d = {
      ...telekom,
      amount_without_vat: -100,
      vat_amount: -23,
      amount_total: -123,
      items: [{ name: "Vrátenie", total: 100, vat_rate: 23 }],
    };
    expect(polozkyPrijatej(d)).toMatchObject([{ zaklad: -100, dph: -23 }]);
  });
});

describe("kontrola prijatých dokladov", () => {
  const pdp = {
    id: "p-pdp",
    company_id: "c",
    invoice_number: "26090002",
    supplier_name: "Oceľ s. r. o.",
    issue_date: "2026-09-16",
    amount_without_vat: 5475.32,
    vat_amount: 0,
    amount_total: 5475.32,
    currency: "EUR",
    dph_rezim: "samozdanenie",
    reverse_charge: false,
    items: [],
  };
  it("prenesenie bez členenia pre samozdanenie sa zastaví", () => {
    expect(prekazkaDokladu(prijataAkoDoklad(pdp), firma, {})).toMatch(
      /bez členenia DPH pre samozdanenie/,
    );
    expect(
      prekazkaDokladu(prijataAkoDoklad(pdp), firma, { clenenieDphPdpPrijata: "PDpdp" }),
    ).toBeNull();
  });
  it("zmiešaná faktúra: PDP položky bez členenia sa zastavia", () => {
    const zm = {
      ...pdp,
      dph_rezim: null,
      amount_without_vat: 1694.2,
      vat_amount: 132.8,
      amount_total: 1827,
      items: [
        { name: "Montáž", total: 577.4, vat_rate: 23 },
        { name: "Oceľ (PDP)", total: 1116.8, vat_rate: 23, pdp: true },
      ],
    };
    expect(prekazkaDokladu(prijataAkoDoklad(zm), firma, {})).toMatch(/samozdanenie/);
  });
  it("zaúčtovaná bez predkontácie sa zastaví (FV20260460)", () => {
    const z = {
      ...pdp,
      dph_rezim: null,
      vat_amount: 1259.32,
      amount_total: 6734.64,
      zauctovane_at: "2026-10-06",
    };
    expect(prekazkaDokladu(prijataAkoDoklad(z), firma, { clenenieDphPrijata: "PD" })).toMatch(
      /bez predkontácie/,
    );
    expect(
      prekazkaDokladu(prijataAkoDoklad(z), firma, {
        clenenieDphPrijata: "PD",
        predkontaciaPrijata: "1Pr",
      }),
    ).toBeNull();
  });
  it("hotovostný bloček bez pokladne pri bločkoch podľa platby sa zastaví", () => {
    const b = {
      document_number: "2516",
      payment_method: "hotovost",
      net_amount: 10,
      vat_amount: 2.3,
      vat_rate: 23,
      total_amount: 12.3,
      currency: "EUR",
    };
    expect(prekazkaDokladu(b, firma, { blockyPodlaPlatby: true })).toMatch(/bez pokladne/);
    expect(prekazkaDokladu(b, firma, { blockyPodlaPlatby: true, pokladna: "HP" })).toBeNull();
    expect(prekazkaDokladu(b, firma, {})).toBeNull();
  });
});

describe("rozdiely oproti Pohode", () => {
  it("prepnutie na PDP po odovzdaní sa ukáže (BÝVAJLEPŠIE 20260010)", () => {
    const odoslane = buildPohodaInvoiceXml({
      company: firma,
      invoices: [
        {
          invoice: {
            ...pdpFaktura,
            reverse_charge: false,
            reverse_charge_type: null,
            vat_total: 920,
            total: 4920,
            delivery_date: "2026-10-08",
          },
          items: [{ ...pdpPolozky[0], vat_rate: 23, vat_amount: 920, total: 4920 }],
        },
      ],
    });
    const teraz = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: pdpFaktura, items: pdpPolozky }],
    });
    const r = rozdielyPoli(poliaDokladovXml(odoslane)["f-pdp"], poliaDokladovXml(teraz)["f-pdp"]);
    const pole = Object.fromEntries(r.map((x) => [x.pole, x]));
    expect(pole.dateTax).toMatchObject({ vPohode: "2026-10-08", teraz: "2026-10-01" });
    expect(pole.classificationVAT).toMatchObject({ vPohode: "", teraz: "UDpdp" });
    expect(pole.classificationKVDPH).toMatchObject({ teraz: "A2SP" });
    expect(pole["sum.priceHighVAT"]).toMatchObject({ vPohode: "920.00", teraz: "0.00" });
  });
  it("nezmenený doklad nemá rozdiely", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: pdpFaktura, items: pdpPolozky }],
    });
    expect(rozdielyPoli(poliaDokladovXml(x)["f-pdp"], poliaDokladovXml(x)["f-pdp"])).toEqual([]);
  });
});

describe("oprava po vrátení ide pod novým id (kontrola duplicity Pohody)", () => {
  it("verzia sa pridá k id položky dávky a porovnanie ju ignoruje", async () => {
    const { idDokladuPohody, holeIdDokladu } = await import("./pohoda-kontrola");
    const id = "69975d99-2db0-4e4a-900f-19988cb52763";
    expect(idDokladuPohody(id, 0)).toBe(id);
    expect(idDokladuPohody(id, 2)).toBe(`${id}-2`);
    expect(holeIdDokladu(`${id}-2`)).toBe(id);
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...pdpFaktura, id, pohoda_verzia: 1 }, items: pdpPolozky }],
    });
    expect(xml).toContain(`<dat:dataPackItem id="${id}-1"`);
    expect(Object.keys(poliaDokladovXml(xml))).toEqual([id]);
    const prij = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijataAkoDoklad({ ...telekom, id, pohoda_verzia: 3 }) as any],
    });
    expect(prij).toContain(`<dat:dataPackItem id="${id}-3"`);
  });
});

describe("kontrola polí pred Pohodou (dĺžky a tvar podľa schém Stormware)", () => {
  const firma = { country: "SK" };
  const fa = (o: Record<string, unknown> = {}) => ({
    invoice_number: "FA2026001",
    issue_date: "2026-10-10",
    currency: "EUR",
    customer_ic_dph: "SK2021999888",
    ...o,
  });
  it("vydaná: číslo nad 32 znakov, zlé IČ DPH, mena a KV A.2 bez IČ DPH", () => {
    expect(prekazkaPoliVydanej(fa(), firma)).toBeNull();
    expect(prekazkaPoliVydanej(fa({ invoice_number: "X".repeat(33) }), firma)).toMatch(
      /najviac 32/,
    );
    expect(prekazkaPoliVydanej(fa({ customer_ic_dph: "2021999888" }), firma)).toMatch(
      /nemá tvar IČ DPH/,
    );
    expect(prekazkaPoliVydanej(fa({ customer_ic_dph: "SK" + "1".repeat(20) }), firma)).toMatch(
      /dlhšie ako 18/,
    );
    expect(prekazkaPoliVydanej(fa({ currency: "€" }), firma)).toMatch(/nie je kód ISO/);
    expect(prekazkaPoliVydanej(fa({ customer_ic_dph: null, kv_clenenie: "A2" }), firma)).toMatch(
      /A.2 bez IČ DPH/,
    );
    expect(prekazkaPoliVydanej(fa({ customer_ico: "1234567890123456" }), firma)).toMatch(/IČO/);
  });
  it("prijatá: IČ DPH so sadzbou (čítanie AI) a dlhé číslo dodávateľa zastavia, bloček nie", () => {
    const pr = (o: Record<string, unknown> = {}) => ({
      _typPohody: "receivedInvoice",
      _povodneCislo: "2026-778",
      issue_date: "2026-10-05",
      supplier_ic_dph: "SK2022111222",
      ...o,
    });
    expect(prekazkaPoliPrijateho(pr())).toBeNull();
    expect(prekazkaPoliPrijateho(pr({ supplier_ic_dph: "2.30" }))).toMatch(/nemá tvar IČ DPH/);
    expect(prekazkaPoliPrijateho(pr({ supplier_ic_dph: "2020264818/SK2020264818" }))).toMatch(
      /dlhšie ako 18/,
    );
    expect(
      prekazkaPoliPrijateho(pr({ _povodneCislo: "Fwd: FW: Dožiadanie_MaxiTicket s.r.o." })),
    ).toMatch(/najviac 32/);
    expect(
      prekazkaPoliPrijateho({ document_number: "O-".padEnd(60, "1"), supplier_ic_dph: "23" }),
    ).toBeNull();
  });
  it("upozornenie: prijatá v KV B.2 bez IČ DPH dodávateľa", () => {
    const d = {
      _typPohody: "receivedInvoice",
      _povodneCislo: "2026-1",
      vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
    };
    expect(varovanieKvPrijatej(d, { country: "SK" })).toMatch(/B2\) bez IČ DPH dodávateľa/);
    expect(
      varovanieKvPrijatej({ ...d, supplier_ic_dph: "SK2022111222" }, { country: "SK" }),
    ).toBeNull();
    expect(varovanieKvPrijatej(d, { country: "CZ" })).toBeNull();
  });
});
