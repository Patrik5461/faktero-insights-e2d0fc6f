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

const { handleTatraWebhook } = await import("./tatrabanka-webhook.server");

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

  it("hodnoty prihlasovacích hlavičiek neukladá, len ich prítomnosť", async () => {
    await handleTatraWebhook(
      poziadavka("?s=zle", { authorization: "Bearer velmi-tajny-token", cookie: "a=b" }),
      CESTA,
    );
    expect(vlozene[0].headers.authorization).toBe("(vynechané)");
    expect(vlozene[0].headers.cookie).toBe("(vynechané)");
    expect(JSON.stringify(vlozene[0].headers)).not.toContain("velmi-tajny-token");
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
