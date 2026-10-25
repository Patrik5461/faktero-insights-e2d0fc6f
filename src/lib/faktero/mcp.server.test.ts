import { describe, expect, it, vi } from "vitest";
vi.mock("./api-auth.server", () => ({ overApiKluc: async () => null }));
import { NASTROJE, spracujSpravu } from "./mcp.server";

const volajZ = (odpovede: Record<string, any>) =>
  vi.fn(async (_m: string, cesta: string) => ({
    status: 200,
    json: odpovede[cesta.split("?")[0]] ?? {},
  }));

describe("MCP server", () => {
  it("initialize vráti podporovanú verziu a nástroje", async () => {
    const r: any = await spracujSpravu(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      volajZ({}),
    );
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities.tools).toBeTruthy();
    const l: any = await spracujSpravu({ jsonrpc: "2.0", id: 2, method: "tools/list" }, volajZ({}));
    expect(l.result.tools.map((t: any) => t.name)).toContain("list_overdue_invoices");
    // Zapisujúce nástroje nie sú označené ako len na čítanie, žiadny nič nemaže.
    expect(
      NASTROJE.filter((t) => !t.annotations.readOnlyHint)
        .map((t) => t.name)
        .sort(),
    ).toEqual(["create_customer", "create_invoice", "mark_invoice_paid"]);
    expect(NASTROJE.some((t) => t.annotations.destructiveHint)).toBe(false);
  });
  it("notifikácia nemá odpoveď, neznáma metóda je chyba", async () => {
    expect(
      await spracujSpravu({ jsonrpc: "2.0", method: "notifications/initialized" }, volajZ({})),
    ).toBeNull();
    const r: any = await spracujSpravu(
      { jsonrpc: "2.0", id: 3, method: "resources/list" },
      volajZ({}),
    );
    expect(r.error.code).toBe(-32601);
  });
  it("faktúry po splatnosti: len neuhradené po dátume splatnosti, súčet podľa meny", async () => {
    const volaj = vi.fn(async (_m: string, cesta: string) => ({
      status: 200,
      json: {
        data: cesta.includes("status=issued")
          ? [
              {
                id: "a",
                invoice_number: "1",
                type: "regular",
                due_date: "2020-01-01",
                paid_at: null,
                total: "100",
                currency: "EUR",
              },
              {
                id: "b",
                invoice_number: "2",
                type: "regular",
                due_date: "2999-01-01",
                paid_at: null,
                total: "50",
                currency: "EUR",
              },
            ]
          : [
              {
                id: "c",
                invoice_number: "3",
                type: "proforma",
                due_date: "2020-01-01",
                paid_at: null,
                total: "9",
                currency: "EUR",
              },
            ],
      },
    }));
    const r: any = await spracujSpravu(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_overdue_invoices", arguments: {} },
      },
      volaj,
    );
    expect(r.result.structuredContent.pocet).toBe(1);
    expect(r.result.structuredContent.spolu_podla_meny).toEqual({ EUR: 100 });
  });
  it("chyba API ide do výsledku ako isError, nie ako výnimka", async () => {
    const volaj = vi.fn(async () => ({
      status: 409,
      json: { error: { code: "invalid_state", message: "Faktúra je už uhradená." } },
    }));
    const r: any = await spracujSpravu(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "mark_invoice_paid", arguments: { id: "x" } },
      },
      volaj,
    );
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("už uhradená");
  });
});
