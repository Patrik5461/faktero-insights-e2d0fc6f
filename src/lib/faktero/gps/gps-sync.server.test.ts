import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Beh synchronizácie GPS s pamäťovou databázou a podvrhnutým adaptérom:
 * - druhý beh nezaloží duplicity,
 * - keď vyprší čas, pripojenie ostane `neuplne` a log je „ciastocne“ (dokončí ďalší beh),
 * - limit volaní poskytovateľa → stav „limit“ a `neuplne`, kurzory ostanú,
 * - adaptér, ktorý sa pýta po vozidlách, dostane naraz len dávku vozidiel.
 */

type Riadok = Record<string, any>;
const tabulky: Record<string, Riadok[]> = {};
let poradie = 0;

function dotaz(tabulka: string) {
  const filtre: Array<(r: Riadok) => boolean> = [];
  let akcia: { druh: "select" | "update" | "insert" | "delete"; data?: any } = {
    druh: "select",
  };
  let jeden = false;
  const riadky = () => (tabulky[tabulka] ??= []);
  const vysledok = () => {
    if (akcia.druh === "insert") {
      const nove: Riadok[] = (Array.isArray(akcia.data) ? akcia.data : [akcia.data]).map(
        (r: Riadok) => ({
          id: `${tabulka}-${++poradie}`,
          ...r,
        }),
      );
      if (tabulka === "trips")
        for (const n of nove)
          if (
            riadky().some(
              (r) =>
                r.company_id === n.company_id &&
                r.external_source === n.external_source &&
                r.external_id === n.external_id,
            )
          )
            return { data: null, error: { message: "duplicate key idx_trips_external_unique" } };
      riadky().push(...nove);
      return { data: jeden ? nove[0] : nove, error: null };
    }
    const vybrane = riadky().filter((r) => filtre.every((f) => f(r)));
    if (akcia.druh === "update") for (const r of vybrane) Object.assign(r, akcia.data);
    if (akcia.druh === "delete") tabulky[tabulka] = riadky().filter((r) => !vybrane.includes(r));
    return { data: jeden ? (vybrane[0] ?? null) : vybrane, error: null };
  };
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (s: string, v: any) => (filtre.push((r) => r[s] === v), q),
    in: (s: string, v: any[]) => (filtre.push((r) => v.includes(r[s])), q),
    update: (data: any) => ((akcia = { druh: "update", data }), q),
    insert: (data: any) => ((akcia = { druh: "insert", data }), q),
    delete: () => ((akcia = { druh: "delete" }), q),
    maybeSingle: () => ((jeden = true), q),
    single: () => ((jeden = true), q),
    then: (ok: any, nie: any) => Promise.resolve(vysledok()).then(ok, nie),
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => dotaz(t) },
}));
vi.mock("../payment-crypto.server", () => ({
  decryptSecret: (s: string) => s,
  isDecryptError: () => false,
}));

const adapter: any = {
  id: "falosny",
  nazov: "Falošný GPS",
  polia: [{ kluc: "heslo", nazov: "Heslo", typ: "heslo", povinne: true }],
  vozidla: vi.fn(),
  jazdy: vi.fn(),
  test: vi.fn(),
};
vi.mock("./register", () => ({
  ADAPTERY: [adapter],
  adapterPodlaId: (id: string) => (id === "falosny" ? adapter : null),
}));

const { synchronizujPripojenie } = await import("./gps-sync.server");
const { GpsChyba } = await import("./typy");

function jazda(vozidlo: string, i: number) {
  const z = new Date(Date.now() - (i + 1) * 3600_000);
  return {
    externeId: `${vozidlo}-${i}`,
    vozidloExterneId: vozidlo,
    zaciatok: z.toISOString(),
    koniec: new Date(z.getTime() + 1800_000).toISOString(),
    km: 10,
    sukromna: null,
  };
}

beforeEach(() => {
  for (const k of Object.keys(tabulky)) delete tabulky[k];
  adapter.vozidla.mockReset();
  adapter.jazdy.mockReset();
  delete adapter.vozidielNaVolanie;
  tabulky.gps_pripojenia = [
    {
      id: "p1",
      company_id: "c1",
      poskytovatel: "falosny",
      nazov: "",
      prihlasenie_sifrovane: JSON.stringify({ heslo: "tajne" }),
      aktivne: true,
      auto_sync: true,
      neuplne: true,
      posledna_sync_at: null,
      tankovania_do: null,
    },
  ];
  tabulky.vehicles = [
    { id: "a1", company_id: "c1", license_plate: "BA111AA" },
    { id: "a2", company_id: "c1", license_plate: "BA222BB" },
    { id: "a3", company_id: "c1", license_plate: "BA333CC" },
  ];
  adapter.vozidla.mockResolvedValue([
    { externeId: "x1", spz: "BA 111 AA", nazov: "Auto 1" },
    { externeId: "x2", spz: "BA-222-BB", nazov: "Auto 2" },
    { externeId: "x3", spz: "BA333CC", nazov: "Auto 3" },
  ]);
  adapter.jazdy.mockImplementation(async (_p: any, _od: Date, _do: Date, ids: string[]) =>
    ids.flatMap((v) => [jazda(v, 1), jazda(v, 2)]),
  );
});

describe("synchronizujPripojenie", () => {
  it("spáruje vozidlá podľa ŠPZ, stiahne jazdy a druhý beh nezaloží duplicity", async () => {
    const r = await synchronizujPripojenie("p1", { druh: "rucne" });
    expect(r.chyba).toBeUndefined();
    expect(r.importovane).toBe(6);
    expect(r.neuplne).toBe(false);
    expect(tabulky.gps_vozidla_vazby.map((v) => v.vehicle_id).sort()).toEqual(["a1", "a2", "a3"]);
    expect(tabulky.trips).toHaveLength(6);
    // Kurzor po celom behu sedí na „teraz“ → ďalší beh bez prekryvu nič nesťahuje;
    // prekryv dvoch dní sa skúša cez posunutie kurzora dozadu.
    for (const v of tabulky.gps_vozidla_vazby)
      v.jazdy_do = new Date(Date.now() - 3 * 86400_000).toISOString();
    const r2 = await synchronizujPripojenie("p1", { druh: "noc" });
    expect(r2.importovane).toBe(0);
    expect(r2.duplicity).toBe(6);
    expect(tabulky.trips).toHaveLength(6);
    const p = tabulky.gps_pripojenia[0];
    expect(p.neuplne).toBe(false);
    expect(p.stav).toBe("ok");
    expect(tabulky.gps_sync_logy.map((l) => [l.druh, l.stav])).toEqual([
      ["rucne", "ok"],
      ["noc", "ok"],
    ]);
  });

  it("keď vyprší čas, ostane neúplné a dokončí to ďalší beh", async () => {
    adapter.vozidielNaVolanie = 1;
    let volani = 0;
    const koniec = Date.now() + 10_000;
    adapter.jazdy.mockImplementation(async (_p: any, _o: Date, _d: Date, ids: string[]) => {
      volani++;
      // po prvom volaní „zjeme“ čas behu
      if (volani === 1) vi.setSystemTime(koniec - 1000);
      return ids.map((v) => jazda(v, 1));
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const r = await synchronizujPripojenie("p1", { druh: "noc", koniec });
      expect(volani).toBe(1);
      expect(r.neuplne).toBe(true);
      expect(r.importovane).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect(tabulky.gps_pripojenia[0].neuplne).toBe(true);
    expect(tabulky.gps_sync_logy.at(-1)).toMatchObject({ druh: "noc", stav: "ciastocne" });
    // jedno vozidlo má kurzor, dve čakajú
    expect(tabulky.gps_vozidla_vazby.filter((v) => v.jazdy_do).length).toBe(1);

    const r2 = await synchronizujPripojenie("p1", { druh: "noc" });
    expect(r2.neuplne).toBe(false);
    expect(tabulky.trips).toHaveLength(3);
    expect(tabulky.gps_pripojenia[0].neuplne).toBe(false);
  });

  it("dávka vozidiel na jedno volanie adaptéra", async () => {
    adapter.vozidielNaVolanie = 2;
    await synchronizujPripojenie("p1", { druh: "rucne" });
    const davky = adapter.jazdy.mock.calls.map((c: any[]) => c[3].length);
    expect(davky).toEqual([2, 1]);
    expect(tabulky.trips).toHaveLength(6);
  });

  it("limit volaní poskytovateľa → stav limit a neúplné, heslo nie je v logu", async () => {
    adapter.jazdy.mockRejectedValue(new GpsChyba("limit", "Príliš veľa volaní (tajne)."));
    const r = await synchronizujPripojenie("p1", { druh: "noc" });
    expect(r.chyba).toContain("••••");
    expect(r.chyba).not.toContain("tajne");
    const p = tabulky.gps_pripojenia[0];
    expect(p.stav).toBe("limit");
    expect(p.neuplne).toBe(true);
    expect(tabulky.gps_sync_logy.at(-1)).toMatchObject({ stav: "limit" });
  });

  it("iná chyba (zlé heslo) sa neskúša každých 15 minút", async () => {
    adapter.vozidla.mockRejectedValue(new GpsChyba("prihlasenie", "Zlé heslo."));
    const r = await synchronizujPripojenie("p1", { druh: "noc" });
    expect(r.chyba).toBe("Zlé heslo.");
    expect(tabulky.gps_pripojenia[0]).toMatchObject({ stav: "chyba", neuplne: false });
  });
});
