import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Nočný beh musí stiahnuť aj banky mimo Tatra banky.
 *
 * Pôvodne mal natvrdo `provider = "tatrabanka"`, takže Wise, Revolut a
 * Wallester sa nesťahovali nikdy — pripojenie hlásilo „pripojené" a pohyby
 * neprišli, kým človek neklikol na tlačidlo. Toto stráži, že sa na ne beh
 * pýta a že zlyhanie jednej banky nezhodí ostatné.
 */

const pripojenia: any[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (tabulka: string) => {
      const dotaz: any = {
        select: () => dotaz,
        in: (_s: string, hodnoty: string[]) => {
          dotaz._povolene = hodnoty;
          return dotaz;
        },
        eq: () =>
          Promise.resolve({ data: pripojenia.filter((c) => dotaz._povolene.includes(c.provider)) }),
        update: () => ({ eq: () => Promise.resolve({}) }),
      };
      if (tabulka !== "bank_connections") throw new Error(`neočakávaná tabuľka ${tabulka}`);
      return dotaz;
    },
  },
}));

const wise = vi.fn();
const revolut = vi.fn();
const wallester = vi.fn();
vi.mock("./wise.server", () => ({ synchronizujWiseZoServera: (c: string) => wise(c) }));
vi.mock("./revolut.server", () => ({ synchronizujRevolutZoServera: (c: string) => revolut(c) }));
vi.mock("./wallester.server", () => ({
  synchronizujWallesterZoServera: (c: string) => wallester(c),
}));

function pripojenie(provider: string, id: string) {
  return { id, company_id: `firma-${id}`, provider, status: "connected" };
}

beforeEach(() => {
  pripojenia.length = 0;
  for (const f of [wise, revolut, wallester]) {
    f.mockReset();
    f.mockResolvedValue({ accounts: 1, inserted: 2, problemy: [] });
  }
});

describe("denný beh a ostatné banky", () => {
  it("stiahne Wise, Revolut aj Wallester, nielen Tatra banku", async () => {
    pripojenia.push(
      pripojenie("wise", "w1"),
      pripojenie("revolut", "r1"),
      pripojenie("wallester", "s1"),
    );
    const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");

    const r = await runDailySyncOstatnych();

    expect(wise).toHaveBeenCalledWith("firma-w1");
    expect(revolut).toHaveBeenCalledWith("firma-r1");
    expect(wallester).toHaveBeenCalledWith("firma-s1");
    expect(r.connections).toBe(3);
    expect(r.inserted).toBe(6);
    expect(r.failed).toBe(0);
  });

  it("zlyhanie jednej banky nezhodí ostatné", async () => {
    pripojenia.push(pripojenie("wise", "w1"), pripojenie("revolut", "r1"));
    wise.mockRejectedValue(new Error("Wise odmietol podpis"));
    const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");

    const r = await runDailySyncOstatnych();

    expect(r.failed).toBe(1);
    expect(r.results.find((x: any) => x.connection_id === "w1")?.error).toBe(
      "Wise odmietol podpis",
    );
    // Revolut sa napriek tomu stiahol.
    expect(revolut).toHaveBeenCalled();
    expect(r.inserted).toBe(2);
  });

  it("problém na jednej mene sa zapíše, pripojenie ostáva úspešné", async () => {
    pripojenia.push(pripojenie("wise", "w1"));
    wise.mockResolvedValue({ accounts: 2, inserted: 3, problemy: ["USD: podpis odmietnutý"] });
    const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");

    const r = await runDailySyncOstatnych();

    expect(r.failed).toBe(0);
    expect(r.results[0].problemy).toEqual(["USD: podpis odmietnutý"]);
  });

  it("banku, ktorú beh nevie stiahnuť, si ani nevypýta", async () => {
    pripojenia.push(pripojenie("wise", "w1"), pripojenie("neznama", "x1"));
    const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");

    const r = await runDailySyncOstatnych();

    expect(r.connections).toBe(1);
  });
});

/**
 * Sťahovanie pohybov bolo pre tie tri banky trikrát ten istý kód. Po vydelení
 * na jedno miesto naň visí aj tlačidlo v appke aj nočný beh, takže sa oplatí
 * podchytiť, čo v ňom bolo najkrehkejšie: vynechanie už uložených pohybov a
 * to, že jedna mena nemá zhodiť ostatné.
 */
function fakeKlient(ucty: any[], zname: string[]) {
  const vlozene: any[] = [];
  let synchronizovane = false;
  const klient = {
    from: (tabulka: string) => {
      if (tabulka === "bank_accounts") {
        return { select: () => ({ eq: () => Promise.resolve({ data: ucty }) }) };
      }
      if (tabulka === "bank_connections") {
        return {
          update: () => ({
            eq: () => {
              synchronizovane = true;
              return Promise.resolve({});
            },
          }),
        };
      }
      const dotaz: any = {
        select: () => dotaz,
        eq: () => dotaz,
        gte: () => dotaz,
        not: () => dotaz,
        order: () => dotaz,
        range: (od: number) =>
          Promise.resolve({
            data: od === 0 ? zname.map((r) => ({ transaction_reference: r })) : [],
            error: null,
          }),
        insert: (riadky: any[]) => ({
          select: () => {
            vlozene.push(...riadky);
            return Promise.resolve({ data: riadky.map(() => ({ id: "x" })), error: null });
          },
        }),
      };
      return dotaz;
    },
  };
  return { klient, vlozene, bolSync: () => synchronizovane };
}

const pohyb = (id: string) => ({
  external_id: id,
  booking_date: "2026-09-10",
  amount: 10,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  description: "skúška",
});

describe("stiahniPohybyPripojenia", () => {
  it("vloží len to, čo ešte nemáme", async () => {
    const { klient, vlozene, bolSync } = fakeKlient(
      [{ id: "u1", external_account_id: "ext1", currency: "EUR" }],
      ["uz-mame"],
    );
    const { stiahniPohybyPripojenia } = await import("./bank-sync.server");

    const r = await stiahniPohybyPripojenia(klient, "firma", "conn", async () => [
      pohyb("uz-mame"),
      pohyb("nove"),
    ]);

    expect(r.vlozenych).toBe(1);
    expect(vlozene.map((v) => v.transaction_reference)).toEqual(["nove"]);
    expect(bolSync()).toBe(true);
  });

  it("chyba jednej meny nezabráni stiahnutiu ostatných", async () => {
    const { klient, vlozene } = fakeKlient(
      [
        { id: "u1", external_account_id: "ext1", currency: "USD" },
        { id: "u2", external_account_id: "ext2", currency: "EUR" },
      ],
      [],
    );
    const { stiahniPohybyPripojenia } = await import("./bank-sync.server");

    const r = await stiahniPohybyPripojenia(klient, "firma", "conn", async (u) => {
      if (u.currency === "USD") throw new Error("podpis odmietnutý");
      return [pohyb("eur-1")];
    });

    expect(r.vlozenych).toBe(1);
    expect(r.problemy).toEqual(["USD: podpis odmietnutý"]);
    expect(vlozene).toHaveLength(1);
  });

  it("účet bez identifikátora v banke sa preskočí", async () => {
    const { klient } = fakeKlient([{ id: "u1", external_account_id: null, currency: "EUR" }], []);
    const { stiahniPohybyPripojenia } = await import("./bank-sync.server");
    const nacitaj = vi.fn();

    const r = await stiahniPohybyPripojenia(klient, "firma", "conn", nacitaj as any);

    expect(nacitaj).not.toHaveBeenCalled();
    expect(r.vlozenych).toBe(0);
  });
});
