import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Stráže testovacej firmy pri cudzích integráciách: konektor Pohody dostane
  prázdnu dávku, Trans.eu sa nezavolá a cron GPS testovaciu firmu preskočí.
  Skutočná firma vždy prejde ďalej.
*/

const TEST = "11111111-1111-4111-8111-111111111111";
const SKUTOCNA = "22222222-2222-4222-8222-222222222222";

/** Podvrh databázy: `companies` vie povedať, ktorá firma je testovacia. */
function klient(
  dalsie: (tabulka: string) => any = () => {
    throw new Error("DALEJ");
  },
) {
  return {
    from: (tabulka: string) => {
      if (tabulka !== "companies") return dalsie(tabulka);
      let id: string | null = null;
      let ids: string[] = [];
      const q: any = {
        select: () => q,
        eq: (_s: string, v: string) => ((id = v), q),
        in: (_s: string, v: string[]) => ((ids = v), q),
        not: () => q,
        maybeSingle: async () => ({
          data: { testovacia_pre: id === TEST ? SKUTOCNA : null },
          error: null,
        }),
        then: (ok: (x: unknown) => unknown) =>
          ok({ data: ids.filter((x) => x === TEST).map((x) => ({ id: x })), error: null }),
      };
      return q;
    },
  };
}

let admin: any = klient();
vi.mock("@/integrations/supabase/client.server", () => ({
  // Moduly si klienta odložia pri importe — preto stály objekt, ktorý deleguje.
  supabaseAdmin: { from: (t: string) => admin.from(t) },
}));

beforeEach(() => {
  admin = klient();
});

describe("konektor Pohody — zostavDavku", () => {
  it("testovacia firma dostane prázdnu dávku a nič sa neoznačí", async () => {
    const { zostavDavku } = await import("./pohoda-konektor.server");
    const davka = await zostavDavku(klient(), { companyId: TEST, oznacit: true });
    expect(davka.prazdna).toBe(true);
    expect(davka.xml).toBe("");
    expect(davka.faktur).toBe(0);
  });

  it("skutočná firma ide ďalej k dokladom", async () => {
    const { zostavDavku } = await import("./pohoda-konektor.server");
    await expect(zostavDavku(klient(), { companyId: SKUTOCNA, oznacit: false })).rejects.toThrow(
      "DALEJ",
    );
  });
});

describe("Trans.eu — konfigTranseu", () => {
  it("testovacia firma sa s Trans.eu nespojí", async () => {
    const { konfigTranseu } = await import("./transeu.server");
    await expect(konfigTranseu(TEST)).rejects.toMatchObject({
      name: "TestovaciaFirmaZastavene",
      message: "Testovacia firma — Trans.eu sa v testovacej firme nepripája.",
    });
  });

  it("skutočná firma ide ďalej k napojeniu", async () => {
    const { konfigTranseu } = await import("./transeu.server");
    await expect(konfigTranseu(SKUTOCNA)).rejects.toThrow("DALEJ");
  });
});

describe("GPS — nočný beh", () => {
  it("testovaciu firmu preskočí, skutočnú synchronizuje", async () => {
    const synchronizovane: string[] = [];
    admin = klient((tabulka) => {
      if (tabulka !== "gps_pripojenia") throw new Error(`neočakávaná tabuľka ${tabulka}`);
      const zoznam = [
        { id: "p-test", company_id: TEST, aktivne: true, auto_sync: true, poskytovatel: "traccar" },
        {
          id: "p-ostra",
          company_id: SKUTOCNA,
          aktivne: true,
          auto_sync: true,
          poskytovatel: "traccar",
        },
      ];
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: async () => ({ data: zoznam, error: null }),
        // synchronizujPripojenie: načítanie jedného pripojenia
        maybeSingle: async () => {
          throw new Error("SYNC");
        },
      };
      q.eq = (_s: string, v: unknown) => {
        if (typeof v === "string" && v.startsWith("p-")) synchronizovane.push(v);
        return q;
      };
      return q;
    });
    const { behCronu } = await import("./gps/gps-sync.server");
    await behCronu(60_000).catch(() => undefined);
    expect(synchronizovane).not.toContain("p-test");
    expect(synchronizovane).toContain("p-ostra");
  });
});
