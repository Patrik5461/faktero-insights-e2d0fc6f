import { describe, expect, it, vi } from "vitest";

const volania: string[][] = [];
vi.mock("@/integrations/supabase/client", () => {
  const dotaz = () => {
    let ids: string[] = [];
    const q: any = {
      update: () => q,
      in: (_s: string, v: string[]) => ((ids = v), volania.push(v), q),
      eq: () => q,
      select: async () => ({ data: ids.map((id) => ({ id })), error: null }),
    };
    return q;
  };
  return { supabase: { from: dotaz } };
});

import { DAVKA_ID, poDavkach } from "./po-davkach";
import { obnovZKosa } from "./obnova-z-kosa";

const idcka = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("hromadný zápis po dávkach", () => {
  it("700 id → dávky 300/300/100 v pôvodnom poradí", async () => {
    const davky: number[] = [];
    const vsetky: string[] = [];
    await poDavkach(idcka(700), async (d) => {
      davky.push(d.length);
      vsetky.push(...d);
    });
    expect(DAVKA_ID).toBe(300);
    expect(davky).toEqual([300, 300, 100]);
    expect(vsetky).toEqual(idcka(700));
  });

  it("chyba dávky zastaví ďalšie", async () => {
    const fn = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(poDavkach(idcka(650), fn)).rejects.toThrow("x");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("obnova z koša nad 650 dokladmi ide po 300", async () => {
    volania.length = 0;
    await obnovZKosa("invoices", idcka(650), "firma");
    expect(volania.map((v) => v.length)).toEqual([300, 300, 50]);
  });
});
