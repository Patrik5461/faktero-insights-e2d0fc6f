import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Návrh zaúčtovania na serveri: poradie zdrojov, pamäť (AI sa druhýkrát
 * nevolá), zahodenie vymyslených kódov a výpadok AI bez pádu.
 */

const aiText = vi.fn();
vi.mock("./ai.server", () => ({ aiText: (...a: unknown[]) => aiText(...a) }));

type Data = Record<string, { list?: any[]; single?: any }>;

/** Napodobenina klienta Supabase — dotazy sa reťazia, výsledok je podľa tabuľky. */
function falosnyKlient(data: Data) {
  const zapisy: { tabulka: string; akcia: string; hodnota: any }[] = [];
  const from = (tabulka: string) => {
    const b: any = {};
    for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "neq", "lt"])
      b[m] = () => b;
    b.maybeSingle = async () => ({ data: data[tabulka]?.single ?? null, error: null });
    b.then = (ok: any, nie: any) =>
      Promise.resolve({ data: data[tabulka]?.list ?? [], error: null }).then(ok, nie);
    b.upsert = async (hodnota: any) => {
      zapisy.push({ tabulka, akcia: "upsert", hodnota });
      return { error: null };
    };
    b.update = (hodnota: any) => {
      zapisy.push({ tabulka, akcia: "update", hodnota });
      return b;
    };
    b.delete = () => {
      zapisy.push({ tabulka, akcia: "delete", hodnota: null });
      return b;
    };
    return b;
  };
  return { klient: { from }, zapisy };
}

const FIRMA = "00000000-0000-0000-0000-000000000001";
const faktura = {
  id: "00000000-0000-0000-0000-0000000000f1",
  company_id: FIRMA,
  supplier_name: "Orange Slovensko, a.s.",
  supplier_ico: "35697270",
  supplier_ic_dph: "SK2020310578",
  amount_without_vat: 20,
  vat_amount: 4.6,
  amount_total: 24.6,
  currency: "EUR",
  type: "regular",
  items: [{ name: "Paušál Go", vat_rate: 23, total: 24.6 }],
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
  category: null,
};

function zaklad(extra: Data = {}): Data {
  return {
    companies: { single: { country: "SK" } },
    predkontacie: {
      list: [
        { druh: "predkontacia", kod: "1Fp", popis: "Služby", agenda: "receivedInvoice" },
        { druh: "predkontacia", kod: "2Fm", popis: "Materiál", agenda: "receivedInvoice" },
        { druh: "clenenie_dph", kod: "PD", popis: "Tuzemské s odpočtom", agenda: "" },
      ],
    },
    pravidla_uctovania: { list: [] },
    purchase_invoices: { list: [] },
    expense_documents: { list: [] },
    doklad_navyky: { single: null },
    ai_navrhy_zauctovania: { single: null },
    ...extra,
  };
}

beforeEach(() => {
  vi.resetModules();
  aiText.mockReset();
});

describe("návrh pre prijatú faktúru", () => {
  it("nový dodávateľ — AI navrhne, vymyslený kód sa zahodí a návrh sa zapamätá", async () => {
    aiText.mockResolvedValue(
      '{"predkontacia":"1Fp","clenenie":"PX","kv":null,"kategoria":null,"dovod":"telekomunikačné služby → 518"}',
    );
    const s = await import("./ai-predkontacia.server");
    const { klient, zapisy } = falosnyKlient(zaklad());
    const k = await s.nacitajKontext(klient, FIRMA);
    const v = await s.navrhPrijatej(klient, faktura, k, "u1");
    expect(v.stav).toBe("navrh");
    expect(v.polia.predkontacia).toEqual({ hodnota: "1Fp", zdroj: "ai" });
    expect(v.polia.clenenie).toBeUndefined();
    expect(v.dovod).toBe("telekomunikačné služby → 518");
    expect(aiText).toHaveBeenCalledTimes(1);
    expect(aiText.mock.calls[0][1]).toMatchObject({
      ucel: "ai_predkontacia",
      bezUvazovania: true,
      json: true,
    });
    const ulozene = zapisy.find((z) => z.tabulka === "ai_navrhy_zauctovania");
    expect(ulozene?.hodnota).toMatchObject({
      doklad_typ: "prijata",
      stav: "navrh",
      navrh: { predkontacia: "1Fp" },
    });
  });

  it("pamäť: pri ďalšom otvorení sa AI nevolá", async () => {
    const s = await import("./ai-predkontacia.server");
    const { vstupZPrijatej, odtlacok } = await import("./ai-predkontacia");
    const { rozpisPrijatej } = await import("./prijate-do-pohody");
    const odtl = odtlacok(vstupZPrijatej(faktura, "SK", rozpisPrijatej(faktura)));
    const { klient, zapisy } = falosnyKlient(
      zaklad({
        ai_navrhy_zauctovania: {
          single: {
            odtlacok: odtl,
            stav: "navrh",
            navrh: { predkontacia: "1Fp", clenenie: "PD", dovod: "služby" },
          },
        },
      }),
    );
    const v = await s.navrhPrijatej(klient, faktura, await s.nacitajKontext(klient, FIRMA), "u1");
    expect(aiText).not.toHaveBeenCalled();
    expect(v.zPamate).toBe(true);
    expect(v.polia.clenenie).toEqual({ hodnota: "PD", zdroj: "ai" });
    expect(zapisy).toEqual([]);
  });

  it("pravidlo a návyk majú prednosť — keď pokryjú obe polia, AI sa nevolá", async () => {
    const s = await import("./ai-predkontacia.server");
    const { klient } = falosnyKlient(
      zaklad({
        pravidla_uctovania: {
          list: [
            {
              id: "p1",
              nazov: "Orange",
              poradie: 1,
              aktivne: true,
              dodavatel_ico: "35697270",
              dodavatel_text: null,
              sposob_uhrady: null,
              druh: "prijata",
              kategoria: null,
              predkontacia: "2Fm",
              clenenie_dph: null,
              odpocet: null,
              poznamka: null,
            },
          ],
        },
        doklad_navyky: {
          single: { polia: { predkontacia: [{ h: "1Fp" }], clenenie: [{ h: "PD" }] } },
        },
      }),
    );
    const v = await s.navrhPrijatej(klient, faktura, await s.nacitajKontext(klient, FIRMA), "u1");
    expect(aiText).not.toHaveBeenCalled();
    expect(v.polia.predkontacia).toEqual({ hodnota: "2Fm", zdroj: "pravidlo" });
    expect(v.polia.clenenie).toEqual({ hodnota: "PD", zdroj: "navyk" });
  });

  it("výpadok AI — žiadny návrh, nič nepadne a nič sa nezapamätá", async () => {
    aiText.mockRejectedValue(new Error("Gemini 503"));
    const s = await import("./ai-predkontacia.server");
    const { klient, zapisy } = falosnyKlient(zaklad());
    const v = await s.navrhPrijatej(klient, faktura, await s.nacitajKontext(klient, FIRMA), "u1");
    expect(v.stav).toBe("nedostupny");
    expect(v.polia).toEqual({});
    expect(zapisy).toEqual([]);
  });

  it("prázdny číselník a žiadne použité kódy — hláška namiesto volania AI", async () => {
    const s = await import("./ai-predkontacia.server");
    const { klient } = falosnyKlient(zaklad({ predkontacie: { list: [] } }));
    const v = await s.navrhPrijatej(klient, faktura, await s.nacitajKontext(klient, FIRMA), "u1");
    expect(v.stav).toBe("bez_ciselnika");
    expect(aiText).not.toHaveBeenCalled();
  });

  it("zaúčtovaná faktúra a nemecká firma návrh nedostanú", async () => {
    const s = await import("./ai-predkontacia.server");
    const { klient } = falosnyKlient(zaklad());
    const k = await s.nacitajKontext(klient, FIRMA);
    expect(
      (await s.navrhPrijatej(klient, { ...faktura, zauctovane_at: "2026-10-01" }, k, "u1")).stav,
    ).toBe("netreba");
    expect((await s.navrhPrijatej(klient, faktura, { ...k, krajina: "DE" }, "u1")).stav).toBe(
      "nepodporovane",
    );
    expect(aiText).not.toHaveBeenCalled();
  });
});
