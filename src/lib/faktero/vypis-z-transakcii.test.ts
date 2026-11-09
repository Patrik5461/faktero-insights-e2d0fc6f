import { describe, it, expect } from "vitest";
import {
  zostavVypisUctu,
  buildCamt053,
  buildStatementPdf,
  poznamkaCiastocny,
  datumVoVete,
  cestaVlastnehoVypisu,
} from "./bank-statements-own.server";

/*
  Malý falošný Supabase klient — vie práve toľko, koľko potrebuje
  `zostavVypisUctu`: eq/gte/lte/gt, order, limit, range, maybeSingle.
*/
type Tx = { id: number; booking_date: string; amount: number; [k: string]: unknown };

function falosnyKlient(opts: { txs: Tx[]; booked: number }) {
  const tabulky: Record<string, any[]> = {
    bank_accounts: [
      {
        id: "acc",
        company_id: "firma",
        iban: "SK3102000000004012345678",
        account_name: "VÚB bežný",
        currency: "EUR",
        balance: opts.booked,
        booked_balance: opts.booked,
      },
    ],
    companies: [{ id: "firma", name: "BÝVAJLEPŠIE s.r.o.", ico: "12345678" }],
    bank_transactions: opts.txs.map((t) => ({ bank_account_id: "acc", currency: "EUR", ...t })),
  };
  return {
    from(tabulka: string) {
      let riadky = [...(tabulky[tabulka] ?? [])];
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => ((riadky = riadky.filter((r) => r[k] === v)), q),
        gte: (k: string, v: string) => ((riadky = riadky.filter((r) => r[k] >= v)), q),
        lte: (k: string, v: string) => ((riadky = riadky.filter((r) => r[k] <= v)), q),
        gt: (k: string, v: string) => ((riadky = riadky.filter((r) => r[k] > v)), q),
        order: (k: string, o?: { ascending?: boolean }) => {
          const smer = o?.ascending === false ? -1 : 1;
          riadky.sort((a, b) => (a[k] < b[k] ? -smer : a[k] > b[k] ? smer : 0));
          return q;
        },
        limit: (n: number) => ((riadky = riadky.slice(0, n)), q),
        range: (od: number, po: number) => Promise.resolve({ data: riadky.slice(od, po + 1), error: null }),
        maybeSingle: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
      };
      return q;
    },
  };
}

// Účet pripojený 26. 10. — pohyby začínajú až vtedy.
const pohyby: Tx[] = [
  { id: 1, booking_date: "2026-10-26", amount: 500 },
  { id: 2, booking_date: "2026-10-28", amount: -120.5 },
  { id: 3, booking_date: "2026-11-03", amount: -30 },
];

describe("čiastočný výpis z pohybov", () => {
  it("nočný beh (bez ciastocny) neúplný mesiac odmietne", async () => {
    const z = await zostavVypisUctu(
      falosnyKlient({ txs: pohyby, booked: 1349.5 }),
      "acc",
      "2026-10-01",
      "2026-10-31",
    );
    expect(z).toEqual({ ok: false, dovod: "neuplne", najstarsi: "2026-10-26" });
  });

  it("s ciastocny začne najstarším pohybom a dopočíta počiatočný zostatok pred ním", async () => {
    const z = await zostavVypisUctu(
      falosnyKlient({ txs: pohyby, booked: 1349.5 }),
      "acc",
      "2026-10-01",
      "2026-10-31",
      { ciastocny: true },
    );
    if (!z.ok) throw new Error("čakaný výpis");
    expect(z.ciastocnyOd).toBe("2026-10-26");
    expect(z.input.periodStart).toBe("2026-10-26");
    expect(z.input.partialFrom).toBe("2026-10-26");
    expect(z.input.transactions).toHaveLength(2);
    // konečný = 1349,50 − (−30) = 1379,50; počiatočný = 1379,50 − 379,50 = 1000
    expect(z.input.closing).toBe(1379.5);
    expect(z.input.opening).toBe(1000);

    const xml = buildCamt053({ ...z.input, createdAt: "2026-11-09T10:00:00.000Z" });
    expect(xml).toContain(
      "<AddtlStmtInf>Čiastočný výpis od 26. 10. 2026 – skôr Faktero pohyby z banky nemá. Tento výpis zostavilo Faktero",
    );
    // Upozornenie, že nejde o výpis banky, sa už neodsekne v polovici.
    expect(xml).toContain("niektoré poplatky).</AddtlStmtInf>");
    expect(xml).toContain("<FrDtTm>2026-10-26T00:00:00</FrDtTm>");
    expect(xml).toContain(
      '<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-26</Dt></Dt></Bal>',
    );
    expect(xml).toContain("<Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy=\"EUR\">1379.50</Amt>");

    const pdf = await buildStatementPdf(z.input);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("úplný mesiac nemá poznámku o čiastočnosti", async () => {
    const z = await zostavVypisUctu(
      falosnyKlient({ txs: pohyby, booked: 1349.5 }),
      "acc",
      "2026-11-01",
      "2026-11-09",
      { ciastocny: true },
    );
    if (!z.ok) throw new Error("čakaný výpis");
    expect(z.ciastocnyOd).toBeNull();
    expect(z.input.opening).toBe(1379.5);
    expect(buildCamt053(z.input)).not.toContain("Čiastočný výpis");
  });

  it("bez pohybov do konca obdobia povie bez-pohybov", async () => {
    const z = await zostavVypisUctu(
      falosnyKlient({ txs: pohyby, booked: 0 }),
      "acc",
      "2026-09-01",
      "2026-09-30",
      { ciastocny: true },
    );
    expect(z).toEqual({ ok: false, dovod: "bez-pohybov", najstarsi: "2026-10-26" });
    const prazdny = await zostavVypisUctu(
      falosnyKlient({ txs: [], booked: 0 }),
      "acc",
      "2026-10-01",
      "2026-10-31",
      { ciastocny: true },
    );
    expect(prazdny.ok).toBe(false);
  });

  it("veta a cesta súboru", () => {
    expect(datumVoVete("2026-10-26")).toBe("26. 10. 2026");
    expect(poznamkaCiastocny("2026-10-05")).toBe(
      "Čiastočný výpis od 5. 10. 2026 – skôr Faktero pohyby z banky nemá.",
    );
    expect(cestaVlastnehoVypisu("firma", "acc", "2026-10-01", "XML")).toBe(
      "firma/acc/2026-10-faktero.xml",
    );
  });
});
