import { describe, expect, it, vi } from "vitest";
import {
  BUCKETY_FIRMY,
  vymazTestovaciuFirmu,
  zmazSuboryTestovacejFirmy,
} from "./testovacia-firma-vymazanie.server";

const FIRMA = "11111111-2222-3333-4444-555555555555";

/** Klient prihláseného — vráti členstvo s rolou. */
function klientClena(rola: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rola ? { role: rola } : null }) }),
        }),
      }),
    }),
  };
}

/** Servisný klient: firma (testovacia_pre), úložisko so súbormi, rpc. */
function admin(testovaciaPre: string | null, subory: Record<string, string[]> = {}) {
  const zmazane: string[] = [];
  const rpc = vi.fn(async () => ({ data: FIRMA, error: null }));
  const k = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { testovacia_pre: testovaciaPre }, error: null }),
        }),
      }),
    }),
    rpc,
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          if (prefix === FIRMA) {
            const s = subory[bucket] ?? [];
            return { data: s.length ? [{ name: "priecinok", id: null }] : [], error: null };
          }
          if (prefix === `${FIRMA}/priecinok`)
            return { data: (subory[bucket] ?? []).map((n) => ({ name: n, id: "x" })), error: null };
          return { data: [], error: null };
        },
        remove: async (cesty: string[]) => {
          zmazane.push(...cesty.map((c) => `${bucket}:${c}`));
          return { error: null };
        },
      }),
    },
  };
  return { k, zmazane, rpc };
}

describe("vymazanie testovacej firmy", () => {
  it("správca testovacej: zmaže súbory a zavolá obnovu", async () => {
    const { k, zmazane, rpc } = admin("rodic", {
      "invoice-pdfs": ["a.pdf"],
      nespracovane: ["b.jpg"],
    });
    const r = await vymazTestovaciuFirmu(
      { supabase: klientClena("accountant"), userId: "u" },
      FIRMA,
      k as any,
    );
    expect(r.subory).toBe(2);
    expect(zmazane).toEqual([
      `invoice-pdfs:${FIRMA}/priecinok/a.pdf`,
      `nespracovane:${FIRMA}/priecinok/b.jpg`,
    ]);
    expect(rpc).toHaveBeenCalledWith("faktero_obnov_testovaciu_firmu", { _company_id: FIRMA });
  });

  it("skutočnú firmu odmietne a nič nezmaže", async () => {
    const { k, zmazane, rpc } = admin(null, { "invoice-pdfs": ["a.pdf"] });
    await expect(
      vymazTestovaciuFirmu({ supabase: klientClena("owner"), userId: "u" }, FIRMA, k as any),
    ).rejects.toThrow(/len v testovacej/);
    expect(zmazane).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bežný používateľ ani nečlen nesmie", async () => {
    const { k, rpc } = admin("rodic");
    await expect(
      vymazTestovaciuFirmu({ supabase: klientClena("employee"), userId: "u" }, FIRMA, k as any),
    ).rejects.toThrow(/majiteľ, admin alebo účtovník/);
    await expect(
      vymazTestovaciuFirmu({ supabase: klientClena(null), userId: "u" }, FIRMA, k as any),
    ).rejects.toThrow(/nemáte prístup/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chyba pri overení firmy zastaví (fail-closed)", async () => {
    const { k, rpc } = admin("rodic");
    k.from = () =>
      ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "výpadok" } }) }),
        }),
      }) as any;
    await expect(
      vymazTestovaciuFirmu({ supabase: klientClena("owner"), userId: "u" }, FIRMA, k as any),
    ).rejects.toThrow(/výpadok/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("neplatné id firmy nepustí do úložiska (prefix by bol celé úložisko)", async () => {
    const { k } = admin("rodic");
    await expect(zmazSuboryTestovacejFirmy(k as any, "")).rejects.toThrow();
  });

  it("zoznam úložísk obsahuje aj prílohy faktúr, nespracované a doklady vozidiel", () => {
    expect(BUCKETY_FIRMY).toEqual(
      expect.arrayContaining(["invoice-attachments", "nespracovane", "vehicle-docs"]),
    );
  });
});
