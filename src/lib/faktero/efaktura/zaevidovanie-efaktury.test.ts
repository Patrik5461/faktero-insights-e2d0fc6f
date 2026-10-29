import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import {
  daSaZaevidovat,
  druhZRozobratia,
  kamZaradit,
  nastaveniePrijmu,
  odkazNaZaradenie,
  PREDVOLENE_NASTAVENIE_PRIJMU,
} from "./zaevidovanie-efaktury";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../schvalovanie.server", () => ({ zabezpecSchvalovanie: async () => {} }));
vi.mock("./nahlad.server", () => ({
  prilozPdfKPrijatej: async () => false,
  pdfPrijatejEfaktury: async () => ({ bajty: new Uint8Array([1]), prilozene: false }),
}));
vi.mock("../ucenie-z-oprav.server", () => ({
  doplnUcenim: async (_s: unknown, a: any) => a.udaje,
}));

const STAV = "11111111-2222-3333-4444-555555555555";

describe("nastavenie príjmu", () => {
  it("bez profilu a pri neznámych hodnotách platí predvolené (Prijaté faktúry, otvoriť)", () => {
    expect(nastaveniePrijmu(null)).toEqual(PREDVOLENE_NASTAVENIE_PRIJMU);
    expect(nastaveniePrijmu({ prijem_ciel: "nieco", prijem_stav_id: "zle" })).toEqual(
      PREDVOLENE_NASTAVENIE_PRIJMU,
    );
    expect(
      nastaveniePrijmu({
        prijem_ciel: "nespracovane",
        prijem_automaticky: true,
        prijem_otvorit: false,
        prijem_stav_id: STAV,
      }),
    ).toEqual({ ciel: "nespracovane", stavId: STAV, automaticky: true, otvorit: false });
  });
});

describe("kam zaradiť podľa nastavenia a druhu", () => {
  const prijate = { ...PREDVOLENE_NASTAVENIE_PRIJMU, stavId: STAV };
  const nesprac = { ...PREDVOLENE_NASTAVENIE_PRIJMU, ciel: "nespracovane" as const };

  it("faktúra a dobropis idú podľa nastavenia", () => {
    expect(kamZaradit(prijate, "faktura")).toEqual({
      kam: "prijate",
      typ: "regular",
      stavId: STAV,
    });
    expect(kamZaradit(prijate, "dobropis")).toEqual({
      kam: "prijate",
      typ: "regular",
      stavId: STAV,
    });
    expect(kamZaradit(nesprac, "faktura")).toEqual({ kam: "nespracovane", druh: "faktura" });
    expect(kamZaradit(nesprac, "dobropis")).toEqual({ kam: "nespracovane", druh: "dobropis" });
  });

  it("zálohová ide vždy medzi prijaté zálohové, bez stavu", () => {
    expect(kamZaradit(prijate, "zalohova")).toEqual({
      kam: "prijate",
      typ: "proforma",
      stavId: null,
    });
    expect(kamZaradit(nesprac, "zalohova")).toEqual({
      kam: "prijate",
      typ: "proforma",
      stavId: null,
    });
  });

  it("samofaktúra sa nezaraďuje medzi prijaté", () => {
    expect(kamZaradit(prijate, "samofaktura")).toEqual({ kam: "samofaktura" });
    expect(kamZaradit(nesprac, "samofaktura_dobropis")).toEqual({ kam: "samofaktura" });
  });

  it("druh zo staršieho parsed_data a odkaz na zaradenie", () => {
    expect(druhZRozobratia({ documentKind: "invoice", typeCode: "386" })).toBe("zalohova");
    expect(druhZRozobratia({ documentKind: "credit_note" })).toBe("dobropis");
    expect(druhZRozobratia({ documentKind: "self_billing" })).toBe("samofaktura");
    expect(druhZRozobratia(null)).toBe("faktura");
    expect(odkazNaZaradenie({ kam: "prijate", id: "a" })).toBe("/prijate-faktury/a");
    expect(odkazNaZaradenie({ kam: "nespracovane", id: "b" })).toBe("/nespracovane/b");
  });

  it("zámok: zaevidovaný ani rozbehnutý doklad sa znova nezakladá, spadnutý po 2 minútach áno", () => {
    const teraz = new Date("2026-10-29T10:00:00Z");
    expect(daSaZaevidovat({}, teraz)).toBe(true);
    expect(daSaZaevidovat({ matched_supplier_invoice_id: "x" }, teraz)).toBe(false);
    expect(daSaZaevidovat({ nespracovany_id: "x" }, teraz)).toBe(false);
    expect(daSaZaevidovat({ zaevidovanie_at: "2026-10-29T09:59:30Z" }, teraz)).toBe(false);
    expect(daSaZaevidovat({ zaevidovanie_at: "2026-10-29T09:57:00Z" }, teraz)).toBe(true);
  });
});

/* ---- idempotencia nad databázou v pamäti ---- */

type Riadok = Record<string, any>;

/** Minimálny klient Supabase nad poliami v pamäti (eq/is/in/limit, select/insert/update). */
function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const from = (meno: string) => {
    tabulky[meno] ??= [];
    const filtre: ((r: Riadok) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let data: Riadok | Riadok[] | null = null;
    let vratit = false;
    const vykonaj = () => {
      const t = tabulky[meno];
      if (op === "insert") {
        const nove = (Array.isArray(data) ? data : [data!]).map((x) => ({
          id: crypto.randomUUID(),
          ...x,
        }));
        t.push(...nove);
        return nove;
      }
      const zhoda = t.filter((r) => filtre.every((f) => f(r)));
      if (op === "update") for (const r of zhoda) Object.assign(r, data);
      return zhoda.map((r) => ({ ...r }));
    };
    const b: any = {
      select: () => {
        vratit = true;
        return b;
      },
      insert: (d: Riadok) => {
        op = "insert";
        data = d;
        return b;
      },
      update: (d: Riadok) => {
        op = "update";
        data = d;
        return b;
      },
      eq: (k: string, v: unknown) => (filtre.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) === v), b),
      in: (k: string, v: unknown[]) => (filtre.push((r) => v.includes(r[k])), b),
      ilike: (k: string, v: string) => (
        filtre.push((r) => String(r[k] ?? "").toLowerCase() === v.toLowerCase()),
        b
      ),
      order: () => b,
      limit: () => b,
      range: () => b,
      single: async () => ({ data: vykonaj()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: vykonaj()[0] ?? null, error: null }),
      then: (ok: (x: any) => unknown, zle?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: vratit || op === "select" ? vykonaj() : (vykonaj(), null),
          error: null,
        }).then(ok, zle),
    };
    return b;
  };
  return {
    from,
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}) }) },
  };
}

const FIRMA = "aaaaaaaa-0000-0000-0000-000000000001";
const PRIJATA = "bbbbbbbb-0000-0000-0000-000000000001";

function databaza(nast: Riadok = {}) {
  const xml = generatePeppolBisXml(
    mapToEN16931({
      company: {
        name: "Dodávateľ s.r.o.",
        ico: "86179504",
        dic: "4286179504",
        ic_dph: "SK4286179504",
        country: "SK",
        vat_payer: true,
      } as any,
      invoice: {
        invoice_number: "FA2026001",
        type: "regular",
        issue_date: "2026-10-08",
        due_date: "2026-10-22",
        currency: "EUR",
        subtotal: 1000,
        vat_total: 230,
        total: 1230,
        advance_amount: 615,
        customer_name: "Odberateľ s.r.o.",
        customer_ico: "43291067",
        customer_dic: "5843291067",
        customer_ic_dph: "SK5843291067",
        customer_country: "SK",
      } as any,
      items: [
        {
          position: 1,
          name: "Služba",
          quantity: 1,
          unit: "ks",
          unit_price: 1000,
          vat_rate: 23,
          subtotal: 1000,
          vat_amount: 230,
          total: 1230,
        } as any,
      ],
    }),
  ).xml;
  return {
    efaktura_profiles: [{ company_id: FIRMA, ...nast }],
    efaktura_received_documents: [
      {
        id: PRIJATA,
        company_id: FIRMA,
        xml_payload: xml,
        parsed_data: {},
        document_number: "FA2026001",
        received_at: "2026-10-28T10:00:00Z",
        matched_supplier_invoice_id: null,
        nespracovany_id: null,
        zaevidovanie_at: null,
      },
    ],
    purchase_invoices: [] as Riadok[],
    nespracovane_doklady: [] as Riadok[],
  };
}

describe("zaevidovanie je idempotentné", () => {
  let mod: typeof import("./zaevidovanie-efaktury.server");
  beforeEach(async () => {
    mod = await import("./zaevidovanie-efaktury.server");
  });

  it("druhé zaevidovanie vráti ten istý doklad a druhý nezaloží", async () => {
    const db = databaza();
    const sb = falosnyKlient(db);
    const a = await mod.zaevidujPrijatuEfakturu(sb, {
      companyId: FIRMA,
      receivedId: PRIJATA,
      userId: null,
    });
    const b = await mod.zaevidujPrijatuEfakturu(sb, {
      companyId: FIRMA,
      receivedId: PRIJATA,
      userId: null,
    });
    expect(a.uzExistoval).toBe(false);
    expect(b).toEqual({ kam: "prijate", id: a.id, uzExistoval: true });
    expect(db.purchase_invoices).toHaveLength(1);
    expect(db.purchase_invoices[0]).toMatchObject({
      amount_total: 1230,
      advance_amount: 615,
      source: "efaktura",
    });
    expect(db.efaktura_received_documents[0]).toMatchObject({
      matched_supplier_invoice_id: a.id,
      zaevidovanie_at: null,
    });
  });

  it("súbežné zaevidovanie (klik počas automatiky) založí len jeden doklad", async () => {
    const db = databaza({ prijem_automaticky: true });
    const sb = falosnyKlient(db);
    const vysledky = await Promise.allSettled([
      mod.zaevidujPrijatuEfakturu(sb, { companyId: FIRMA, receivedId: PRIJATA, userId: null }),
      mod.zaevidujAutomaticky(sb, FIRMA, [PRIJATA]),
    ]);
    expect(
      vysledky.every((v) => v.status === "fulfilled" || /eviduje/.test(String((v as any).reason))),
    ).toBe(true);
    expect(db.purchase_invoices).toHaveLength(1);
  });

  it("tá istá faktúra, ktorá už medzi prijatými je, sa len pripojí", async () => {
    const db = databaza();
    db.purchase_invoices.push({
      id: "cccccccc-0000-0000-0000-000000000001",
      company_id: FIRMA,
      invoice_number: "FA2026001",
      supplier_name: "Dodávateľ s.r.o.",
      supplier_ico: "86179504",
      amount_total: 1230,
      deleted_at: null,
    });
    const v = await mod.zaevidujPrijatuEfakturu(falosnyKlient(db), {
      companyId: FIRMA,
      receivedId: PRIJATA,
      userId: null,
    });
    expect(v).toMatchObject({
      kam: "prijate",
      id: "cccccccc-0000-0000-0000-000000000001",
      pripojena: true,
    });
    expect(db.purchase_invoices).toHaveLength(1);
  });

  it("do Nespracovaných ide s údajmi z XML a druhýkrát sa nezdvojí", async () => {
    const db = databaza({ prijem_ciel: "nespracovane" });
    const sb = falosnyKlient(db);
    const a = await mod.zaevidujPrijatuEfakturu(sb, {
      companyId: FIRMA,
      receivedId: PRIJATA,
      userId: null,
    });
    const b = await mod.zaevidujPrijatuEfakturu(sb, {
      companyId: FIRMA,
      receivedId: PRIJATA,
      userId: null,
    });
    expect(a.kam).toBe("nespracovane");
    expect(b).toEqual({ kam: "nespracovane", id: a.id, uzExistoval: true });
    expect(db.nespracovane_doklady).toHaveLength(1);
    expect(db.nespracovane_doklady[0]).toMatchObject({
      zdroj: "efaktura",
      stav: "vytazene",
      druh: "faktura",
      ai: null,
    });
    expect(db.nespracovane_doklady[0].udaje).toMatchObject({
      cislo: "FA2026001",
      celkom: 1230,
      zaloha: 615,
    });
    expect(db.purchase_invoices).toHaveLength(0);
  });

  it("automatika bez zapnutého nastavenia nič nezaeviduje a nikdy nehodí chybu", async () => {
    const db = databaza();
    await expect(mod.zaevidujAutomaticky(falosnyKlient(db), FIRMA, [PRIJATA])).resolves.toEqual({
      zaevidovanych: 0,
      problemy: [],
    });
    expect(db.purchase_invoices).toHaveLength(0);
    const zly = {
      from: () => {
        throw new Error("databáza nedostupná");
      },
    };
    await expect(mod.zaevidujAutomaticky(zly, FIRMA, [PRIJATA])).resolves.toMatchObject({
      zaevidovanych: 0,
    });
  });
});
