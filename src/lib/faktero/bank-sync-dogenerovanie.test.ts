import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sťahovanie, ktoré prinieslo nové pohyby, spustí dogenerovanie výpisov —
 * len pre firmu pripojenia a len pre účty, kam niečo pribudlo.
 */

const spustiDogenerovanie = vi.fn(async () => null);
vi.mock("./vypisy-dogenerovanie.server", () => ({ spustiDogenerovanie }));

/** Reťaz PostgRESTu; insert vráti vložené riadky, ostatné prázdno. */
function fakeSupabase() {
  const from = (table: string) => {
    let vkladane: any[] | null = null;
    const vysledok = () => {
      if (vkladane) return { data: vkladane.map((_, i) => ({ id: `n${i}` })), error: null };
      if (table === "bank_accounts")
        return {
          data: [
            { id: "u1", external_account_id: "e1", currency: "EUR" },
            { id: "u2", external_account_id: "e2", currency: "USD" },
          ],
          error: null,
        };
      return { data: [], error: null };
    };
    const b: any = new Proxy(
      {},
      {
        get(_, k: string) {
          if (k === "then")
            return (res: any, rej: any) => Promise.resolve(vysledok()).then(res, rej);
          if (k === "maybeSingle" || k === "single")
            return () => Promise.resolve({ data: null, error: null });
          return (...a: any[]) => {
            if (k === "insert") vkladane = Array.isArray(a[0]) ? a[0] : [a[0]];
            return b;
          };
        },
      },
    );
    return b;
  };
  return { from };
}

const { stiahniPohybyPripojenia } = await import("./bank-sync.server");

beforeEach(() => spustiDogenerovanie.mockClear());

describe("stiahniPohybyPripojenia → dogenerovanie výpisov", () => {
  it("nové pohyby na jednom účte spustia dogenerovanie tej firmy a toho účtu", async () => {
    await stiahniPohybyPripojenia(fakeSupabase(), "firma-1", "c1", async (u) =>
      u.id === "u1"
        ? [{ external_id: "x1", booking_date: "2026-10-10", amount: 5, currency: "EUR" }]
        : [],
    );
    await new Promise((r) => setTimeout(r, 0));
    await vi.dynamicImportSettled();
    expect(spustiDogenerovanie).toHaveBeenCalledTimes(1);
    expect(spustiDogenerovanie).toHaveBeenCalledWith({
      companyId: "firma-1",
      bankAccountIds: ["u1"],
      dovod: "nove-pohyby",
    });
  });

  it("bez nových pohybov sa nespúšťa nič", async () => {
    await stiahniPohybyPripojenia(fakeSupabase(), "firma-1", "c1", async () => []);
    await vi.dynamicImportSettled();
    expect(spustiDogenerovanie).not.toHaveBeenCalled();
  });
});
