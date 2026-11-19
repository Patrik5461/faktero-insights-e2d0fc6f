/*
  Bankové pohyby do POHODY cez konektor a mesačný balík
  (`companies.pohoda_posielat_banku`):
   - výber: vypnuté = nič, účet bez skratky sa preskočí s hláškou, odovzdaný
     a práve odoslaný (na ceste) pohyb nejde;
   - poradie v dávke: banka za faktúrami, prijatými a pokladňou;
   - dávka s bankou prejde schémou Stormware;
   - spoločný generátor dá bajt po bajte to isté XML ako pôvodné ručné
     „XML pre POHODU“ (overené v POHODE) a konektor za celý mesiac tie isté
     položky ako ručný výpis za ten mesiac.
*/
import { describe, expect, it, vi } from "vitest";

vi.mock("./kurzy.server", () => ({
  kurzPreDoklad: async (_mena: string, den: string) => ({ kurz: den === "2026-10-05" ? 24.312 : 24.4 }),
}));

import {
  buildPohodaBankXml,
  buildPohodaDavkaXml,
  polozkyAutomatickejLikvidacie,
  polozkyBankovehoVypisu,
  type VypisPohyb,
} from "./export.server";
import { pravidloPohybu } from "./pravidla-uctovania";
import { odhadniOznacenie } from "./vypis-oznacenie";
import { symbolyZTextu } from "./banka-pohoda-id";
import {
  idLikvidacie,
  likvidaciePreSkupiny,
  PRAVIDLO_PAROVANIA_ID,
  rozoberLikvidaciu,
  skratkaZIdLikvidacie,
  datumVypisuSkupiny,
  koniecMesiaca,
  skratkaUctuVPohode,
  vyberPohybovBanky,
  zarovnaneCislaVypisu,
  cisloVypisuZDatumu,
  pohybZTransakcie,
  type TransakciaBanky,
} from "./banka-pohoda";
import { bankaPreDavku, xmlVypisuPrePohodu } from "./banka-pohoda.server";
import { idPoloziekDavky } from "./pohoda-konektor-davka";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

/* ------------------------------------------------------------------ údaje */

const FIRMA = "c0000000-0000-0000-0000-000000000001";
const firma: any = {
  id: FIRMA,
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
  pohoda_posielat_banku: true,
  pohoda_banka: "TB",
  pohoda_predkontacia_banka: "1Bank",
  pohoda_predkontacie_oznaceni: { poplatok: "BPopl" },
};
const UCET_TB = { id: "a0000000-0000-0000-0000-00000000000a", iban: "SK31 1100 0000 0029 4502 4401", currency: "EUR", account_name: "Tatra" };
const UCET_VUB = { id: "b0000000-0000-0000-0000-00000000000b", iban: "SK89 0200 0000 0012 3456 7890", currency: "EUR", account_name: "VÚB" };
const UCET_CZK = { id: "c0000000-0000-0000-0000-00000000000c", iban: "SK12 1100 0000 0029 9999 0001", currency: "CZK", account_name: "Koruny" };
const SKRATKY = [
  { iban: "SK3111000000002945024401", pohoda_skratka: "TB" },
  { iban: "SK12 1100 0000 0029 9999 0001", pohoda_skratka: "TBCZK" },
];
const pravidla = [
  {
    id: "r1",
    aktivne: true,
    druh: "banka",
    smer: "vydaj",
    dodavatel_text: "Orange",
    predkontacia: "5Tel",
    poradie: 1,
  },
];

const tx = (n: number, ucet: string, datum: string, suma: number, extra: Partial<TransakciaBanky> = {}): TransakciaBanky => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  bank_account_id: ucet,
  booking_date: datum,
  amount: suma,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  counterparty_iban: null,
  description: null,
  created_at: `${datum}T10:00:00Z`,
  exported_at: null,
  ...extra,
});

const TXS: TransakciaBanky[] = [
  tx(1, UCET_TB.id, "2026-10-03", 123, { variable_symbol: "20260001", counterparty: "Odberateľ s.r.o.", counterparty_iban: "SK6807200002891987426353", description: "Úhrada faktúry /VS20260001/SS77/KS0308" }),
  tx(2, UCET_TB.id, "2026-10-03", -2.5, { description: "Poplatok za vedenie účtu" }),
  tx(3, UCET_TB.id, "2026-10-07", -45.9, { counterparty: "Orange Slovensko", description: "Faktúra za telefón · IBAN DE89370400440532013000" }),
  tx(4, UCET_TB.id, "2026-10-31", 10, { description: "Vklad" }),
];

/* --------------------------------------------- pôvodné ručné „XML pre POHODU“ (pred zjednotením) */

/** Doslovná kópia mapovania z `vypis-pohoda-xml.functions.ts` pred zjednotením — referencia. */
function staraCesta(company: any, ucet: any, txs: any[], prav: any[], vypis: { period_end: string }, banka: string, kurzyDni = new Map<string, number | null>()) {
  const menaUctu = String(ucet.currency ?? "").trim().toUpperCase() || "EUR";
  const pohyby: VypisPohyb[] = txs.map((t) => {
    const popis = String(t.description ?? "");
    const ibanZTextu = /IBAN\s+([A-Z]{2}\d{2}[0-9A-Z ]{10,36})\s*$/i.exec(popis)?.[1] ?? null;
    const symboly = symbolyZTextu(popis);
    const p: VypisPohyb = {
      id: t.id ?? null,
      kurz: kurzyDni.get(String(t.booking_date)) ?? null,
      ks: symboly.ks,
      ss: symboly.ss,
      datum: t.booking_date,
      suma: Math.abs(Number(t.amount)),
      smer: Number(t.amount) < 0 ? "vydaj" : "prijem",
      popis: popis.replace(/\s*·\s*IBAN\s+[A-Z]{2}[0-9A-Z ]{10,40}\s*$/i, "").trim() || null,
      protistrana: t.counterparty ?? null,
      protiucet: (t.counterparty_iban ?? ibanZTextu)?.replace(/\s+/g, "") ?? null,
      vs: t.variable_symbol ?? null,
    };
    p.oznacenie = odhadniOznacenie({ popis: p.popis, protistrana: p.protistrana, smer: p.smer, vs: p.vs });
    const r = pravidloPohybu((prav ?? []) as any[], p, ucet.iban);
    return { ...p, predkontacia: r ? (r as { predkontacia: string }).predkontacia : null };
  });
  return buildPohodaBankXml({
    company,
    pohyby,
    datumVypisu: vypis.period_end,
    cisloVypisu: String(Number(String(vypis.period_end).slice(5, 7)) || ""),
    ucet: ucet.iban,
    mena: menaUctu,
    nastavenia: {
      banka,
      predkontaciaBanka: String(company?.pohoda_predkontacia_banka ?? "").trim() || null,
      predkontacieOznaceni: (company?.pohoda_predkontacie_oznaceni ?? {}) as Record<string, string>,
    } as any,
  });
}

/* ------------------------------------------------------------------ falošná databáza */

type Riadok = Record<string, any>;
function databaza(tabulky: Record<string, Riadok[]>) {
  const from = (t: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let rozsah: [number, number] | null = null;
    const poradie: string[] = [];
    let hlava = false;
    const q: any = {
      select: (_s?: string, o?: { head?: boolean }) => ((hlava = !!o?.head), q),
      eq: (k: string, v: any) => (filtre.push((r) => String(r[k]) === String(v)), q),
      in: (k: string, v: any[]) => (filtre.push((r) => v.map(String).includes(String(r[k]))), q),
      is: (k: string, v: null) => (filtre.push((r) => r[k] == v), q),
      not: (k: string, _o: string, _v: null) => (filtre.push((r) => r[k] != null), q),
      gte: (k: string, v: any) => (filtre.push((r) => String(r[k]) >= String(v)), q),
      lte: (k: string, v: any) => (filtre.push((r) => String(r[k]) <= String(v)), q),
      lt: (k: string, v: any) => (filtre.push((r) => String(r[k]) < String(v)), q),
      order: (k: string) => (poradie.push(k), q),
      range: (a: number, b: number) => ((rozsah = [a, b]), q),
      then: (ok: any, zle: any) => Promise.resolve(vykonaj()).then(ok, zle),
    };
    function vykonaj() {
      let out = (tabulky[t] ?? []).filter((r) => filtre.every((f) => f(r))).map((r) => ({ ...r }));
      out.sort((a, b) => {
        for (const k of poradie) {
          const c = String(a[k]).localeCompare(String(b[k]));
          if (c) return c;
        }
        return 0;
      });
      if (rozsah) out = out.slice(rozsah[0], rozsah[1] + 1);
      return { data: hlava ? null : out, error: null, count: out.length };
    }
    return q;
  };
  return { from };
}

const db = (txs: TransakciaBanky[], ucty: any[] = [UCET_TB, UCET_VUB], skratky = SKRATKY) =>
  databaza({
    bank_accounts: ucty.map((u) => ({ ...u, company_id: FIRMA })),
    company_bank_accounts: skratky.map((s) => ({ ...s, company_id: FIRMA })),
    bank_transactions: txs.map((t) => ({ ...t, company_id: FIRMA })),
    pravidla_uctovania: pravidla.map((p) => ({ ...p, company_id: FIRMA })),
  });

/* ------------------------------------------------------------------ výber */

describe("výber bankových pohybov", () => {
  const zaklad = {
    zapnute: true,
    ucty: [UCET_TB, UCET_VUB],
    skratkyFirmy: SKRATKY,
    pohodaBanka: "TB",
    transakcie: [...TXS, tx(9, UCET_VUB.id, "2026-10-04", 50)],
  };

  it("vypnuté posielanie = nič, ani hláška", () => {
    expect(vyberPohybovBanky({ ...zaklad, zapnute: false })).toEqual({ skupiny: [], bezSkratky: [], vybrane: [] });
  });

  it("účet bez skratky v POHODE sa preskočí a nahlási; spoločná skratka firmy pri viacerých účtoch neplatí", () => {
    const r = vyberPohybovBanky(zaklad);
    expect(r.vybrane.map((t) => t.bank_account_id)).toEqual([UCET_TB.id, UCET_TB.id, UCET_TB.id, UCET_TB.id]);
    expect(r.bezSkratky.map((u) => u.id)).toEqual([UCET_VUB.id]);
    expect(r.skupiny).toHaveLength(1);
    expect(r.skupiny[0]).toMatchObject({ skratka: "TB", mesiac: "2026-10" });
  });

  it("jediný účet firmy smie ísť pod spoločnou skratkou (Prepojenie s Pohodou)", () => {
    expect(skratkaUctuVPohode(UCET_VUB, [], "TB", 1)).toBe("TB");
    expect(skratkaUctuVPohode(UCET_VUB, [], "TB", 2)).toBeNull();
    expect(skratkaUctuVPohode(UCET_VUB, [], "", 1)).toBeNull();
  });

  it("odovzdaný a práve odoslaný (na ceste) pohyb nejde; strop dávky", () => {
    const t = [...TXS];
    t[0] = { ...t[0]!, exported_at: "2026-11-01T00:00:00Z" };
    const r = vyberPohybovBanky({ ...zaklad, transakcie: t, naCeste: new Set([TXS[1]!.id]) });
    expect(r.vybrane.map((x) => x.id)).toEqual([TXS[2]!.id, TXS[3]!.id]);
    expect(vyberPohybovBanky({ ...zaklad, strop: 2 }).vybrane).toHaveLength(2);
  });

  it("pohyby sa delia na výpisy po účte a mesiaci", () => {
    const r = vyberPohybovBanky({
      ...zaklad,
      skratkyFirmy: [...SKRATKY, { iban: UCET_VUB.iban, pohoda_skratka: "VUB" }],
      transakcie: [...TXS, tx(10, UCET_TB.id, "2026-11-02", 5), tx(9, UCET_VUB.id, "2026-10-04", 50)],
    });
    expect(r.skupiny.map((s) => [s.skratka, s.mesiac, s.transakcie.length])).toEqual([
      ["TB", "2026-10", 4],
      ["VUB", "2026-10", 1],
      ["TB", "2026-11", 1],
    ]);
  });

  it("dátum výpisu je koniec mesiaca, najneskôr dnes", () => {
    expect(koniecMesiaca("2026-02-10")).toBe("2026-02-28");
    expect(datumVypisuSkupiny("2026-10", "2026-11-16")).toBe("2026-10-31");
    expect(datumVypisuSkupiny("2026-11", "2026-11-16")).toBe("2026-11-16");
  });
});

/* ------------------------------------------------------------------ databáza → položky */

describe("bankaPreDavku", () => {
  const dnes = new Date("2026-11-16T08:00:00Z");

  it("vypnuté posielanie = nič", async () => {
    const r = await bankaPreDavku(db(TXS) as any, { company: { ...firma, pohoda_posielat_banku: false }, od: "2026-10-01", dnes });
    expect(r).toEqual({ entries: "", zaznamy: [], hlasky: [], skupiny: [] });
  });

  it("vyberie neodovzdané pohyby účtov so skratkou, ostatné preskočí s hláškou", async () => {
    const t = [...TXS, tx(9, UCET_VUB.id, "2026-10-04", 50), tx(11, UCET_TB.id, "2026-09-30", 1)];
    t[1] = { ...t[1]!, exported_at: "2026-11-01T00:00:00Z" };
    const r = await bankaPreDavku(db(t) as any, { company: firma, od: "2026-10-01", naCeste: new Set([TXS[3]!.id]), dnes });
    expect(r.zaznamy.map((z) => z.id)).toEqual([TXS[0]!.id, TXS[2]!.id]);
    expect(idPoloziekDavky(`<x>${r.entries}</x>`)).toEqual([`BNK-${TXS[0]!.id}`, `BNK-${TXS[2]!.id}`]);
    expect(r.hlasky).toEqual([
      "Banka — účet VÚB (SK8902000000001234567890) nemá skratku v Pohode, jeho pohyby sa neposielajú — doplňte ju vo Firma → Bankové účty",
    ]);
    // Poradie pohybu je poradie v mesačnom výpise (aj s odovzdaným a odoslaným).
    // Odovzdaný pohyb má číslo 1, nové pokračujú za ním (2, 3) — číslo dokladu v POHODE sa nesmie opakovať.
    expect(r.entries).toMatch(/<bnk:numberMovement>2<\/bnk:numberMovement>[\s\S]*<bnk:numberMovement>3<\/bnk:numberMovement>/);
    expect(r.entries).not.toMatch(/<bnk:numberMovement>1<\/bnk:numberMovement>/);
    expect(r.entries).toContain("<typ:ids>TB</typ:ids>");
    // Pravidlo pre banku (Orange → 5Tel) ako v ručnom XML.
    expect(r.entries).toContain("<typ:ids>5Tel</typ:ids>");
  });

  it("konektor za celý mesiac = tie isté položky ako ručné „XML pre POHODU“ za ten mesiac", async () => {
    const r = await bankaPreDavku(db(TXS) as any, { company: firma, od: "2026-10-01", dnes });
    const rucne = staraCesta(firma, UCET_TB, TXS, pravidla, { period_end: "2026-10-31" }, "TB");
    const polozky = (x: string) => [...x.matchAll(/<dat:dataPackItem\b[\s\S]*?<\/dat:dataPackItem>/g)].map((m) => m[0]);
    expect(polozky(r.entries)).toEqual(polozky(rucne));
    expect(polozky(r.entries)).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ ručné XML: zhoda so starou cestou */

describe("ručné „XML pre POHODU“ po zjednotení", () => {
  it("dá bajt po bajte to isté XML ako pôvodná cesta (EUR, pravidlá, označenie, KS/ŠS, zahraničný IBAN)", async () => {
    const novy = await xmlVypisuPrePohodu({
      company: firma,
      ucet: UCET_TB,
      txs: TXS,
      pravidla,
      banka: "TB",
      periodEnd: "2026-10-31",
    });
    expect(novy).toBe(staraCesta(firma, UCET_TB, TXS, pravidla, { period_end: "2026-10-31" }, "TB"));
    // Zahraničný IBAN ide do internej poznámky, KS a ŠS z textu.
    expect(novy).toContain("Protiúčet: DE89370400440532013000");
    expect(novy).toContain("<bnk:symConst>0308</bnk:symConst>");
  });

  it("aj účet v cudzej mene s kurzom ku dňu", async () => {
    const txs = [
      tx(21, UCET_CZK.id, "2026-10-05", 1000, { currency: "CZK" }),
      tx(22, UCET_CZK.id, "2026-10-06", -300, { currency: "CZK" }),
    ];
    const novy = await xmlVypisuPrePohodu({ company: firma, ucet: UCET_CZK, txs, pravidla: [], banka: "TBCZK", periodEnd: "2026-10-31" });
    const kurzy = new Map<string, number | null>([
      ["2026-10-05", 24.312],
      ["2026-10-06", 24.4],
    ]);
    expect(novy).toBe(staraCesta(firma, UCET_CZK, txs, [], { period_end: "2026-10-31" }, "TBCZK", kurzy));
    expect(novy).toContain("<bnk:foreignCurrency>");
  });
});

/* ------------------------------------------------------------------ dávka */

describe("dávka konektora s bankovými pohybmi", () => {
  const FA = "11111111-1111-1111-1111-111111111111";
  const POK = "44444444-4444-4444-4444-444444444444";
  const ZR = "33333333-3333-3333-3333-333333333333";
  const faktura: any = {
    id: FA,
    invoice_number: "20260001",
    type: "regular",
    issue_date: "2026-10-03",
    delivery_date: "2026-10-03",
    due_date: "2026-10-17",
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: "Odberateľ s.r.o.",
  };
  const polozka = { name: "Práca", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 };
  const pokladna: any = { id: POK, entry_number: "P1", entry_date: "2026-10-05", type: "prijem", amount: 20, description: "Tržba" };

  async function davka() {
    const r = await bankaPreDavku(db(TXS) as any, { company: firma, od: "2026-10-01", dnes: new Date("2026-11-16T08:00:00Z") });
    return buildPohodaDavkaXml({
      likvidacia: polozkyAutomatickejLikvidacie(likvidaciePreSkupiny(r.skupiny, "2026-11-16"), PRAVIDLO_PAROVANIA_ID),
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] as any }],
      doklady: [],
      pohyby: [pokladna],
      storna: [{ id: ZR, cislo: "260148" }],
      nastavenia: { pokladna: "HP" } as any,
      banka: r.entries,
    });
  }

  it("banka ide za faktúrami a pokladňou, za ňou likvidácia, potom storno", async () => {
    const ids = idPoloziekDavky(await davka());
    expect(ids[0]).toBe(FA);
    expect(ids[1]).toBe(POK);
    expect(ids.slice(2, 6)).toEqual(TXS.map((t) => `BNK-${t.id}`));
    expect(ids[6]).toMatch(/^LQD-TB-2026-11-16-[0-9a-f]{8}$/);
    expect(ids[7]).toBe(`${ZR}-storno`);
  });

  it("prejde schémou Stormware (data.xsd s bank.xsd a automaticLiquidation.xsd)", async () => {
    const xml = await davka();
    expect(xml).toContain('xmlns:bnk="http://www.stormware.cz/schema/version_2/bank.xsd"');
    expect(xml).toContain('xmlns:lqd="http://www.stormware.cz/schema/version_2/automaticLiquidation.xsd"');
    // Filter na dátum bankového dokladu: od začiatku najstaršieho mesiaca do dnes, pravidlo id 1.
    expect(xml).toContain("<ftr:bankAccount><typ:ids>TB</typ:ids></ftr:bankAccount>");
    expect(xml).toContain("<ftr:dateFrom>2026-10-01</ftr:dateFrom>");
    expect(xml).toContain("<ftr:dateTill>2026-11-16</ftr:dateTill>");
    expect(xml).toContain("<lqd:ruleOfPairing><typ:id>1</typ:id></lqd:ruleOfPairing>");
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("bez bankových pohybov sa dávka nemení (žiadny menný priestor navyše)", () => {
    const bez = buildPohodaDavkaXml({ company: firma, invoices: [{ invoice: faktura, items: [polozka] as any }], doklady: [], pohyby: [] });
    expect(bez).not.toContain("bank.xsd");
    expect(bez).toBe(
      buildPohodaDavkaXml({ company: firma, invoices: [{ invoice: faktura, items: [polozka] as any }], doklady: [], pohyby: [], banka: "" }),
    );
  });

  it("predkontácie bankových pohybov sa neprekladajú (zhodné s ručným XML)", () => {
    const entries = polozkyBankovehoVypisu({
      company: firma,
      pohyby: [{ id: TXS[0]!.id, datum: "2026-10-03", suma: 1, smer: "prijem", predkontacia: "221/311" }],
      nastavenia: { banka: "TB" } as any,
    });
    const xml = buildPohodaDavkaXml({
      company: firma,
      invoices: [],
      doklady: [],
      pohyby: [],
      nastavenia: { mapaPredkontacii: { "221/311": "XX" } } as any,
      banka: entries,
    });
    expect(xml).toContain("<typ:ids>221/311</typ:ids>");
  });
});

/* ------------------------------------------------------------------ automatická likvidácia */

describe("automatická likvidácia", () => {
  const skupiny = [
    { skratka: "TABe", mesiac: "2026-11", transakcie: [{ id: "a" }] },
    { skratka: "TABe", mesiac: "2026-10", transakcie: [{ id: "b" }] },
    { skratka: "VUB-SK", mesiac: "2026-11", transakcie: [{ id: "c" }] },
  ];

  it("jedna na účet, od najstaršieho mesiaca do dnes; id rozlíši dávky toho istého dňa", () => {
    const l = likvidaciePreSkupiny(skupiny, "2026-11-16");
    expect(l.map((x) => [x.skratka, x.od, x.do])).toEqual([
      ["TABe", "2026-10-01", "2026-11-16"],
      ["VUB-SK", "2026-11-01", "2026-11-16"],
    ]);
    expect(l[0]!.id).toMatch(/^LQD-TABe-2026-11-16-[0-9a-f]{8}$/);
    expect(idLikvidacie("TABe", "2026-11-16", ["a", "b"])).toBe(idLikvidacie("TABe", "2026-11-16", ["b", "a"]));
    expect(idLikvidacie("TABe", "2026-11-16", ["a"])).not.toBe(idLikvidacie("TABe", "2026-11-16", ["a", "b"]));
    expect(skratkaZIdLikvidacie(l[1]!.id)).toBe("VUB-SK");
  });

  it("odpoveď spočíta spárované a pohyby bez dokladu; ostatné položky ignoruje", () => {
    const xml = `<rsp:responsePack state="ok">
      <rsp:responsePackItem id="BNK-x" state="ok"><bnk:bankResponse state="ok"/></rsp:responsePackItem>
      <rsp:responsePackItem version="2.0" id="LQD-TABe-2026-11-16-00aa11bb" state="ok">
        <lqd:automaticLiquidationResponse version="2.0" state="ok"><lqd:automaticLiquidationDetails>
          <lqd:automaticLiquidationDetail><lqd:movementDetail><lqd:number>TABe111</lqd:number></lqd:movementDetail>
            <lqd:liquidationDetail><lqd:state>ok</lqd:state><lqd:documents><lqd:document><lqd:state>ok</lqd:state><lqd:number>K101c001</lqd:number></lqd:document></lqd:documents></lqd:liquidationDetail>
          </lqd:automaticLiquidationDetail>
          <lqd:automaticLiquidationDetail><lqd:movementDetail><lqd:number>TABe113</lqd:number></lqd:movementDetail>
            <lqd:liquidationDetail><lqd:state>warning</lqd:state><lqd:detail>K pohybu č. TABe113 nenájdený doklad (VS = 1)</lqd:detail></lqd:liquidationDetail>
          </lqd:automaticLiquidationDetail>
        </lqd:automaticLiquidationDetails></lqd:automaticLiquidationResponse>
      </rsp:responsePackItem></rsp:responsePack>`;
    expect(rozoberLikvidaciu(xml)).toEqual([
      { id: "LQD-TABe-2026-11-16-00aa11bb", skratka: "TABe", prijata: true, poznamka: null, sparovane: 1, bezDokladu: 1 },
    ]);
  });
});

describe("poradiePokracovanim", () => {
  it("odovzdané si nechajú 1…E, nové pokračujú v poradí príchodu (aj s rovnakým dňom)", async () => {
    const { poradiePokracovanim } = await import("./banka-pohoda");
    const m = poradiePokracovanim([
      { id: "a", booking_date: "2026-11-15", exported_at: "x", created_at: "2026-11-15T08:00:00Z" },
      { id: "b", booking_date: "2026-11-15", exported_at: "x", created_at: "2026-11-15T08:00:00Z" },
      { id: "0", booking_date: "2026-11-15", exported_at: null, created_at: "2026-11-16T09:00:00Z" },
      { id: "c", booking_date: "2026-11-14", exported_at: null, created_at: "2026-11-16T09:00:01Z" },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(3);
    expect(m.get("0")).toBe(4);
  });
});

/* ------------------------------------------------------------------ zarovnané čísla, likvidácia v ručnom XML, údaje z faktúry */

describe("nový formát výpisu (010/0001) od novembra 2026", () => {
  it("staré obdobie a mesiac odovzdaný po starom ostávajú; nové obdobie zarovnané", () => {
    expect(zarovnaneCislaVypisu("2026-10")).toBe(false);
    expect(zarovnaneCislaVypisu("2026-11")).toBe(true);
    expect(zarovnaneCislaVypisu("2026-12", [null, "2026-12-03T02:00:00+00:00"])).toBe(true);
    // Pohyb, ktorý odišiel starým kódom, drží celý mesiac po starom.
    expect(zarovnaneCislaVypisu("2026-11", [null, "2026-11-16T02:45:09.902+00:00"])).toBe(false);
    expect(zarovnaneCislaVypisu("2026-11", ["2026-11-16 02:45:09+00"])).toBe(false);
    expect(cisloVypisuZDatumu("2026-10-31")).toBe("10");
    expect(cisloVypisuZDatumu("2026-11-30", true)).toBe("011");
    expect(cisloVypisuZDatumu("2026-10-31", true)).toBe("010");
  });

  const NOV = [
    tx(31, UCET_TB.id, "2026-11-03", 123, { variable_symbol: "20260001", counterparty: "Odberateľ s.r.o.", counterparty_iban: "SK6807200002891987426353" }),
    tx(32, UCET_TB.id, "2026-11-05", -2.5, { description: "Poplatok za vedenie účtu" }),
  ];

  it("ručné XML za november: 011/0001 a automatická likvidácia ako v konektore — prejde schémou", async () => {
    const x = await xmlVypisuPrePohodu({ company: firma, ucet: UCET_TB, txs: NOV, pravidla, banka: "TB", periodEnd: "2026-11-30", dnes: "2026-12-02" });
    expect(x).toContain("<bnk:statementNumber>011</bnk:statementNumber>");
    expect(x).toContain("<bnk:numberMovement>0001</bnk:numberMovement>");
    expect(x).toContain("<bnk:numberMovement>0002</bnk:numberMovement>");
    expect(x).toContain("<lqd:automaticLiquidation");
    expect(x).toContain("<ftr:dateFrom>2026-11-01</ftr:dateFrom>");
    expect(x).toContain("<ftr:dateTill>2026-12-02</ftr:dateTill>");
    expect(x).toContain(`<lqd:ruleOfPairing><typ:id>${PRAVIDLO_PAROVANIA_ID}</typ:id></lqd:ruleOfPairing>`);
    expect(x).toMatch(/xmlns:lqd=.*automaticLiquidation\.xsd/);
    expect(x).toMatch(/xmlns:ftr=.*filter\.xsd/);
    expect(await chybaXsd(x)).toBeNull();
  });

  it("overovačka schémy chybu naozaj nájde (nezmysel v likvidácii)", async () => {
    const x = await xmlVypisuPrePohodu({ company: firma, ucet: UCET_TB, txs: NOV, pravidla, banka: "TB", periodEnd: "2026-11-30", dnes: "2026-12-02" });
    const zle = x.replace("<lqd:ruleOfPairing>", "<lqd:nezmysel>1</lqd:nezmysel><lqd:ruleOfPairing>");
    expect(await chybaXsd(zle)).not.toBeNull();
    // Aj sedemnásťmiestne poradie (viac než 10 znakov s číslom výpisu) schéma odmietne.
    const dlhe = x.replace("<bnk:numberMovement>0001</bnk:numberMovement>", "<bnk:numberMovement>00000000001</bnk:numberMovement>");
    expect(await chybaXsd(dlhe)).not.toBeNull();
  });

  it("ručné XML za október ostáva bez likvidácie a so starými číslami", async () => {
    const x = await xmlVypisuPrePohodu({ company: firma, ucet: UCET_TB, txs: TXS, pravidla, banka: "TB", periodEnd: "2026-10-31", dnes: "2026-12-02" });
    expect(x).not.toContain("automaticLiquidation");
    expect(x).toContain("<bnk:statementNumber>10</bnk:statementNumber>");
    expect(x).toContain("<bnk:numberMovement>1</bnk:numberMovement>");
  });

  it("ručné XML za mesiac, ktorý konektor už poslal po starom, čísla nemení", async () => {
    const txs = NOV.map((t, i) => (i === 0 ? { ...t, exported_at: "2026-11-16T02:45:09Z" } : t));
    const x = await xmlVypisuPrePohodu({ company: firma, ucet: UCET_TB, txs, pravidla, banka: "TB", periodEnd: "2026-11-30", dnes: "2026-12-02" });
    expect(x).toContain("<bnk:statementNumber>11</bnk:statementNumber>");
    expect(x).toContain("<bnk:numberMovement>1</bnk:numberMovement>");
  });

  it("konektor: nový mesiac 011/000N, pokračovanie za pohybom odovzdaným po novom", async () => {
    const r = await bankaPreDavku(db(NOV) as any, { company: firma, od: "2026-11-01", dnes: new Date("2026-11-20T08:00:00Z") });
    expect(r.entries).toContain("<bnk:statementNumber>011</bnk:statementNumber>");
    expect(r.entries).toContain("<bnk:numberMovement>0001</bnk:numberMovement>");
    expect(r.entries).toContain("<bnk:numberMovement>0002</bnk:numberMovement>");
    const poNovom = NOV.map((t, i) => (i === 0 ? { ...t, exported_at: "2026-11-20T03:00:00Z" } : t));
    const r2 = await bankaPreDavku(db(poNovom) as any, { company: firma, od: "2026-11-01", dnes: new Date("2026-11-21T08:00:00Z") });
    expect(r2.entries).toContain("<bnk:statementNumber>011</bnk:statementNumber>");
    expect(r2.entries).toContain("<bnk:numberMovement>0002</bnk:numberMovement>");
    expect(r2.entries).not.toContain("<bnk:numberMovement>0001</bnk:numberMovement>");
    const x = buildPohodaDavkaXml({
      company: firma,
      invoices: [],
      doklady: [],
      pohyby: [],
      nastavenia: {} as any,
      banka: r.entries,
      likvidacia: polozkyAutomatickejLikvidacie(likvidaciePreSkupiny(r.skupiny, "2026-11-20"), PRAVIDLO_PAROVANIA_ID),
    } as any);
    expect(await chybaXsd(x)).toBeNull();
  });

  it("konektor: mesiac odovzdaný po starom pokračuje po starom (odovzdaný pohyb sa neprečísluje)", async () => {
    const poStarom = NOV.map((t, i) => (i === 0 ? { ...t, exported_at: "2026-11-16T02:45:09Z" } : t));
    const r = await bankaPreDavku(db(poStarom) as any, { company: firma, od: "2026-11-01", dnes: new Date("2026-11-21T08:00:00Z") });
    expect(r.entries).toContain("<bnk:statementNumber>11</bnk:statementNumber>");
    expect(r.entries).toContain("<bnk:numberMovement>2</bnk:numberMovement>");
  });
});

describe("pohyb spárovaný s faktúrou", () => {
  it("doplní partnera, VS a text z faktúry, keď ich pohyb nemá", () => {
    const p = pohybZTransakcie(tx(41, UCET_TB.id, "2026-11-04", 123), {
      pravidla: [],
      iban: UCET_TB.iban,
      kurz: null,
      doklad: { typ: "FV", cislo: "20260001", vs: null, partner: "Odberateľ s.r.o." },
    });
    expect(p).toMatchObject({ protistrana: "Odberateľ s.r.o.", vs: "20260001", popis: "Úhrada FV č. 20260001" });
    const q = pohybZTransakcie(tx(42, UCET_TB.id, "2026-11-04", -245.6), {
      pravidla: [],
      iban: UCET_TB.iban,
      kurz: null,
      doklad: { typ: "FP", cislo: "FA-2026/15", vs: "202615", partner: "AUTOGLAS, s.r.o." },
    });
    expect(q).toMatchObject({ protistrana: "AUTOGLAS, s.r.o.", vs: "202615", popis: "Úhrada FP č. FA-2026/15" });
  });

  it("vlastné údaje pohybu sa neprepisujú; nečíselné číslo faktúry nie je VS", () => {
    const p = pohybZTransakcie(
      tx(43, UCET_TB.id, "2026-11-04", 50, { counterparty: "Banka", variable_symbol: "111", description: "Platba" }),
      { pravidla: [], iban: UCET_TB.iban, kurz: null, doklad: { typ: "FV", cislo: "20260009", vs: "20260009", partner: "Iný" } },
    );
    expect(p).toMatchObject({ protistrana: "Banka", vs: "111", popis: "Platba" });
    const q = pohybZTransakcie(tx(44, UCET_TB.id, "2026-11-04", 50), {
      pravidla: [],
      iban: UCET_TB.iban,
      kurz: null,
      doklad: { typ: "FV", cislo: "FA-7", vs: null, partner: null },
    });
    expect(q.vs).toBeNull();
    expect(q.popis).toBe("Úhrada FV č. FA-7");
  });

  it("konektor si spárovanú faktúru načíta sám (matched_invoice_id / matched_purchase_invoice_id)", async () => {
    const txs = [
      tx(51, UCET_TB.id, "2026-11-03", 123, { matched_invoice_id: "inv-1" } as any),
      tx(52, UCET_TB.id, "2026-11-04", -99, { matched_purchase_invoice_id: "pi-1" } as any),
    ];
    const d = databaza({
      bank_accounts: [UCET_TB].map((u) => ({ ...u, company_id: FIRMA })),
      company_bank_accounts: SKRATKY.map((s) => ({ ...s, company_id: FIRMA })),
      bank_transactions: txs.map((t) => ({ ...t, company_id: FIRMA })),
      pravidla_uctovania: [],
      invoices: [{ id: "inv-1", invoice_number: "20260077", variable_symbol: "20260077", customer_name: "Odberateľ s.r.o." }],
      purchase_invoices: [{ id: "pi-1", invoice_number: "260101873", variable_symbol: null, supplier_name: "AUTOGLAS, s.r.o." }],
    });
    const r = await bankaPreDavku(d as any, { company: firma, od: "2026-11-01", dnes: new Date("2026-11-20T08:00:00Z") });
    expect(r.entries).toContain("<bnk:text>Úhrada FV č. 20260077</bnk:text>");
    expect(r.entries).toContain("<bnk:symVar>20260077</bnk:symVar>");
    expect(r.entries).toContain("<bnk:text>Úhrada FP č. 260101873</bnk:text>");
    expect(r.entries).toContain("<typ:company>AUTOGLAS, s.r.o.</typ:company>");
    expect(r.entries).toContain("<bnk:symVar>260101873</bnk:symVar>");
  });
});
