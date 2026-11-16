import { describe, expect, it } from "vitest";
import { spracujZauctovaneBlocky, textNespracovania } from "./spracovanie-po-zauctovani.server";

/*
  Ručne zaúčtovaný bloček sa presunie z Nespracovaných do Prijatých bločkov —
  falošný PostgREST klient v pamäti (ako zrusenie-zauctovania.server.test.ts).
*/

type Riadok = Record<string, any>;

function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const zapisy: { tabulka: string; zmena: Riadok; ids: string[] }[] = [];
  const from = (tabulka: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let zmena: Riadok | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      in: (k: string, vs: any[]) => (filtre.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), q),
      update: (z: Riadok) => ((zmena = z), q),
      vysledok() {
        const rs = (tabulky[tabulka] ?? []).filter((r) => filtre.every((f) => f(r)));
        if (zmena) {
          for (const r of rs) Object.assign(r, zmena);
          zapisy.push({ tabulka, zmena, ids: rs.map((r) => r.id) });
        }
        return rs.map((r) => ({ ...r }));
      },
      then: (ok: any, zle: any) => Promise.resolve({ data: q.vysledok(), error: null }).then(ok, zle),
    };
    return q;
  };
  return { from, zapisy };
}

const FIRMA = "11111111-1111-4111-8111-111111111111";
const blocek = (id: string, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  document_number: id.toUpperCase(),
  supplier_name: "Shell",
  status: "new",
  total_amount: 12.5,
  issue_date: "2026-11-10",
  zauctovane_at: "2026-11-16T10:00:00Z",
  processed_at: null,
  processed_by: null,
  exported_at: null,
  locked_at: null,
  deleted_at: null,
  ...x,
});

const spusti = (riadky: Riadok[], ids = riadky.map((r) => r.id)) => {
  const sb = falosnyKlient({ expense_documents: riadky });
  return { sb, v: spracujZauctovaneBlocky(sb, { companyId: FIRMA, ids, userId: "u1" }) };
};

describe("spracujZauctovaneBlocky", () => {
  it("zaúčtovaný nespracovaný bloček so sumou a dátumom sa spracuje", async () => {
    const b = blocek("b1");
    const { v } = spusti([b]);
    expect(await v).toEqual({ spracovane: ["b1"], ostavaju: [] });
    expect(b.status).toBe("processed");
    expect(b.processed_by).toBe("u1");
    expect(b.processed_at).toEqual(expect.any(String));
  });

  it("bez sumy alebo dátumu ostáva v Nespracovaných a povie prečo", async () => {
    const bezSumy = blocek("b1", { total_amount: null });
    const bezDatumu = blocek("b2", { issue_date: null });
    const bezOboch = blocek("b3", { total_amount: null, issue_date: null, document_number: null });
    const { v, sb } = spusti([bezSumy, bezDatumu, bezOboch]);
    expect(await v).toEqual({
      spracovane: [],
      ostavaju: [
        { id: "b1", popis: "B1", dovod: "chýba suma — ostáva v Nespracovaných" },
        { id: "b2", popis: "B2", dovod: "chýba dátum — ostáva v Nespracovaných" },
        { id: "b3", popis: "Shell", dovod: "chýba suma a dátum — ostáva v Nespracovaných" },
      ],
    });
    expect(sb.zapisy).toEqual([]);
    expect(bezSumy.status).toBe("new");
  });

  it("chýbajúci dodávateľ spracovaniu nebráni", async () => {
    const b = blocek("b1", { supplier_name: null });
    expect((await spusti([b]).v).spracovane).toEqual(["b1"]);
  });

  it("odovzdaný, zamknutý, zmazaný ani nezaúčtovaný sa nemení", async () => {
    const riadky = [
      blocek("b1", { exported_at: "2026-11-01T00:00:00Z" }),
      blocek("b2", { locked_at: "2026-11-01T00:00:00Z" }),
      blocek("b3", { deleted_at: "2026-11-01T00:00:00Z" }),
      blocek("b4", { zauctovane_at: null }),
    ];
    const { v, sb } = spusti(riadky);
    expect(await v).toEqual({ spracovane: [], ostavaju: [] });
    expect(sb.zapisy).toEqual([]);
    expect(riadky.every((r) => r.status === "new")).toBe(true);
  });

  it("spracovaný ostáva spracovaný — dátum ani spracovateľ sa neprepíšu", async () => {
    const b = blocek("b1", { status: "processed", processed_at: "2026-11-02T00:00:00Z", processed_by: "u0" });
    const { v, sb } = spusti([b]);
    expect(await v).toEqual({ spracovane: [], ostavaju: [] });
    expect(sb.zapisy).toEqual([]);
    expect(b.processed_by).toBe("u0");
  });

  it("cudzia firma ani iný doklad sa nezmenia", async () => {
    const cudzi = blocek("b1", { company_id: "22222222-2222-4222-8222-222222222222" });
    const iny = blocek("b2");
    const { v } = spusti([cudzi, iny], ["b1"]);
    expect(await v).toEqual({ spracovane: [], ostavaju: [] });
    expect(cudzi.status).toBe("new");
    expect(iny.status).toBe("new");
  });

  it("text dôvodu", () => {
    expect(textNespracovania(["suma", "dodávateľ"])).toBe("chýba suma — ostáva v Nespracovaných");
  });
});

describe("kto bloček presúva", () => {
  it("len ručné zaúčtovanie (zauctujDokladyFn), autopilot nie", async () => {
    const { readFileSync } = await import("node:fs");
    const zauctovanie = readFileSync("src/lib/faktero/zauctovanie.functions.ts", "utf-8");
    expect(zauctovanie).toContain("spracovanie-po-zauctovani.server");
    const autopilot = readFileSync("src/lib/faktero/auto-uctovanie.server.ts", "utf-8");
    expect(autopilot).not.toContain("spracovanie-po-zauctovani");
    expect(autopilot).not.toContain("zauctujDokladyFn");
  });
});
