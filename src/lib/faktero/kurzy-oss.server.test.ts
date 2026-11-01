import { describe, expect, it, vi, beforeEach } from "vitest";

/*
  Kurz ECB pre OSS (čl. 366 smernice 2006/112/ES): zverejnený v posledný deň
  štvrťroka, inak v najbližší nasledujúci deň zverejnenia; kým nevyšiel,
  predbežne posledný známy. Pamäť `exchange_rates` nahrádza pole riadkov.
*/
let riadky: { den: string; mena: string; kurz: number }[] = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const dotaz = () => {
    const f: { mena?: string; gte?: string; lte?: string; asc?: boolean } = {};
    const q: any = {
      select: () => q,
      eq: (_s: string, v: string) => ((f.mena = v), q),
      gte: (_s: string, v: string) => ((f.gte = v), q),
      lte: (_s: string, v: string) => ((f.lte = v), q),
      order: (_s: string, o: { ascending: boolean }) => ((f.asc = o.ascending), q),
      limit: () => q,
      upsert: () => Promise.resolve({ error: null }),
      then: (ok: any, zle: any) => {
        const data = riadky
          .filter(
            (r) => r.mena === f.mena && (!f.gte || r.den >= f.gte) && (!f.lte || r.den <= f.lte),
          )
          .sort((a, b) => (a.den < b.den ? -1 : 1) * (f.asc ? 1 : -1));
        return Promise.resolve({ data, error: null }).then(ok, zle);
      },
    };
    return q;
  };
  return { supabaseAdmin: { from: () => dotaz() } };
});

vi.mock("@/lib/faktero/datum-vystavenia", () => ({ dnesBratislava: () => "2026-11-01" }));

describe("kurzEcbOss", () => {
  beforeEach(() => {
    riadky = [
      { den: "2026-06-29", mena: "USD", kurz: 1.1 },
      { den: "2026-06-30", mena: "USD", kurz: 1.12 },
      { den: "2026-07-01", mena: "USD", kurz: 1.13 },
      { den: "2026-10-30", mena: "USD", kurz: 1.2 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECB sa v teste nevolá"))),
    );
  });

  it("kurz zverejnený v posledný deň štvrťroka", async () => {
    const { kurzEcbOss } = await import("./kurzy.server");
    expect(await kurzEcbOss("USD", "2026-06-30")).toEqual({
      kurz: 1.12,
      den: "2026-06-30",
      predbezne: false,
    });
  });

  it("deň bez zverejnenia → najbližší nasledujúci", async () => {
    riadky = riadky.filter((r) => r.den !== "2026-06-30");
    const { kurzEcbOss } = await import("./kurzy.server");
    expect(await kurzEcbOss("usd", "2026-06-30")).toEqual({
      kurz: 1.13,
      den: "2026-07-01",
      predbezne: false,
    });
  });

  it("štvrťrok ešte neskončil → predbežne posledný zverejnený", async () => {
    const { kurzEcbOss } = await import("./kurzy.server");
    expect(await kurzEcbOss("USD", "2026-12-31")).toEqual({
      kurz: 1.2,
      den: "2026-10-30",
      predbezne: true,
    });
  });

  it("euro kurz nemá", async () => {
    const { kurzEcbOss } = await import("./kurzy.server");
    expect(await kurzEcbOss("EUR", "2026-06-30")).toBeNull();
  });
});
