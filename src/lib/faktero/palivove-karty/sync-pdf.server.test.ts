/*
  PDF faktúry od vydavateľa karty → doklad prijatej faktúry. Databáza a úložisko
  sú podvrhnuté — overuje sa, že existujúci súbor sa neprepíše a že chyba
  sťahovania synchronizáciu nezhodí.
*/
import { describe, expect, it, vi } from "vitest";

vi.mock("../payment-crypto.server", () => ({ decryptSecret: () => "{}" }));

import { prilozPdfFaktury, type Kontext } from "./sync.server";
import type { KartaFaktura } from "./typy";

function falosnyAdmin(riadok: Record<string, unknown> | null, zapise = true) {
  const zaznam = {
    nahrate: [] as string[],
    zmazane: [] as string[],
    update: null as Record<string, unknown> | null,
    logy: [] as Record<string, unknown>[],
  };
  const retaz = (tabulka: string) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => q,
      maybeSingle: async () => ({ data: riadok }),
      update: (v: Record<string, unknown>) => {
        zaznam.update = v;
        return {
          eq: () => ({ is: () => ({ select: async () => ({ data: zapise ? [{}] : [] }) }) }),
        };
      },
      insert: async (v: Record<string, unknown>) => {
        if (tabulka === "palivove_karty_logy") zaznam.logy.push(v);
        return { error: null };
      },
    };
    return q;
  };
  const admin = {
    from: retaz,
    storage: {
      from: () => ({
        upload: async (c: string) => {
          zaznam.nahrate.push(c);
          return { error: null };
        },
        remove: async (c: string[]) => {
          zaznam.zmazane.push(...c);
          return { error: null };
        },
      }),
    },
  };
  const k = {
    admin,
    companyId: "firma-1",
    pripojenie: { id: "pr-1", company_id: "firma-1" },
  } as unknown as Kontext;
  return { k, zaznam };
}

const F = { cislo: "900001234" } as KartaFaktura;
const PDF = {
  bajty: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  nazov: "f.pdf",
  mime: "application/pdf",
};

describe("prilozPdfFaktury", () => {
  it("faktúra bez súboru dostane PDF", async () => {
    const { k, zaznam } = falosnyAdmin({ id: "pi-1", file_path: null, deleted_at: null });
    expect(await prilozPdfFaktury(k, "pi-1", F, async () => PDF)).toBe(true);
    expect(zaznam.nahrate[0]).toMatch(/^firma-1\/[0-9a-f-]{36}\.pdf$/);
    expect(zaznam.update).toMatchObject({ file_mime: "application/pdf", file_size: 4 });
  });

  it("existujúci súbor sa neprepíše a nič sa nesťahuje", async () => {
    const { k, zaznam } = falosnyAdmin({ id: "pi-1", file_path: "x.pdf", deleted_at: null });
    const stiahni = vi.fn(async () => PDF);
    expect(await prilozPdfFaktury(k, "pi-1", F, stiahni)).toBe(false);
    expect(stiahni).not.toHaveBeenCalled();
    expect(zaznam.nahrate).toEqual([]);
  });

  it("chyba sťahovania sa zapíše do záznamu, nevyhodí sa", async () => {
    const { k, zaznam } = falosnyAdmin({ id: "pi-1", file_path: null, deleted_at: null });
    const ok = await prilozPdfFaktury(k, "pi-1", F, async () => {
      throw new Error("Shell 500");
    });
    expect(ok).toBe(false);
    expect(zaznam.logy[0]).toMatchObject({ stav: "chyba" });
    expect(String(zaznam.logy[0]!.sprava)).toContain("900001234");
  });

  it("súbežne nahratý súbor má prednosť — náš sa zmaže", async () => {
    const { k, zaznam } = falosnyAdmin({ id: "pi-1", file_path: null, deleted_at: null }, false);
    expect(await prilozPdfFaktury(k, "pi-1", F, async () => PDF)).toBe(false);
    expect(zaznam.zmazane).toEqual(zaznam.nahrate);
  });
});
