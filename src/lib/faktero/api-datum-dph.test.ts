import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/integrations/supabase/admin-zdroj.server", () => ({ adminPreApiKluc: () => ({}) }));
vi.mock("./api-auth.server", async (orig) => ({ ...(await orig<any>()), overApiKluc: async () => null }));

describe("API — dátum daňovej povinnosti prijatej faktúry", () => {
  it("bez datum_dph: DUZP, bez neho vystavenie, dobropis prijatie", async () => {
    const { datumDphNovejPrijatej } = await import("./api-zapis.server");
    expect(
      datumDphNovejPrijatej({ issue_date: "2026-11-02", delivery_date: "2026-10-31", amount_total: 10 }),
    ).toBe("2026-10-31");
    expect(datumDphNovejPrijatej({ issue_date: "2026-11-02", delivery_date: null, amount_total: 10 })).toBe(
      "2026-11-02",
    );
    expect(
      datumDphNovejPrijatej({
        issue_date: "2026-11-02",
        delivery_date: "2026-10-31",
        received_date: "2026-11-05",
        amount_total: -10,
      }),
    ).toBe("2026-11-05");
  });

  it("zadaný datum_dph má prednosť", async () => {
    const { datumDphNovejPrijatej } = await import("./api-zapis.server");
    expect(
      datumDphNovejPrijatej({ issue_date: "2026-11-02", delivery_date: "2026-11-02", datum_dph: "2026-10-31" }),
    ).toBe("2026-10-31");
  });

  it("úprava DUZP posunie datum_dph len vtedy, keď zodpovedal predvolenému dňu", async () => {
    const { datumDphPoUpravePrijatej } = await import("./api-zapis.server");
    const stary = { issue_date: "2026-11-02", delivery_date: "2026-11-02", datum_dph: "2026-11-02", amount_total: 10 };
    expect(datumDphPoUpravePrijatej(stary, { delivery_date: "2026-10-31" })).toBe("2026-10-31");
    // Ručne zadaný iný dátum ostane.
    expect(datumDphPoUpravePrijatej({ ...stary, datum_dph: "2026-12-01" }, { delivery_date: "2026-10-31" })).toBe(
      undefined,
    );
    // Prázdny (starý doklad — doterajšie pravidlo) ostane prázdny.
    expect(datumDphPoUpravePrijatej({ ...stary, datum_dph: null }, { delivery_date: "2026-10-31" })).toBe(undefined);
    // Zmena, ktorá DUZP nemení, nič neposúva.
    expect(datumDphPoUpravePrijatej(stary, { note: "x" })).toBe(undefined);
  });
});

describe("MCP — datum_dph", () => {
  const zavolaj = async (name: string, args: any, volaj: any) => {
    const { spracujSpravu } = await import("./mcp.server");
    return spracujSpravu(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      volaj,
    ) as Promise<any>;
  };

  it("zakladanie faktúr má voliteľný datum_dph", async () => {
    const { NASTROJE } = await import("./mcp.server");
    const zoznam: any[] = NASTROJE;
    for (const n of ["create_invoice", "create_purchase_invoice"]) {
      const t = zoznam.find((x) => x.name === n);
      expect(t.inputSchema.properties.datum_dph.description).toContain("Dátum daňovej povinnosti");
      expect(t.inputSchema.required ?? []).not.toContain("datum_dph");
    }
  });

  it("bloček datum_dph nemá — chyba bez volania API", async () => {
    const volaj = vi.fn();
    const r = await zavolaj("set_document_accounting", { document_type: "receipt", id: "r1", datum_dph: "2026-10-31" }, volaj);
    expect(r.result.isError).toBe(true);
    expect(volaj).not.toHaveBeenCalled();
  });

  it("set_document_accounting pošle datum_dph (prázdny = null)", async () => {
    const volaj = vi.fn(async () => ({ status: 200, json: { id: "i1", datum_dph: null } }));
    await zavolaj("set_document_accounting", { document_type: "purchase_invoice", id: "p1", datum_dph: "" }, volaj);
    expect((volaj.mock.calls[0] as any[]).slice(0, 3)).toEqual([
      "PUT",
      "/api/v1/purchase-invoices/p1",
      { datum_dph: null },
    ]);
  });
});
