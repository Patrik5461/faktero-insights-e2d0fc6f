import { describe, expect, it, vi } from "vitest";
import {
  DuplicitnySuborChyba,
  jeDuplicitnySubor,
  odkazNaDuplicitu,
  popisDuplicity,
  textDuplicity,
  vyberDuplicitu,
  type KandidatDuplicity,
} from "./duplicita-suboru";
import { najdiRovnakySubor, odtlacokSuboru } from "./duplicita-suboru.server";

const k = (o: Partial<KandidatDuplicity>): KandidatDuplicity => ({
  agenda: "prijata",
  id: "x",
  cislo: null,
  partner: null,
  nahrane: null,
  ...o,
});

describe("odtlačok súboru", () => {
  it("rovnaké bajty = rovnaký SHA-256, iný bajt = iný", () => {
    const a = new TextEncoder().encode("%PDF-1.4 faktúra 2026001");
    const b = new TextEncoder().encode("%PDF-1.4 faktúra 2026001");
    const c = new TextEncoder().encode("%PDF-1.4 faktúra 2026002");
    expect(odtlacokSuboru(a)).toBe(odtlacokSuboru(b));
    expect(odtlacokSuboru(a)).not.toBe(odtlacokSuboru(c));
    expect(odtlacokSuboru(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("vyberDuplicitu", () => {
  it("nič nenájdené — nahratie prejde", () => {
    expect(vyberDuplicitu([])).toEqual({ duplicita: null, vKosi: false });
  });
  it("len v koši — nahratie prejde a povie sa to", () => {
    expect(vyberDuplicitu([k({ vKosi: true }), k({ agenda: "nespracovany", vKosi: true })])).toEqual({
      duplicita: null,
      vKosi: true,
    });
  });
  it("živý doklad má prednosť pred košom, nespracovaný pred vytvoreným", () => {
    const r = vyberDuplicitu([
      k({ id: "kos", vKosi: true }),
      k({ id: "blocek", agenda: "blocek" }),
      k({ id: "nesp", agenda: "nespracovany", cislo: "FA1" }),
    ]);
    expect(r.vKosi).toBe(false);
    expect(r.duplicita).toEqual({ agenda: "nespracovany", id: "nesp", cislo: "FA1", partner: null, nahrane: null });
  });
  it("v rovnakej agende najstarší", () => {
    const r = vyberDuplicitu([k({ id: "b", nahrane: "2026-11-02" }), k({ id: "a", nahrane: "2026-11-01" })]);
    expect(r.duplicita?.id).toBe("a");
  });
});

describe("odkaz a text", () => {
  it("odkaz vedie na detail podľa agendy", () => {
    expect(odkazNaDuplicitu({ agenda: "nespracovany", id: "1" })).toEqual({ to: "/nespracovane/$id", params: { id: "1" } });
    expect(odkazNaDuplicitu({ agenda: "prijata", id: "2" })).toEqual({ to: "/prijate-faktury/$id", params: { id: "2" } });
    expect(odkazNaDuplicitu({ agenda: "blocek", id: "3" })).toEqual({ to: "/doklady/novy", search: { id: "3" } });
    expect(odkazNaDuplicitu({ agenda: "ostatny", id: "4" })).toEqual({ to: "/ostatne-doklady/novy", search: { id: "4" } });
  });
  it("text pre denník mailov a API", () => {
    const d = { agenda: "prijata" as const, id: "1", cislo: "2026001", partner: "Lipa s.r.o.", nahrane: null };
    expect(popisDuplicity(d)).toBe("2026001, Lipa s.r.o.");
    expect(textDuplicity(d)).toBe("Tento doklad už vo Fakteri je — Prijaté faktúry: 2026001, Lipa s.r.o.");
    expect(textDuplicity({ ...d, cislo: null, partner: " " })).toBe("Tento doklad už vo Fakteri je — Prijaté faktúry");
    const e = new DuplicitnySuborChyba(d);
    expect(jeDuplicitnySubor(e)).toBe(true);
    expect(jeDuplicitnySubor(new Error("x"))).toBe(false);
    expect(e.message).toMatch(/^Tento doklad už vo Fakteri je/);
  });
});

/** Klient, ktorý vráti riadky podľa tabuľky a zapíše, čo sa pýtalo. */
function klient(riadky: Record<string, unknown[] | Error>) {
  const filtre: Record<string, [string, unknown][]> = {};
  return {
    filtre,
    from: vi.fn((tab: string) => {
      filtre[tab] = [];
      const q: any = {
        select: () => q,
        eq: (s: string, v: unknown) => (filtre[tab]!.push([s, v]), q),
        limit: () => {
          const r = riadky[tab];
          return Promise.resolve(r instanceof Error ? { data: null, error: r } : { data: r ?? [], error: null });
        },
      };
      return q;
    }),
  };
}

describe("najdiRovnakySubor", () => {
  it("hľadá vo firme podľa odtlačku vo všetkých agendách aj v koši", async () => {
    const sb = klient({});
    expect(await najdiRovnakySubor(sb, "firma", "h")).toEqual({ duplicita: null, vKosi: false });
    for (const tab of ["nespracovane_doklady", "purchase_invoices", "expense_documents", "other_documents"])
      expect(sb.filtre[tab]).toEqual([
        ["company_id", "firma"],
        ["subor_hash", "h"],
      ]);
    expect(sb.filtre.kos_dokladov).toEqual([
      ["company_id", "firma"],
      ["zaznam->>subor_hash", "h"],
    ]);
  });
  it("vytvorená prijatá faktúra — odkaz na ňu s číslom a dodávateľom", async () => {
    const sb = klient({
      purchase_invoices: [{ id: "p1", invoice_number: "2026001", supplier_name: "Lipa", nahrane_at: "2026-11-01T10:00:00Z", deleted_at: null }],
    });
    const r = await najdiRovnakySubor(sb, "f", "h");
    expect(r.duplicita).toEqual({ agenda: "prijata", id: "p1", cislo: "2026001", partner: "Lipa", nahrane: "2026-11-01T10:00:00Z" });
  });
  it("zmazaná prijatá faktúra a záznam v koši nahratie nezastavia", async () => {
    const sb = klient({
      purchase_invoices: [{ id: "p1", deleted_at: "2026-11-02T00:00:00Z" }],
      kos_dokladov: [{ id: "k1" }],
    });
    expect(await najdiRovnakySubor(sb, "f", "h")).toEqual({ duplicita: null, vKosi: true });
  });
  it("nespracovaný s údajmi z AI", async () => {
    const sb = klient({
      nespracovane_doklady: [{ id: "n1", created_at: "2026-11-18", udaje: { cislo: "77", dodavatel: { nazov: "Shell" } } }],
    });
    expect((await najdiRovnakySubor(sb, "f", "h")).duplicita).toMatchObject({ agenda: "nespracovany", id: "n1", cislo: "77", partner: "Shell" });
  });
  it("chyba dotazu (stĺpec ešte nie je) nahratie nezablokuje", async () => {
    const sb = klient({ nespracovane_doklady: new Error("column subor_hash does not exist") });
    expect(await najdiRovnakySubor(sb, "f", "h")).toEqual({ duplicita: null, vKosi: false });
  });
});
