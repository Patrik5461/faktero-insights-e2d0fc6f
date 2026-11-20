import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dogenerovanie výpisov po pripojení banky: zlyhaný mesiac sa doplní, výpis
 * od banky ostane nedotknutý, vlastný výpis sa prestaví len keď pribudli
 * pohyby, a nikdy sa nesiaha na inú firmu.
 */

/* ----------------------------------------------- pamäťová „databáza" */

type Tab = Record<string, any[]>;
let tabulky: Tab;
let nahrate: string[];
let seq = 0;

function dotaz(table: string) {
  const filtre: Array<(r: any) => boolean> = [];
  let op: { k: "select" | "insert" | "update" | "upsert" | "delete"; data?: any } = { k: "select" };
  let poradie: { col: string; asc: boolean } | null = null;
  let limit: number | null = null;
  let range: [number, number] | null = null;
  let jeden = false;

  const vykonaj = () => {
    const rows = (tabulky[table] ??= []);
    if (op.k === "insert") {
      const arr = (Array.isArray(op.data) ? op.data : [op.data]).map((r: any) => ({
        id: `id-${++seq}`,
        status: "pending",
        source: "bank",
        error: null,
        task_id: null,
        updated_at: new Date().toISOString(),
        ...r,
      }));
      rows.push(...arr);
      return { data: jeden ? arr[0] : arr, error: null };
    }
    if (op.k === "upsert") {
      const r = op.data;
      const kluc = (x: any) =>
        [x.bank_account_id, x.period_start, x.period_end, x.export_type].join("|");
      const ex = rows.find((x) => kluc(x) === kluc(r));
      if (ex) Object.assign(ex, r);
      else rows.push({ id: `id-${++seq}`, ...r });
      return { data: null, error: null };
    }
    let out = rows.filter((r) => filtre.every((f) => f(r)));
    if (op.k === "update") {
      out.forEach((r) => Object.assign(r, op.data));
      return { data: null, error: null };
    }
    if (op.k === "delete") {
      tabulky[table] = rows.filter((r) => !out.includes(r));
      return { data: null, error: null };
    }
    if (poradie) {
      const { col, asc } = poradie;
      out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
    }
    if (range) out = out.slice(range[0], range[1] + 1);
    if (limit != null) out = out.slice(0, limit);
    return { data: jeden ? (out[0] ?? null) : out, error: null };
  };

  const b: any = {
    select: () => b,
    insert: (d: any) => ((op = { k: "insert", data: d }), b),
    update: (d: any) => ((op = { k: "update", data: d }), b),
    upsert: (d: any) => ((op = { k: "upsert", data: d }), b),
    delete: () => ((op = { k: "delete" }), b),
    eq: (c: string, v: any) => (filtre.push((r) => r[c] === v), b),
    in: (c: string, v: any[]) => (filtre.push((r) => v.includes(r[c])), b),
    gt: (c: string, v: any) => (filtre.push((r) => r[c] > v), b),
    gte: (c: string, v: any) => (filtre.push((r) => r[c] >= v), b),
    lte: (c: string, v: any) => (filtre.push((r) => r[c] <= v), b),
    order: (col: string, o?: { ascending?: boolean }) => (
      (poradie ??= { col, asc: o?.ascending !== false }), b
    ),
    limit: (n: number) => ((limit = n), b),
    range: (a: number, z: number) => ((range = [a, z]), b),
    maybeSingle: () => ((jeden = true), Promise.resolve(vykonaj())),
    single: () => ((jeden = true), Promise.resolve(vykonaj())),
    then: (res: any, rej: any) => Promise.resolve(vykonaj()).then(res, rej),
  };
  return b;
}

const supabaseAdmin = {
  from: (t: string) => dotaz(t),
  storage: {
    from: () => ({
      upload: async (path: string) => {
        nahrate.push(path);
        return { error: null };
      },
    }),
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("./testovacia-firma-banka.server", () => ({
  bezTestovacichFiriem: async (r: any[]) => r,
}));

/* --------------------------------------------- banka a vlastný výpis */

const vybavVypisZBanky = vi.fn();
vi.mock("./bank-statements.server", async (orig) => ({
  ...(await orig<typeof import("./bank-statements.server")>()),
  vybavVypisZBanky: (...a: any[]) => vybavVypisZBanky(...a),
}));

const zostavVypisUctu = vi.fn();
vi.mock("./bank-statements-own.server", () => ({
  zostavVypisUctu: (...a: any[]) => zostavVypisUctu(...a),
  suborVypisu: async () => new Uint8Array([1, 2, 3]),
  cestaVlastnehoVypisu: (c: string, a: string, s: string, t: string) =>
    `${c}/${a}/${s.slice(0, 7)}-faktero.${t.toLowerCase()}`,
  BUCKET_VYPISOV: "bank-statements",
}));

const { dogenerujVypisy, spustiDogenerovanie, mesiaceNaKontrolu, zlucVstupy } =
  await import("./vypisy-dogenerovanie.server");

/* ------------------------------------------------------------ dáta */

const DNES = "2026-11-19";
const STARO = "2026-11-01T06:00:00.000Z";

function vypis(over: Record<string, any>) {
  return {
    id: `v-${++seq}`,
    company_id: "f1",
    bank_account_id: "tb1",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    export_type: "PDF",
    status: "ready",
    source: "bank",
    error: null,
    task_id: null,
    updated_at: STARO,
    ...over,
  };
}

/** Oba formáty za mesiac v danom stave. */
function oba(over: Record<string, any>) {
  return [vypis({ ...over, export_type: "PDF" }), vypis({ ...over, export_type: "XML" })];
}

/** Všetky mesiace od septembra do októbra hotové od banky — nič na práci. */
function hotoveOdBanky(ucet: string, firma = "f1") {
  return ["2026-09", "2026-10"].flatMap((m) =>
    oba({
      bank_account_id: ucet,
      company_id: firma,
      period_start: `${m}-01`,
      period_end: m === "2026-09" ? "2026-09-30" : "2026-10-31",
    }),
  );
}

beforeEach(() => {
  seq = 0;
  nahrate = [];
  // Banka výpis vydá: riadok (ak bol) prejde do `ready`, ako v skutočnom `processRow`.
  vybavVypisZBanky.mockReset().mockImplementation(async (_db, _c, _a, _s, _e, _t, riadok) => {
    if (riadok) riadok.status = "ready";
    return { stav: "ready", vytvoreny: !riadok };
  });
  zostavVypisUctu.mockReset().mockImplementation(async () => ({
    ok: true,
    input: { periodStart: "x" },
    najstarsi: "2026-09-01",
    ciastocnyOd: null,
  }));
  tabulky = {
    bank_connections: [
      { id: "c1", company_id: "f1", provider: "tatrabanka", status: "connected", access_token: "t", consent_id: "s2" },
      { id: "c2", company_id: "f2", provider: "tatrabanka", status: "connected", access_token: "t", consent_id: "s9" },
    ],
    bank_accounts: [
      { id: "tb1", company_id: "f1", bank_connection_id: "c1", iban: "SK1", external_account_id: "e1", unavailable_since: null, pohyby_chyba_suhlas: null },
      { id: "cudzi1", company_id: "f1", bank_connection_id: "c1", iban: "SK0900", external_account_id: "e2", unavailable_since: null, pohyby_chyba_suhlas: null },
      { id: "tb2", company_id: "f2", bank_connection_id: "c2", iban: "SK2", external_account_id: "e3", unavailable_since: null, pohyby_chyba_suhlas: null },
    ],
    bank_transactions: [
      { id: "t1", company_id: "f1", bank_account_id: "tb1", booking_date: "2026-09-01", created_at: "2026-09-02T00:00:00Z" },
      { id: "t2", company_id: "f1", bank_account_id: "cudzi1", booking_date: "2026-09-01", created_at: "2026-09-02T00:00:00Z" },
      { id: "t3", company_id: "f2", bank_account_id: "tb2", booking_date: "2026-09-01", created_at: "2026-09-02T00:00:00Z" },
    ],
    bank_statements: [
      ...hotoveOdBanky("tb1"),
      // Cudzí účet: september aj október zostavené Fakterom, banka ho nepozná.
      ...["2026-09", "2026-10"].flatMap((m) =>
        oba({
          bank_account_id: "cudzi1",
          period_start: `${m}-01`,
          period_end: m === "2026-09" ? "2026-09-30" : "2026-10-31",
          source: "faktero",
          error: null,
        }),
      ),
      vypis({ bank_account_id: "cudzi1", period_start: "2026-08-01", period_end: "2026-08-31", status: "unsupported", error: "tb_statement_task_failed: 404 PRODUCT_UNKNOWN", updated_at: STARO }),
      ...hotoveOdBanky("tb2", "f2"),
    ],
  };
});

describe("mesiaceNaKontrolu", () => {
  it("ukončené mesiace od prvého pohybu po minulý mesiac, najviac 13", () => {
    expect(mesiaceNaKontrolu(DNES, "2026-09-15")).toEqual(["2026-10", "2026-09"]);
    const dlhe = mesiaceNaKontrolu(DNES, "2020-01-01");
    expect(dlhe).toHaveLength(13);
    expect(dlhe[0]).toBe("2026-10");
    expect(dlhe[12]).toBe("2025-10");
    expect(mesiaceNaKontrolu(DNES, "2020-01-01", "2026-10")).toEqual(["2026-10"]);
  });
});

describe("dogenerujVypisy", () => {
  it("bez zmien nerobí nič — banka ani zostavenie sa nevolajú", async () => {
    const r = await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    expect(zostavVypisUctu).not.toHaveBeenCalled();
    expect(nahrate).toEqual([]);
    expect(r.zBanky + r.vlastnych + r.chyby.length).toBe(0);
  });

  it("zlyhaný mesiac (SCA_EXPIRED) vypýta znova od banky, hotový od banky nechá tak", async () => {
    const okt = tabulky.bank_statements.filter(
      (r) => r.bank_account_id === "tb1" && r.period_start === "2026-10-01",
    );
    okt.forEach((r) => Object.assign(r, { status: "failed", error: "401 SCA_EXPIRED" }));

    const r = await dogenerujVypisy({ companyId: "f1", dnes: DNES });

    expect(vybavVypisZBanky).toHaveBeenCalledTimes(2);
    for (const [, , acc, start, end, typ, riadok] of vybavVypisZBanky.mock.calls) {
      expect(acc.id).toBe("tb1");
      expect([start, end]).toEqual(["2026-10-01", "2026-10-31"]);
      expect(["PDF", "XML"]).toContain(typ);
      expect(riadok?.period_start).toBe("2026-10-01");
    }
    // September (ready od banky) sa nepýtal ani neprestavoval.
    expect(zostavVypisUctu).not.toHaveBeenCalled();
    expect(r.zBanky).toBe(2);
  });

  it("chýbajúci mesiac účtu v TB sa založí cez banku", async () => {
    tabulky.bank_statements = tabulky.bank_statements.filter(
      (r) => !(r.bank_account_id === "tb1" && r.period_start === "2026-09-01"),
    );
    await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).toHaveBeenCalledTimes(2);
    expect(vybavVypisZBanky.mock.calls.every((c) => c[3] === "2026-09-01" && c[6] === null)).toBe(true);
  });

  it("pri stále vypršanom súhlase sa do banky nepýta", async () => {
    tabulky.bank_statements
      .filter((r) => r.bank_account_id === "tb1" && r.period_start === "2026-10-01")
      .forEach((r) => Object.assign(r, { status: "failed" }));
    tabulky.bank_accounts[0].pohyby_chyba_suhlas = "s2";
    const r = await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    expect(r.cakaNaSuhlas).toBe(2);
  });

  it("čo banka odmietne (PRODUCT_UNKNOWN), zostaví Faktero", async () => {
    tabulky.bank_statements
      .filter((r) => r.bank_account_id === "tb1" && r.period_start === "2026-10-01")
      .forEach((r) => Object.assign(r, { status: "failed" }));
    vybavVypisZBanky.mockImplementation(async () => ({
      stav: "unsupported",
      vytvoreny: false,
      dovod: "mimo-tb",
      chyba: "PRODUCT_UNKNOWN",
    }));
    const r = await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(zostavVypisUctu).toHaveBeenCalledTimes(1);
    expect(r.vlastnych).toBe(2);
    expect(nahrate.sort()).toEqual(["f1/tb1/2026-10-faktero.pdf", "f1/tb1/2026-10-faktero.xml"]);
  });

  it("zlyhaný vlastný výpis cudzieho účtu sa prestaví bez banky", async () => {
    tabulky.bank_statements
      .filter((r) => r.bank_account_id === "cudzi1" && r.period_start === "2026-10-01")
      .forEach((r) => Object.assign(r, { status: "failed", error: "upload zlyhal" }));
    const r = await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    expect(zostavVypisUctu).toHaveBeenCalledTimes(1);
    expect(zostavVypisUctu.mock.calls[0].slice(1, 4)).toEqual(["cudzi1", "2026-10-01", "2026-10-31"]);
    const okt = tabulky.bank_statements.filter(
      (x) => x.bank_account_id === "cudzi1" && x.period_start === "2026-10-01",
    );
    expect(okt.map((x) => [x.status, x.source, x.error])).toEqual([
      ["ready", "faktero", null],
      ["ready", "faktero", null],
    ]);
    expect(r.vlastnych).toBe(2);
  });

  it("mesiac, ku ktorému pribudli pohyby, sa vlastný prestaví — iné mesiace nie", async () => {
    tabulky.bank_transactions.push({
      id: "t9",
      company_id: "f1",
      bank_account_id: "cudzi1",
      booking_date: "2026-10-20",
      created_at: "2026-11-18T10:00:00Z",
    });
    await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    // Október áno, september nie (pohyb je z októbra).
    expect(zostavVypisUctu).toHaveBeenCalledTimes(1);
    expect(zostavVypisUctu.mock.calls[0][2]).toBe("2026-10-01");
    // Ready výpisy od banky na účte tb1 sa nezmenili.
    expect(
      tabulky.bank_statements
        .filter((r) => r.bank_account_id === "tb1")
        .every((r) => r.status === "ready" && r.source === "bank" && r.updated_at === STARO),
    ).toBe(true);
  });

  it("výpis od banky (ready) sa neprestaví ani keď pribudnú pohyby", async () => {
    tabulky.bank_transactions.push({
      id: "t8",
      company_id: "f1",
      bank_account_id: "tb1",
      booking_date: "2026-10-20",
      created_at: "2026-11-18T10:00:00Z",
    });
    await dogenerujVypisy({ companyId: "f1", dnes: DNES, bankAccountIds: ["tb1"] });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    expect(zostavVypisUctu).not.toHaveBeenCalled();
  });

  it("nesiaha na inú firmu", async () => {
    tabulky.bank_statements
      .filter((r) => r.company_id === "f2")
      .forEach((r) => Object.assign(r, { status: "failed" }));
    await dogenerujVypisy({ companyId: "f1", dnes: DNES });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    // Ani cudzí účet podstrčený v zozname účtov.
    await dogenerujVypisy({ companyId: "f1", dnes: DNES, bankAccountIds: ["tb2"] });
    expect(vybavVypisZBanky).not.toHaveBeenCalled();
    expect(tabulky.bank_statements.filter((r) => r.company_id === "f2").every((r) => r.status === "failed")).toBe(true);
  });
});

describe("spustiDogenerovanie", () => {
  it("obnovený súhlas dogeneruje len svoju firmu; súbežná požiadavka sa zlúči", async () => {
    for (const r of tabulky.bank_statements) {
      if (r.period_start === "2026-10-01" && r.source === "bank") r.status = "failed";
    }
    const a = spustiDogenerovanie({ companyId: "f1", dovod: "pripojenie-tb", dnes: DNES });
    const b = spustiDogenerovanie({ companyId: "f1", dovod: "nove-pohyby", dnes: DNES });
    await Promise.all([a, b]);
    const ucty = new Set(vybavVypisZBanky.mock.calls.map((c) => c[2].id));
    expect([...ucty]).toEqual(["tb1"]);
    // Prvý beh október vybavil; zlúčený druhý už nemal čo robiť.
    expect(vybavVypisZBanky).toHaveBeenCalledTimes(2);
    expect(tabulky.bank_statements.filter((r) => r.company_id === "f2" && r.status === "failed")).toHaveLength(2);
  });

  it("zlucVstupy: prázdny zoznam účtov znamená všetky", () => {
    expect(
      zlucVstupy({ companyId: "f1", bankAccountIds: ["a"] }, { companyId: "f1" }).bankAccountIds,
    ).toBeUndefined();
    expect(
      zlucVstupy({ companyId: "f1", bankAccountIds: ["a"] }, { companyId: "f1", bankAccountIds: ["b"] })
        .bankAccountIds,
    ).toEqual(["a", "b"]);
  });
});
