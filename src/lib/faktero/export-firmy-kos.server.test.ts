import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { zostavBalikFirmy } from "./export-firmy.server";

/** Klient Supabase, ktorý vráti pripravené riadky tabuľky (len prvú stránku). */
function klient(tabulky: Record<string, Record<string, unknown>[]>) {
  return {
    from(tabulka: string) {
      let od = 0;
      const b: any = {
        select: () => b,
        eq: () => b,
        in: () => b,
        gte: () => b,
        lte: () => b,
        lt: () => b,
        order: () => b,
        range: (zac: number) => {
          od = zac;
          return b;
        },
        maybeSingle: async () => ({ data: tabulky[tabulka]?.[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, zle: (e: unknown) => unknown) =>
          Promise.resolve({ data: od === 0 ? (tabulky[tabulka] ?? []) : [], error: null }).then(
            ok,
            zle,
          ),
      };
      return b;
    },
  };
}

describe("balík firmy a kôš", () => {
  it("doklady z koša dá do priečinka kos/, nie medzi živé", async () => {
    const supabase = klient({
      companies: [{ id: "f1", name: "Firma" }],
      invoices: [
        { id: "a", invoice_number: "2026001", deleted_at: null },
        { id: "b", invoice_number: "2026002", deleted_at: "2026-10-01T00:00:00Z" },
      ],
      invoice_items: [
        { id: "i1", invoice_id: "a", name: "Živá položka" },
        { id: "i2", invoice_id: "b", name: "Položka z koša" },
      ],
      purchase_invoices: [{ id: "p", invoice_number: "D1", deleted_at: "2026-10-02T00:00:00Z" }],
      customers: [{ id: "c", name: "Odberateľ", deleted_at: null }],
    });
    const v = await zostavBalikFirmy(
      supabase,
      { company_id: "f1", s_pdf: false, s_skenmi: false, podla: "vystavenia" },
      { maxPdf: 10, maxSkenov: 10 },
    );
    const zip = await JSZip.loadAsync(v.obsah);
    const citaj = (n: string) => zip.file(n)?.async("string");

    expect(await citaj("faktury.csv")).toContain("2026001");
    expect(await citaj("faktury.csv")).not.toContain("2026002");
    expect(await citaj("kos/faktury.csv")).toContain("2026002");
    expect(await citaj("faktury-polozky.csv")).not.toContain("Položka z koša");
    expect(await citaj("kos/faktury-polozky.csv")).toContain("Položka z koša");
    // Len kôš — hlavný súbor nevznikne, v koši je.
    expect(zip.file("prijate-faktury.csv")).toBeNull();
    expect(await citaj("kos/prijate-faktury.csv")).toContain("D1");
    // Prázdny kôš súbor nevyrobí.
    expect(zip.file("kos/odberatelia.csv")).toBeNull();

    expect(v.pocty["faktúry"]).toBe(1);
    expect(v.pocty["kôš — faktúry"]).toBe(1);
    expect(v.pocty["kôš — prijaté faktúry"]).toBe(1);
  });
});
