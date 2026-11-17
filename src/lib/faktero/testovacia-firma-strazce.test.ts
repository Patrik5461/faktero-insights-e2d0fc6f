/*
  Stráže akcií mimo Faktera pre testovaciu firmu: eFaktúra, webhooky, push,
  pozvánky. Databáza je v pamäti, sieť je podvrhnutá — naostro sa nevolá nič.
  Pre každú stráž: testovacia firma sa zastaví (alebo potichu preskočí),
  skutočná prejde ďalej.
*/
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riadok = Record<string, any>;
const tabulky: Record<string, Riadok[]> = {};

function dotaz(tabulka: string) {
  const filtre: ((r: Riadok) => boolean)[] = [];
  let akcia: { op: "select" | "update" | "insert"; data?: any } = { op: "select" };
  let jeden = false;
  let limit = Infinity;
  const riadky = () => (tabulky[tabulka] ??= []);
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => (filtre.push((r) => r[k] === v), b),
    in: (k: string, v: unknown[]) => (filtre.push((r) => v.includes(r[k])), b),
    is: (k: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) === v), b),
    not: (k: string, _op: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) !== v), b),
    lt: (k: string, v: any) => (filtre.push((r) => r[k] < v), b),
    lte: (k: string, v: any) => (filtre.push((r) => r[k] <= v), b),
    or: () => b,
    order: () => b,
    limit: (n: number) => ((limit = n), b),
    maybeSingle: () => ((jeden = true), b),
    single: () => ((jeden = true), b),
    update: (data: any) => ((akcia = { op: "update", data }), b),
    insert: (data: any) => ((akcia = { op: "insert", data }), b),
    then: (ok: (v: any) => void, zle?: (e: unknown) => void) => {
      try {
        let data: any;
        if (akcia.op === "insert") {
          const r = { id: `id-${riadky().length + 1}`, ...akcia.data };
          riadky().push(r);
          data = jeden ? { ...r } : [{ ...r }];
        } else {
          const vyber = riadky()
            .filter((r) => filtre.every((f) => f(r)))
            .slice(0, limit);
          if (akcia.op === "update") for (const r of vyber) Object.assign(r, akcia.data);
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

const klient = { from: (t: string) => dotaz(t) };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: klient }));

// Za strážou eFaktúry ide schvaľovanie — tu ho len zaznamenáme a zastavíme,
// aby bolo vidieť, že skutočná firma prešla ďalej.
const zaStrazou = vi.fn();
vi.mock("@/lib/faktero/schvalovanie.server", () => ({
  overOdoslanie: async (companyId: string) => {
    zaStrazou(companyId);
    throw new Error("ZA_STRAZOU");
  },
}));

const pokusyWebhooku: any[] = [];
vi.mock("@/lib/faktero/webhook-odoslanie.server", () => ({
  posliPokusWebhooku: async (p: any) => {
    pokusyWebhooku.push(p);
    return { ok: true, status: 200, body: "ok", chyba: null, trvanieMs: 1 };
  },
}));

const SKUTOCNA = "11111111-1111-4111-8111-111111111111";
const TESTOVACIA = "22222222-2222-4222-8222-222222222222";
const fetchVolania: string[] = [];

beforeEach(() => {
  for (const k of Object.keys(tabulky)) delete tabulky[k];
  tabulky.companies = [
    { id: SKUTOCNA, name: "Firma s.r.o.", dic: "2121372693", testovacia_pre: null },
    { id: TESTOVACIA, name: "Test – Firma s.r.o.", dic: "2121372693", testovacia_pre: SKUTOCNA },
  ];
  zaStrazou.mockClear();
  pokusyWebhooku.length = 0;
  fetchVolania.length = 0;
  vi.stubGlobal("fetch", async (u: any) => {
    fetchVolania.push(String(u));
    return new Response("{}", { status: 200 });
  });
  for (const m of ["log", "info", "warn"] as const)
    vi.spyOn(console, m).mockImplementation(() => {});
});

describe("eFaktúra — odoslanie", () => {
  it("testovacia firma: zastaví sa pred čímkoľvek ďalším, nič neodíde", async () => {
    tabulky.invoices = [{ id: "f-test", company_id: TESTOVACIA }];
    const { sendEfaktura, HLASKA_TESTOVACIA_EFAKTURA } = await import("./efaktura/epostak.server");
    await expect(sendEfaktura("f-test", "ep-firma")).rejects.toMatchObject({
      name: "TestovaciaFirmaZastavene",
      message: HLASKA_TESTOVACIA_EFAKTURA,
    });
    expect(zaStrazou).not.toHaveBeenCalled();
    expect(fetchVolania).toEqual([]);
  });

  it("skutočná firma prejde strážou ďalej", async () => {
    tabulky.invoices = [{ id: "f-ostra", company_id: SKUTOCNA }];
    const { sendEfaktura } = await import("./efaktura/epostak.server");
    await expect(sendEfaktura("f-ostra", "ep-firma")).rejects.toThrow("ZA_STRAZOU");
    expect(zaStrazou).toHaveBeenCalledWith(SKUTOCNA);
  });

  it("registrácia „len odosielanie“: testovacia sa neregistruje", async () => {
    const { vytvorOnboardingLenOdosielanie, HLASKA_TESTOVACIA_REGISTRACIA } =
      await import("./efaktura/len-odosielanie.server");
    await expect(vytvorOnboardingLenOdosielanie(TESTOVACIA, "a@firma.sk")).rejects.toMatchObject({
      message: HLASKA_TESTOVACIA_REGISTRACIA,
    });
    expect(tabulky.efaktura_odosielanie_ziadosti ?? []).toEqual([]);
    expect(fetchVolania).toEqual([]);
  });
});

describe("webhooky", () => {
  function pripravWebhooky() {
    tabulky.webhooks = [
      {
        id: "w-ostra",
        company_id: SKUTOCNA,
        url: "https://a.sk/h",
        secret: "s",
        events: ["*"],
        active: true,
      },
      {
        id: "w-test",
        company_id: TESTOVACIA,
        url: "https://b.sk/h",
        secret: "s",
        events: ["*"],
        active: true,
      },
    ];
    tabulky.bank_transactions = [
      { id: "t1", bank_account_id: null, amount: 10 },
      { id: "t2", bank_account_id: null, amount: 20 },
    ];
  }

  it("doručovač fronty: testovacia sa označí bez odoslania, skutočná sa doručí", async () => {
    pripravWebhooky();
    tabulky.webhook_outbox = [
      {
        id: 1,
        company_id: SKUTOCNA,
        event: "bank_transaction.created",
        entity_id: "t1",
        attempts: 0,
        processed_at: null,
      },
      {
        id: 2,
        company_id: TESTOVACIA,
        event: "bank_transaction.created",
        entity_id: "t2",
        attempts: 0,
        processed_at: null,
      },
    ];
    const { spracujWebhookOutbox } = await import("./webhook-outbox.server");
    const { HLASKA_TESTOVACIA_WEBHOOK } = await import("./webhook-trigger.server");
    const r = await spracujWebhookOutbox();

    expect(r.preskocenych).toBe(1);
    expect(pokusyWebhooku.map((p) => p.url)).toEqual(["https://a.sk/h"]);
    const test = tabulky.webhook_outbox.find((x) => x.id === 2)!;
    expect(test.processed_at).toBeTruthy();
    expect(test.error).toBe(HLASKA_TESTOVACIA_WEBHOOK);
    expect(tabulky.webhook_delivery_logs.every((l) => l.company_id === SKUTOCNA)).toBe(true);
  });

  it("triggerEvent: testovacia firma nezaloží doručenie ani nepošle nič", async () => {
    pripravWebhooky();
    const { triggerEvent } = await import("./webhook-trigger.server");
    await triggerEvent({ company_id: TESTOVACIA, event: "invoice.created", data: { id: "x" } });
    expect(tabulky.webhook_delivery_logs ?? []).toEqual([]);
    expect(pokusyWebhooku).toEqual([]);

    await triggerEvent({ company_id: SKUTOCNA, event: "invoice.created", data: { id: "x" } });
    expect(pokusyWebhooku).toHaveLength(1);
  });

  it("opakovania: doručenie testovacej firmy sa ukončí bez pokusu", async () => {
    pripravWebhooky();
    const minule = new Date(Date.now() - 60_000).toISOString();
    tabulky.webhook_delivery_logs = [
      {
        id: "d1",
        company_id: SKUTOCNA,
        webhook_id: "w-ostra",
        event_type: "invoice.created",
        payload: {},
        attempt_count: 1,
        status: "retrying",
        next_attempt_at: minule,
      },
      {
        id: "d2",
        company_id: TESTOVACIA,
        webhook_id: "w-test",
        event_type: "invoice.created",
        payload: {},
        attempt_count: 1,
        status: "retrying",
        next_attempt_at: minule,
      },
    ];
    const { spracujOpakovaniaWebhookov, HLASKA_TESTOVACIA_WEBHOOK } =
      await import("./webhook-trigger.server");
    await spracujOpakovaniaWebhookov();
    expect(pokusyWebhooku.map((p) => p.url)).toEqual(["https://a.sk/h"]);
    const d2 = tabulky.webhook_delivery_logs.find((x) => x.id === "d2")!;
    expect(d2.status).toBe("failed");
    expect(d2.error_message).toBe(HLASKA_TESTOVACIA_WEBHOOK);
  });

  it("„Poslať znova“ v testovacej firme skončí hláškou", async () => {
    pripravWebhooky();
    tabulky.webhook_delivery_logs = [
      {
        id: "d3",
        company_id: TESTOVACIA,
        webhook_id: "w-test",
        status: "failed",
        attempt_count: 5,
      },
    ];
    const { posliWebhookZnova, HLASKA_TESTOVACIA_WEBHOOK } =
      await import("./webhook-trigger.server");
    await expect(posliWebhookZnova("d3")).rejects.toMatchObject({
      message: HLASKA_TESTOVACIA_WEBHOOK,
    });
    expect(pokusyWebhooku).toEqual([]);
  });
});

describe("push a pozvánky", () => {
  it("push pre testovaciu firmu sa potichu preskočí", async () => {
    process.env.FCM_PROJECT_ID = "p";
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "a", private_key: "b" });
    tabulky.company_users = [{ company_id: TESTOVACIA, user_id: "u1" }];
    tabulky.profiles = [{ id: "u1", push_token: "tok" }];
    const { sendPush } = await import("./push.server");
    const r: any = await sendPush({ company_id: TESTOVACIA, title: "t", body: "b" });
    expect(r).toMatchObject({ ok: true, sent: 0, skipped: true });
    expect(fetchVolania).toEqual([]);
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  });

  it("pozvánka do testovacej firmy sa nezaloží", async () => {
    const { vytvorPozvanku, HLASKA_TESTOVACIA_POZVANKA } = await import("./invitations.server");
    await expect(
      vytvorPozvanku(klient, {
        companyId: TESTOVACIA,
        email: "kolega@firma.sk",
        role: "employee",
        invitedBy: "u1",
      }),
    ).rejects.toMatchObject({ message: HLASKA_TESTOVACIA_POZVANKA });
    expect(tabulky.company_invitations ?? []).toEqual([]);
  });
});
