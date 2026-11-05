import { describe, expect, it } from "vitest";
import {
  navrhOpravy,
  noveZUlozenehoAi,
  ochrany,
  rozpisZAiDo20261105,
  rucnaUprava,
  terminPodania,
  ulozenyStav,
  vyhodnot,
  type FirmaOpravy,
} from "./oprava-rozpisu-dph";

const firma: FirmaOpravy = { id: "f1", name: "Test", country: "SK", locked_until: null };

/** Fixture 1 (RISS Plus): 26,90 pri 0 % + 116,87 pri 23 % / 26,88; uložené ako jedna sadzba. */
const prijata1 = {
  id: "p1",
  company_id: "f1",
  source: "mail",
  file_path: "f1/p1.pdf",
  type: "regular",
  issue_date: "2026-10-30",
  delivery_date: "2026-10-30",
  received_date: "2026-11-03",
  amount_without_vat: 143.77,
  vat_amount: 26.88,
  amount_total: 170.65,
  items: null,
  created_at: "2026-11-03T10:00:00Z",
  updated_at: "2026-11-03T10:00:00Z",
};

/** Fixture 2: 360,00 nie je predmetom DPH + 24,39 pri 23 % / 5,61. */
const blocek2 = {
  id: "e2",
  company_id: "f1",
  source: "upload",
  status: "processed",
  file_path: "f1/e2.pdf",
  issue_date: "2026-10-20",
  net_amount: 384.39,
  vat_amount: 5.61,
  total_amount: 390,
  vat_rate: 1.46,
  vat_breakdown: [{ sadzba: 1.46, zaklad: 384.39, dph: 5.61 }],
  items: null,
  ai_raw: { amount_without_vat: 384.39, vat_amount: 5.61, amount_total: 390 },
  created_at: "2026-10-21T10:00:00Z",
  updated_at: "2026-10-21T10:00:00Z",
};

describe("vyhodnot — uložený stav", () => {
  it("fixture 1: pomer 18,7 % → 19 % neprejde kontrolou", () => {
    const st = ulozenyStav("purchase_invoices", prijata1, firma);
    expect(st.rozpis).toEqual([{ sadzba: 19, zaklad: 143.77, dph: 26.88 }]);
    const v = vyhodnot(st);
    expect(v.stav).toBe("chybny");
    expect(v.kontrola.chyby.map((c) => c.kod)).toContain("riadok_dph");
  });

  it("fixture 2: sadzba 1,46 % mimo povolených (bod 8) aj efektívna sadzba (bod 9)", () => {
    const v = vyhodnot(ulozenyStav("expense_documents", blocek2, firma));
    expect(v.stav).toBe("chybny");
    expect(v.kontrola.chyby.map((c) => c.kod)).toContain("neplatna_sadzba");
    expect(v.podozrenia.map((p) => p.kod)).toContain("efektivna_sadzba");
  });

  it("0 % bez kategórie ide na kontrolu (bod 10), s kategóriou je v poriadku", () => {
    const b = { ...blocek2, net_amount: 360, vat_amount: 0, total_amount: 360, vat_rate: 0 };
    expect(
      vyhodnot(
        ulozenyStav(
          "expense_documents",
          { ...b, vat_breakdown: [{ sadzba: 0, zaklad: 360, dph: 0 }] },
          firma,
        ),
      ).kontrola.chyby.map((c) => c.kod),
    ).toContain("neplatna_kategoria");
    expect(
      vyhodnot(
        ulozenyStav(
          "expense_documents",
          {
            ...b,
            vat_breakdown: [{ sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" }],
          },
          firma,
        ),
      ).stav,
    ).toBe("ok");
  });

  it("prijatá s položkami netto, ktoré sedia, je v poriadku", () => {
    const p = {
      ...prijata1,
      items: [
        { name: "a", vat_rate: 23, total: 91.41, quantity: 1 },
        { name: "b", vat_rate: 0, total: 26.9, quantity: 1, vat_category: "exempt" },
        { name: "c", vat_rate: 23, total: 6.26, quantity: 1 },
        { name: "d", vat_rate: 23, total: 19.2, quantity: 1 },
      ],
    };
    const v = vyhodnot(ulozenyStav("purchase_invoices", p, firma));
    expect(v.kontrola.ok).toBe(true);
  });

  it("prijatá s `vat_breakdown` (nový stĺpec) — rozpis z neho, aj kategória", () => {
    const p = {
      ...prijata1,
      vat_breakdown: [
        { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "out_of_scope" },
        { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
      ],
    };
    const st = ulozenyStav("purchase_invoices", p, firma);
    expect(st.rozpis).toHaveLength(2);
    expect(vyhodnot(st).stav).toBe("ok");
  });
});

describe("ochrany", () => {
  const st = ulozenyStav("purchase_invoices", prijata1, firma);
  const nie = { stav: "nie" as const, dovod: "" };
  it("odovzdaný, zamknutý, zmazaný, uzavreté obdobie", () => {
    expect(
      ochrany({
        tabulka: "purchase_invoices",
        row: { ...prijata1, exported_at: "x" },
        firma,
        stav: st,
        rucne: nie,
        dnes: "2026-11-05",
      }),
    ).toContain("odovzdany");
    expect(
      ochrany({
        tabulka: "purchase_invoices",
        row: prijata1,
        firma: { ...firma, locked_until: "2026-10-31" },
        stav: st,
        rucne: nie,
        dnes: "2026-11-05",
      }),
    ).toContain("uzavrete_obdobie");
  });
  it("obdobie po termíne priznania (25. nasledujúceho mesiaca)", () => {
    expect(terminPodania("2026-10-15")).toBe("2026-11-25");
    expect(terminPodania("2026-12-01")).toBe("2027-01-25");
    const s = {
      ...prijata1,
      received_date: "2026-09-10",
      delivery_date: "2026-09-01",
      issue_date: "2026-09-01",
    };
    const o = ochrany({
      tabulka: "purchase_invoices",
      row: s,
      firma,
      stav: st,
      rucne: nie,
      dnes: "2026-11-05",
    });
    expect(o).toContain("obdobie_po_termine");
    expect(
      ochrany({
        tabulka: "purchase_invoices",
        row: s,
        firma,
        stav: st,
        rucne: nie,
        dnes: "2026-11-05",
        ajPoTermine: true,
      }),
    ).not.toContain("obdobie_po_termine");
  });
  it("eFaktúra a ručný zápis nie sú z vyťaženia", () => {
    expect(
      ochrany({
        tabulka: "purchase_invoices",
        row: { ...prijata1, source: "efaktura" },
        firma,
        stav: st,
        rucne: nie,
        dnes: "2026-11-05",
      }),
    ).toContain("nie_z_vytazenia");
  });
});

describe("rucnaUprava — heuristika", () => {
  it("príznak", () => {
    expect(
      rucnaUprava("purchase_invoices", { ...prijata1, rucne_upravene_at: "2026-11-04T10:00:00Z" })
        .stav,
    ).toBe("ano");
  });
  it("história: zmena sumy človekom / appkou; automat a systém nie", () => {
    expect(
      rucnaUprava("purchase_invoices", prijata1, [
        { pole: "vat_amount", kto: "u1", kto_typ: "clovek", kedy: "2026-11-04" },
      ]).stav,
    ).toBe("ano");
    expect(
      rucnaUprava("purchase_invoices", prijata1, [
        { pole: "vat_amount", kto: null, kto_typ: "system", kedy: "2026-11-04" },
      ]).stav,
    ).toBe("nie");
    // starý záznam bez typu, so známym kto = človek
    expect(
      rucnaUprava("purchase_invoices", prijata1, [
        { pole: "items", kto: "u1", kto_typ: null, kedy: "2026-10-10" },
      ]).stav,
    ).toBe("ano");
    // zmena iného poľa sa nepočíta
    expect(
      rucnaUprava("purchase_invoices", prijata1, [
        { pole: "status", kto: "u1", kto_typ: "clovek", kedy: "2026-10-10" },
      ]).stav,
    ).toBe("nie");
  });
  it("bloček: suma sa líši od ai_raw", () => {
    expect(rucnaUprava("expense_documents", { ...blocek2, total_amount: 400 }).stav).toBe("ano");
    expect(rucnaUprava("expense_documents", blocek2).stav).toBe("nie");
  });
  it("doklad spred histórie, menený po vytvorení → neisté", () => {
    expect(
      rucnaUprava("purchase_invoices", {
        ...prijata1,
        created_at: "2026-09-01T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
      }).stav,
    ).toBe("neiste");
    expect(
      rucnaUprava("purchase_invoices", {
        ...prijata1,
        created_at: "2026-09-01T10:00:00Z",
        updated_at: "2026-09-01T10:01:00Z",
      }).stav,
    ).toBe("nie");
  });
  it("Nespracované: rozpis zo starého aj nového výpočtu = nie, iný = áno", () => {
    const ai = { amount_without_vat: 143.77, vat_amount: 26.88, amount_total: 170.65 };
    const stary = rozpisZAiDo20261105(ai);
    expect(stary).toEqual([{ sadzba: 19, zaklad: 143.77, dph: 26.88 }]);
    expect(
      rucnaUprava("nespracovane_doklady", { id: "n1", ai, udaje: { rozpis: stary } }).stav,
    ).toBe("nie");
    expect(
      rucnaUprava("nespracovane_doklady", {
        id: "n1",
        ai,
        udaje: {
          rozpis: [
            { sadzba: 0, zaklad: 26.9, dph: 0 },
            { sadzba: 23, zaklad: 116.87, dph: 26.88 },
          ],
        },
      }).stav,
    ).toBe("ano");
  });
});

describe("navrhOpravy", () => {
  const nove1 = {
    ai: { x: 1 },
    rozpis: [
      { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "exempt" },
      { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
    ],
    spolu: 170.65,
    prenesenie: false,
  };

  it("fixture 1: prepíše rozpis prijatej, sumy ostanú, celková sa nemení", () => {
    const st = ulozenyStav("purchase_invoices", prijata1, firma);
    const n = navrhOpravy({ tabulka: "purchase_invoices", row: prijata1, stav: st, nove: nove1 });
    expect(n.akcia).toBe("prepisat");
    if (n.akcia !== "prepisat") return;
    expect(n.zmeny.vat_breakdown).toEqual([
      { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "exempt" },
      { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
    ]);
    expect(n.zmeny.amount_without_vat).toBe(143.77);
    expect(n.zmeny.vat_amount).toBe(26.88);
    expect(n.zmeny).not.toHaveProperty("amount_total");
    // nezaúčtovaná ide späť do fronty automatického zaúčtovania
    expect(n.zmeny.auto_uctovanie_at).toBeNull();
  });

  it("dobropis: rozpis so znamienkom dokladu", () => {
    const d = {
      ...prijata1,
      amount_without_vat: -143.77,
      vat_amount: -26.88,
      amount_total: -170.65,
    };
    const n = navrhOpravy({
      tabulka: "purchase_invoices",
      row: d,
      stav: ulozenyStav("purchase_invoices", d, firma),
      nove: nove1,
    });
    expect(n.akcia).toBe("prepisat");
    if (n.akcia === "prepisat") {
      expect(n.zmeny.amount_without_vat).toBe(-143.77);
      expect((n.zmeny.vat_breakdown as any[])[1].dph).toBe(-26.88);
    }
  });

  it("iná celková suma → na kontrolu", () => {
    const n = navrhOpravy({
      tabulka: "purchase_invoices",
      row: prijata1,
      stav: ulozenyStav("purchase_invoices", prijata1, firma),
      nove: { ...nove1, spolu: 180 },
    });
    expect(n.akcia).toBe("na_kontrolu");
  });

  it("nové vyťaženie s 0 % bez kategórie → na kontrolu (bod 10)", () => {
    const n = navrhOpravy({
      tabulka: "purchase_invoices",
      row: prijata1,
      stav: ulozenyStav("purchase_invoices", prijata1, firma),
      nove: { ...nove1, rozpis: [{ sadzba: 0, zaklad: 26.9, dph: 0 }, nove1.rozpis[1]!] },
    });
    expect(n.akcia).toBe("na_kontrolu");
  });

  it("zle vyčítané položky prijatej idú do polozky_vypnute", () => {
    const p = { ...prijata1, items: [{ name: "všetko", vat_rate: 19, total: 170.65 }] };
    const n = navrhOpravy({
      tabulka: "purchase_invoices",
      row: p,
      stav: ulozenyStav("purchase_invoices", p, firma),
      nove: nove1,
    });
    expect(n.akcia).toBe("prepisat");
    if (n.akcia === "prepisat") {
      expect(n.zmeny.items).toBeNull();
      expect(n.zmeny.polozky_vypnute).toEqual(p.items);
    }
  });

  it("rozúčtovaný doklad → na kontrolu", () => {
    const p = { ...prijata1, rozuctovanie: [{ suma: 100 }] };
    expect(
      navrhOpravy({
        tabulka: "purchase_invoices",
        row: p,
        stav: ulozenyStav("purchase_invoices", p, firma),
        nove: nove1,
      }).akcia,
    ).toBe("na_kontrolu");
  });

  it("fixture 2: bloček opravený z nového vyťaženia — 360 mimo DPH + 23 %", () => {
    const st = ulozenyStav("expense_documents", blocek2, firma);
    const n = navrhOpravy({
      tabulka: "expense_documents",
      row: blocek2,
      stav: st,
      nove: {
        ai: { nove: true },
        rozpis: [
          { sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" },
          { sadzba: 23, zaklad: 24.39, dph: 5.61, vat_category: "standard" },
        ],
        spolu: 390,
        prenesenie: false,
      },
    });
    expect(n.akcia).toBe("prepisat");
    if (n.akcia === "prepisat") {
      expect(n.zmeny.vat_rate).toBeNull();
      expect(n.zmeny.net_amount).toBe(384.39);
      expect(n.zmeny.ai_raw).toEqual({ nove: true });
    }
  });
});

describe("noveZUlozenehoAi", () => {
  it("vráti null, keď uložené AI nedá platný rozpis (len sumy 384,39/5,61)", () => {
    expect(
      noveZUlozenehoAi(blocek2.ai_raw, { krajina: "SK", datumDodania: "2026-10-20" }),
    ).toBeNull();
  });
});
