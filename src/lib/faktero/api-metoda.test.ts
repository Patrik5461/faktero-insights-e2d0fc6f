import { describe, expect, it } from "vitest";
import { metodaApiNaJson } from "./api-metoda";

const tanstack406 = () =>
  new Response(JSON.stringify({ error: "Only HTML requests are supported here" }), {
    status: 406,
    headers: { "content-type": "application/json" },
  });

describe("metodaApiNaJson", () => {
  it("406 z TanStacku pod /api/v1 → 405 method_not_allowed", async () => {
    const r = await metodaApiNaJson(
      new Request("https://www.faktero.sk/api/v1/invoices/x", { method: "DELETE" }),
      tanstack406(),
    );
    expect(r.status).toBe(405);
    expect((await r.json()).error.code).toBe("method_not_allowed");
  });

  it("mimo API a iné odpovede nechá tak", async () => {
    const mimo = tanstack406();
    expect(
      await metodaApiNaJson(new Request("https://www.faktero.sk/faktury", { method: "PUT" }), mimo),
    ).toBe(mimo);
    const ok = new Response("{}", { status: 200 });
    expect(await metodaApiNaJson(new Request("https://www.faktero.sk/api/v1/invoices"), ok)).toBe(
      ok,
    );
  });
});
