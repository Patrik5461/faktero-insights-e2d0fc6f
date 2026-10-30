import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import {
  kontrolnyVykaz,
  type PrijataFaktura,
  type PrijatyDoklad,
  type VystavenaFaktura,
  type Vstup,
} from "./dph-vykazy";
import { kvNaXml } from "./dph-vykazy-xml";
import { bezNezahrnovanych, nacitajVstup } from "./dph-vykazy.server";
import { kvPrijatehoDokladu, kvVystavenehoDokladu, upozornenieA1 } from "./kv-urcenie";
import { kvPrijatehoPrePohodu, kvVystavenehoPrePohodu } from "./pohoda-kv";

/*
  Riadok kontrolného výkazu podľa metodického pokynu FS SR (3.1.1, 3.3.1,
  3.4.2) — a to isté vo výkaze Faktera aj v exporte do Pohody.
*/

const obdobie = { rok: 2026, mesiac: 9 };
const vstup = (p: Partial<Vstup>): Vstup => ({
  obdobie,
  vystavene: [],
  prijate: [],
  doklady: [],
  ...p,
});

const vystavena = (p: Partial<VystavenaFaktura> = {}): VystavenaFaktura => ({
  cislo: "2026001",
  typ: "regular",
  datumDodania: "2026-09-10",
  riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }],
  ...p,
});

const prijata = (p: Partial<PrijataFaktura> = {}): PrijataFaktura => ({
  cislo: "PF1",
  dodavatelIcDph: "SK2022222222",
  datumDodania: "2026-09-12",
  rezim: "tuzemsko",
  odpocet: true,
  riadky: [{ sadzba: 23, zaklad: 200, dan: 46 }],
  ...p,
});

const blocek = (p: Partial<PrijatyDoklad> = {}): PrijatyDoklad => ({
  dodavatelIcDph: "SK2023333333",
  odpocet: true,
  riadky: [{ sadzba: 23, zaklad: 10, dan: 2.3 }],
  ...p,
});

/** Do ktorej časti výkaz Faktera dal vystavenú faktúru. */
function castVystavenej(f: VystavenaFaktura): string {
  const v = kontrolnyVykaz(vstup({ vystavene: [f] }));
  if (v.a1.length) return "A1";
  if (v.a2.length) return "A2";
  if (v.c1.length) return "C1";
  if (v.d2) return "D2";
  return "";
}

function castPrijatej(p: PrijataFaktura): string {
  const v = kontrolnyVykaz(vstup({ prijate: [p] }));
  if (v.b1.length) return "B1";
  if (v.b2.length) return "B2";
  if (v.b31 || v.b32.length) return "B3";
  if (v.c2.length) return "C2";
  return "";
}

const validator = () =>
  XsdValidator.fromDoc(
    XmlDocument.fromBuffer(readFileSync(new URL("./schemy/kv_dph_2025.xsd", import.meta.url))),
  );

const firmaXml = {
  icDph: "SK2020123456",
  dic: "2020123456",
  nazov: "Testovacia firma s. r. o.",
  ulica: "Hlavná",
  cislo: "12",
  psc: "81101",
  obec: "Bratislava",
  stat: "Slovensko",
  tel: "0900123456",
  email: "firma@test.sk",
  danovyUrad: "Bratislava",
  konatel: "Ján Novák",
};

function overXsd(xml: string) {
  const doc = XmlDocument.fromString(xml);
  try {
    expect(() => validator().validate(doc)).not.toThrow();
  } finally {
    doc.dispose();
  }
}

describe("A.1 vs. D.2 — kto je odberateľ", () => {
  it("platiteľ DPH → A.1 s IČ DPH", () => {
    const v = kontrolnyVykaz(vstup({ vystavene: [vystavena({ odberatelIcDph: "SK2021111111" })] }));
    expect(v.a1).toEqual([
      { odb: "SK2021111111", f: "2026001", den: "2026-09-10", z: 100, d: 23, s: 23 },
    ]);
    expect(v.d2).toBeNull();
  });

  it("podnikateľ bez IČ DPH (len IČO alebo DIČ) → A.1, stĺpec IČ DPH prázdny", () => {
    for (const f of [
      vystavena({ odberatelIco: "12345678" }),
      vystavena({ odberatelDic: "2021111111" }),
    ]) {
      const v = kontrolnyVykaz(vstup({ vystavene: [f] }));
      expect(v.a1).toHaveLength(1);
      expect(v.a1[0].odb).toBeUndefined();
      expect(v.d2).toBeNull();
      expect(v.vytky).toEqual([]);
    }
  });

  it("občan (bez IČ DPH, IČO aj DIČ) → D.2 súhrnne", () => {
    const v = kontrolnyVykaz(
      vstup({
        vystavene: [
          vystavena({ riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] }),
          vystavena({ cislo: "2026002", riadky: [{ sadzba: 5, zaklad: 40, dan: 2 }] }),
        ],
      }),
    );
    expect(v.a1).toEqual([]);
    expect(v.d2).toEqual({ z: 100, d: 23, zzn: 40, dzn: 2 });
  });

  it("ručne zvolené A.1 má prednosť, pri občanovi s upozornením", () => {
    const v = kontrolnyVykaz(vstup({ vystavene: [vystavena({ kv: "A1" })] }));
    expect(v.a1).toHaveLength(1);
    expect(v.vytky).toHaveLength(1);
    expect(v.vytky[0].text).toContain("D.2");
    // Pri podnikateľovi bez IČ DPH je A.1 správne — bez upozornenia.
    expect(upozornenieA1({ kv: "A1", ico: "12345678" })).toBeNull();
    expect(upozornenieA1({ kv: null })).toBeNull();
  });

  it("ručne zvolené D.2 prebije A.1 aj pri platiteľovi", () => {
    expect(castVystavenej(vystavena({ kv: "D2", odberatelIcDph: "SK2021111111" }))).toBe("D2");
  });

  it("predvolené firmy (D.2) platí len pre bežnú faktúru, nie pre dobropis", () => {
    expect(castVystavenej(vystavena({ kvPredvolene: "D2", odberatelIcDph: "SK2021111111" }))).toBe(
      "D2",
    );
    expect(
      castVystavenej(
        vystavena({
          typ: "credit_note",
          opravujeCislo: "2026001",
          kvPredvolene: "D2",
          odberatelIcDph: "SK2021111111",
          riadky: [{ sadzba: 23, zaklad: -10, dan: -2.3 }],
        }),
      ),
    ).toBe("C1");
  });

  it("členenie DPH „nezahrnovať“ (UN) vystavenú faktúru z KV vynechá", () => {
    expect(castVystavenej(vystavena({ odberatelIcDph: "SK1", clenenieDph: "UN" }))).toBe("");
  });
});

describe("dobropis — C.1 a C.2", () => {
  const dobropis = (p: Partial<VystavenaFaktura> = {}) =>
    vystavena({
      cislo: "D2026001",
      typ: "credit_note",
      opravujeCislo: "2026001",
      riadky: [{ sadzba: 23, zaklad: -50, dan: -11.5 }],
      ...p,
    });

  it("dobropis platiteľovi → C.1 s číslom pôvodnej faktúry", () => {
    const v = kontrolnyVykaz(vstup({ vystavene: [dobropis({ odberatelIcDph: "SK2021111111" })] }));
    expect(v.c1).toEqual([
      { odb: "SK2021111111", fo: "D2026001", fp: "2026001", zr: -50, dr: -11.5, s: 23 },
    ]);
  });

  it("dobropis občanovi → súhrn D.2 (C.1 je len k A.1/A.2)", () => {
    const v = kontrolnyVykaz(vstup({ vystavene: [vystavena(), dobropis()] }));
    expect(v.c1).toEqual([]);
    expect(v.d2).toEqual({ z: 50, d: 11.5, zzn: 0, dzn: 0 });
  });

  it("dobropis bez čísla pôvodnej faktúry → výtka, nie C.1", () => {
    const v = kontrolnyVykaz(
      vstup({
        vystavene: [dobropis({ opravujeCislo: null, odberatelIcDph: "SK2021111111" })],
      }),
    );
    expect(v.c1).toEqual([]);
    expect(v.vytky.map((x) => x.text).join()).toContain("C.1");
  });

  it("prijatý dobropis → C.2, aj bez nároku na odpočet (odpočítaná nula)", () => {
    const p = prijata({
      cislo: "PD1",
      opravujeCislo: "PF1",
      riadky: [{ sadzba: 23, zaklad: -20, dan: -4.6 }],
    });
    expect(kontrolnyVykaz(vstup({ prijate: [p] })).c2).toEqual([
      { dod: "SK2022222222", fo: "PD1", fp: "PF1", zr: -20, dr: -4.6, s: 23, or: -4.6 },
    ]);
    expect(kontrolnyVykaz(vstup({ prijate: [{ ...p, odpocet: false }] })).c2[0].or).toBe(0);
  });

  it("prijatý dobropis bez čísla pôvodnej → výtka, nie B.2", () => {
    const v = kontrolnyVykaz(
      vstup({
        prijate: [prijata({ dobropis: true, riadky: [{ sadzba: 23, zaklad: -20, dan: -4.6 }] })],
      }),
    );
    expect(v.b2).toEqual([]);
    expect(v.c2).toEqual([]);
    expect(v.vytky.map((x) => x.text).join()).toContain("C.2");
  });
});

describe("B.2 len s odpočtom — PN a bez nároku na odpočet", () => {
  it("bežná prijatá faktúra → B.2", () => {
    expect(castPrijatej(prijata())).toBe("B2");
  });

  it("členenie PN (napr. 502000/PN) → do KV nepatrí", () => {
    expect(castPrijatej(prijata({ clenenieDph: "PN" }))).toBe("");
    expect(castPrijatej(prijata({ clenenieDph: "PNnedan" }))).toBe("");
    expect(castPrijatej(prijata({ clenenieDph: "UN" }))).toBe("");
  });

  it("ručne zvolené členenie KV má prednosť pred PN (ako v Pohode)", () => {
    expect(castPrijatej(prijata({ clenenieDph: "PN", kv: "B2" }))).toBe("B2");
  });

  it("bez nároku na odpočet → do B.2 nepatrí", () => {
    expect(castPrijatej(prijata({ odpocet: false }))).toBe("");
  });

  it("prenesenie s PN do KV nejde, bez PN do B.1", () => {
    expect(castPrijatej(prijata({ rezim: "samozdanenie" }))).toBe("B1");
    expect(castPrijatej(prijata({ rezim: "samozdanenie", clenenieDph: "PN" }))).toBe("");
  });
});

describe("B.3 — bločky", () => {
  it("bloček s odpočtom ide do B.3.1 sumárne", () => {
    const v = kontrolnyVykaz(vstup({ doklady: [blocek(), blocek()] }));
    expect(v.b31).toEqual({ z: 20, d: 4.6, o: 4.6 });
  });

  it("bloček s PN, bez odpočtu alebo „X“ do B.3 nejde", () => {
    for (const d of [
      blocek({ clenenieDph: "PN" }),
      blocek({ odpocet: false }),
      blocek({ kv: "X" }),
    ]) {
      expect(kontrolnyVykaz(vstup({ doklady: [d] })).b31).toBeNull();
    }
  });

  it("bloček ručne B.2 ide po riadkoch, predvolené firmy B.2 tiež", () => {
    const v = kontrolnyVykaz(
      vstup({
        doklady: [
          blocek({ kv: "B2", cislo: "F1", datum: "2026-09-03" }),
          blocek({ kvPredvolene: "B2", cislo: "F2", datum: "2026-09-04" }),
        ],
      }),
    );
    expect(v.b2.map((r) => r.f)).toEqual(["F1", "F2"]);
    expect(v.b31).toBeNull();
  });

  it("riadky rozúčtovania s PN sa z dokladu odčítajú", () => {
    expect(
      bezNezahrnovanych(
        [
          { sadzba: 23, zaklad: 100, dan: 23 },
          { sadzba: 5, zaklad: 10, dan: 0.5 },
        ],
        [{ sadzba: 23, zaklad: 40, dph: 9.2 }],
      ),
    ).toEqual([
      { sadzba: 23, zaklad: 60, dan: 13.8 },
      { sadzba: 5, zaklad: 10, dan: 0.5 },
    ]);
    // Dobropis je záporný — odčíta sa v jeho znamienku, celý PN riadok zmizne.
    expect(
      bezNezahrnovanych(
        [{ sadzba: 23, zaklad: -40, dan: -9.2 }],
        [{ sadzba: 23, zaklad: 40, dph: 9.2 }],
      ),
    ).toEqual([]);
  });
});

describe("výkaz Faktera a export do Pohody dávajú ten istý riadok", () => {
  const vystaveneStavy: {
    f: Partial<VystavenaFaktura>;
  }[] = [
    { f: { odberatelIcDph: "SK2021111111" } },
    { f: { odberatelIco: "12345678" } },
    { f: {} },
    { f: { kv: "A1" } },
    { f: { kv: "X", odberatelIcDph: "SK1" } },
    { f: { kvPredvolene: "D2", odberatelIcDph: "SK1" } },
    { f: { clenenieDph: "UN", odberatelIcDph: "SK1" } },
    {
      f: {
        typ: "credit_note",
        opravujeCislo: "1",
        odberatelIcDph: "SK1",
        riadky: [{ sadzba: 23, zaklad: -1, dan: -0.23 }],
      },
    },
    {
      f: {
        typ: "credit_note",
        opravujeCislo: "1",
        riadky: [{ sadzba: 23, zaklad: -1, dan: -0.23 }],
      },
    },
    {
      f: {
        prenosDane: true,
        prenosTyp: "domestic_69",
        odberatelIcDph: "SK1",
        riadky: [{ sadzba: 0, zaklad: 100, dan: 0 }],
      },
    },
    {
      f: {
        prenosDane: true,
        prenosTyp: "eu_b2b",
        odberatelIcDph: "DE1",
        riadky: [{ sadzba: 0, zaklad: 100, dan: 0 }],
      },
    },
  ];

  it.each(vystaveneStavy.map((s, i) => [i, s.f] as const))("vystavená #%i", (_i, p) => {
    const f = vystavena(p);
    const pohoda = kvVystavenehoPrePohodu({
      cz: false,
      typ: f.typ,
      kvDokladu: f.kv,
      predvolene: f.kvPredvolene,
      reverseCharge: Boolean(f.prenosDane),
      tuzemskePdp: f.prenosTyp === "domestic_69",
      maDph: f.riadky.some((r) => r.dan !== 0),
      icDphOdberatela: f.odberatelIcDph,
      icoOdberatela: f.odberatelIco,
      dicOdberatela: f.odberatelDic,
      clenenieDph: f.clenenieDph,
    });
    expect(castVystavenej(f)).toBe(pohoda);
  });

  const prijateStavy: Partial<PrijataFaktura>[] = [
    {},
    { clenenieDph: "PN" },
    { clenenieDph: "PN", kv: "B2" },
    { odpocet: false },
    { kv: "X" },
    { rezim: "samozdanenie" },
    { rezim: "dovoz" },
    { opravujeCislo: "PF0", riadky: [{ sadzba: 23, zaklad: -1, dan: -0.23 }] },
  ];

  it.each(prijateStavy.map((p, i) => [i, p] as const))("prijatá #%i", (_i, p) => {
    const f = prijata(p);
    const pohoda = kvPrijatehoPrePohodu({
      cz: false,
      kvDokladu: f.kv,
      blocek: false,
      dobropis: Boolean(f.opravujeCislo),
      pdp: f.rezim === "samozdanenie",
      rezim: f.rezim,
      maDph: f.riadky.some((r) => r.dan !== 0),
      odpocet: f.odpocet,
      clenenieDph: f.clenenieDph,
    });
    expect(castPrijatej(f)).toBe(pohoda);
  });

  it("nadobudnutie z EÚ: Faktero B.1 z faktúry, Pohoda cez interný doklad", () => {
    const o = { blocek: false, dobropis: false, pdp: false, rezim: "nadobudnutie", maDph: true };
    expect(kvPrijatehoDokladu({ ...o, nadobudnutieDoB1: true })).toBe("B1");
    expect(kvPrijatehoPrePohodu({ ...o, cz: false })).toBe("");
  });

  it("zálohová faktúra do KV nepatrí", () => {
    expect(kvVystavenehoDokladu({ typ: "proforma", maDph: true, icDphOdberatela: "SK1" })).toBe("");
  });
});

describe("načítanie dokladov — členenie DPH z dokladu, kategórie aj firmy", () => {
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

  const prijataRiadok = (p: Record<string, any> = {}) => ({
    id: "p1",
    invoice_number: "PF-1",
    supplier_name: "Dodávateľ s. r. o.",
    supplier_ic_dph: "SK2022222222",
    issue_date: "2026-09-05",
    delivery_date: "2026-09-05",
    currency: "EUR",
    dph_rezim: "tuzemsko",
    odpocet: true,
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    status: "paid",
    ...p,
  });

  const fakturaRiadok = (p: Record<string, any> = {}) => ({
    id: "i1",
    invoice_number: "2026001",
    type: "regular",
    status: "sent",
    issue_date: "2026-09-10",
    delivery_date: "2026-09-10",
    currency: "EUR",
    customer_name: "Ján Občan",
    reverse_charge: false,
    discount_total: 0,
    invoice_items: [{ vat_rate: 23, subtotal: 100, quantity: 1, unit_price: 100 }],
    ...p,
  });

  async function nacitaj(t: Record<string, any[]>) {
    const { vstup: v } = await nacitajVstup(
      klient({ companies: [{ id: "f", country: "SK" }], ...t }) as any,
      "f",
      obdobie,
    );
    return { vstup: v, kv: kontrolnyVykaz(v) };
  }

  it("prijatá faktúra s PN na doklade: bez B.2 a bez odpočtu", async () => {
    const { vstup: v, kv } = await nacitaj({
      purchase_invoices: [prijataRiadok({ pohoda_clenenie_dph: "PN" })],
    });
    expect(kv.b2).toEqual([]);
    expect(v.prijate[0].odpocet).toBe(false);
  });

  it("PN z predvoleného členenia firmy pre prijaté doklady", async () => {
    const { kv } = await nacitaj({
      companies: [{ id: "f", country: "SK", pohoda_clenenie_dph_prijata: "PN" }],
      purchase_invoices: [prijataRiadok()],
    });
    expect(kv.b2).toEqual([]);
  });

  it("faktúra občanovi → D.2, firme s IČO → A.1 bez IČ DPH; XML sedí so schémou", async () => {
    const { kv } = await nacitaj({
      invoices: [
        fakturaRiadok(),
        fakturaRiadok({ id: "i2", invoice_number: "2026002", customer_ico: "12345678" }),
      ],
      purchase_invoices: [
        prijataRiadok(),
        prijataRiadok({ id: "p2", invoice_number: "PF-2", pohoda_clenenie_dph: "PN" }),
      ],
      expense_documents: [
        {
          id: "e1",
          document_number: "B1",
          supplier_ic_dph: "SK2023333333",
          issue_date: "2026-09-07",
          currency: "EUR",
          status: "processed",
          net_amount: 10,
          vat_amount: 2.3,
          total_amount: 12.3,
        },
      ],
    });
    expect(kv.d2).toEqual({ z: 100, d: 23, zzn: 0, dzn: 0 });
    expect(kv.a1).toEqual([
      { odb: undefined, f: "2026002", den: "2026-09-10", z: 100, d: 23, s: 23 },
    ]);
    expect(kv.b2.map((r) => r.f)).toEqual(["PF-1"]);
    expect(kv.b31).toEqual({ z: 10, d: 2.3, o: 2.3 });
    const xml = kvNaXml(kv, firmaXml, obdobie);
    expect(xml).toContain('<A1 F="2026002"');
    expect(xml).toContain('<D2 Z="100.00" D="23.00"');
    overXsd(xml);
  });
});
