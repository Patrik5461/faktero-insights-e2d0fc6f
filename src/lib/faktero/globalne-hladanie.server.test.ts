import { describe, expect, it } from "vitest";
import { hladajGlobalne } from "./globalne-hladanie.server";

/** Klient Supabase, ktorý si zapíše reťaz volaní každého dotazu. */
function falosnyKlient(clen: { role: string; permissions?: unknown } | null, riadky: Record<string, any[]> = {}) {
  const dotazy: { tabulka: string; volania: [string, unknown[]][] }[] = [];
  const sb = {
    from(tabulka: string) {
      const z = { tabulka, volania: [] as [string, unknown[]][] };
      dotazy.push(z);
      const b: any = new Proxy(
        {},
        {
          get(_t, kluc: string) {
            if (kluc === "then") {
              const data = tabulka === "company_users" ? clen : (riadky[tabulka] ?? []);
              return (ok: (v: unknown) => void) =>
                ok({ data, error: null, count: Array.isArray(data) ? data.length + 10 : null });
            }
            if (kluc === "maybeSingle") return () => b;
            return (...args: unknown[]) => {
              z.volania.push([kluc, args]);
              return b;
            };
          },
        },
      );
      return b;
    },
  };
  return { sb, dotazy };
}

const P = { companyId: "c1", userId: "u1", dnes: "2026-11-20" };

describe("hladajGlobalne", () => {
  it("nečlen dostane chybu", async () => {
    const { sb } = falosnyKlient(null);
    await expect(hladajGlobalne(sb, { ...P, dotaz: "novak" })).rejects.toThrow(/prístup/);
  });

  it("custom len s bankou sa pýta len na pohyby", async () => {
    const { sb, dotazy } = falosnyKlient({ role: "custom", permissions: { banka: "read" } });
    const r = await hladajGlobalne(sb, { ...P, dotaz: "novak" });
    expect(r.prehladane).toEqual(["banka"]);
    expect(dotazy.map((d) => d.tabulka)).toEqual(["company_users", "bank_transactions"]);
  });

  it("tvar dotazu: firma, kôš, or, poradie, limit, presný počet", async () => {
    const { sb, dotazy } = falosnyKlient({ role: "owner" }, {
      invoices: [{ id: "i1", invoice_number: "QA2-0001", customer_name: "Novák", total: 10 }],
    });
    const r = await hladajGlobalne(sb, { ...P, dotaz: "novak" });
    const inv = dotazy.find((d) => d.tabulka === "invoices")!;
    const mena = inv.volania.map((v) => v[0]);
    expect(mena).toEqual(["select", "eq", "is", "or", "order", "order", "limit"]);
    expect(inv.volania[0][1][1]).toEqual({ count: "exact" });
    expect(inv.volania[1][1]).toEqual(["company_id", "c1"]);
    expect(inv.volania[2][1]).toEqual(["deleted_at", null]);
    expect(String(inv.volania[3][1][0])).toContain("customer_name.imatch.");
    expect(inv.volania[6][1]).toEqual([12]);
    // Bločky nemajú kôš.
    const exp = dotazy.find((d) => d.tabulka === "expense_documents")!;
    expect(exp.volania.map((v) => v[0])).not.toContain("is");
    const g = r.skupiny.find((x) => x.skupina === "vystavene")!;
    expect(g.pocet).toBe(11);
    expect(g.polozky[0].cislo).toBe("QA2-0001");
  });

  it("krátky dotaz sa do databázy nepýta", async () => {
    const { sb, dotazy } = falosnyKlient({ role: "owner" });
    const r = await hladajGlobalne(sb, { ...P, dotaz: "a" });
    expect(r.skupiny).toEqual([]);
    expect(dotazy.map((d) => d.tabulka)).toEqual(["company_users"]);
  });

  it("čistá suma sa nepýta na zákazky ani kontakty", async () => {
    const { sb, dotazy } = falosnyKlient({ role: "owner" });
    await hladajGlobalne(sb, { ...P, dotaz: "123,45" });
    const t = dotazy.map((d) => d.tabulka);
    expect(t).not.toContain("jobs");
    expect(t).not.toContain("customers");
    expect(t).toContain("bank_transactions");
  });
});
