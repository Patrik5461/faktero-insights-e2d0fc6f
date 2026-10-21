/*
  Prevzatie firmy migračným kódom a rozpoznanie PARTICIPANT_ALREADY_REGISTERED.
  ePošták aj Resend sú len mock fetchu — naostro sa nevolá nič.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KOD = "TAJNY-MIGRACNY-KOD-8f3a91";

// ─── Databáza v pamäti ───────────────────────────────────────────────────────
type Riadok = Record<string, any>;
const tabulky: Record<string, Riadok[]> = {};
const zapisy: { tabulka: string; op: string; data: unknown }[] = [];

function dotaz(tabulka: string) {
  const filtre: ((r: Riadok) => boolean)[] = [];
  let akcia: { op: "select" | "update" | "insert" | "upsert"; data?: any } = { op: "select" };
  let jeden = false;
  let limit = Infinity;
  const riadky = () => (tabulky[tabulka] ??= []);
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => (filtre.push((r) => r[k] === v), b),
    in: (k: string, v: unknown[]) => (filtre.push((r) => v.includes(r[k])), b),
    is: (k: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) === v), b),
    not: (k: string, _op: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) !== v), b),
    order: () => b,
    limit: (n: number) => ((limit = n), b),
    maybeSingle: () => ((jeden = true), b),
    update: (data: any) => ((akcia = { op: "update", data }), b),
    insert: (data: any) => ((akcia = { op: "insert", data }), b),
    upsert: (data: any) => ((akcia = { op: "upsert", data }), b),
    then: (ok: (v: any) => void, zle?: (e: unknown) => void) => {
      try {
        let data: any;
        if (akcia.op === "insert" || akcia.op === "upsert") {
          zapisy.push({ tabulka, op: akcia.op, data: akcia.data });
          riadky().push({ ...akcia.data });
          data = [akcia.data];
        } else {
          const vyber = riadky()
            .filter((r) => filtre.every((f) => f(r)))
            .slice(0, limit);
          if (akcia.op === "update") {
            zapisy.push({ tabulka, op: "update", data: akcia.data });
            for (const r of vyber) Object.assign(r, akcia.data);
          }
          data = jeden ? (vyber[0] ? { ...vyber[0] } : null) : vyber.map((r) => ({ ...r }));
        }
        ok({ data, error: null });
      } catch (e) {
        zle?.(e);
      }
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => dotaz(t) },
}));

// ─── ePošták a Resend ────────────────────────────────────────────────────────
type Odpoved = { status: number; telo: unknown };
let odpovede: Record<string, Odpoved[]> = {};
let volania: { url: string; metoda: string; hlavicky: Record<string, string>; telo: any }[] = [];
let maily: any[] = [];

function nastav(cesta: string, ...o: Odpoved[]) {
  odpovede[cesta] = o;
}

const op = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  operationType: "migration_in",
  status,
  customerRef: "dic-2121372693",
  dic: "2121372693",
  peppolId: "0245:2121372693",
  legalName: "SFC, s.r.o.",
  companyEmail: "sfc@example.sk",
  firmId: status === "succeeded" ? "22222222-2222-4222-8222-222222222222" : null,
  participantId: null,
  reviewRequired: status === "manual_review",
  error: null,
  createdAt: "2026-10-21T10:00:00Z",
  completedAt: null,
  ...extra,
});

const ID = "24b9b7e5-3165-420e-b24d-3234cd54101f";
const FIRMA = "5ec8ebf0-53ab-4eb5-904d-62b860778aa6";

let konzola: string[] = [];

beforeEach(() => {
  for (const k of Object.keys(tabulky)) delete tabulky[k];
  zapisy.length = 0;
  odpovede = {};
  volania = [];
  maily = [];
  konzola = [];
  process.env.PAYMENT_SECRETS_KEY = "test-kluc-na-sifrovanie-tajomstiev-0123456789";
  process.env.EPOSTAK_CLIENT_ID = "id";
  process.env.EPOSTAK_CLIENT_SECRET = "secret";
  process.env.EPOSTAK_ENV = "sandbox";
  process.env.RESEND_API_KEY = "test";
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      konzola.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    });
  }
  vi.stubGlobal("fetch", async (u: string | URL, o: any = {}) => {
    const url = String(u);
    const telo = o.body ? JSON.parse(o.body) : null;
    volania.push({ url, metoda: o.method ?? "GET", hlavicky: o.headers ?? {}, telo });
    if (url.includes("api.resend.com")) {
      maily.push(telo);
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/api/v1/auth/token")) {
      return new Response(JSON.stringify({ access_token: "jwt", expires_in: 900 }), {
        status: 200,
      });
    }
    const cesta = Object.keys(odpovede).find((c) => url.includes(c));
    if (!cesta)
      return new Response(JSON.stringify({ error: { code: "NOT_MOCKED" } }), { status: 500 });
    const r = odpovede[cesta].length > 1 ? odpovede[cesta].shift()! : odpovede[cesta][0];
    return new Response(JSON.stringify(r.telo), { status: r.status });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function ziadost(extra: Riadok = {}) {
  tabulky.efaktura_pds_ziadosti = [
    {
      id: ID,
      dic: "2121372693",
      nazov: "SFC, s.r.o.",
      email: "sfc@example.sk",
      telefon: null,
      stav: "cudzi_poskytovatel",
      chyba: "Firma je v Peppole u iného poskytovateľa — na prechod treba migračný kód od neho.",
      pokusov: 4,
      company_id: FIRMA,
      token_sifrovany: null,
      migracny_kod_sifrovany: null,
      cudzi_poskytovatel: "Doklado s.r.o.",
      pozvanka_odoslana_at: null,
      ...extra,
    },
  ];
  return tabulky.efaktura_pds_ziadosti[0];
}

/** Kód sa nesmie objaviť nikde okrem tela požiadavky na migráciu. */
function overUtajenieKodu() {
  expect(JSON.stringify(zapisy)).not.toContain(KOD);
  expect(JSON.stringify(tabulky)).not.toContain(KOD);
  expect(konzola.join("\n")).not.toContain(KOD);
  expect(JSON.stringify(maily)).not.toContain(KOD);
  for (const v of volania) {
    expect(JSON.stringify(v.hlavicky)).not.toContain(KOD);
    expect(v.url).not.toContain(KOD);
    if (v.telo?.migrationCode !== undefined) {
      expect(v.url).toContain("/white-label/participants/migrations");
    } else {
      expect(JSON.stringify(v.telo ?? "")).not.toContain(KOD);
    }
  }
}

const { prevezmiMigracnymKodom } = await import("./migracia.server");
const { dokonciRozbehnuteRegistracie, spracujZiadost, jeCudziPoskytovatel } =
  await import("./webhooky-obsluha.server");
const { klucMigracie, organizaciaZCertifikatu } = await import("./epostak.server");
const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

describe("prevzatie firmy migračným kódom", () => {
  it("201: firma je naša, profil zapnutý, kód zmazaný, audit bez kódu", async () => {
    ziadost();
    nastav("/white-label/participants/migrations", { status: 201, telo: op("succeeded") });

    const r = await prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "admin-1" });

    expect(r).toMatchObject({ stav: "registrovana", bezi: false });
    const z = tabulky.efaktura_pds_ziadosti[0];
    expect(z).toMatchObject({ stav: "registrovana", migracny_kod_sifrovany: null, chyba: null });
    expect(z.epostak_firm_id).toBe("22222222-2222-4222-8222-222222222222");

    const poz = volania.find((v) => v.url.includes("/participants/migrations"))!;
    expect(poz.metoda).toBe("POST");
    expect(poz.telo).toEqual({
      customerRef: "dic-2121372693",
      dic: "2121372693",
      companyEmail: "sfc@example.sk",
      migrationCode: KOD,
    });
    expect(poz.hlavicky["X-Firm-Id"]).toBeUndefined();
    expect(poz.hlavicky["Idempotency-Key"]).toBe(klucMigracie(ID, KOD));
    expect(poz.hlavicky["Idempotency-Key"]).toMatch(
      /^faktero-pds-migracia:24b9b7e5-[^:]+:[0-9a-f]{32}$/,
    );

    expect(tabulky.efaktura_profiles?.[0]).toMatchObject({ company_id: FIRMA, enabled: true });
    const audit = tabulky.platform_audit_logs?.[0];
    expect(audit).toMatchObject({ action: "efaktura_migracia", entity_id: ID });
    expect(audit.metadata.vysledok).toBe("registrovana");
    // Firma s účtom dostane oznámenie, admin výsledok.
    expect(maily.some((m) => m.subject.includes("napojená na Faktero"))).toBe(true);
    expect(
      maily.some((m) => m.subject.includes("prevzatie od iného poskytovateľa je hotové")),
    ).toBe(true);
    overUtajenieKodu();
  });

  it("202 → cron dopytuje operáciu a dokončí prevzatie", async () => {
    ziadost();
    nastav("/white-label/participants/migrations", { status: 202, telo: op("processing") });
    const r = await prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "admin-1" });
    expect(r).toMatchObject({ stav: "registruje_sa", bezi: true });
    const z = tabulky.efaktura_pds_ziadosti[0];
    expect(z.epostak_operacia_id).toBe("11111111-1111-4111-8111-111111111111");
    // Kým migrácia beží, kód je uložený — ale len zašifrovaný.
    expect(z.migracny_kod_sifrovany).toBeTruthy();
    expect(z.migracny_kod_sifrovany).not.toContain(KOD);

    nastav("/white-label/operations/11111111-1111-4111-8111-111111111111", {
      status: 200,
      telo: op("succeeded"),
    });
    await dokonciRozbehnuteRegistracie();
    expect(tabulky.efaktura_pds_ziadosti[0]).toMatchObject({
      stav: "registrovana",
      migracny_kod_sifrovany: null,
    });
    expect(tabulky.efaktura_profiles?.[0]).toMatchObject({ company_id: FIRMA });
    // Dopyt ide bez novej migrácie (ePošták dostal kód raz).
    expect(volania.filter((v) => v.url.includes("/participants/migrations"))).toHaveLength(1);
    overUtajenieKodu();
  });

  it("422: zrozumiteľná hláška, kód zmazaný, žiadosť späť u cudzieho poskytovateľa, cron neopakuje", async () => {
    ziadost();
    nastav("/white-label/participants/migrations", {
      status: 422,
      telo: {
        error: { code: "MIGRATION_CODE_REJECTED", message: "Migration code was rejected by SMP" },
      },
    });
    const r = await prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "admin-1" });
    expect(r.stav).toBe("cudzi_poskytovatel");
    expect(r.bezi).toBe(false);
    expect(r.chyba).toMatch(/zlý, expirovaný alebo už použitý/);
    expect(tabulky.efaktura_pds_ziadosti[0].migracny_kod_sifrovany).toBeNull();

    const pred = volania.length;
    await dokonciRozbehnuteRegistracie();
    expect(volania.length).toBe(pred);
    overUtajenieKodu();
  });

  it("409: konflikt sa vysvetlí", async () => {
    ziadost({ stav: "chyba" });
    nastav("/white-label/participants/migrations", {
      status: 409,
      telo: { error: { code: "MIGRATION_CONFLICT", message: "Migration state conflict" } },
    });
    const r = await prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "admin-1" });
    expect(r.stav).toBe("cudzi_poskytovatel");
    expect(r.chyba).toMatch(/v konflikte/);
    overUtajenieKodu();
  });

  it("5xx: ostane v chybe s kódom zašifrovaným, cron to zopakuje s tým istým kľúčom", async () => {
    ziadost();
    nastav(
      "/white-label/participants/migrations",
      { status: 503, telo: { error: { code: "UNAVAILABLE", message: "try later" } } },
      { status: 201, telo: op("succeeded") },
    );
    const r = await prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "admin-1" });
    expect(r.stav).toBe("chyba");
    expect(tabulky.efaktura_pds_ziadosti[0].migracny_kod_sifrovany).toBeTruthy();
    await dokonciRozbehnuteRegistracie();
    expect(tabulky.efaktura_pds_ziadosti[0]).toMatchObject({
      stav: "registrovana",
      migracny_kod_sifrovany: null,
    });
    const kluce = volania
      .filter((v) => v.url.includes("/participants/migrations"))
      .map((v) => v.hlavicky["Idempotency-Key"]);
    expect(kluce).toHaveLength(2);
    expect(kluce[0]).toBe(kluce[1]);
    overUtajenieKodu();
  });

  it("registrovanú firmu prevziať nejde", async () => {
    ziadost({ stav: "registrovana" });
    await expect(
      prevezmiMigracnymKodom(db, { id: ID, kod: KOD, adminUserId: "a" }),
    ).rejects.toThrow(/už vo Fakteri/);
    expect(volania).toHaveLength(0);
  });
});

describe("PARTICIPANT_ALREADY_REGISTERED pri registrácii", () => {
  async function sTokenom(extra: Riadok = {}) {
    const { encryptSecret } = await import("../payment-crypto.server");
    return ziadost({
      stav: "chyba",
      pokusov: 1,
      chyba: null,
      cudzi_poskytovatel: null,
      token_sifrovany: encryptSecret("fs-token"),
      ...extra,
    });
  }

  it("prejde do „u iného poskytovateľa“, cron ju už neopakuje a admin dostane upozornenie", async () => {
    await sTokenom();
    nastav("/white-label/participants/registrations", {
      status: 409,
      telo: {
        error: {
          code: "PARTICIPANT_ALREADY_REGISTERED",
          message: "SMP reports an existing participant. Use an inbound migration code",
        },
      },
    });
    await dokonciRozbehnuteRegistracie();
    const z = tabulky.efaktura_pds_ziadosti[0];
    expect(z.stav).toBe("cudzi_poskytovatel");
    expect(z.chyba).toBe(
      "Firma je v Peppole u iného poskytovateľa — na prechod treba migračný kód od neho.",
    );
    expect(maily.some((m) => /u iného poskytovateľa/.test(m.subject))).toBe(true);
    expect(maily.at(-1).text).toMatch(/Prevziať firmu/);

    const pred = volania.length;
    await dokonciRozbehnuteRegistracie();
    await dokonciRozbehnuteRegistracie();
    expect(volania.length).toBe(pred);
  });

  it("v produkcii zistí poskytovateľa z certifikátu v SMP cez produkčnú firmu", async () => {
    process.env.EPOSTAK_ENV = "production";
    await sTokenom();
    tabulky.efaktura_profiles = [
      { company_id: "t", epostak_firm_id: "test-firma", enabled: true, test_mode: true },
      { company_id: "p", epostak_firm_id: "prod-firma", enabled: true, test_mode: false },
    ];
    nastav("/white-label/participants/registrations", {
      status: 409,
      telo: { error: { code: "PARTICIPANT_ALREADY_REGISTERED", message: "x" } },
    });
    nastav("/peppol/participants/0245/2121372693", {
      status: 200,
      telo: {
        found: true,
        certificate: {
          present: true,
          subject: "CN=PSK000123, OU=PEPPOL PRODUCTION AP, O=Doklado s.r.o., C=SK",
        },
      },
    });
    await spracujZiadost(ID);
    expect(tabulky.efaktura_pds_ziadosti[0].cudzi_poskytovatel).toBe("Doklado s.r.o.");
    const lookup = volania.find((v) => v.url.includes("/peppol/participants/"))!;
    expect(lookup.hlavicky["X-Firm-Id"]).toBe("prod-firma");
    expect(maily.at(-1).text).toContain("Firma je u: Doklado s.r.o.");
  });

  it("rozpozná kód v chybe požiadavky aj v chybe operácie", () => {
    expect(
      jeCudziPoskytovatel({
        status: 409,
        response: { error: { code: "PARTICIPANT_ALREADY_REGISTERED" } },
      }),
    ).toBe(true);
    expect(jeCudziPoskytovatel({ code: "PARTICIPANT_ALREADY_REGISTERED", message: "m" })).toBe(
      true,
    );
    expect(
      jeCudziPoskytovatel(
        new Error("ePošták … zlyhal: SMP reports … (PARTICIPANT_ALREADY_REGISTERED)"),
      ),
    ).toBe(true);
    expect(jeCudziPoskytovatel({ code: "SMP_REGISTRATION_NOT_FOUND" })).toBe(false);
    expect(jeCudziPoskytovatel(null)).toBe(false);
  });

  it("O= z predmetu certifikátu", () => {
    expect(organizaciaZCertifikatu("CN=X, O=Doklado s.r.o., C=SK")).toBe("Doklado s.r.o.");
    expect(organizaciaZCertifikatu('CN=X,O="Firma, a.s.",C=SK')).toBe("Firma, a.s.");
    expect(organizaciaZCertifikatu("CN=X, OU=Y")).toBeNull();
    expect(organizaciaZCertifikatu(undefined)).toBeNull();
  });
});
