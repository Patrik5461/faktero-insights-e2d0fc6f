import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bezTestovacichFiriem,
  HLASKA_TESTOVACIA_BANKA,
  HLASKA_TESTOVACIA_PLATBA,
  zastavBankuTestovacej,
  zastavPlatbuTestovacej,
} from "./testovacia-firma-banka.server";
import { jeZastaveneTestom } from "./testovacia-firma";

/**
 * Testovacia firma sa nikdy nepripája k banke a neposiela platby; nočné behy
 * ju potichu preskočia. Skutočná firma musí prejsť ďalej bez zmeny.
 */

const SKUTOCNA = "11111111-1111-1111-1111-111111111111";
const TESTOVACIA = "22222222-2222-2222-2222-222222222222";

/** Podvrh `companies`: `testovacia_pre` podľa id, `in().not()` pre zoznam. */
function klientFiriem(chyba = false) {
  const firmy: Record<string, string | null> = { [SKUTOCNA]: null, [TESTOVACIA]: SKUTOCNA };
  return {
    from: (t: string) => {
      if (t !== "companies") throw new Error(`neočakávaná tabuľka ${t}`);
      let id = "";
      let ids: string[] = [];
      const d: any = {
        select: () => d,
        eq: (_s: string, v: string) => ((id = v), d),
        in: (_s: string, v: string[]) => ((ids = v), d),
        maybeSingle: async () =>
          chyba
            ? { data: null, error: { message: "výpadok" } }
            : { data: id in firmy ? { testovacia_pre: firmy[id] } : null, error: null },
        not: async () => ({
          data: ids.filter((x) => firmy[x]).map((x) => ({ id: x })),
          error: null,
        }),
      };
      return d;
    },
  };
}

describe("stráž pripojenia banky", () => {
  it("testovaciu firmu zastaví s hláškou", async () => {
    const e = await zastavBankuTestovacej(TESTOVACIA, klientFiriem()).catch((x) => x);
    expect(jeZastaveneTestom(e)).toBe(true);
    expect(e.message).toBe(HLASKA_TESTOVACIA_BANKA);
  });
  it("skutočnú firmu pustí ďalej", async () => {
    await expect(zastavBankuTestovacej(SKUTOCNA, klientFiriem())).resolves.toBeUndefined();
  });
  it("keď sa firma nedá overiť, radšej zastaví", async () => {
    const e = await zastavBankuTestovacej(SKUTOCNA, klientFiriem(true)).catch((x) => x);
    expect(jeZastaveneTestom(e)).toBe(true);
  });
});

describe("stráž platby do banky", () => {
  it("testovaciu firmu zastaví, skutočnú pustí", async () => {
    const e = await zastavPlatbuTestovacej(TESTOVACIA, klientFiriem()).catch((x) => x);
    expect(e.message).toBe(HLASKA_TESTOVACIA_PLATBA);
    await expect(zastavPlatbuTestovacej(SKUTOCNA, klientFiriem())).resolves.toBeUndefined();
  });
});

describe("nočné behy", () => {
  it("bezTestovacichFiriem vyhodí testovacie, skutočné nechá", async () => {
    const riadky = [
      { id: "a", company_id: SKUTOCNA },
      { id: "b", company_id: TESTOVACIA },
    ];
    const r = await bezTestovacichFiriem(riadky, "test", klientFiriem());
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
});

// ── Nočné sťahovanie ostatných bánk (Wise, Revolut, Wallester, Fio) ─────────

const pripojenia: any[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => {
      if (t === "companies") return klientFiriem().from("companies");
      const d: any = {
        select: () => d,
        in: () => d,
        eq: () => Promise.resolve({ data: pripojenia }),
      };
      return d;
    },
  },
}));
const wise = vi.fn();
vi.mock("./wise.server", () => ({ synchronizujWiseZoServera: (c: string) => wise(c) }));

describe("runDailySyncOstatnych", () => {
  beforeEach(() => {
    wise.mockReset();
    wise.mockResolvedValue({ accounts: 1, inserted: 0, problemy: [] });
    pripojenia.length = 0;
  });

  it("testovaciu firmu do banky nepošle, skutočnú áno", async () => {
    pripojenia.push(
      { id: "c1", company_id: SKUTOCNA, provider: "wise", status: "connected" },
      { id: "c2", company_id: TESTOVACIA, provider: "wise", status: "connected" },
    );
    const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");
    const r = await runDailySyncOstatnych();
    expect(wise).toHaveBeenCalledTimes(1);
    expect(wise).toHaveBeenCalledWith(SKUTOCNA);
    expect(r.connections).toBe(1);
  });
});
