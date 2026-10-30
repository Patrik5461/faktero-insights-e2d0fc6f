import { describe, expect, it, vi } from "vitest";

/* Neplatné id z adresy / tela: 404 alebo 400 namiesto 500 db_error. */
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const dbChyba = (hodnota: string) => ({
  status: 500,
  body: {
    error: { code: "db_error", message: `invalid input syntax for type uuid: "${hodnota}"` },
  },
});

describe("chybaNeplatnehoId", () => {
  it("id z adresy → 404 not_found", async () => {
    const { chybaNeplatnehoId } = await import("./api-auth.server");
    expect(chybaNeplatnehoId(dbChyba("nie-uuid"), "/api/v1/invoices/nie-uuid/pdf")).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Záznam s týmto id neexistuje." } },
    });
  });

  it("id z tela → 400 validation_error", async () => {
    const { chybaNeplatnehoId } = await import("./api-auth.server");
    const r = chybaNeplatnehoId(dbChyba("abc"), "/api/v1/invoices");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation_error");
  });

  it("ostatné odpovede nechá tak", async () => {
    const { chybaNeplatnehoId } = await import("./api-auth.server");
    const ina = { status: 500, body: { error: { code: "db_error", message: "timeout" } } };
    expect(chybaNeplatnehoId(ina, "/api/v1/invoices/x")).toBe(ina);
    const okOdpoved = { status: 200, body: { data: [] } };
    expect(chybaNeplatnehoId(okOdpoved, "/api/v1/invoices")).toBe(okOdpoved);
  });
});
