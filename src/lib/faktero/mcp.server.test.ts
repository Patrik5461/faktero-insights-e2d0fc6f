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
    // Zapisujúce nástroje nie sú označené ako len na čítanie; maže len ručná úhrada.
    expect(
      NASTROJE.filter((t) => !t.annotations.readOnlyHint)
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "add_purchase_invoice_payment",
      "create_bank_account",
      "create_company",
      "create_customer",
      "create_invoice",
      "create_product",
      "create_purchase_invoice",
      "create_receipt",
      "delete_purchase_invoice_payment",
      "import_bank_transactions",
      "import_contacts",
      "invite_user",
      "mark_invoice_paid",
      "mark_purchase_invoice_paid",
      "resolve_bank_transaction",
      "set_document_accounting",
      "update_document_labels",
    ]);
    expect(NASTROJE.filter((t) => t.annotations.destructiveHint).map((t) => t.name)).toEqual([
      "delete_purchase_invoice_payment",
    ]);
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

describe("MCP — úhrady, značky a pohyby", () => {
  const zavolaj = (name: string, args: any, volaj: any) =>
    spracujSpravu(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } },
      volaj,
    ) as Promise<any>;

  it("úhrada sa pošle na /payments bez id v tele, mazanie cez DELETE", async () => {
    const volaj = vi.fn(async () => ({ status: 201, json: { id: "u1" } }));
    await zavolaj(
      "add_purchase_invoice_payment",
      { id: "f1", amount: 50, paid_at: "2026-10-28" },
      volaj,
    );
    expect((volaj.mock.calls[0] as any[]).slice(0, 3)).toEqual([
      "POST",
      "/api/v1/purchase-invoices/f1/payments",
      { amount: 50, paid_at: "2026-10-28" },
    ]);
    await zavolaj("delete_purchase_invoice_payment", { id: "f1", payment_id: "u1" }, volaj);
    expect((volaj.mock.calls[1] as any[]).slice(0, 2)).toEqual([
      "DELETE",
      "/api/v1/purchase-invoices/f1/payments/u1",
    ]);
  });

  it("značky idú cez PUT na správny druh dokladu, neznámy druh je chyba", async () => {
    const volaj = vi.fn(async () => ({
      status: 200,
      json: { id: "r1", stav_id: "s1", stitky: ["a"], komentar: "k" },
    }));
    const r = await zavolaj(
      "update_document_labels",
      { document_type: "receipt", id: "r1", stav: "Skontrolovať", stitky_pridat: "a" },
      volaj,
    );
    expect((volaj.mock.calls[0] as any[]).slice(0, 3)).toEqual([
      "PUT",
      "/api/v1/receipts/r1",
      { stav: "Skontrolovať", stitky_pridat: "a" },
    ]);
    expect(r.result.structuredContent.stitky).toEqual(["a"]);
    const zle = await zavolaj("update_document_labels", { document_type: "x", id: "1" }, volaj);
    expect(zle.result.isError).toBe(true);
  });

  it("zaúčtovanie posiela len accounting a účtovnú poznámku", async () => {
    const volaj = vi.fn(async () => ({ status: 200, json: { id: "i1" } }));
    await zavolaj(
      "set_document_accounting",
      { document_type: "invoice", id: "i1", accounting: { predkontacia: "1Fv" }, stitky: ["x"] },
      volaj,
    );
    expect((volaj.mock.calls[0] as any[]).slice(0, 3)).toEqual([
      "PUT",
      "/api/v1/invoices/i1",
      { accounting: { predkontacia: "1Fv" } },
    ]);
  });

  it("vybavenie pohybu: null označenie zruší", async () => {
    const volaj = vi.fn(async () => ({ status: 200, json: { id: "p1", vybavenie: null } }));
    await zavolaj("resolve_bank_transaction", { id: "p1", resolution: null }, volaj);
    expect((volaj.mock.calls[0] as any[]).slice(0, 3)).toEqual([
      "POST",
      "/api/v1/bank-transactions/p1/resolution",
      { resolution: null },
    ]);
  });

  it("stavy a štítky v jednom nástroji", async () => {
    const r = await zavolaj(
      "list_document_labels",
      {},
      volajZ({
        "/api/v1/document-states": { data: [{ id: "s1", nazov: "Skontrolovať" }] },
        "/api/v1/tags": { data: [{ id: "t1", nazov: "Auto" }] },
      }),
    );
    expect(r.result.structuredContent.stavy[0].nazov).toBe("Skontrolovať");
    expect(r.result.structuredContent.stitky[0].nazov).toBe("Auto");
  });
});

describe("MCP s kľúčom účtu (viac firiem)", () => {
  const kontext = {
    ucet: true,
    firmy: [
      { id: "f1", name: "Prvá s.r.o.", ico: "11111111" },
      { id: "f2", name: "Druhá s.r.o.", ico: "22222222" },
    ],
  };
  it("nástroje majú povinný parameter company a je tu list_companies", async () => {
    const l: any = await spracujSpravu(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      volajZ({}),
      kontext,
    );
    const nazvy = l.result.tools.map((t: any) => t.name);
    expect(nazvy[0]).toBe("list_companies");
    const faktury = l.result.tools.find((t: any) => t.name === "list_invoices");
    expect(faktury.inputSchema.properties.company).toBeTruthy();
    expect(faktury.inputSchema.required).toContain("company");
    const i: any = await spracujSpravu(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: {} },
      volajZ({}),
      kontext,
    );
    expect(i.result.instructions).toMatch(/list_companies/);
  });
  it("company sa pošle ako firma volania, nie ako vstup nástroja", async () => {
    const volaj = vi.fn(async () => ({ status: 200, json: { data: [] } }));
    await spracujSpravu(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_invoices", arguments: { company: "22222222", status: "issued" } },
      },
      volaj as any,
      kontext,
    );
    const [metoda, cesta, telo, firma] = volaj.mock.calls[0] as unknown as any[];
    expect(metoda).toBe("GET");
    expect(cesta).toContain("status=issued");
    expect(cesta).not.toContain("company");
    expect(telo).toBeUndefined();
    expect(firma).toBe("22222222");
  });
  it("kľúč firmy nástroje nemení", async () => {
    const l: any = await spracujSpravu({ jsonrpc: "2.0", id: 4, method: "tools/list" }, volajZ({}));
    const faktury = l.result.tools.find((t: any) => t.name === "list_invoices");
    expect(faktury.inputSchema.properties?.company).toBeUndefined();
  });
});
