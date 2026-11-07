import { describe, expect, it, vi } from "vitest";
import { zvysVerziuPohody } from "./pohoda-odoslane-xml.server";

describe("zvýšenie verzie pre Pohodu", () => {
  it("jedným volaním funkcie v databáze (atomicky)", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    const from = vi.fn();
    await zvysVerziuPohody({ rpc, from }, "purchase_invoices", ["a", "b"]);
    expect(rpc).toHaveBeenCalledWith("zvys_pohoda_verziu", {
      _tabulka: "purchase_invoices",
      _ids: ["a", "b"],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("bez migrácie v databáze ostane postup po riadkoch", async () => {
    const zapisy: any[] = [];
    const sb = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
      from: () => {
        const q: any = {
          select: () => q,
          in: async () => ({ data: [{ id: "a", pohoda_verzia: 3 }], error: null }),
          update: (v: any) => ((q.v = v), q),
          eq: async (_k: string, id: string) => (zapisy.push({ id, ...q.v }), { error: null }),
        };
        return q;
      },
    };
    await zvysVerziuPohody(sb, "cash_entries", ["a"]);
    expect(zapisy).toEqual([{ id: "a", pohoda_verzia: 4 }]);
  });

  it("iná chyba databázy sa nezamlčí", async () => {
    const sb = { rpc: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }), from: vi.fn() };
    await expect(zvysVerziuPohody(sb, "invoices", ["a"])).rejects.toThrow(/nezvýšila/);
  });

  it("prázdny zoznam nič nevolá", async () => {
    const rpc = vi.fn();
    await zvysVerziuPohody({ rpc }, "invoices", []);
    expect(rpc).not.toHaveBeenCalled();
  });
});
