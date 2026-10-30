import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Presun cudzej faktúry s kontrolou práv. Supabase je falošný: zaznamenáva
  zápisy, aby sa dalo overiť, že bez prístupu sa nič nezapíše.
*/

const pristup = vi.hoisted(() => ({ firmy: new Set<string>() }));
const zapisyAdmina = vi.hoisted(() => [] as string[]);

vi.mock("./over-pristup", () => ({
  overPristup: async (_ctx: unknown, companyId: string) => {
    if (!pristup.firmy.has(companyId)) throw new Error("K tejto firme nemáte prístup.");
    return "owner";
  },
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const q: any = new Proxy(
    {},
    {
      get: (_t, k) => (k === "then" ? undefined : (..._a: unknown[]) => q),
    },
  );
  return {
    supabaseAdmin: {
      from: (t: string) => {
        zapisyAdmina.push(t);
        return q;
      },
    },
  };
});

const NESEDI = {
  dovod: "ico",
  odberatel: { nazov: "Beta a.s.", ico: "87654321", dic: null, ic_dph: null },
  firma: { nazov: "Alfa s.r.o." },
};

function klient(opts: { sPravom: string[]; riadok?: Record<string, unknown> }) {
  const zapisy: { tabulka: string; zmena: unknown }[] = [];
  const firmy = [
    { id: "zdroj", name: "Alfa s.r.o.", ico: "12345678", dic: null, ic_dph: null },
    { id: "beta", name: "Beta a.s.", ico: "87654321", dic: null, ic_dph: null },
    { id: "ina", name: "Iná s.r.o.", ico: "55555555", dic: null, ic_dph: null },
  ];
  const riadok = {
    id: "p1",
    company_id: "zdroj",
    file_path: null,
    exported_at: null,
    deleted_at: null,
    samofakturacia: false,
    locked_at: null,
    note: null,
    odberatel_nesedi: NESEDI,
    ...opts.riadok,
  };
  const dotaz = (tabulka: string) => {
    let zmena: unknown = null;
    let ids: string[] | null = null;
    const q: any = {
      select: () => q,
      eq: () => q,
      in: (_k: string, v: string[]) => {
        ids = v;
        return q;
      },
      update: (z: unknown) => {
        zmena = z;
        zapisy.push({ tabulka, zmena: z });
        return q;
      },
      maybeSingle: async () => ({ data: tabulka === "purchase_invoices" ? riadok : null }),
      then: (res: (v: unknown) => unknown) =>
        res(
          zmena
            ? { error: null }
            : tabulka === "companies"
              ? { data: firmy.filter((f) => !ids || ids.includes(f.id)) }
              : { data: [] },
        ),
    };
    return q;
  };
  return {
    zapisy,
    supabase: {
      from: dotaz,
      rpc: async () => ({ data: opts.sPravom }),
      storage: {
        from: () => ({ download: async () => ({ data: null }), remove: async () => ({}) }),
      },
    },
  };
}

describe("presunPrijatu — kontrola práv", () => {
  beforeEach(() => {
    pristup.firmy = new Set();
    zapisyAdmina.length = 0;
  });

  it("bez prístupu k cieľovej firme sa nič nezapíše", async () => {
    pristup.firmy = new Set(["zdroj"]);
    const k = klient({ sPravom: ["zdroj"] });
    const { presunPrijatu } = await import("./cudzia-faktura.server");
    await expect(
      presunPrijatu({ supabase: k.supabase, userId: "u" }, { id: "p1", cielovaFirmaId: "beta" }),
    ).rejects.toThrow(/nemáte prístup/);
    expect(k.zapisy).toEqual([]);
    expect(zapisyAdmina).toEqual([]);
  });

  it("do firmy, ktorá nesedí na odberateľa, sa nepresúva ani s prístupom", async () => {
    pristup.firmy = new Set(["zdroj", "ina"]);
    const k = klient({ sPravom: ["zdroj", "ina"] });
    const { presunPrijatu } = await import("./cudzia-faktura.server");
    await expect(
      presunPrijatu({ supabase: k.supabase, userId: "u" }, { id: "p1", cielovaFirmaId: "ina" }),
    ).rejects.toThrow(/odberateľ na doklade je iný/);
    expect(k.zapisy).toEqual([]);
  });

  it("odovzdanú faktúru nepresunie", async () => {
    pristup.firmy = new Set(["zdroj", "beta"]);
    const k = klient({ sPravom: ["zdroj", "beta"], riadok: { exported_at: "2026-10-01" } });
    const { presunPrijatu } = await import("./cudzia-faktura.server");
    await expect(
      presunPrijatu({ supabase: k.supabase, userId: "u" }, { id: "p1", cielovaFirmaId: "beta" }),
    ).rejects.toThrow(/odovzdaná/);
    expect(k.zapisy).toEqual([]);
  });

  it("s prístupom k obom firmám presunie a väzby zdrojovej firmy vyprázdni", async () => {
    pristup.firmy = new Set(["zdroj", "beta"]);
    const k = klient({ sPravom: ["zdroj", "beta"] });
    const { presunPrijatu } = await import("./cudzia-faktura.server");
    const r = await presunPrijatu(
      { supabase: k.supabase, userId: "u" },
      { id: "p1", cielovaFirmaId: "beta" },
    );
    expect(r).toEqual({ id: "p1", companyId: "beta" });
    const presun = k.zapisy.find((z) => z.tabulka === "purchase_invoices")!.zmena as Record<
      string,
      unknown
    >;
    expect(presun).toMatchObject({
      company_id: "beta",
      odberatel_nesedi: null,
      pravidlo_id: null,
      pohoda_predkontacia: null,
      zauctovane_at: null,
      stitky: null,
      status: "received",
    });
    expect(zapisyAdmina).toEqual(
      expect.arrayContaining(["bank_transactions", "purchase_invoice_payments", "schvalovanie"]),
    );
  });

  it("ponuka firiem nevráti firmu bez práva zapisovať doklady", async () => {
    const k = klient({ sPravom: ["zdroj"] });
    const { cieleNaPresunPreUzivatela } = await import("./cudzia-faktura.server");
    expect(
      await cieleNaPresunPreUzivatela(
        { supabase: k.supabase, userId: "u" },
        NESEDI as any,
        "zdroj",
      ),
    ).toEqual([]);
    const k2 = klient({ sPravom: ["zdroj", "beta"] });
    expect(
      await cieleNaPresunPreUzivatela(
        { supabase: k2.supabase, userId: "u" },
        NESEDI as any,
        "zdroj",
      ),
    ).toEqual([{ id: "beta", nazov: "Beta a.s." }]);
  });
});
