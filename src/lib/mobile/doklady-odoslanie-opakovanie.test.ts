import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CakajuciDoklad } from "./doklady-fronta";

/*
  Výpadok uprostred odosielania: doklad sa na serveri uložil, ale odpoveď
  sa stratila. Ďalší pokus nesmie nahrať fotku znova a musí poslať to isté id.
*/
let fronta: CakajuciDoklad[] = [];
const nahrajPrilohu = vi.fn(async () => ({ path: "firma/foto.jpg", mime: "image/jpeg", size: 10 }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./offline-queue", () => ({ isOnline: async () => true }));
vi.mock("@/lib/faktero/mobil-doklad", () => ({
  nahrajPrilohu: (...a: unknown[]) => nahrajPrilohu(...(a as [])),
  dokladNaZaznam: (company_id: string, _v: unknown, _u: unknown, p: { path: string } | null) => ({
    company_id,
    source: "photo",
    file_path: p?.path ?? null,
  }),
}));
vi.mock("./doklady-fronta", () => ({
  fronta: async () => fronta,
  zmazZFronty: async (id: string) => {
    fronta = fronta.filter((d) => d.id !== id);
  },
  zapisChybu: async () => {},
  zapisPrilohu: async (id: string, priloha: CakajuciDoklad["priloha"]) => {
    fronta = fronta.map((d) => (d.id === id ? { ...d, priloha } : d));
  },
}));

const { odosliCakajuce } = await import("./doklady-odoslanie");

const ID = "0b9c7f2e-4d1a-4c3b-9e8f-123456789abc";

beforeEach(() => {
  nahrajPrilohu.mockClear();
  fronta = [
    {
      id: ID,
      company_id: "firma",
      uhrada: "karta",
      ts: 0,
      obrazok: "data:image/jpeg;base64,AA",
      fotkaPovinna: true,
      vysledok: { zdroj: "ekasa", overeny: true, total: 5, items: [] } as never,
    },
  ];
});

describe("opakovanie po stratenej odpovedi", () => {
  it("fotku nahrá raz a obidva pokusy pošlú to isté id", async () => {
    const poslane: Array<Record<string, unknown>> = [];
    let prvy = true;
    const uloz = vi.fn(async ({ data }: { data: unknown }) => {
      poslane.push(data as Record<string, unknown>);
      if (prvy) {
        prvy = false;
        throw new Error("Failed to fetch");
      }
      return {};
    });
    const nacitaj = vi.fn();

    const r1 = await odosliCakajuce("firma", nacitaj as never, uloz);
    expect(r1).toEqual({ odoslane: 0, zostalo: 1 });
    const r2 = await odosliCakajuce("firma", nacitaj as never, uloz);
    expect(r2).toEqual({ odoslane: 1, zostalo: 0 });

    expect(nahrajPrilohu).toHaveBeenCalledTimes(1);
    expect(poslane.map((p) => p.id)).toEqual([ID, ID]);
    expect(poslane[1].file_path).toBe("firma/foto.jpg");
    expect(poslane[0].file_path).toBe("firma/foto.jpg");
    expect(fronta).toEqual([]);
  });
});
