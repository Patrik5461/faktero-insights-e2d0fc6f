import { describe, it, expect, vi } from "vitest";
import { rozdelPodlaOdtlacku, type UlozenyPohyb } from "./bank-sync-zhoda";

/**
 * Tobify 19. 11. 2026: po obnove súhlasu prišli z TB tie isté pohyby z ČSOB,
 * SLSP a VÚB s číselnou referenciou, hoci v databáze už boli s referenciou
 * pôvodnej banky. Výpisy potom ukázali 82 platieb dvakrát.
 */
const stare: UlozenyPohyb[] = [
  {
    id: "a",
    transaction_reference: "f17dd758e2712f46356e919e18b0f0aa3c9b4e9b10b8e108053c966c",
    booking_date: "2026-10-01",
    amount: "-5.00",
    variable_symbol: null,
    counterparty_iban: null,
    description: "",
    created_at: "2026-10-01T09:20:04Z",
  },
  {
    id: "b",
    transaction_reference: "6d36380338363fbc2fe4b2fd757c58868369f9cb651d0fb71bd95fb8",
    booking_date: "2026-10-02",
    amount: "-430.50",
    variable_symbol: "20260025",
    counterparty_iban: null,
    description: "",
    created_at: "2026-10-02T09:20:26Z",
  },
  {
    id: "c",
    transaction_reference: "TRN14107400520",
    booking_date: "2026-10-05",
    amount: "-5.00",
    variable_symbol: "498000277",
    counterparty_iban: null,
    description: "",
    created_at: "2026-10-06T09:20:23Z",
  },
];
const zBanky = [
  {
    transaction_reference: "8532182",
    booking_date: "2026-10-01",
    amount: -5,
    variable_symbol: null,
    counterparty_iban: "SK5775000000004035356742",
    description: "SK3575000000004035356750",
  },
  {
    transaction_reference: "8532183",
    booking_date: "2026-10-02",
    amount: -430.5,
    variable_symbol: "20260025",
    counterparty_iban: "SK8909000000005177047384",
    description: "Electronic instant payment OUT",
  },
  {
    transaction_reference: "8532184",
    booking_date: "2026-10-05",
    amount: -5,
    variable_symbol: "498000277",
    counterparty_iban: "SK5375002000020008091808",
    description: "Mainten Fee",
  },
];
const refy = (t: { transaction_reference: string | null }[]) =>
  new Set(t.map((x) => x.transaction_reference!).filter(Boolean));

describe("rozdelPodlaOdtlacku", () => {
  it("staré riadky s hex/TRN referenciou + nové číselné z TB → nič sa nevloží", () => {
    const { nove, povysenia } = rozdelPodlaOdtlacku(zBanky, stare, refy(zBanky));
    expect(nove).toEqual([]);
    expect(povysenia.map((p) => [p.id, p.transaction_reference])).toEqual(
      expect.arrayContaining([
        ["a", "8532182"],
        ["b", "8532183"],
        ["c", "8532184"],
      ]),
    );
    // Starý riadok si doplní, čo mu chýbalo.
    expect(povysenia.find((p) => p.id === "b")!.doplnit).toEqual({
      counterparty_iban: "SK8909000000005177047384",
      description: "Electronic instant payment OUT",
    });
  });

  it("naozaj nový pohyb (iný deň alebo suma) sa vloží", () => {
    const novy = { ...zBanky[0], transaction_reference: "8532999", booking_date: "2026-10-03" };
    const { nove } = rozdelPodlaOdtlacku([...zBanky, novy], stare, refy([...zBanky, novy]));
    expect(nove).toEqual([novy]);
  });

  it("dve rovnaké platby v ten istý deň sa nezlejú do jednej (1 : 1)", () => {
    const druhy = { ...zBanky[0], transaction_reference: "8532200" };
    const { nove, povysenia } = rozdelPodlaOdtlacku(
      [zBanky[0], druhy],
      [stare[0]],
      refy([zBanky[0], druhy]),
    );
    expect(povysenia).toHaveLength(1);
    expect(nove).toHaveLength(1);
  });

  it("rozdielny VS alebo IBAN protistrany = iný pohyb", () => {
    const inyVs = { ...zBanky[1], variable_symbol: "11111111" };
    expect(rozdelPodlaOdtlacku([inyVs], stare, refy([inyVs])).nove).toEqual([inyVs]);
    const s = [{ ...stare[1], counterparty_iban: "SK0000000000000000000000" }];
    expect(rozdelPodlaOdtlacku([zBanky[1]], s, refy([zBanky[1]])).nove).toEqual([zBanky[1]]);
  });

  it("riadok, ktorý banka vrátila pod jeho vlastnou referenciou, nie je kandidát", () => {
    // V DB je jeden -5,00 € pod číselnou referenciou, banka ho vrátila aj s druhým.
    const ulozeny = { ...stare[0], id: "x", transaction_reference: "8532182" };
    const druhy = { ...zBanky[0], transaction_reference: "8532201" };
    const { nove } = rozdelPodlaOdtlacku([druhy], [ulozeny], refy([zBanky[0], druhy]));
    expect(nove).toEqual([druhy]);
  });

  it("pri viacerých kandidátoch berie najstarší riadok a presnejšiu zhodu", () => {
    const k1 = { ...stare[1], id: "novsi", created_at: "2026-11-01T00:00:00Z" };
    const k2 = { ...stare[1], id: "starsi", created_at: "2026-10-01T00:00:00Z" };
    const { povysenia } = rozdelPodlaOdtlacku([zBanky[1]], [k1, k2], refy([zBanky[1]]));
    expect(povysenia[0].id).toBe("starsi");
  });
});

/*
 * Celá cesta synchronizácie: obnovený súhlas vráti tie isté pohyby pod novou
 * referenciou — nevloží sa nič a staré riadky si prevezmú novú referenciu.
 */
const fetchTransactions = vi.fn();
vi.mock("./tatrabanka.server", () => ({
  fetchTransactions: (...a: unknown[]) => fetchTransactions(...a),
}));

function fakeDb(riadky: UlozenyPohyb[]) {
  const vlozene: any[] = [];
  const upravy: Array<{ id: string; zmena: any }> = [];
  const klient = {
    from(tabulka: string) {
      const stav: any = { tabulka };
      const q: any = {
        select: (_c?: string, o?: any) => {
          stav.head = o?.head;
          return q;
        },
        eq: (_k: string, v: any) => {
          stav.eq = v;
          return q;
        },
        gte: () => q,
        order: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        range: (od: number, po: number) =>
          Promise.resolve({ data: riadky.slice(od, po + 1), error: null }),
        update: (zmena: any) => ({
          eq: (_k: string, id: string) => {
            if (tabulka === "bank_transactions") upravy.push({ id, zmena });
            return Promise.resolve({ error: null });
          },
        }),
        insert: (r: any[]) => {
          vlozene.push(...r);
          return { select: () => Promise.resolve({ data: r, error: null }) };
        },
        then: (res: any) =>
          res(stav.head ? { count: riadky.length, error: null } : { data: [], error: null }),
      };
      return q;
    },
  };
  return { klient, vlozene, upravy };
}

describe("stiahniTransakcieUctu po obnove súhlasu", () => {
  it("nevloží duplicity a prevezme novú referenciu", async () => {
    fetchTransactions.mockResolvedValue(zBanky);
    const { stiahniTransakcieUctu } = await import("./bank-sync.server");
    const { klient, vlozene, upravy } = fakeDb(stare);
    const r = await stiahniTransakcieUctu(
      klient,
      { company_id: "firma", consent_id: "novy" },
      "token",
      { id: "ucet", external_account_id: "5226", pohyby_ok_at: new Date().toISOString() },
      60,
    );
    expect(r.inserted).toBe(0);
    expect(vlozene).toEqual([]);
    expect(upravy.map((u) => [u.id, u.zmena.transaction_reference]).sort()).toEqual([
      ["a", "8532182"],
      ["b", "8532183"],
      ["c", "8532184"],
    ]);
  });

  it("nový pohyb vedľa starých sa vloží práve raz", async () => {
    const novy = { ...zBanky[0], transaction_reference: "8532999", booking_date: "2026-11-18" };
    fetchTransactions.mockResolvedValue([...zBanky, novy]);
    const { stiahniTransakcieUctu } = await import("./bank-sync.server");
    const { klient, vlozene } = fakeDb(stare);
    const r = await stiahniTransakcieUctu(
      klient,
      { company_id: "firma", consent_id: "novy" },
      "token",
      { id: "ucet", external_account_id: "5226", pohyby_ok_at: new Date().toISOString() },
      60,
    );
    expect(r.inserted).toBe(1);
    expect(vlozene.map((v) => v.transaction_reference)).toEqual(["8532999"]);
  });
});
