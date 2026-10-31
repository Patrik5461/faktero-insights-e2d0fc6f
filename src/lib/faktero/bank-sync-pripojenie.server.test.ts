import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ktoré účty pripojenia sa ťahajú: notifikácia menuje účet → len ten;
 * vypršaný súhlas → notifikácia ho preskočí, denný beh ho raz skúsi
 * (súhlas k účtu v inej banke sa dá obnoviť aj v aplikácii TB bez zmeny
 * `consent_id`, a bez pokusu by účet ostal stáť navždy).
 */

const fetchTransactions = vi.fn();
vi.mock("./tatrabanka.server", () => ({
  fetchAccounts: async () => [
    { external_account_id: "ext-1", iban: "SK11", currency: "EUR", balance: 1 },
    { external_account_id: "ext-2", iban: "SK22", currency: "EUR", balance: 2 },
  ],
  fetchTransactions: (...a: unknown[]) => fetchTransactions(...a),
}));
vi.mock("./bank-tokens.server", () => ({
  bankToken: (x: string) => x,
  zasifrujBankToken: (x: string) => x,
}));

const UCTY = [
  { id: "u1", external_account_id: "ext-1", iban: "SK11", pohyby_ok_at: null },
  { id: "u2", external_account_id: "ext-2", iban: "SK22", pohyby_ok_at: null },
];

/** Reťaz PostgRESTu: každá metóda vráti seba, výsledok sa určí pri await. */
function fakeSupabase(zlySuhlas: Record<string, string>) {
  const zapisy: Array<{ table: string; data: any }> = [];
  const from = (table: string) => {
    const ops: Array<[string, any[]]> = [];
    const vysledok = (single: boolean) => {
      const select = ops.find(([k]) => k === "select")?.[1]?.[0] ?? "";
      const update = ops.find(([k]) => k === "update");
      if (update) zapisy.push({ table, data: update[1][0] });
      if (table === "bank_accounts" && single) return { data: { id: "x" } };
      if (table === "bank_accounts" && String(select).includes("pohyby_chyba_suhlas"))
        return {
          data: UCTY.map((u) => ({ id: u.id, pohyby_chyba_suhlas: zlySuhlas[u.id] ?? null })),
        };
      if (table === "bank_accounts" && String(select).includes("external_account_id"))
        return { data: UCTY };
      if (table === "bank_transactions") return { count: 3, data: [] };
      return { data: null, error: null };
    };
    const b: any = new Proxy(
      {},
      {
        get(_, k: string) {
          if (k === "then")
            return (res: any, rej: any) => Promise.resolve(vysledok(false)).then(res, rej);
          if (k === "maybeSingle" || k === "single") return () => Promise.resolve(vysledok(true));
          return (...a: any[]) => {
            ops.push([k, a]);
            return b;
          };
        },
      },
    );
    return b;
  };
  return { klient: { from }, zapisy };
}

const conn = {
  id: "c1",
  company_id: "f1",
  consent_id: "s1",
  access_token: "tok",
  refresh_token: null,
  token_expires_at: "2027-02-03T00:00:00Z",
};

const { syncPripojenie } = await import("./bank-sync.server");

beforeEach(() => {
  fetchTransactions.mockReset().mockRejectedValue(new Error("tb_api_error: 401 SCA_EXPIRED"));
});

const tahane = () => fetchTransactions.mock.calls.map((c) => c[1]);

describe("syncPripojenie — výber účtov", () => {
  it("notifikácia s účtom ťahá len ten účet", async () => {
    const { klient } = fakeSupabase({});
    await syncPripojenie(klient, conn, 7, { lenUcty: ["ext-2"] });
    expect(tahane()).toEqual(["ext-2"]);
  });

  it("neznámy účet v notifikácii — ťahajú sa všetky", async () => {
    const { klient } = fakeSupabase({});
    await syncPripojenie(klient, conn, 7, { lenUcty: ["ext-9"] });
    expect(tahane()).toEqual(["ext-1", "ext-2"]);
  });

  it("účet s vypršaným súhlasom notifikácia preskočí, denný beh ho skúsi", async () => {
    const a = fakeSupabase({ u1: "s1" });
    await syncPripojenie(a.klient, conn, 7);
    expect(tahane()).toEqual(["ext-2"]);

    fetchTransactions.mockClear();
    const b = fakeSupabase({ u1: "s1" });
    await syncPripojenie(b.klient, conn, 14, { skusitVyprsane: true });
    expect(tahane()).toEqual(["ext-1", "ext-2"]);
    // Chyba súhlasu sa zapíše k účtu — tá istá, akú už mal; sumy z banky nikde.
    expect(b.zapisy.some((z) => z.data?.pohyby_chyba_suhlas === "s1")).toBe(true);
  });
});
