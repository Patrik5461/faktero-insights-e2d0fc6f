import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/integrations/supabase/admin-zdroj.server", () => ({ adminPreApiKluc: () => ({}) }));

type Riadok = Record<string, any>;

/** Klient nad poľami v pamäti — len výber (eq/is/in/order/range). */
function klient(tabulky: Record<string, Riadok[]>) {
  const vlozene: Riadok[] = [];
  const from = (meno: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    const vysledok = () => (tabulky[meno] ?? []).filter((r) => filtre.every((f) => f(r)));
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (filtre.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) === v), b),
      in: (k: string, v: unknown[]) => (filtre.push((r) => v.includes(r[k])), b),
      order: () => b,
      limit: () => b,
      range: () => b,
      insert: (d: Riadok) => (vlozene.push(d), b),
      maybeSingle: async () => ({ data: vysledok()[0] ?? null, error: null }),
      single: async () => ({ data: { id: "nova" }, error: null }),
      then: (ok: (x: any) => unknown, zle?: (e: unknown) => unknown) =>
        Promise.resolve({ data: vysledok(), error: null }).then(ok, zle),
    };
    return b;
  };
  return { from, vlozene };
}

const FIRMA = "aaaaaaaa-0000-0000-0000-000000000001";
const EXIST = "cccccccc-0000-0000-0000-000000000001";
const povodna = {
  id: EXIST,
  company_id: FIRMA,
  invoice_number: "1126817",
  type: "regular",
  status: "paid",
  supplier_ico: "47699167",
  supplier_name: "MOKOŠÁK PLUS s.r.o.",
  amount_total: 78.3,
  currency: "EUR",
  issue_date: "2026-10-15",
  deleted_at: null,
  zauctovane_at: "2026-10-27T22:17:24Z",
  exported_at: "2026-10-27T22:17:24Z",
};
const ctx = (sb: any, body: any) =>
  ({ supabase: sb, company_id: FIRMA, requestBody: body, ucet: false, mode: "live" }) as any;

describe("API zápis prijatej faktúry — duplicita", () => {
  it("tá istá faktúra (číslo + IČO + suma + rok) vráti 409 duplicate_document s id existujúcej", async () => {
    const { zalozPrijatu } = await import("./api-zapis.server");
    const sb = klient({ purchase_invoices: [povodna] });
    const r = await zalozPrijatu(
      ctx(sb, {
        invoice_number: "01126817",
        supplier: { name: "Mokošák plus", ico: "47 699 167" },
        issue_date: "2026-10-15",
        amount_total: 78.3,
      }),
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("duplicate_document");
    expect(r.body.error.details.existing_id).toBe(EXIST);
    expect(r.body.error.message).toContain("Táto faktúra už je v evidencii: 1126817");
    expect(sb.vlozene).toHaveLength(0);
  });

  it("chyba spúšťača v databáze sa premapuje na 409 duplicate_document", async () => {
    const { chybaZapisuDokladu } = await import("./api-zapis.server");
    const r = chybaZapisuDokladu({
      code: "P0001",
      message: `Táto faktúra už je v evidencii: 1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR [${EXIST}]`,
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "duplicate_document", details: { existing_id: EXIST } });
    const b = chybaZapisuDokladu({ message: `Tento bloček už je uložený: Shell, 20. 9. 2026, 70.00 EUR [${EXIST}]` });
    expect(b.body.error.code).toBe("duplicate_document");
    expect(chybaZapisuDokladu({ message: "iná chyba" }).status).toBe(500);
  });
});
