import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Server Trans.eu s podvrhnutou databázou a odpoveďami podľa dokumentácie
  (token: /ext/auth-api/accounts/token, zoznam: /ext/orders-api/v1/orders-received).
*/

type Riadok = Record<string, any>;
const db: { napojenie: Riadok | null; upserty: Riadok[]; aktualizacie: Riadok[] } = {
  napojenie: null,
  upserty: [],
  aktualizacie: [],
};

function dotaz(tabulka: string) {
  const q: any = {
    select: () => q,
    eq: () => q,
    is: () => q,
    or: () => q,
    maybeSingle: async () => ({ data: tabulka === "transeu_napojenia" ? db.napojenie : null }),
    update: (v: Riadok) => {
      db.aktualizacie.push({ tabulka, ...v });
      if (tabulka === "transeu_napojenia" && db.napojenie) Object.assign(db.napojenie, v);
      return q;
    },
    upsert: async (v: Riadok[]) => {
      db.upserty.push(...v);
      return { error: null };
    },
    // update(...).select() vráti zmenený riadok (napojenie je v teste jedno)
    then: (ok: (x: unknown) => unknown) =>
      ok({
        data: tabulka === "transeu_napojenia" && db.napojenie ? [db.napojenie] : null,
        error: null,
      }),
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => dotaz(t) },
}));
vi.mock("./payment-crypto.server", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
}));

const FIRMA = "11111111-2222-3333-4444-555555555555";
const POUZIVATEL = "66666666-7777-4888-9999-000000000000";
const OBJEDNAVKA = {
  id: "efc4dea5-ddd2-44d7-834d-d53d433a4de8",
  number: "123xy4z",
  created_at: "2026-10-09T13:52:29.552Z",
  status: { value: "ready" },
  freight: {
    shipper: { legal_name: "Spedition GmbH", vat_id: "DE123456789" },
    spots: [
      {
        spot_order: 1,
        operations: [{ type: "loading", timespans: { begin: "2026-10-12T08:00:00.000Z" } }],
        place: { address: { country: "sk", postal_code: "821 08", locality: "Bratislava" } },
      },
      {
        spot_order: 2,
        operations: [{ type: "unloading", timespans: { end: "2026-10-13T16:00:00.000Z" } }],
        place: { address: { country: "de", postal_code: "10115", locality: "Berlin" } },
      },
    ],
  },
  payment: { days: 30, price: { currency: "eur", type: "route", value: 1450 } },
};

let volania: { url: string; init: RequestInit }[] = [];

function odpoved(status: number, telo: unknown) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.TRANSEU_CLIENT_ID = "faktero-cid";
  process.env.TRANSEU_CLIENT_SECRET = "faktero-secret";
  process.env.TRANSEU_API_KEY = "faktero-api-key";
  process.env.PAYMENT_SECRETS_KEY = "testovaci-kluc-na-podpis";
  db.upserty = [];
  db.aktualizacie = [];
  volania = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transeu.server", () => {
  it("vypršaný token obnoví, uloží nový refresh token a stiahne objednávky", async () => {
    db.napojenie = {
      client_id: null,
      access_token_sifrovany: "enc:stary-access",
      refresh_token_sifrovany: "enc:stary-refresh",
      token_plati_do: new Date(Date.now() - 1000).toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        volania.push({ url, init });
        if (url.endsWith("/ext/auth-api/accounts/token"))
          return odpoved(200, {
            access_token: "novy-access",
            token_type: "Bearer",
            expires_in: 21599,
            refresh_token: "novy-refresh",
          });
        if (url.includes("/ext/orders-api/v1/orders-received")) return odpoved(200, [OBJEDNAVKA]);
        return odpoved(404, {});
      }),
    );
    const { stiahniObjednavky } = await import("./transeu.server");
    const v = await stiahniObjednavky(FIRMA, "2026-09-01T00:00:00.000Z");
    expect(v).toEqual({ stiahnute: 1 });

    const token = volania[0];
    expect(token.url).toBe("https://api.platform.trans.eu/ext/auth-api/accounts/token");
    expect((token.init.headers as any)["Api-key"]).toBe("faktero-api-key");
    expect(Object.fromEntries(new URLSearchParams(String(token.init.body)))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "stary-refresh",
      client_id: "faktero-cid",
      client_secret: "faktero-secret",
    });
    // Trans.eu pri obnove vydá nový refresh token — uložiť treba ten.
    expect(db.napojenie!.refresh_token_sifrovany).toBe("enc:novy-refresh");

    const zoznam = volania[1];
    expect((zoznam.init.headers as any).Authorization).toBe("Bearer novy-access");
    expect((zoznam.init.headers as any)["Api-key"]).toBe("faktero-api-key");
    expect(db.upserty[0]).toMatchObject({
      company_id: FIRMA,
      transeu_id: OBJEDNAVKA.id,
      zakaznik_vat_id: "DE123456789",
      nakladka: "SK 821 08 Bratislava",
      vykladka: "DE 10115 Berlin",
      cena: 1450,
      mena: "EUR",
    });
    // väzby na doklady sa pri stiahnutí neprepisujú
    expect("sales_order_id" in db.upserty[0]).toBe(false);
    expect("invoice_id" in db.upserty[0]).toBe(false);
  });

  it("pri 401 raz obnoví token a požiadavku zopakuje", async () => {
    db.napojenie = {
      client_id: null,
      access_token_sifrovany: "enc:platny",
      refresh_token_sifrovany: "enc:r1",
      token_plati_do: new Date(Date.now() + 3_600_000).toISOString(),
    };
    let zoznamy = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        volania.push({ url, init });
        if (url.endsWith("/accounts/token"))
          return odpoved(200, { access_token: "a2", expires_in: 21599, refresh_token: "r2" });
        zoznamy++;
        return zoznamy === 1 ? odpoved(401, { error: "invalid_token" }) : odpoved(200, []);
      }),
    );
    const { transeuApi } = await import("./transeu.server");
    await expect(transeuApi(FIRMA, "/ext/orders-api/v1/orders-received?page=1")).resolves.toEqual(
      [],
    );
    expect(volania.map((v) => v.url.replace("https://api.platform.trans.eu", ""))).toEqual([
      "/ext/orders-api/v1/orders-received?page=1",
      "/ext/auth-api/accounts/token",
      "/ext/orders-api/v1/orders-received?page=1",
    ]);
  });

  it("zamietnutá obnova (invalid_grant) označí napojenie chybou", async () => {
    db.napojenie = {
      client_id: null,
      access_token_sifrovany: "enc:x",
      refresh_token_sifrovany: "enc:zly",
      token_plati_do: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odpoved(400, { error: "invalid_grant" })),
    );
    const { transeuApi } = await import("./transeu.server");
    await expect(transeuApi(FIRMA, "/ext/companies-api/v1/companies")).rejects.toThrow(
      /pripojte účet znova/,
    );
    expect(db.napojenie!.stav).toBe("chyba");
  });

  it("vlastná aplikácia dopravcu má prednosť pred aplikáciou Faktera", async () => {
    db.napojenie = {
      client_id: "dopravca-cid",
      client_secret_sifrovany: "enc:dopravca-secret",
      api_kluc_sifrovany: "enc:dopravca-key",
    };
    const { konfigTranseu } = await import("./transeu.server");
    await expect(konfigTranseu(FIRMA)).resolves.toMatchObject({
      clientId: "dopravca-cid",
      clientSecret: "dopravca-secret",
      apiKey: "dopravca-key",
      vlastna: true,
    });
  });

  it("podpísaný state vráti firmu, používateľa a nonce; podvrhnutý neprejde", async () => {
    const { podpisanyStavTranseu, overStavTranseu } = await import("./transeu.server");
    const s = podpisanyStavTranseu(FIRMA, POUZIVATEL, "a".repeat(32));
    expect(overStavTranseu(s)).toEqual({
      companyId: FIRMA,
      userId: POUZIVATEL,
      nonce: "a".repeat(32),
    });
    const surovy = Buffer.from(s, "base64url").toString("utf8").split(".");
    const podvrh = (i: number, v: string) => {
      const c = [...surovy];
      c[i] = v;
      return Buffer.from(c.join(".")).toString("base64url");
    };
    expect(overStavTranseu(podvrh(0, "99999999-2222-3333-4444-555555555555"))).toBeNull();
    expect(overStavTranseu(podvrh(1, "99999999-2222-3333-4444-555555555555"))).toBeNull();
    expect(overStavTranseu(podvrh(3, "b".repeat(32)))).toBeNull();
    // starý tvar (bez používateľa) a starý čas
    expect(overStavTranseu(podvrh(2, String(Date.now() - 11 * 60_000)))).toBeNull();
    expect(overStavTranseu("nezmysel")).toBeNull();
    expect(overStavTranseu("")).toBeNull();
  });

  it("cookie proti CSRF: zhoda nonce, čítanie z hlavičky a doména", async () => {
    const { cookieSedi, cookieZPoziadavky, domenaCookie, COOKIE_TRANSEU } =
      await import("./transeu.server");
    const n = "c".repeat(32);
    expect(cookieSedi(n, n)).toBe(true);
    expect(cookieSedi("d".repeat(32), n)).toBe(false);
    expect(cookieSedi(null, n)).toBe(false);
    expect(cookieSedi("", n)).toBe(false);
    expect(cookieZPoziadavky(`a=1; ${COOKIE_TRANSEU}=${n}; b=2`)).toBe(n);
    expect(cookieZPoziadavky("a=1")).toBeNull();
    expect(cookieZPoziadavky(null)).toBeNull();
    expect(domenaCookie("www.faktero.sk")).toBe("faktero.sk");
    expect(domenaCookie("faktero.sk:443")).toBe("faktero.sk");
    expect(domenaCookie("localhost:3000")).toBeUndefined();
    expect(domenaCookie("zlefaktero.sk")).toBeUndefined();
  });
  // Súbežné obnovy (zámok) overuje transeu.db.test.ts proti databáze — súbežný dynamický
  // import podvrhnutého modulu vitest nezvládne a vráti skutočný klient.
});
