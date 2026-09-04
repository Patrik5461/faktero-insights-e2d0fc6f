import { beforeEach, describe, expect, it, vi } from "vitest";

const vlozene: any[] = [];
let odmietnutychZaDen = 0;
/** Súhlasy, ktoré v tomto teste „máme" v `bank_connections`. */
let suhlasyVDb: string[] = [];
/** Pre ktoré súhlasy sa spustilo sťahovanie. */
const stiahnute: string[][] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (tabulka: string) => {
      if (tabulka === "bank_connections") {
        const dotaz: any = {
          select: () => dotaz,
          eq: () => dotaz,
          in: (_stlpec: string, hodnoty: string[]) =>
            Promise.resolve({
              data: hodnoty
                .filter((h) => suhlasyVDb.includes(h))
                .map((consent_id) => ({ consent_id })),
            }),
        };
        return dotaz;
      }
      return {
        insert: (row: any) => {
          vlozene.push(row);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          not: () => ({
            gte: () => Promise.resolve({ count: odmietnutychZaDen }),
          }),
        }),
      };
    },
  },
}));

vi.mock("./bank-sync.server", () => ({
  syncPodlaSuhlasov: (consentIds: string[]) => {
    stiahnute.push(consentIds);
    return Promise.resolve({ connections: consentIds.length, inserted: 0, failed: 0, results: [] });
  },
}));

/** Sťahovanie beží mimo odpovede — treba pustiť frontu úloh. */
const dobehni = () => new Promise((r) => setTimeout(r, 0));

const { handleTatraWebhook, schemaAutorizacie, odtlacokTajomstva, suhlasyZNotifikacie } =
  await import("./tatrabanka-webhook.server");

const CESTA = "/api/public/tatrabanka/webhook";
const TELO = JSON.stringify({ event: "ACCOUNT_UPDATED", iban: "SK0011000000002600000000" });

/** Notifikácia v tvare, v akom chodí z banky. */
function notifikacia(...consentIds: string[]): string {
  return JSON.stringify({
    events: {
      transactionEvents: consentIds.map((consentId) => ({
        consentId,
        eventType: "NEW",
        accounts: [{ accountId: "221b56df-5b32-48f3-a92c-8f77b2ee6ee6" }],
      })),
    },
  });
}

function poziadavka(
  query: string,
  hlavicky: Record<string, string> = {},
  telo: string = TELO,
): Request {
  return new Request(`https://www.faktero.sk${CESTA}${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Layer7-SecureSpan-Gateway/v10.1.00-b12727",
      ...hlavicky,
    },
    body: telo,
  });
}

describe("prijímač notifikácií Tatra banky", () => {
  beforeEach(() => {
    vlozene.length = 0;
    stiahnute.length = 0;
    odmietnutychZaDen = 0;
    suhlasyVDb = [];
    process.env.TB_WEBHOOK_SECRET = "tajne";
  });

  it("na GET odpovie, že endpoint žije", async () => {
    const r = await handleTatraWebhook(
      new Request(`https://www.faktero.sk${CESTA}`, { method: "GET" }),
      CESTA,
    );
    expect(r.status).toBe(200);
    expect(vlozene).toHaveLength(0);
  });

  it("so správnym tajomstvom notifikáciu uloží bez chyby", async () => {
    const r = await handleTatraWebhook(poziadavka("?s=tajne"), CESTA);
    expect(r.status).toBe(200);
    expect(vlozene).toHaveLength(1);
    expect(vlozene[0].error_message).toBeNull();
    expect(vlozene[0].payload).toEqual({
      event: "ACCOUNT_UPDATED",
      iban: "SK0011000000002600000000",
    });
  });

  it("odmietnutú notifikáciu uloží ako diagnostiku, ale stále vráti 401", async () => {
    const r = await handleTatraWebhook(poziadavka("?s=zle"), CESTA);
    expect(r.status).toBe(401);
    expect(vlozene).toHaveLength(1);
    expect(vlozene[0].error_message).toContain("neznámy súhlas");
    // Práve kvôli tomuto to ukladáme — nech vidno, čím sa banka autentizuje.
    expect(vlozene[0].headers["user-agent"]).toContain("Layer7-SecureSpan-Gateway");
    expect(vlozene[0].raw_body).toBe(TELO);
  });

  it("hodnoty prihlasovacích hlavičiek neukladá, len ich prítomnosť a schému", async () => {
    await handleTatraWebhook(
      poziadavka("?s=zle", { authorization: "Bearer velmi-tajny-token", cookie: "a=b" }),
      CESTA,
    );
    // Uloží sa schéma a popis tvaru — nikdy nič z hodnoty samotnej.
    expect(vlozene[0].headers.authorization).toMatch(/^Bearer \(vynechané; dĺžka 17,/);
    expect(vlozene[0].headers.cookie).toMatch(/^\(vynechané; /);
    expect(JSON.stringify(vlozene[0].headers)).not.toContain("velmi-tajny-token");
  });

  it("hlavička bez medzery je celá údaj — neuloží sa z nej nič", async () => {
    await handleTatraWebhook(poziadavka("?s=zle", { authorization: "abc123tajne" }), CESTA);
    // Bez medzery nie je čo brať ako schému; ostane len popis tvaru.
    expect(vlozene[0].headers.authorization).toMatch(/^\(vynechané; dĺžka 11, bez medzery/);
    expect(JSON.stringify(vlozene[0].headers)).not.toContain("abc123tajne");
  });

  it("tajomstvo v hlavičke x-webhook-secret sa neukladá nikdy", async () => {
    await handleTatraWebhook(
      poziadavka("", { "x-webhook-secret": "Basic nie-je-to-schema" }),
      CESTA,
    );
    // Schéma sa číta len z `authorization`; tu sa popíše celá hodnota.
    expect(vlozene[0].headers["x-webhook-secret"]).toMatch(/^\(vynechané; /);
    expect(JSON.stringify(vlozene[0])).not.toContain("nie-je-to-schema");
  });

  it("cesta sa ukladá bez query — tajomstvo z URL sa nesmie dostať do tabuľky", async () => {
    await handleTatraWebhook(poziadavka("?s=tajne"), CESTA);
    expect(vlozene[0].path).toBe(CESTA);
    expect(JSON.stringify(vlozene[0])).not.toContain("tajne");
  });

  it("keď je denný strop odmietnutých vyčerpaný, neuloží nič", async () => {
    odmietnutychZaDen = 50;
    const r = await handleTatraWebhook(poziadavka("?s=zle"), CESTA);
    expect(r.status).toBe(401);
    expect(vlozene).toHaveLength(0);
  });

  it("bez tajomstva aj bez známeho súhlasu je to cudzí podnet — 401", async () => {
    delete process.env.TB_WEBHOOK_SECRET;
    const r = await handleTatraWebhook(poziadavka(""), CESTA);
    expect(r.status).toBe(401);
    expect(stiahnute).toHaveLength(0);
  });
});

describe("notifikácia overená súhlasom", () => {
  const CUDZI = "22222222-2222-4222-8222-222222222222";
  /*
    Odstup medzi sťahovaniami si handler pamätá naprieč volaniami, tak nech má
    každý test vlastný súhlas — inak by mu ho zaškrtil test pred ním.
  */
  let poradie = 0;
  const dalsiSuhlas = () =>
    `11111111-1111-4111-8111-1111111111${String(++poradie).padStart(2, "0")}`;
  let NAS = "";

  beforeEach(() => {
    NAS = dalsiSuhlas();
    vlozene.length = 0;
    stiahnute.length = 0;
    odmietnutychZaDen = 0;
    suhlasyVDb = [];
    delete process.env.TB_WEBHOOK_SECRET;
  });

  it("známy consentId ju prijme a spustí sťahovanie", async () => {
    suhlasyVDb = [NAS];
    const r = await handleTatraWebhook(poziadavka("", {}, notifikacia(NAS)), CESTA);
    await dobehni();
    expect(r.status).toBe(200);
    expect(vlozene[0].error_message).toBeNull();
    expect(vlozene[0].processed).toBe(true);
    expect(stiahnute).toEqual([[NAS]]);
  });

  it("ťahá len pre naše súhlasy, cudzie z tej istej notifikácie ignoruje", async () => {
    suhlasyVDb = [NAS];
    await handleTatraWebhook(poziadavka("", {}, notifikacia(NAS, CUDZI)), CESTA);
    await dobehni();
    expect(stiahnute).toEqual([[NAS]]);
  });

  it("samý neznámy consentId je 401 a neťahá nič", async () => {
    const r = await handleTatraWebhook(poziadavka("", {}, notifikacia(CUDZI)), CESTA);
    await dobehni();
    expect(r.status).toBe(401);
    expect(stiahnute).toHaveLength(0);
  });

  it("druhá výzva hneď za prvou už neťahá — banka klope aj niekoľkokrát", async () => {
    suhlasyVDb = [NAS];
    await handleTatraWebhook(poziadavka("", {}, notifikacia(NAS)), CESTA);
    await handleTatraWebhook(poziadavka("", {}, notifikacia(NAS)), CESTA);
    await dobehni();
    expect(stiahnute).toEqual([[NAS]]);
  });

  it("z obsahu notifikácie sa neberie nič okrem consentId", async () => {
    suhlasyVDb = [NAS];
    const podvrh = JSON.stringify({
      events: { transactionEvents: [{ consentId: NAS, amount: "999999", iban: "SK99" }] },
    });
    await handleTatraWebhook(poziadavka("", {}, podvrh), CESTA);
    await dobehni();
    // Sťahuje sa z API banky, nie z tela — do sťahovania ide len súhlas.
    expect(stiahnute).toEqual([[NAS]]);
  });
});

describe("súhlasy z notifikácie", () => {
  it("nájde consentId aj keď je zabalený hlbšie", () => {
    const c = "44444444-4444-4444-8444-444444444444";
    expect(suhlasyZNotifikacie({ a: { b: [{ consentId: c }] } })).toEqual([c]);
  });

  it("hodnotu, ktorá nie je UUID, nevydá za súhlas", () => {
    expect(suhlasyZNotifikacie({ consentId: "../../etc/passwd" })).toEqual([]);
    expect(suhlasyZNotifikacie({ consentId: 42 })).toEqual([]);
  });

  it("ten istý súhlas vráti raz a viac než desať ich nezoberie", () => {
    const c = "55555555-5555-4555-8555-555555555555";
    expect(suhlasyZNotifikacie([{ consentId: c }, { consentId: c }])).toEqual([c]);
    const vela = Array.from({ length: 30 }, (_, i) => ({
      consentId: `66666666-6666-4666-8666-6666666666${String(i).padStart(2, "0")}`,
    }));
    expect(suhlasyZNotifikacie(vela)).toHaveLength(10);
  });

  it("z prázdneho ani nezmyselného tela nespadne", () => {
    expect(suhlasyZNotifikacie(null)).toEqual([]);
    expect(suhlasyZNotifikacie("text")).toEqual([]);
  });
});

describe("schéma z hlavičky Authorization", () => {
  it("vezme prvé slovo, keď za ním je údaj", () => {
    expect(schemaAutorizacie("Basic dXNlcjpoZXNsbw==")).toBe("Basic");
    expect(schemaAutorizacie("Bearer eyJhbGciOi")).toBe("Bearer");
  });

  it("nevezme nič, keď je hodnota jeden kus", () => {
    expect(schemaAutorizacie("dXNlcjpoZXNsbw==")).toBeNull();
    expect(schemaAutorizacie("Bearer")).toBeNull();
    expect(schemaAutorizacie("Bearer   ")).toBeNull();
    expect(schemaAutorizacie(" tajne")).toBeNull();
  });

  it("nevezme nič, keď prvé slovo nevyzerá ako názov schémy", () => {
    expect(schemaAutorizacie("dXNlcjpo=ZXNsbw== a")).toBeNull();
    expect(schemaAutorizacie("aaaaaaaaaaaaaaaaaaaaaaaaaaa tajne")).toBeNull();
  });
});

describe("odtlacokTajomstva", () => {
  it("z hodnoty nezverejní ani znak", () => {
    const tajomstvo = "supertajneheslo123";
    const o = odtlacokTajomstva(tajomstvo);
    expect(o).not.toContain("super");
    expect(o).not.toContain("heslo");
    expect(o).toContain("dĺžka 18");
  });

  it("rozozná Basic poslaný bez slova Basic", () => {
    // Presne toto potrebujeme vedieť: banka posiela hodnotu bez schémy.
    const base64 = Buffer.from("pouzivatel:heslo").toString("base64");
    const o = odtlacokTajomstva(base64);
    expect(o).toContain("Basic bez slova Basic");
    expect(o).not.toContain("pouzivatel");
  });

  it("rozozná JWT", () => {
    expect(odtlacokTajomstva("aaa.bbb.ccc")).toContain("JWT");
  });

  it("rozozná hex a UUID", () => {
    expect(odtlacokTajomstva("a".repeat(64))).toContain("hex");
    expect(odtlacokTajomstva("badd7a56-f225-40b9-a663-123eb4018768")).toContain("UUID");
  });

  it("popíše aj hodnotu, ktorá do žiadneho tvaru nesadne", () => {
    const o = odtlacokTajomstva("Ab3!x@");
    expect(o).toContain("dĺžka 6");
    expect(o).toContain("aj iné znaky");
  });

  it("prázdnu hodnotu nevydáva za tvar", () => {
    expect(odtlacokTajomstva("   ")).toBe("prázdne");
  });
});
