import { beforeEach, describe, expect, it, vi } from "vitest";

const stav = vi.hoisted(() => ({
  uid: "u1" as string | null,
  riadok: { role: "custom", permissions: { faktury: "edit" } } as any,
  chyba: null as any,
  volania: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const dotaz: any = {
    select: () => dotaz,
    eq: (k: string, v: string) => {
      stav.volania.push([k, v]);
      return dotaz;
    },
    maybeSingle: async () => ({ data: stav.riadok, error: stav.chyba }),
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: stav.uid ? { user: { id: stav.uid } } : null } }) },
      from: () => dotaz,
    },
  };
});

import { nacitajClenstvo, zabudniClenstvo } from "./use-opravnenia";

beforeEach(() => {
  zabudniClenstvo();
  stav.uid = "u1";
  stav.riadok = { role: "custom", permissions: { faktury: "edit" } };
  stav.chyba = null;
  stav.volania = [];
});

describe("nacitajClenstvo", () => {
  it("číta vlastný riadok (firma + user_id) a pamätá si ho", async () => {
    expect(await nacitajClenstvo("f1")).toEqual({ rola: "custom", opravnenia: { faktury: "edit" } });
    expect(stav.volania).toEqual([
      ["company_id", "f1"],
      ["user_id", "u1"],
    ]);
    stav.riadok = { role: "owner", permissions: {} };
    expect((await nacitajClenstvo("f1")).rola).toBe("custom");
    zabudniClenstvo("f1");
    expect((await nacitajClenstvo("f1")).rola).toBe("owner");
  });
  it("neprihlásený alebo nečlen → rola null", async () => {
    stav.uid = null;
    expect(await nacitajClenstvo("f2")).toEqual({ rola: null, opravnenia: {} });
    zabudniClenstvo();
    stav.uid = "u1";
    stav.riadok = null;
    expect(await nacitajClenstvo("f2")).toEqual({ rola: null, opravnenia: {} });
  });
  it("chyba sa nepamätá", async () => {
    stav.chyba = { message: "x" };
    await expect(nacitajClenstvo("f3")).rejects.toBeTruthy();
    stav.chyba = null;
    expect((await nacitajClenstvo("f3")).rola).toBe("custom");
  });
});
