import { describe, expect, it, vi } from "vitest";

/*
  Testovací kľúč (fk_test_…) smie len čítať: zápisy cez handleApi vrátia 403
  test_key_read_only a dávka pre Pohodu (vlastná autentifikácia) bez
  náhľadu tiež 403 — inak by označila doklady za odovzdané.
*/
const zostavDavku = vi.fn(async (_db: unknown, o: { oznacit: boolean }) => ({
  prazdna: false,
  xml: "<dataPack/>",
  oznacit: o.oznacit,
  faktur: 1,
  dokladov: 0,
  pokladnicnych: 0,
  zakaznikov: 0,
  zasob: 0,
  zakaziek: 0,
  pohybov: 0,
  storien: 0,
  jobId: null,
}));
vi.mock("@/lib/faktero/pohoda-konektor.server", () => ({ zostavDavku }));

let MODE: "test" | "live" = "test";
vi.mock("@/integrations/supabase/client.server", () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    insert: async () => ({ error: null }),
    update: () => q,
    maybeSingle: async () => ({
      data: { id: "k1", company_id: "f1", mode: MODE, revoked_at: null, expires_at: null, ucet_user_id: null, firmy: null },
    }),
    then: (ok: any) => Promise.resolve({ data: [], error: null }).then(ok),
  };
  return { supabaseAdmin: { from: () => q } };
});
vi.mock("@/integrations/supabase/admin-zdroj.server", () => ({ adminPreApiKluc: () => ({}) }));

const ziadost = (cesta: string, method = "GET") =>
  new Request(`https://www.faktero.sk${cesta}`, {
    method,
    headers: { authorization: "Bearer fk_test_x", "content-type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });

describe("testovací kľúč nezapisuje", () => {
  it("handleApi: POST/PUT/DELETE → 403 test_key_read_only, handler sa nespustí", async () => {
    MODE = "test";
    const { handleApi } = await import("./api-auth.server");
    const fn = vi.fn(async () => ({ status: 200, body: {} }));
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await handleApi(ziadost("/api/v1/invoices/x/cancel", m), fn);
      expect(r.status, m).toBe(403);
      expect((await r.json()).error.code).toBe("test_key_read_only");
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it("Pohoda dávka: test kľúč bez náhľadu 403, s náhľadom len náhľad", async () => {
    MODE = "test";
    zostavDavku.mockClear();
    const { Route } = await import("@/routes/api/v1/pohoda/davka");
    const GET = (Route.options as any).server.handlers.GET;
    const r = await GET({ request: ziadost("/api/v1/pohoda/davka") });
    expect(r.status).toBe(403);
    expect(zostavDavku).not.toHaveBeenCalled();
    const n = await GET({ request: ziadost("/api/v1/pohoda/davka?nahlad=1") });
    expect(n.status).toBe(200);
    expect(zostavDavku.mock.calls[0]?.[1]).toMatchObject({ oznacit: false });
  });

  it("Pohoda dávka: live kľúč označí", async () => {
    MODE = "live";
    zostavDavku.mockClear();
    const { Route } = await import("@/routes/api/v1/pohoda/davka");
    const GET = (Route.options as any).server.handlers.GET;
    const r = await GET({ request: ziadost("/api/v1/pohoda/davka") });
    expect(r.status).toBe(200);
    expect(zostavDavku.mock.calls[0]?.[1]).toMatchObject({ oznacit: true });
  });
});
