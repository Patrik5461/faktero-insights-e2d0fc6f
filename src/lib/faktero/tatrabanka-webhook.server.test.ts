import { beforeEach, describe, expect, it, vi } from "vitest";

const vlozene: any[] = [];
let odmietnutychZaDen = 0;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: any) => {
        vlozene.push(row);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        not: () => ({
          gte: () => Promise.resolve({ count: odmietnutychZaDen }),
        }),
      }),
    }),
  },
}));

const { handleTatraWebhook, schemaAutorizacie, odtlacokTajomstva } =
  await import("./tatrabanka-webhook.server");

const CESTA = "/api/public/tatrabanka/webhook";
const TELO = JSON.stringify({ event: "ACCOUNT_UPDATED", iban: "SK0011000000002600000000" });

function poziadavka(query: string, hlavicky: Record<string, string> = {}): Request {
  return new Request(`https://www.faktero.sk${CESTA}${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Layer7-SecureSpan-Gateway/v10.1.00-b12727",
      ...hlavicky,
    },
    body: TELO,
  });
}

describe("prijímač notifikácií Tatra banky", () => {
  beforeEach(() => {
    vlozene.length = 0;
    odmietnutychZaDen = 0;
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
    expect(vlozene[0].error_message).toContain("nesedí tajomstvo");
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

  it("bez nastaveného tajomstva potvrdí a zahodí", async () => {
    delete process.env.TB_WEBHOOK_SECRET;
    const r = await handleTatraWebhook(poziadavka(""), CESTA);
    expect(r.status).toBe(200);
    expect(vlozene).toHaveLength(0);
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
