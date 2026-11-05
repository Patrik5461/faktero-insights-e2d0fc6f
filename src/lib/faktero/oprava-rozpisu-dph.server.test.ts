/*
  Beh opravy rozpisu DPH proti mocku Supabase (pamäťové tabuľky). Overuje,
  že nanečisto sa nezapíše nič a AI sa nevolá, ostrý beh zapíše audit pred
  zmenou, rešpektuje konflikt `updated_at`, a rollback vráti pôvodné hodnoty.
*/
import { describe, expect, it, vi } from "vitest";
import { spustiOpravu, vratBeh, kanonicky } from "./oprava-rozpisu-dph.server";

type Riadok = Record<string, any>;

/** Minimálny mock PostgREST klienta: select/insert/update/delete + eq/neq/in/is/order/range. */
function mockSupabase(tabulky: Record<string, Riadok[]>) {
  const zapisy: { tabulka: string; op: string; data: unknown }[] = [];
  let auditId = 0;
  const from = (t: string) => {
    tabulky[t] ??= [];
    const filtre: ((r: Riadok) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let data: any = null;
    let rozsah: [number, number] | null = null;
    let jeden = false;
    const vyber = () => tabulky[t]!.filter((r) => filtre.every((f) => f(r)));
    const b: any = {
      select: () => b,
      insert: (d: any) => ((op = "insert"), (data = d), b),
      update: (d: any) => ((op = "update"), (data = d), b),
      delete: () => ((op = "delete"), b),
      eq: (k: string, v: any) => (filtre.push((r) => String(r[k]) === String(v)), b),
      neq: (k: string, v: any) => (filtre.push((r) => String(r[k]) !== String(v)), b),
      in: (k: string, v: any[]) => (filtre.push((r) => v.map(String).includes(String(r[k]))), b),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), b),
      order: () => b,
      range: (a: number, z: number) => ((rozsah = [a, z]), b),
      single: () => ((jeden = true), b),
      maybeSingle: () => ((jeden = true), b),
      then: (ok: any, zle: any) => Promise.resolve(vykonaj()).then(ok, zle),
    };
    const vykonaj = () => {
      if (op === "insert") {
        const r = { id: ++auditId, created_at: new Date().toISOString(), ...data };
        tabulky[t]!.push(r);
        zapisy.push({ tabulka: t, op, data });
        return { data: jeden ? r : [r], error: null };
      }
      if (op === "update") {
        const zasah = vyber();
        for (const r of zasah)
          Object.assign(r, JSON.parse(JSON.stringify(data)), {
            updated_at: new Date(Date.now() + 1000).toISOString(),
          });
        zapisy.push({ tabulka: t, op, data });
        return { data: zasah.map((r) => ({ id: r.id })), error: null };
      }
      if (op === "delete") {
        const zasah = new Set(vyber());
        tabulky[t] = tabulky[t]!.filter((r) => !zasah.has(r));
        zapisy.push({ tabulka: t, op, data: [...zasah].map((r) => r.id) });
        return { data: null, error: null };
      }
      let out = vyber().map((r) => JSON.parse(JSON.stringify(r)));
      if (rozsah) out = out.slice(rozsah[0], rozsah[1] + 1);
      return { data: jeden ? (out[0] ?? null) : out, error: null };
    };
    return b;
  };
  return {
    sb: {
      from,
      storage: {
        from: () => ({ download: async () => ({ data: null, error: { message: "mock" } }) }),
      },
    },
    zapisy,
    tabulky,
  };
}

const firma = { id: "f1", name: "Firma", country: "SK", locked_until: null };

function data() {
  return {
    companies: [firma],
    historia_dokladov: [] as Riadok[],
    oprava_rozpisu_dph_audit: [] as Riadok[],
    nespracovane_doklady: [] as Riadok[],
    purchase_invoices: [
      // fixture 1 — chybná, opraviteľná novým vyťažením
      {
        id: "p1",
        company_id: "f1",
        source: "mail",
        file_path: "f1/p1.pdf",
        type: "regular",
        supplier_name: "RISS Plus",
        invoice_number: "2026001",
        issue_date: "2026-10-30",
        delivery_date: "2026-10-30",
        received_date: "2026-11-03",
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
        items: null,
        created_at: "2026-11-03T10:00:00Z",
        updated_at: "2026-11-03T10:00:00Z",
      },
      // rovnaká, ale odovzdaná do Pohody → preskočená
      {
        id: "p2",
        company_id: "f1",
        source: "mail",
        file_path: "f1/p2.pdf",
        type: "regular",
        issue_date: "2026-10-30",
        delivery_date: "2026-10-30",
        received_date: "2026-11-03",
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
        exported_at: "2026-11-04T10:00:00Z",
        created_at: "2026-11-03T10:00:00Z",
        updated_at: "2026-11-04T10:00:00Z",
      },
      // ručne upravená (história) → len na kontrolu
      {
        id: "p3",
        company_id: "f1",
        source: "nahrate",
        file_path: "f1/p3.pdf",
        type: "regular",
        issue_date: "2026-10-30",
        delivery_date: "2026-10-30",
        received_date: "2026-11-03",
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
        created_at: "2026-11-03T10:00:00Z",
        updated_at: "2026-11-04T10:00:00Z",
      },
      // v poriadku
      {
        id: "p4",
        company_id: "f1",
        source: "mail",
        file_path: "f1/p4.pdf",
        type: "regular",
        issue_date: "2026-10-30",
        delivery_date: "2026-10-30",
        received_date: "2026-11-03",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        created_at: "2026-11-03T10:00:00Z",
        updated_at: "2026-11-03T10:00:00Z",
      },
    ] as Riadok[],
    expense_documents: [] as Riadok[],
  };
}

const deps = (vytaz = vi.fn()) => ({
  textSuboru: async () => ({ text: null, maXml: false }),
  vytaz,
  teraz: () => new Date("2026-11-05T12:00:00Z"),
  log: () => {},
});

const noveP1 = {
  ai: { opravene: true },
  rozpis: [
    { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "exempt" },
    { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
  ],
  spolu: 170.65,
  prenesenie: false,
};

describe("spustiOpravu", () => {
  it("nanečisto: nič nezapíše, AI nevolá, správne roztriedi", async () => {
    const d = data();
    d.historia_dokladov.push({
      id: 1,
      agenda: "prijata",
      doklad_id: "p3",
      pole: "vat_amount",
      kto: "u1",
      kto_typ: "clovek",
      kedy: "2026-11-04",
    });
    const m = mockSupabase(d);
    const vytaz = vi.fn();
    const s = await spustiOpravu(m.sb, { runId: "r1" }, deps(vytaz));
    expect(m.zapisy).toEqual([]);
    expect(vytaz).not.toHaveBeenCalled();
    const v = Object.fromEntries(s.riadky.map((r) => [r.id, r.vysledok]));
    expect(v).toEqual({ p1: "na_vytazenie", p2: "preskocene", p3: "na_kontrolu", p4: "ok" });
    expect(s.odhadAiVolani).toBe(1);
    expect(s.riadky.find((r) => r.id === "p3")!.rucne).toContain("história");
  });

  it("ostro: audit pred zmenou, prepis rozpisu, označenie ručne upravenej; rollback vráti", async () => {
    const d = data();
    d.historia_dokladov.push({
      id: 1,
      agenda: "prijata",
      doklad_id: "p3",
      pole: "vat_amount",
      kto: "u1",
      kto_typ: "clovek",
      kedy: "2026-11-04",
    });
    const m = mockSupabase(d);
    const vytaz = vi.fn(async () => noveP1);
    const s = await spustiOpravu(m.sb, { runId: "r2", zapisat: true }, deps(vytaz));
    expect(vytaz).toHaveBeenCalledTimes(1);
    const v = Object.fromEntries(s.riadky.map((r) => [r.id, r.vysledok]));
    expect(v.p1).toBe("opravene");
    expect(v.p2).toBe("preskocene");
    expect(v.p3).toBe("na_kontrolu");

    const p1 = m.tabulky.purchase_invoices!.find((r) => r.id === "p1")!;
    expect(p1.vat_breakdown).toHaveLength(2);
    expect(p1.amount_total).toBe(170.65);
    const p2 = m.tabulky.purchase_invoices!.find((r) => r.id === "p2")!;
    expect(p2.vat_breakdown).toBeUndefined();
    expect(p2.na_kontrolu_dovod).toBeUndefined();
    const p3 = m.tabulky.purchase_invoices!.find((r) => r.id === "p3")!;
    expect(p3.na_kontrolu_dovod).toMatch(/^Rozpis DPH/);
    expect(p3.amount_without_vat).toBe(143.77);

    // audit sa zapísal pred update
    const poradie = m.zapisy.map((z) => `${z.tabulka}:${z.op}`);
    expect(poradie.indexOf("oprava_rozpisu_dph_audit:insert")).toBeLessThan(
      poradie.indexOf("purchase_invoices:update"),
    );
    const audit = m.tabulky.oprava_rozpisu_dph_audit!;
    expect(audit.map((a) => [a.document_id, a.akcia])).toEqual([
      ["p1", "prepis"],
      ["p3", "na_kontrolu"],
    ]);
    expect(audit[0]!.old_values).toMatchObject({ amount_without_vat: 143.77, vat_breakdown: null });

    // rollback nanečisto nič nezmení
    const pred = m.zapisy.length;
    const r0 = await vratBeh(m.sb, "r2", { log: () => {} });
    expect(r0.naVratenie).toBe(2);
    expect(m.zapisy.length).toBe(pred);
    // ostrý rollback
    const r1 = await vratBeh(m.sb, "r2", { zapisat: true, log: () => {} });
    expect(r1.vratene).toBe(2);
    expect(p1.vat_breakdown).toBeNull();
    expect(p3.na_kontrolu_dovod).toBeNull();
    expect(m.tabulky.oprava_rozpisu_dph_audit!.filter((a) => a.akcia === "rollback")).toHaveLength(
      2,
    );
  });

  it("rollback nevráti zmenu, ktorú niekto po behu prepísal", async () => {
    const m = mockSupabase(data());
    await spustiOpravu(m.sb, { runId: "r3", zapisat: true }, deps(vi.fn(async () => noveP1)));
    const p1 = m.tabulky.purchase_invoices!.find((r) => r.id === "p1")!;
    p1.vat_amount = 26.9; // človek opravil
    const r = await vratBeh(m.sb, "r3", { zapisat: true, log: () => {} });
    expect(r.konflikty.map((k) => k.id)).toContain("p1");
    expect(p1.vat_amount).toBe(26.9);
  });

  it("limit AI volaní", async () => {
    const m = mockSupabase(data());
    const vytaz = vi.fn(async () => noveP1);
    const s = await spustiOpravu(m.sb, { runId: "r4", zapisat: true, limitAi: 0 }, deps(vytaz));
    expect(vytaz).not.toHaveBeenCalled();
    expect(s.riadky.find((r) => r.id === "p1")!.vysledok).toBe("na_vytazenie");
  });

  it("vzorka nanečisto volá AI, ale nezapíše", async () => {
    const m = mockSupabase(data());
    const vytaz = vi.fn(async () => noveP1);
    const s = await spustiOpravu(m.sb, { runId: "r5", vytazitVzorku: 1 }, deps(vytaz));
    expect(vytaz).toHaveBeenCalledTimes(1);
    expect(m.zapisy).toEqual([]);
    expect(s.riadky.find((r) => r.id === "p1")!.dovod).toMatch(/^vzorka:/);
  });
});

describe("kanonicky", () => {
  it("nezáleží na poradí kľúčov ani na čísle ako texte", () => {
    expect(kanonicky({ b: 1, a: [{ y: "2.50", x: 1 }] })).toBe(
      kanonicky({ a: [{ x: 1, y: 2.5 }], b: 1 }),
    );
  });
});
