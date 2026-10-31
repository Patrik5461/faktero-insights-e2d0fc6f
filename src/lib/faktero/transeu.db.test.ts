import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Trans.eu celým tokom proti skutočnej databáze, s podvrhnutým Trans.eu.
 *
 * Prístup k API Trans.eu nemáme, tak `fetch` na api.platform.trans.eu
 * odpovedá falošný server podľa dokumentácie (token sa pri obnove točí —
 * starý refresh token prestane platiť). Všetko ostatné (databáza, RLS,
 * číslovanie, režim DPH, PDF faktúry v úložisku) je skutočné.
 *
 * Test si založí vlastnú firmu a používateľa, na konci ich zmaže; zvyšky
 * po spadnutom behu (staršie než hodinu) uprace ďalší beh. Spúšťa sa len
 * cez `npm run test:db` (FAKTERO_DB_TESTY=1).
 */
const URL_DB = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const KLUC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const KLUC_KLIENTA =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const ZAPNUTE = process.env.FAKTERO_DB_TESTY === "1";
const bezPristupu =
  !ZAPNUTE || !URL_DB || !KLUC || !KLUC_KLIENTA || !process.env.PAYMENT_SECRETS_KEY;

const PREDPONA = "QA transeu ";
const API = "https://api.platform.trans.eu";

/* ------------------------------------------------------ falošný Trans.eu */

const tu = {
  kody: new Set(["dobry-kod"]),
  access: "",
  refresh: "",
  generacia: 0,
  obnovy: 0,
  odmietnuteObnovy: 0,
  nahrate: [] as { velkost: number; zaciatok: string; meno: string }[],
  faktury: [] as { id: string; telo: any }[],
  odpoved401: 0,
};

function json(status: number, telo: unknown) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noveTokeny() {
  tu.generacia++;
  tu.access = `AT${tu.generacia}`;
  tu.refresh = `RT${tu.generacia}`;
  return { access_token: tu.access, refresh_token: tu.refresh, expires_in: 21599 };
}

const spot = (
  poradie: number,
  typ: string,
  krajina: string,
  psc: string,
  mesto: string,
  t: string,
) => ({
  spot_order: poradie,
  operations: [{ type: typ, timespans: { begin: t, end: t } }],
  place: { address: { country: krajina, postal_code: psc, locality: mesto } },
});

export const OBJEDNAVKY = [
  {
    id: "0e0e0e0e-1111-4111-8111-000000000001",
    number: "QA-EU-1",
    created_at: "2026-10-20T08:00:00.000Z",
    status: { value: "delivery-confirmed" },
    freight: {
      reference_number: "REF-DE",
      distance: 680000,
      // bez predpony štátu — krajinu doplní zoznam partnerov
      shipper: { legal_name: "QA Spedition GmbH", vat_id: "811907980" },
      spots: [
        spot(1, "loading", "sk", "821 08", "Bratislava", "2026-10-21T08:00:00.000Z"),
        spot(2, "unloading", "de", "10115", "Berlin", "2026-10-22T16:00:00.000Z"),
      ],
    },
    payment: { days: 30, price: { currency: "eur", type: "route", value: 1450 } },
  },
  {
    id: "0e0e0e0e-1111-4111-8111-000000000002",
    number: "QA-KM-2",
    created_at: "2026-10-19T08:00:00.000Z",
    status: { value: "completed" },
    freight: {
      distance: 350000,
      shipper: { legal_name: "QA Doprava s.r.o.", vat_id: "SK2020000002" },
      spots: [
        spot(1, "loading", "sk", "010 01", "Žilina", "2026-10-19T08:00:00.000Z"),
        spot(2, "unloading", "sk", "040 01", "Košice", "2026-10-19T18:00:00.000Z"),
      ],
    },
    payment: { days: 14, price: { currency: "eur", type: "km", value: 1.2 } },
  },
  {
    id: "0e0e0e0e-1111-4111-8111-000000000003",
    number: "QA-NAVRH-3",
    created_at: "2026-10-18T08:00:00.000Z",
    status: { value: "proposal-waiting" },
    freight: { shipper: { legal_name: "QA Navrh", vat_id: "PL1234567890" }, spots: [] },
    payment: { price: { currency: "eur", type: "route", value: 500 } },
  },
];

const cakaj = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function falosnyTranseu(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  const h = new Headers(init.headers);
  if (u.pathname === "/ext/auth-api/accounts/token") {
    if (h.get("Api-key") !== "qa-api-kluc") return json(401, { error: "invalid_client" });
    const q = new URLSearchParams(String(init.body));
    if (q.get("client_id") !== "qa-client" || q.get("client_secret") !== "qa-secret-123")
      return json(401, { error: "invalid_client" });
    if (q.get("grant_type") === "authorization_code") {
      if (!tu.kody.delete(q.get("code") ?? ""))
        return json(400, { error: "invalid_grant", error_description: "Code expired" });
      return json(200, noveTokeny());
    }
    if (q.get("grant_type") === "refresh_token") {
      // Banka-štýl: obnova chvíľu trvá — súbežné volania sa stihnú prekryť.
      await cakaj(400);
      if (q.get("refresh_token") !== tu.refresh) {
        tu.odmietnuteObnovy++;
        return json(400, { error: "invalid_grant", error_description: "Refresh token revoked" });
      }
      tu.obnovy++;
      return json(200, noveTokeny());
    }
    return json(400, { error: "unsupported_grant_type" });
  }
  if (h.get("Api-key") !== "qa-api-kluc") return json(403, { message: "Api-key" });
  if (tu.odpoved401 > 0) {
    tu.odpoved401--;
    return json(401, { message: "expired" });
  }
  if (h.get("Authorization") !== `Bearer ${tu.access}`) return json(401, { message: "token" });
  if (u.pathname === "/ext/companies-api/v1/companies")
    return json(200, { legal_name: "QA Dopravca s.r.o.", vat_id: "SK2120000001" });
  if (u.pathname === "/ext/orders-api/v1/orders-received") {
    const strana = Number(u.searchParams.get("page") ?? 1);
    return json(200, strana === 1 ? OBJEDNAVKY : []);
  }
  if (u.pathname === "/ext/partners-api/v1/partners") {
    const f = String(u.searchParams.get("filter") ?? "");
    if (f.includes("811907980"))
      return json(200, {
        partners: [
          {
            company: {
              name: "QA Spedition GmbH",
              email: "qa-spedition@faktero.sk",
              address: {
                country: "de",
                locality: "Berlin",
                postal_code: "10115",
                street: "Hauptstr.",
                number: "1",
              },
            },
          },
        ],
      });
    return json(200, { partners: [] });
  }
  if (u.pathname === "/ext/media-storage-api/v1/assets" && init.method === "PUT") {
    const subor = (init.body as FormData).get("file") as File;
    const b = Buffer.from(await subor.arrayBuffer());
    tu.nahrate.push({ velkost: b.length, zaciatok: b.subarray(0, 5).toString(), meno: subor.name });
    return json(201, { id: `media-${tu.nahrate.length}` });
  }
  const m = /^\/ext\/orders-api\/v1\/orders\/([^/]+)\/invoice$/.exec(u.pathname);
  if (m && init.method === "POST") {
    tu.faktury.push({ id: decodeURIComponent(m[1]), telo: JSON.parse(String(init.body)) });
    return json(201, {});
  }
  return json(404, { message: `neznáma cesta ${u.pathname}` });
}

/* -------------------------------------------------------------- test */

async function uprac(db: SupabaseClient, firma: string) {
  const { data: f } = await db.from("invoices").select("id").eq("company_id", firma);
  const cesty = ((f ?? []) as { id: string }[]).map((x) => `${firma}/${x.id}.pdf`);
  if (cesty.length) await db.storage.from("invoice-pdfs").remove(cesty);
  for (const t of [
    "transeu_objednavky",
    "transeu_napojenia",
    "invoices",
    "sales_orders",
    "customers",
    "number_series",
    "company_users",
  ]) {
    await db.from(t).delete().eq("company_id", firma);
  }
  await db.from("companies").delete().eq("id", firma);
}

describe.skipIf(bezPristupu)("Trans.eu proti databáze (podvrhnutý Trans.eu)", () => {
  let db: SupabaseClient;
  let ako: SupabaseClient;
  let firma: string;
  let cudzia: string;
  let pouzivatel: string;
  const heslo = `Qa!${Math.random().toString(36).slice(2)}A9`;
  let srv: typeof import("./transeu.server");
  const id = (transeuId: string) =>
    db
      .from("transeu_objednavky")
      .select("*")
      .eq("company_id", firma)
      .eq("transeu_id", transeuId)
      .single()
      .then((r) => r.data as any);

  beforeAll(async () => {
    delete process.env.TRANSEU_CLIENT_ID;
    delete process.env.TRANSEU_CLIENT_SECRET;
    delete process.env.TRANSEU_API_KEY;
    const skutocny = globalThis.fetch;
    vi.stubGlobal("fetch", (vstup: any, init?: RequestInit) => {
      const url = typeof vstup === "string" ? vstup : (vstup?.url ?? String(vstup));
      if (url.startsWith(API) || url.startsWith("https://auth.platform.trans.eu"))
        return falosnyTranseu(url, init);
      return skutocny(vstup, init);
    });

    db = createClient(URL_DB, KLUC, { auth: { persistSession: false } });
    const hodinaSpat = new Date(Date.now() - 3600_000).toISOString();
    const { data: stare } = await db
      .from("companies")
      .select("id")
      .like("name", `${PREDPONA}%`)
      .lt("created_at", hodinaSpat);
    for (const { id: s } of (stare ?? []) as { id: string }[]) await uprac(db, s);

    const nova = async (meno: string) => {
      const { data, error } = await db
        .from("companies")
        .insert({
          name: `${PREDPONA}${meno} ${Date.now()}`,
          default_currency: "EUR",
          country: "SK",
          vat_payer: true,
          ico: "52000001",
          dic: "2120000001",
          ic_dph: "SK2120000001",
          street: "Testovacia 1",
          city: "Bratislava",
          zip: "81101",
          iban: "SK3112000000198742637541",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return (data as { id: string }).id;
    };
    firma = await nova("dopravca");
    cudzia = await nova("cudzia");

    const mail = `qa-transeu-${Date.now()}@faktero.test`;
    const { data: u, error: chybaU } = await db.auth.admin.createUser({
      email: mail,
      password: heslo,
      email_confirm: true,
    });
    if (chybaU) throw new Error(chybaU.message);
    pouzivatel = u.user!.id;
    const { error: e2 } = await db
      .from("company_users")
      .insert({ company_id: firma, user_id: pouzivatel, role: "owner" } as never);
    if (e2) throw new Error(e2.message);
    ako = createClient(URL_DB, KLUC_KLIENTA, { auth: { persistSession: false } });
    const { error: e3 } = await ako.auth.signInWithPassword({ email: mail, password: heslo });
    if (e3) throw new Error(e3.message);

    // Vlastná aplikácia dopravcu (ako z formulára Nastavenia → Trans.eu).
    const { encryptSecret } = await import("./payment-crypto.server");
    const { error: e4 } = await db.from("transeu_napojenia").insert({
      company_id: firma,
      client_id: "qa-client",
      client_secret_sifrovany: encryptSecret("qa-secret-123"),
      api_kluc_sifrovany: encryptSecret("qa-api-kluc"),
      stav: "caka",
    } as never);
    if (e4) throw new Error(e4.message);
    srv = await import("./transeu.server");
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (firma) await uprac(db, firma);
    if (cudzia) await uprac(db, cudzia);
    if (pouzivatel) await db.auth.admin.deleteUser(pouzivatel);
  }, 60_000);

  it("state: platný pre svoju firmu, zmenený alebo cudzí odmietnutý", () => {
    const s = srv.podpisanyStavTranseu(firma, pouzivatel);
    expect(srv.overStavTranseu(s)?.companyId).toBe(firma);
    const surovy = Buffer.from(s, "base64url").toString();
    const podvrh = Buffer.from(surovy.replace(firma, cudzia)).toString("base64url");
    expect(srv.overStavTranseu(podvrh)).toBeNull();
    expect(srv.overStavTranseu("nezmysel")).toBeNull();
  });

  it("autorizačná adresa má client_id vlastnej aplikácie, redirect a podpísaný state", async () => {
    const { url, nonce } = await srv.autorizacnaAdresa(firma, pouzivatel);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://auth.platform.trans.eu/oauth2/auth");
    expect(u.searchParams.get("client_id")).toBe("qa-client");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toMatch(/\/api\/public\/transeu\/callback$/);
    const st = srv.overStavTranseu(u.searchParams.get("state")!);
    expect(st?.companyId).toBe(firma);
    expect(st?.nonce).toBe(nonce);
  });

  it("zlý kód z Trans.eu → ľudská chyba uložená pri napojení", async () => {
    await expect(srv.dokonciPrihlasenie(firma, "zly-kod")).rejects.toThrow(
      /Prihlásenie do Trans.eu vypršalo|pripojte účet znova/,
    );
  });

  it("výmena kódu uloží tokeny zašifrované a údaje firmy", async () => {
    await srv.dokonciPrihlasenie(firma, "dobry-kod");
    const { data } = await db
      .from("transeu_napojenia")
      .select("*")
      .eq("company_id", firma)
      .single();
    const n = data as any;
    expect(n.stav).toBe("pripojene");
    expect(n.firma_nazov).toBe("QA Dopravca s.r.o.");
    expect(n.access_token_sifrovany).toBeTruthy();
    expect(n.access_token_sifrovany).not.toContain("AT1");
    expect(n.refresh_token_sifrovany).not.toContain("RT1");
  });

  it("tokeny a kľúče nie sú čitateľné cez REST ani pre člena firmy", async () => {
    const zle = await ako
      .from("transeu_napojenia")
      .select("refresh_token_sifrovany")
      .eq("company_id", firma);
    expect(zle.error?.message).toMatch(/permission denied/);
    const vsetko = await ako.from("transeu_napojenia").select("*").eq("company_id", firma);
    expect(vsetko.error?.message).toMatch(/permission denied/);
    const dobre = await ako
      .from("transeu_napojenia")
      .select("stav, client_id")
      .eq("company_id", firma);
    expect(dobre.data).toEqual([{ stav: "pripojene", client_id: "qa-client" }]);
    const zapis = await ako
      .from("transeu_napojenia")
      .update({ stav: "chyba" } as never)
      .eq("company_id", firma)
      .select();
    expect(zapis.error?.message ?? (zapis.data ?? []).length).toBeTruthy();
    expect(zapis.data ?? []).toEqual([]);
  });

  it("stiahnutie objednávok", async () => {
    const v = await srv.stiahniObjednavky(firma, null);
    expect(v.stiahnute).toBe(3);
    const eu = await id(OBJEDNAVKY[0].id);
    expect(eu.cena).toBe(1450);
    expect(eu.nakladka).toBe("SK 821 08 Bratislava");
    const km = await id(OBJEDNAVKY[1].id);
    expect(km.typ_ceny).toBe("km");
    expect(Number(km.cena)).toBe(420); // 1,20 €/km × 350 km
    expect(Number(km.vzdialenost_km)).toBe(350);
  });

  it("RLS: cudzia firma objednávky nevidí, vlastná rola bez faktúr tiež nie", async () => {
    const { error } = await db.from("transeu_objednavky").insert({
      company_id: cudzia,
      transeu_id: "cudzia-1",
      cena: 1,
    } as never);
    expect(error).toBeNull();
    const vidim = await ako.from("transeu_objednavky").select("company_id");
    expect(new Set((vidim.data ?? []).map((x: any) => x.company_id))).toEqual(new Set([firma]));
    // Server pri akcii hľadá riadok cez RLS — cudzí riadok neexistuje.
    const { data: c } = await db
      .from("transeu_objednavky")
      .select("id")
      .eq("transeu_id", "cudzia-1")
      .single();
    await expect(srv.zalozObjednavku(ako, firma, pouzivatel, (c as any).id)).rejects.toThrow(
      /nenašla/,
    );

    await db
      .from("company_users")
      .update({ role: "custom", permissions: { faktury: "none" } } as never)
      .eq("company_id", firma)
      .eq("user_id", pouzivatel);
    try {
      const bez = await ako.from("transeu_objednavky").select("id").eq("company_id", firma);
      expect(bez.data ?? []).toEqual([]);
      const n = await ako.from("transeu_napojenia").select("stav").eq("company_id", firma);
      expect(n.data ?? []).toEqual([]);
    } finally {
      const { error: e } = await db
        .from("company_users")
        .update({ role: "owner", permissions: {} } as never)
        .eq("company_id", firma)
        .eq("user_id", pouzivatel);
      if (e) throw new Error(e.message);
    }
  });

  it("návrh v Trans.eu sa fakturovať nedá", async () => {
    const r = await id(OBJEDNAVKY[2].id);
    await expect(srv.zalozObjednavku(ako, firma, pouzivatel, r.id)).rejects.toThrow(/neprijali/);
  });

  let fakturaEu: { invoice_id: string; invoice_number: string };
  it("zákazník z EÚ: prijatá objednávka, faktúra s prenesením DPH", async () => {
    const r = await id(OBJEDNAVKY[0].id);
    const so = await srv.zalozObjednavku(ako, firma, pouzivatel, r.id);
    expect(so.nova).toBe(true);
    const { data: obj } = await db
      .from("sales_orders")
      .select("*, sales_order_items(*), customers(*)")
      .eq("id", so.sales_order_id)
      .single();
    const o = obj as any;
    expect(o.customers.country).toBe("DE");
    expect(o.customers.ic_dph).toBe("DE811907980");
    expect(o.customers.city).toBe("Berlin");
    expect(Number(o.sales_order_items[0].vat_rate)).toBe(0);
    expect(o.sales_order_items[0].name).toBe("Preprava SK 821 08 Bratislava → DE 10115 Berlin");

    const f = await srv.vystavFakturu(ako, firma, pouzivatel, r.id);
    expect(f.nova).toBe(true);
    fakturaEu = f;
    const { data: inv } = await db.from("invoices").select("*").eq("id", f.invoice_id).single();
    const i = inv as any;
    expect(i.reverse_charge).toBe(true);
    expect(i.reverse_charge_type).toBe("eu_b2b");
    expect(i.eu_plnenie).toBe("sluzba");
    expect(Number(i.total)).toBe(1450);
    expect(Number(i.vat_total ?? 0)).toBe(0);
    expect(i.external_id).toBe(`transeu:${OBJEDNAVKY[0].id}`);
    expect(i.delivery_date).toBe("2026-10-22");
    expect(i.sales_order_id).toBe(so.sales_order_id);
    const { data: soPo } = await db
      .from("sales_orders")
      .select("status")
      .eq("id", so.sales_order_id)
      .single();
    expect((soPo as any).status).toBe("completed");
  });

  it("druhé vystavenie vráti tú istú faktúru", async () => {
    const r = await id(OBJEDNAVKY[0].id);
    const f2 = await srv.vystavFakturu(ako, firma, pouzivatel, r.id);
    expect(f2.nova).toBe(false);
    expect(f2.invoice_id).toBe(fakturaEu.invoice_id);
    // Ani súbežné kliknutia nezaložia druhú.
    const obe = await Promise.all([
      srv.vystavFakturu(ako, firma, pouzivatel, r.id),
      srv.vystavFakturu(ako, firma, pouzivatel, r.id),
    ]);
    for (const o of obe) expect(o.invoice_id).toBe(fakturaEu.invoice_id);
    const { data: vsetky } = await db
      .from("invoices")
      .select("id")
      .eq("company_id", firma)
      .eq("external_id", `transeu:${OBJEDNAVKY[0].id}`);
    expect((vsetky ?? []).length).toBe(1);
    const { count } = await db
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", firma)
      .is("deleted_at", null);
    expect(count).toBe(1);
  });

  it("PDF faktúry ide späť do Trans.eu", async () => {
    const r = await id(OBJEDNAVKY[0].id);
    const v = await srv.odosliFakturu(ako, firma, r.id);
    expect(v.media_id).toBe("media-1");
    expect(tu.nahrate[0].zaciatok).toBe("%PDF-");
    expect(tu.nahrate[0].velkost).toBeGreaterThan(1000);
    expect(tu.faktury).toHaveLength(1);
    expect(tu.faktury[0].id).toBe(OBJEDNAVKY[0].id);
    const d = tu.faktury[0].telo.invoice_data;
    expect(d.invoice_number).toBe(fakturaEu.invoice_number);
    expect(d.net_value).toBe(1450);
    expect(d.gross_value).toBe(1450);
    expect(d.tax_value).toBe(0);
    expect(d.currency).toBe("eur");
    expect(tu.faktury[0].telo.media_id).toBe("media-1");
    const po = await id(OBJEDNAVKY[0].id);
    expect(po.faktura_odoslana_at).toBeTruthy();
    expect(po.ma_fakturu_v_transeu).toBe(true);
  });

  it("cena za km: domáci zákazník, 420 € + 23 % DPH", async () => {
    const r = await id(OBJEDNAVKY[1].id);
    // Dvojklik na úplne novú objednávku: jedna prijatá objednávka, jedna faktúra.
    // Obe volania uspejú a vrátia tú istú faktúru — druhé nesmie skončiť chybou.
    const [f, f2] = await Promise.all([
      srv.vystavFakturu(ako, firma, pouzivatel, r.id),
      srv.vystavFakturu(ako, firma, pouzivatel, r.id),
    ]);
    expect(f2.invoice_id).toBe(f.invoice_id);
    expect([f.nova, f2.nova].sort()).toEqual([false, true]);
    const { data: so } = await db
      .from("sales_orders")
      .select("id")
      .eq("company_id", firma)
      .eq("customer_order_number", "QA-KM-2")
      .is("deleted_at", null);
    expect((so ?? []).length).toBe(1);
    const { data: inv } = await db
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", f.invoice_id)
      .single();
    const i = inv as any;
    expect(i.reverse_charge).toBe(false);
    expect(Number(i.subtotal)).toBe(420);
    expect(Number(i.total)).toBe(516.6);
    expect(Number(i.invoice_items[0].vat_rate)).toBe(23);
    expect(i.invoice_items[0].description).toContain("350 km");
    // splatnosť 14 dní z Trans.eu
    expect((Date.parse(i.due_date) - Date.parse(i.issue_date)) / 86_400_000).toBe(14);
  });

  it("obnova tokenu: refresh token sa točí a uloží sa nový", async () => {
    await db
      .from("transeu_napojenia")
      .update({ token_plati_do: new Date(Date.now() - 1000).toISOString() } as never)
      .eq("company_id", firma);
    const pred = tu.generacia;
    await srv.transeuApi(firma, "/ext/companies-api/v1/companies");
    expect(tu.generacia).toBe(pred + 1);
    // Ďalšie volanie použije nový access token bez obnovy.
    await srv.transeuApi(firma, "/ext/companies-api/v1/companies");
    expect(tu.generacia).toBe(pred + 1);
    // 401 z API → jedna vynútená obnova.
    tu.odpoved401 = 1;
    await srv.transeuApi(firma, "/ext/companies-api/v1/companies");
    expect(tu.generacia).toBe(pred + 2);
  });

  it("súbežné obnovy: Trans.eu dostane starý refresh token len raz, napojenie ostane", async () => {
    await db
      .from("transeu_napojenia")
      .update({ token_plati_do: new Date(Date.now() - 1000).toISOString() } as never)
      .eq("company_id", firma);
    const obnovyPred = tu.obnovy;
    const odmietnutePred = tu.odmietnuteObnovy;
    const v = await Promise.allSettled([
      srv.transeuApi(firma, "/ext/companies-api/v1/companies"),
      srv.transeuApi(firma, "/ext/companies-api/v1/companies"),
      srv.transeuApi(firma, "/ext/companies-api/v1/companies"),
    ]);
    expect(v.map((x) => x.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(tu.obnovy - obnovyPred).toBe(1);
    expect(tu.odmietnuteObnovy - odmietnutePred).toBe(0);
    const { data } = await db
      .from("transeu_napojenia")
      .select("stav")
      .eq("company_id", firma)
      .single();
    expect((data as any).stav).toBe("pripojene");
  });

  it("súbežné obnovy aj z dvoch procesov (zámok v databáze)", async () => {
    await db
      .from("transeu_napojenia")
      .update({ token_plati_do: new Date(Date.now() - 1000).toISOString() } as never)
      .eq("company_id", firma);
    vi.resetModules();
    const druhy = await import("./transeu.server");
    expect(druhy).not.toBe(srv);
    const obnovyPred = tu.obnovy;
    const v = await Promise.allSettled([
      srv.transeuApi(firma, "/ext/companies-api/v1/companies"),
      druhy.transeuApi(firma, "/ext/companies-api/v1/companies"),
    ]);
    expect(v.map((x) => x.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(tu.obnovy - obnovyPred).toBe(1);
    const { data } = await db
      .from("transeu_napojenia")
      .select("stav, obnova_zamok_do")
      .eq("company_id", firma)
      .single();
    expect((data as any).stav).toBe("pripojene");
    expect((data as any).obnova_zamok_do).toBeNull();
  });
});
