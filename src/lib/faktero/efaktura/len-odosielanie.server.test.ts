/*
  eFaktúra „len odosielanie“ (onboarding send_only u ePoštáka).
  ePošták aj Resend sú len mock fetchu — naostro sa nevolá nič.
*/
import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Databáza v pamäti ───────────────────────────────────────────────────────
type Riadok = Record<string, any>;
const tabulky: Record<string, Riadok[]> = {};

/** Kľúč, podľa ktorého upsert prepisuje (onConflict). */
function dotaz(tabulka: string) {
  const filtre: ((r: Riadok) => boolean)[] = [];
  let akcia: {
    op: "select" | "update" | "insert" | "upsert" | "delete";
    data?: any;
    konflikt?: string;
  } = {
    op: "select",
  };
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
    range: () => b,
    limit: (n: number) => ((limit = n), b),
    maybeSingle: () => ((jeden = true), b),
    single: () => ((jeden = true), b),
    update: (data: any) => ((akcia = { op: "update", data }), b),
    delete: () => ((akcia = { op: "delete" }), b),
    insert: (data: any) => ((akcia = { op: "insert", data }), b),
    upsert: (data: any, o?: { onConflict?: string }) => (
      (akcia = { op: "upsert", data, konflikt: o?.onConflict }),
      b
    ),
    then: (ok: (v: any) => void, zle?: (e: unknown) => void) => {
      try {
        let data: any;
        if (akcia.op === "insert" || akcia.op === "upsert") {
          const k = akcia.konflikt;
          const existujuci = k ? riadky().find((r) => r[k] === akcia.data[k]) : undefined;
          if (existujuci) Object.assign(existujuci, akcia.data);
          else riadky().push({ id: `id-${riadky().length + 1}`, ...akcia.data });
          data = jeden ? { ...(existujuci ?? riadky()[riadky().length - 1]) } : [akcia.data];
        } else {
          const vyber = riadky()
            .filter((r) => filtre.every((f) => f(r)))
            .slice(0, limit);
          if (akcia.op === "update") for (const r of vyber) Object.assign(r, akcia.data);
          if (akcia.op === "delete") tabulky[tabulka] = riadky().filter((r) => !vyber.includes(r));
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
// Kontroly pred odoslaním faktúry (schvaľovanie, dátum, prílohy, zálohy) tu netestujeme.
vi.mock("../schvalovanie.server", () => ({ overOdoslanie: async () => {} }));
vi.mock("../datum-vystavenia.server", () => ({ overDatumPredOdoslanim: async () => {} }));
vi.mock("../zalohy-odpocty.server", () => ({ nacitajOdpocty: async () => ({}) }));
vi.mock("./prilohy-efaktury.server", () => ({
  pripravPrilohyEfaktury: async () => [],
  odtlacokTela: () => "odtlacok",
}));

// ─── ePošták a Resend ────────────────────────────────────────────────────────
type Odpoved = { status: number; telo: unknown };
let odpovede: Record<string, Odpoved[]> = {};
let volania: { url: string; metoda: string; hlavicky: Record<string, string>; telo: any }[] = [];
let maily: any[] = [];

function nastav(cesta: string, ...o: Odpoved[]) {
  odpovede[cesta] = o;
}

const FIRMA = "5ec8ebf0-53ab-4eb5-904d-62b860778aa6";
const PDS = "24b9b7e5-3165-420e-b24d-3234cd54101f";
const POZIADAVKA = "33333333-3333-4333-8333-333333333333";
const EP_FIRMA = "44444444-4444-4444-8444-444444444444";
const KLUC_FIRMY = "sk_int_firemny_tajny_kluc_0123456789";
const TAJOMSTVO = "a".repeat(64);

const onboarding = (status: string, extra: Record<string, unknown> = {}) => ({
  id: POZIADAVKA,
  customerRef: "odosielanie-2121372693",
  serviceMode: "send_only",
  status,
  firmId: status === "active" ? EP_FIRMA : null,
  nextAction:
    status === "awaiting_pfs"
      ? "select_provider_on_pfs"
      : status === "action_required"
        ? "complete_client_activation"
        : null,
  relationshipMode: "technical_delegation",
  payerMode: "firm_billed",
  keyCreation:
    status === "active"
      ? {
          method: "POST",
          path: "/api/v1/integrator/keys",
          scopedFirmId: EP_FIRMA,
          scopes: ["documents:send", "documents:read"],
        }
      : null,
  clientMessage: { sk: `Krok pre firmu (${status})`, en: `Next step (${status})` },
  ...extra,
});

beforeEach(async () => {
  for (const k of Object.keys(tabulky)) delete tabulky[k];
  odpovede = {};
  volania = [];
  maily = [];
  process.env.PAYMENT_SECRETS_KEY = "test-kluc-na-sifrovanie-tajomstiev-0123456789";
  process.env.EPOSTAK_CLIENT_ID = "hlavny";
  process.env.EPOSTAK_CLIENT_SECRET = "secret";
  process.env.EPOSTAK_ENV = "sandbox";
  process.env.RESEND_API_KEY = "test";
  delete process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET;
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation(() => {});
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
      // JWT prezradí, ktorým kľúčom vznikol.
      return new Response(
        JSON.stringify({ access_token: `jwt-${telo.client_id}`, expires_in: 900 }),
        {
          status: 200,
        },
      );
    }
    const metoda = o.method ?? "GET";
    const cesta =
      Object.keys(odpovede).find(
        (c) => c.startsWith(`${metoda} `) && url.includes(c.slice(metoda.length + 1)),
      ) ?? Object.keys(odpovede).find((c) => !/^[A-Z]+ /.test(c) && url.includes(c));
    if (!cesta)
      return new Response(JSON.stringify({ error: { code: "NOT_MOCKED" } }), { status: 500 });
    const r = odpovede[cesta].length > 1 ? odpovede[cesta].shift()! : odpovede[cesta][0];
    return new Response(r.telo === undefined ? "" : JSON.stringify(r.telo), { status: r.status });
  });
  const ep = await import("./epostak.server");
  ep.zabudniKlucFirmy();
  ep.resetEPostakToken();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function firma() {
  tabulky.companies = [
    { id: FIRMA, name: "SFC, s.r.o.", dic: "2121372693", ico: "36000000", email: "sfc@example.sk" },
  ];
}

const m = await import("./len-odosielanie.server");
const ep = await import("./epostak.server");
const { encryptSecret } = await import("../payment-crypto.server");

function podpisane(telo: string, pecatka = Math.floor(Date.now() / 1000)) {
  const hex = createHmac("sha256", TAJOMSTVO).update(`${pecatka}.${telo}`).digest("hex");
  return { podpis: `sha256=${hex}`, pecatka: String(pecatka) };
}

function ulozTajomstvoWebhooku() {
  tabulky.efaktura_epostak_nastavenie = [
    { kluc: m.NASTAVENIE_WEBHOOKU, tajomstvo_sifrovane: encryptSecret(TAJOMSTVO) },
  ];
}

describe("vytvorenie onboardingu iba odosielanie", () => {
  it("POST s telom podľa ePoštáka, Idempotency-Key podľa firmy, bez X-Firm-Id", async () => {
    firma();
    nastav("POST /api/v1/onboarding-requests", { status: 202, telo: onboarding("awaiting_pfs") });

    const r = await m.vytvorOnboardingLenOdosielanie(
      FIRMA,
      "sfc@example.sk",
      "technical_delegation",
      {
        pdsZiadostId: PDS,
        prijemPoskytovatel: "Doklado s.r.o.",
        adminUserId: "admin-1",
      },
    );

    expect(r).toMatchObject({ stav: "caka_na_fs", nextAction: "select_provider_on_pfs" });
    const post = volania.find((v) => v.url.endsWith("/api/v1/onboarding-requests"))!;
    expect(post.metoda).toBe("POST");
    expect(post.telo).toEqual({
      serviceMode: "send_only",
      relationshipMode: "technical_delegation",
      customerRef: "odosielanie-2121372693",
      dic: "2121372693",
      contactEmail: "sfc@example.sk",
    });
    expect(post.hlavicky["Idempotency-Key"]).toBe(`faktero-odosielanie:${FIRMA}:1`);
    expect(post.hlavicky["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    expect(post.hlavicky["X-Firm-Id"]).toBeUndefined();
    // Partnerský (hlavný) kľúč.
    expect(post.hlavicky.Authorization).toBe("Bearer jwt-hlavny");

    const z = tabulky.efaktura_odosielanie_ziadosti[0];
    expect(z).toMatchObject({
      company_id: FIRMA,
      pds_ziadost_id: PDS,
      stav: "caka_na_fs",
      epostak_request_id: POZIADAVKA,
      prijem_poskytovatel: "Doklado s.r.o.",
      client_message_sk: "Krok pre firmu (awaiting_pfs)",
    });
    // Profil sa nezapína, kým žiadosť nie je active.
    expect(tabulky.efaktura_profiles ?? []).toHaveLength(0);
  });

  it("rozbehnutá žiadosť sa pri opakovaní len dopytuje (GET), nevytvára druhá", async () => {
    firma();
    nastav("POST /api/v1/onboarding-requests", { status: 202, telo: onboarding("awaiting_pfs") });
    await m.vytvorOnboardingLenOdosielanie(FIRMA, "sfc@example.sk");
    nastav(`GET /api/v1/onboarding-requests/${POZIADAVKA}`, {
      status: 200,
      telo: onboarding("action_required"),
    });
    const r = await m.vytvorOnboardingLenOdosielanie(FIRMA, "sfc@example.sk");
    expect(r.stav).toBe("caka_na_potvrdenie");
    expect(
      volania.filter((v) => v.metoda === "POST" && v.url.endsWith("/onboarding-requests")),
    ).toHaveLength(1);
  });

  it("503 (controlled preview vypnutý) → chyba so zrozumiteľnou hláškou", async () => {
    firma();
    nastav("POST /api/v1/onboarding-requests", {
      status: 503,
      telo: { error: { code: "PREVIEW_DISABLED", message: "Preview disabled" } },
    });
    const r = await m.vytvorOnboardingLenOdosielanie(FIRMA, "sfc@example.sk");
    expect(r.stav).toBe("chyba");
    expect(r.chyba).toMatch(/controlled preview/);
  });

  it("po vypršaní nový pokus: nový Idempotency-Key aj customerRef", async () => {
    firma();
    tabulky.efaktura_odosielanie_ziadosti = [
      {
        company_id: FIRMA,
        dic: "2121372693",
        customer_ref: "odosielanie-2121372693",
        pokus: 1,
        relationship_mode: "technical_delegation",
        contact_email: "sfc@example.sk",
        stav: "zamietnuta",
        epostak_stav: "expired",
        epostak_request_id: POZIADAVKA,
      },
    ];
    nastav("POST /api/v1/onboarding-requests", { status: 202, telo: onboarding("awaiting_pfs") });
    await m.vytvorOnboardingLenOdosielanie(FIRMA, "sfc@example.sk");
    const post = volania.find((v) => v.url.endsWith("/api/v1/onboarding-requests"))!;
    expect(post.hlavicky["Idempotency-Key"]).toBe(`faktero-odosielanie:${FIRMA}:2`);
    expect(post.telo.customerRef).toBe("odosielanie-2121372693-2");
  });
});

describe("webhook onboarding.active", () => {
  function rozbehnuta() {
    firma();
    tabulky.efaktura_odosielanie_ziadosti = [
      {
        company_id: FIRMA,
        dic: "2121372693",
        customer_ref: "odosielanie-2121372693",
        pokus: 1,
        relationship_mode: "technical_delegation",
        contact_email: "sfc@example.sk",
        prijem_poskytovatel: "Doklado s.r.o.",
        stav: "caka_na_potvrdenie",
        epostak_request_id: POZIADAVKA,
        kluc_pokusov: 0,
        pokusov: 1,
      },
    ];
  }
  const udalost = (typ = "onboarding.active", id = "evt-1") =>
    JSON.stringify({
      id,
      type: typ,
      occurredAt: "2026-10-22T10:00:00Z",
      data: {
        requestId: POZIADAVKA,
        customerRef: "odosielanie-2121372693",
        status: "active",
        nextAction: null,
        clientMessage: { sk: "Hotovo", en: "Done" },
        firmId: EP_FIRMA,
        keyCreation: {
          method: "POST",
          path: "/api/v1/integrator/keys",
          scopedFirmId: EP_FIRMA,
          scopes: ["documents:send", "documents:read"],
        },
      },
    });

  it("platný podpis → kľúč firmy, profil v režime len_odosielanie, e-mail firme", async () => {
    rozbehnuta();
    ulozTajomstvoWebhooku();
    nastav("POST /api/v1/integrator/keys", {
      status: 201,
      telo: {
        id: "55555555-5555-4555-8555-555555555555",
        keyPrefix: "sk_int_firm...abcd",
        clientId: "66666666-6666-4666-8666-666666666666",
        scopes: ["documents:send", "documents:read"],
        scopedFirmId: EP_FIRMA,
        key: KLUC_FIRMY,
      },
    });
    const telo = udalost();
    const r = await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo) });
    expect(r).toMatchObject({ ok: true, spracovane: true });

    const kluc = volania.find((v) => v.url.endsWith("/api/v1/integrator/keys"))!;
    expect(kluc.telo).toMatchObject({
      scopes: ["documents:send", "documents:read"],
      scopedFirmId: EP_FIRMA,
    });
    expect(kluc.hlavicky.Authorization).toBe("Bearer jwt-hlavny");

    const z = tabulky.efaktura_odosielanie_ziadosti[0];
    expect(z).toMatchObject({
      stav: "active",
      epostak_firm_id: EP_FIRMA,
      posledna_udalost_id: "evt-1",
    });
    expect(z.kluc_client_id).toBe("66666666-6666-4666-8666-666666666666");
    expect(z.kluc_sifrovany).toBeTruthy();
    // Kľúč nikde v čitateľnej podobe.
    expect(JSON.stringify(tabulky)).not.toContain(KLUC_FIRMY);

    expect(tabulky.efaktura_profiles[0]).toMatchObject({
      company_id: FIRMA,
      epostak_firm_id: EP_FIRMA,
      enabled: true,
      test_mode: true,
      rezim: "len_odosielanie",
      prijem_poskytovatel: "Doklado s.r.o.",
      peppol_participant_id: "0245:2121372693",
    });
    expect(maily).toHaveLength(1);
    expect(maily[0].subject).toContain("môže odosielať eFaktúry z Faktera");
    expect(maily[0].text).toContain("u Doklado s.r.o.");

    // Tá istá udalosť znova (ePošták opakuje doručenie) — nič navyše.
    const r2 = await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo) });
    expect(r2).toMatchObject({ ok: true, spracovane: false });
    expect(volania.filter((v) => v.url.endsWith("/api/v1/integrator/keys"))).toHaveLength(1);
    expect(maily).toHaveLength(1);
  });

  it("nesediaci podpis aj stará pečiatka sa odmietnu a nič sa nezmení", async () => {
    rozbehnuta();
    ulozTajomstvoWebhooku();
    const telo = udalost();
    const zly = await m.prijmiOnboardingUdalost({
      telo,
      podpis: `sha256=${"0".repeat(64)}`,
      pecatka: String(Math.floor(Date.now() / 1000)),
    });
    expect(zly).toMatchObject({ ok: false, dovod: "nesedi_podpis" });
    const stary = await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo, 1_000_000) });
    expect(stary).toMatchObject({ ok: false, dovod: "stara_pecatka" });
    expect(tabulky.efaktura_odosielanie_ziadosti[0].stav).toBe("caka_na_potvrdenie");
    expect(tabulky.efaktura_profiles ?? []).toHaveLength(0);
  });

  it("bez uloženého tajomstva sa neprijme nič", async () => {
    rozbehnuta();
    const telo = udalost();
    const r = await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo) });
    expect(r).toMatchObject({ ok: false, dovod: "bez_tajomstva" });
  });

  it("kľúč firmy sa nedá vytvoriť (403) → firma aj tak odosiela hlavným kľúčom, cron to skúsi znova", async () => {
    rozbehnuta();
    ulozTajomstvoWebhooku();
    nastav("POST /api/v1/integrator/keys", {
      status: 403,
      telo: {
        error: { code: "FIRM_KEY_ISSUANCE_DISABLED", message: "Firm key issuance disabled" },
      },
    });
    const telo = udalost();
    await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo) });
    const z = tabulky.efaktura_odosielanie_ziadosti[0];
    expect(z.stav).toBe("active");
    expect(z.kluc_sifrovany ?? null).toBeNull();
    expect(z.kluc_chyba).toMatch(/FIRM_KEY_ISSUANCE_DISABLED/);
    expect(tabulky.efaktura_profiles[0]).toMatchObject({ enabled: true, rezim: "len_odosielanie" });

    // Cron: kľúč skúsi znova, teraz prejde.
    nastav("POST /api/v1/integrator/keys", {
      status: 201,
      telo: { id: "k2", clientId: "client-firmy", key: KLUC_FIRMY, scopes: [] },
    });
    await m.dokonciOnboardingyLenOdosielanie();
    expect(tabulky.efaktura_odosielanie_ziadosti[0].kluc_client_id).toBe("client-firmy");
    expect(maily).toHaveLength(1);
  });

  it("partnerská udalosť sa na spoločnej adrese rozozná, udalosť dokladu nie", () => {
    expect(m.jePartnerskaUdalost(udalost())).toBe(true);
    expect(m.jePartnerskaUdalost(JSON.stringify({ type: "webhook.disabled" }))).toBe(true);
    expect(m.jePartnerskaUdalost(JSON.stringify({ event: "document.delivered" }))).toBe(false);
    expect(m.jePartnerskaUdalost("nie je json")).toBe(false);
  });
});

describe("podpis onboarding webhooku", () => {
  const telo = '{"id":"e","type":"onboarding.signed"}';
  it("s pečiatkou ako udalosti dokladov (sha256= nad `${pečiatka}.${telo}`)", () => {
    const { podpis, pecatka } = podpisane(telo);
    expect(m.overOnboardingPodpis({ podpis, pecatka, telo, tajomstvo: TAJOMSTVO }).platny).toBe(
      true,
    );
    expect(
      m.overOnboardingPodpis({ podpis, pecatka, telo: telo + " ", tajomstvo: TAJOMSTVO }).platny,
    ).toBe(false);
  });
  it("bez pečiatky HMAC z holého tela, s predponou aj bez", () => {
    const hex = createHmac("sha256", TAJOMSTVO).update(telo).digest("hex");
    for (const podpis of [hex, `sha256=${hex}`]) {
      expect(
        m.overOnboardingPodpis({ podpis, pecatka: null, telo, tajomstvo: TAJOMSTVO }).platny,
      ).toBe(true);
    }
    expect(
      m.overOnboardingPodpis({ podpis: hex, pecatka: null, telo, tajomstvo: "b".repeat(64) })
        .platny,
    ).toBe(false);
    expect(
      m.overOnboardingPodpis({ podpis: null, pecatka: null, telo, tajomstvo: TAJOMSTVO }).platny,
    ).toBe(false);
  });
});

describe("cron dopyt", () => {
  it("rozbehnutá žiadosť → GET → active → profil zapnutý", async () => {
    firma();
    tabulky.efaktura_odosielanie_ziadosti = [
      {
        company_id: FIRMA,
        dic: "2121372693",
        customer_ref: "odosielanie-2121372693",
        pokus: 1,
        relationship_mode: "managed_service",
        contact_email: "sfc@example.sk",
        prijem_poskytovatel: "Doklado s.r.o.",
        stav: "caka_na_fs",
        epostak_request_id: POZIADAVKA,
        kluc_pokusov: 0,
      },
    ];
    nastav(`GET /api/v1/onboarding-requests/${POZIADAVKA}`, {
      status: 200,
      telo: onboarding("active"),
    });
    nastav("POST /api/v1/integrator/keys", {
      status: 201,
      telo: { id: "k1", clientId: "client-firmy", key: KLUC_FIRMY, scopes: [] },
    });
    const r = await m.dokonciOnboardingyLenOdosielanie();
    expect(r.obnovenych).toBe(1);
    const get = volania.find((v) => v.url.endsWith(`/onboarding-requests/${POZIADAVKA}`))!;
    expect(get.metoda).toBe("GET");
    expect(get.hlavicky["X-Firm-Id"]).toBeUndefined();
    expect(tabulky.efaktura_odosielanie_ziadosti[0]).toMatchObject({
      stav: "active",
      epostak_firm_id: EP_FIRMA,
    });
    expect(tabulky.efaktura_profiles[0]).toMatchObject({ rezim: "len_odosielanie", enabled: true });
  });

  it("revoked po aktivácii → profil sa vypne", async () => {
    firma();
    tabulky.efaktura_odosielanie_ziadosti = [
      {
        company_id: FIRMA,
        dic: "2121372693",
        stav: "active",
        epostak_request_id: POZIADAVKA,
        epostak_firm_id: EP_FIRMA,
        contact_email: "sfc@example.sk",
      },
    ];
    tabulky.efaktura_profiles = [{ company_id: FIRMA, enabled: true, rezim: "len_odosielanie" }];
    ulozTajomstvoWebhooku();
    const telo = JSON.stringify({
      id: "evt-r",
      type: "onboarding.revoked",
      data: { requestId: POZIADAVKA, status: "revoked", firmId: EP_FIRMA },
    });
    await m.prijmiOnboardingUdalost({ telo, ...podpisane(telo) });
    expect(tabulky.efaktura_odosielanie_ziadosti[0].stav).toBe("zamietnuta");
    expect(tabulky.efaktura_profiles[0].enabled).toBe(false);
  });
});

describe("firma v režime len odosielanie", () => {
  function aktivna(sKlucom = true) {
    firma();
    tabulky.efaktura_odosielanie_ziadosti = [
      {
        company_id: FIRMA,
        dic: "2121372693",
        stav: "active",
        epostak_firm_id: EP_FIRMA,
        ...(sKlucom
          ? { kluc_client_id: "client-firmy", kluc_sifrovany: encryptSecret(KLUC_FIRMY) }
          : {}),
      },
    ];
    tabulky.efaktura_profiles = [
      {
        id: "profil-1",
        company_id: FIRMA,
        epostak_firm_id: EP_FIRMA,
        enabled: true,
        rezim: "len_odosielanie",
        prijem_poskytovatel: "Doklado s.r.o.",
      },
    ];
  }

  it("odošle faktúru kľúčom firmy (scopedFirmId) a X-Firm-Id firmy", async () => {
    aktivna();
    tabulky.invoices = [
      {
        id: "faktura-1",
        company_id: FIRMA,
        type: "invoice",
        invoice_number: "2026001",
        issue_date: "2026-10-22",
        due_date: "2026-11-05",
        delivery_date: "2026-10-22",
        currency: "EUR",
        total: 123,
        variable_symbol: "2026001",
        customer_name: "Odberateľ s.r.o.",
        customer_dic: "2020202020",
      },
    ];
    tabulky.invoice_items = [
      {
        invoice_id: "faktura-1",
        position: 1,
        name: "Služba",
        quantity: 1,
        unit_price: 100,
        vat_rate: 23,
        subtotal: 100,
      },
    ];
    nastav("POST /api/v1/documents/send", {
      status: 201,
      telo: { documentId: "doc-1", status: "sent" },
    });

    const r = await ep.sendEfaktura("faktura-1", EP_FIRMA);
    expect(r).toMatchObject({ documentId: "doc-1", status: "sent" });

    const token = volania.filter((v) => v.url.endsWith("/api/v1/auth/token")).map((v) => v.telo);
    expect(token).toContainEqual(
      expect.objectContaining({ client_id: "client-firmy", client_secret: KLUC_FIRMY }),
    );
    const send = volania.find((v) => v.url.endsWith("/api/v1/documents/send"))!;
    expect(send.hlavicky.Authorization).toBe("Bearer jwt-client-firmy");
    expect(send.hlavicky["X-Firm-Id"]).toBe(EP_FIRMA);
    expect(send.telo.receiverPeppolId ?? JSON.stringify(send.telo)).toContain("0245:2020202020");
    expect(tabulky.efaktura_deliveries?.[0]).toMatchObject({ provider_message_id: "doc-1" });
  });

  it("bez kľúča firmy odosiela hlavným kľúčom s X-Firm-Id", async () => {
    aktivna(false);
    nastav("GET /api/v1/documents/doc-1/status", { status: 200, telo: { status: "delivered" } });
    await ep.getEfakturaStatus("doc-1", EP_FIRMA);
    const st = volania.find((v) => v.url.includes("/documents/doc-1/status"))!;
    expect(st.hlavicky.Authorization).toBe("Bearer jwt-hlavny");
    expect(st.hlavicky["X-Firm-Id"]).toBe(EP_FIRMA);
  });

  it("príjem sa nespúšťa: žiadne /inbound/documents, ani v nočnej synchronizácii", async () => {
    aktivna();
    nastav("GET /api/v1/documents/doc-1/status", { status: 200, telo: { status: "delivered" } });
    tabulky.efaktura_deliveries = [
      { company_id: FIRMA, provider_message_id: "doc-1", status: "sent" },
    ];

    const r = await ep.stiahniPrijate(FIRMA, EP_FIRMA);
    expect(r).toMatchObject({ novych: 0, lenOdosielanie: true });

    const { synchronizujFirmu } = await import("./nocna-uloha.server");
    const v = await synchronizujFirmu(FIRMA, EP_FIRMA);
    expect(v.chyba).toBeUndefined();
    expect(v.novychPrijatych).toBe(0);
    expect(v.obnovenychStavov).toBe(1);
    expect(volania.some((x) => x.url.includes("/inbound/"))).toBe(false);
  });

  it("webhook dokladov len na odoslané stavy a hlavným kľúčom", async () => {
    aktivna();
    nastav("POST /api/v1/webhooks", { status: 201, telo: { id: "wh-1", secret: "s".repeat(64) } });
    const { zapniWebhookyFiriem } = await import("./webhooky-obsluha.server");
    await zapniWebhookyFiriem();
    const wh = volania.find((v) => v.url.endsWith("/api/v1/webhooks"))!;
    expect(wh.telo.events).toEqual([
      "document.sent",
      "document.delivered",
      "document.delivery_failed",
      "document.rejected",
    ]);
    expect(wh.telo.events).not.toContain("document.received");
    expect(wh.telo.events).not.toContain("document.response_received");
    expect(wh.hlavicky.Authorization).toBe("Bearer jwt-hlavny");
  });
});

describe("nastavenie onboarding webhooku", () => {
  it("PUT uloží tajomstvo zašifrované; keď webhook už je a tajomstvo nepoznáme, bez „znova“ odmietne", async () => {
    nastav("GET /api/v1/onboarding-requests/webhook", { status: 200, telo: { webhook: null } });
    nastav("PUT /api/v1/onboarding-requests/webhook", {
      status: 201,
      telo: {
        webhook: {
          url: "https://www.faktero.sk/api/public/efaktura/epostak",
          events: [],
          isActive: true,
        },
        secret: TAJOMSTVO,
      },
    });
    const r = await m.nastavWebhookOnboardingu();
    expect(r.maTajomstvo).toBe(true);
    const put = volania.find((v) => v.metoda === "PUT")!;
    expect(put.telo.url).toMatch(/\/api\/public\/efaktura\/epostak$/);
    expect(put.telo.events).toContain("onboarding.active");
    expect(JSON.stringify(tabulky)).not.toContain(TAJOMSTVO);

    // Iná inštalácia: webhook u ePoštáka je, tajomstvo nemáme.
    for (const k of Object.keys(tabulky)) delete tabulky[k];
    nastav("GET /api/v1/onboarding-requests/webhook", {
      status: 200,
      telo: { webhook: { url: "https://x", events: [], isActive: true } },
    });
    await expect(m.nastavWebhookOnboardingu()).rejects.toThrow(/Vytvoriť nanovo/);
  });
});
