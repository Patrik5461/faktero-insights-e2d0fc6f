/*
  Presun bločku do Nespracovaných musí byť idempotentný — opakovaný pokus
  (dvojklik, fronta appky po výpadku siete) nesmie založiť druhú kópiu.
  Databáza je tu nahradená pamäťou s rovnakým správaním primárneho kľúča.
*/
import { describe, expect, it } from "vitest";
import {
  idPresunutehoBlocku,
  presunBlocekDoNespracovanych,
  presunutyBlocek,
} from "./nespracovane.server";

type Riadok = Record<string, any>;

function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const dopyt = (tabulka: string) => {
    const filtre: [string, unknown][] = [];
    let akcia: "select" | "delete" = "select";
    const riadky = () => (tabulky[tabulka] ??= []);
    const zhodne = () => riadky().filter((r) => filtre.every(([k, v]) => r[k] === v));
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filtre.push([k, v]);
        return q;
      },
      limit: () => q,
      maybeSingle: async () => ({ data: zhodne()[0] ?? null, error: null }),
      delete: () => {
        akcia = "delete";
        return q;
      },
      insert: async (r: Riadok) => {
        if (riadky().some((x) => x.id === r.id))
          return {
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        riadky().push({ ...r });
        return { error: null };
      },
      then: (ok: (v: unknown) => void) => {
        if (akcia === "delete") {
          const zostane = riadky().filter((r) => !filtre.every(([k, v]) => r[k] === v));
          tabulky[tabulka] = zostane;
          return Promise.resolve({ error: null }).then(ok);
        }
        return Promise.resolve({ data: zhodne(), error: null }).then(ok);
      },
    };
    return q;
  };
  return { from: dopyt, storage: { from: () => ({}) } };
}

const BLOCEK = {
  id: "11111111-1111-4111-8111-111111111111",
  company_id: "22222222-2222-4222-8222-222222222222",
  status: "new",
  exported_at: null,
  supplier_name: "Kaufland",
  document_number: "B-1",
  issue_date: "2026-10-30",
  total_amount: 12.5,
  currency: "EUR",
  source: "photo",
  file_path: null,
};

describe("presun bločku do Nespracovaných", () => {
  it("nespracovaný doklad dostane id bločku", () => {
    expect(idPresunutehoBlocku(BLOCEK.id)).toBe(BLOCEK.id);
  });

  it("druhý presun toho istého bločku nezaloží kópiu", async () => {
    const db: Record<string, Riadok[]> = {
      expense_documents: [{ ...BLOCEK }],
      nespracovane_doklady: [],
    };
    const k = falosnyKlient(db);
    const prvy = await presunBlocekDoNespracovanych(k, BLOCEK.id, null);
    const druhy = await presunBlocekDoNespracovanych(k, BLOCEK.id, null);
    expect(prvy.id).toBe(BLOCEK.id);
    expect(druhy.id).toBe(BLOCEK.id);
    expect(db.nespracovane_doklady).toHaveLength(1);
    expect(db.expense_documents).toHaveLength(0);
  });

  it("súbežný presun (riadok už založil iný pokus) bloček dorobí zmazať", async () => {
    const db: Record<string, Riadok[]> = {
      expense_documents: [{ ...BLOCEK }],
      nespracovane_doklady: [{ id: BLOCEK.id, company_id: BLOCEK.company_id }],
    };
    const k = falosnyKlient(db);
    const r = await presunBlocekDoNespracovanych(k, BLOCEK.id, null);
    expect(r.id).toBe(BLOCEK.id);
    expect(db.nespracovane_doklady).toHaveLength(1);
    expect(db.expense_documents).toHaveLength(0);
  });

  it("neexistujúci a nepresunutý bloček je stále chyba", async () => {
    const k = falosnyKlient({ expense_documents: [], nespracovane_doklady: [] });
    await expect(presunBlocekDoNespracovanych(k, BLOCEK.id, null)).rejects.toThrow(
      "Doklad sa nenašiel.",
    );
    expect(await presunutyBlocek(k, BLOCEK.id)).toBeNull();
  });
});
