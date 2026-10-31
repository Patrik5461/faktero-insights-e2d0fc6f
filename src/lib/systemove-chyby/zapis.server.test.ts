import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: [{ id: "x", nova: true, upozornit: false }], error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

import {
  pouzivatelZHlaviciek,
  pripravRiadok,
  urovenChybyFunkcie,
  zaznamenajChybu,
  zdrojPodlaCesty,
} from "./zapis.server";

describe("pripravRiadok", () => {
  it("vyčistí správu, stack, trasu a odmietne neplatné uuid", () => {
    const e = new Error(
      "Prihlásenie pre jan@firma.sk s tokenom eyJabcdefgh.eyJabcdefgh.abcdefghij zlyhalo",
    );
    const r = pripravRiadok({
      zdroj: "server",
      chyba: e,
      trasa: "/api/x?apikey=tajne",
      metoda: "post",
      companyId: "nie-je-uuid",
      userId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    });
    expect(r.sprava).not.toContain("jan@firma.sk");
    expect(r.sprava).not.toContain("eyJ");
    expect(r.trasa).toBe("/api/x");
    expect(r.metoda).toBe("POST");
    expect(r.company_id).toBeNull();
    expect(r.user_id).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(r.odtlacok).toMatch(/^[0-9a-f]{28}$/);
  });
});

describe("urovenChybyFunkcie", () => {
  it("presmerovanie, neprihlásený a 4xx nezapisuje", () => {
    expect(urovenChybyFunkcie(new Response(null, { status: 302 }))).toBeNull();
    expect(urovenChybyFunkcie({ isNotFound: true })).toBeNull();
    expect(urovenChybyFunkcie(Object.assign(new Error("x"), { statusCode: 403 }))).toBeNull();
    expect(
      urovenChybyFunkcie(new Error("Unauthorized: No authorization header provided")),
    ).toBeNull();
  });

  it("programové chyby a databáza sú chyba, hláška pre používateľa varovanie", () => {
    expect(urovenChybyFunkcie(new TypeError("x is undefined"))).toBe("chyba");
    expect(urovenChybyFunkcie(new Error("permission denied for table invoices"))).toBe("chyba");
    expect(urovenChybyFunkcie(new Error("Faktúra je uzamknutá."))).toBe("varovanie");
    expect(urovenChybyFunkcie(Object.assign(new Error("[]"), { name: "ZodError" }))).toBe(
      "varovanie",
    );
  });
});

describe("pouzivatelZHlaviciek", () => {
  it("vyberie sub z tokenu, inak null", () => {
    const telo = Buffer.from(
      JSON.stringify({ sub: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" }),
    ).toString("base64url");
    const h = new Headers({ authorization: `Bearer eyJhbGciOiJIUzI1NiJ9.${telo}.podpis` });
    expect(pouzivatelZHlaviciek(h)).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(pouzivatelZHlaviciek(new Headers())).toBeNull();
    expect(pouzivatelZHlaviciek(new Headers({ authorization: "Bearer zle" }))).toBeNull();
  });
});

describe("zaznamenajChybu", () => {
  it("nehodí ani pri nezmysle a zapisuje až po odpovedi, zlúčené", async () => {
    rpc.mockClear();
    expect(() =>
      zaznamenajChybu({ zdroj: "server", chyba: { toString: null } as any }),
    ).not.toThrow();
    expect(zaznamenajChybu({ zdroj: "hook", sprava: "test zlúčenia" })).toBe(true);
    // Druhý výskyt hneď nato sa len priráta.
    expect(zaznamenajChybu({ zdroj: "hook", sprava: "test zlúčenia" })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(rpc).toHaveBeenCalled();
    const volanie = rpc.mock.calls.find((c: any[]) => c[1]?.p?.sprava === "test zlúčenia") as any;
    expect(volanie[0]).toBe("zapis_systemovu_chybu");
    expect(volanie[1].p_pocet).toBe(1);
  });

  it("zlyhanie databázy nič nezhodí", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("db dole");
    });
    expect(zaznamenajChybu({ zdroj: "server", sprava: "iná chyba" })).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
  });

  it("zdroj podľa cesty", () => {
    expect(zdrojPodlaCesty("/api/public/hooks/bank-sync")).toBe("hook");
    expect(zdrojPodlaCesty("/api/v1/invoices")).toBe("server");
  });
});
