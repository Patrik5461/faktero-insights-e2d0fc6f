import { beforeEach, describe, expect, it } from "vitest";

/*
  Serverová časť pravidla duplicity: hľadanie v databáze (falošný klient
  v pamäti) a vynútenie v zaúčtovaní prijatých faktúr a bločkov.
*/

type Riadok = Record<string, any>;

/** Minimálny PostgREST klient nad poľami v pamäti. */
function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const zapisy: { tabulka: string; zmena: Riadok; ids: string[] }[] = [];
  const from = (tabulka: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let zmena: Riadok | null = null;
    let rozsah: [number, number] | null = null;
    let limit: number | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      neq: (k: string, v: any) => (filtre.push((r) => r[k] !== v), q),
      in: (k: string, vs: any[]) => (filtre.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), q),
      not: () => q,
      or: () => q,
      ilike: () => q,
      order: () => q,
      gte: () => q,
      range: (a: number, b: number) => ((rozsah = [a, b]), q),
      limit: (n: number) => ((limit = n), q),
      update: (z: Riadok) => ((zmena = z), q),
      vysledok() {
        let rs = (tabulky[tabulka] ?? []).filter((r) => filtre.every((f) => f(r)));
        if (zmena) {
          for (const r of rs) Object.assign(r, zmena);
          zapisy.push({ tabulka, zmena, ids: rs.map((r) => r.id) });
        }
        if (rozsah) rs = rs.slice(rozsah[0], rozsah[1] + 1);
        if (limit != null) rs = rs.slice(0, limit);
        return rs.map((r) => ({ ...r }));
      },
      maybeSingle: async () => ({ data: q.vysledok()[0] ?? null, error: null }),
      single: async () => ({ data: q.vysledok()[0] ?? null, error: null }),
      then: (ok: any, zle: any) => Promise.resolve({ data: q.vysledok(), error: null }).then(ok, zle),
    };
    return q;
  };
  return { from, zapisy };
}

const FIRMA = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("duplicityDokladov / najdiUlozenyBlocek", () => {
  it("nájde duplicitu prijatej aj pri inak zapísanom čísle (podľa IČO)", async () => {
    const { duplicityDokladov } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient({
      purchase_invoices: [
        { id: id(1), company_id: FIRMA, invoice_number: "0012", supplier_ico: "123", type: "regular", status: "received", amount_total: 5, deleted_at: null },
        { id: id(2), company_id: FIRMA, invoice_number: "12", supplier_ico: "123", type: "regular", status: "booked", amount_total: 5, deleted_at: null, zauctovane_at: "x" },
        { id: id(3), company_id: "ina-firma", invoice_number: "0012", supplier_ico: "123", type: "regular", status: "received", amount_total: 5, deleted_at: null },
      ],
    });
    const m = await duplicityDokladov(sb, FIRMA, "prijata", [
      { id: id(1), company_id: FIRMA, invoice_number: "0012", supplier_ico: "123", type: "regular", status: "received", amount_total: 5 },
    ]);
    expect(m.get(id(1))).toEqual([{ id: id(2), cislo: "12", zauctovany: true }]);
  });

  it("uložený bloček nájde podľa dodávateľa, dňa a sumy", async () => {
    const { najdiUlozenyBlocek } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient({
      expense_documents: [
        { id: id(5), company_id: FIRMA, supplier_ico: "47793155", supplier_name: "Shell", issue_date: "2026-10-22", total_amount: 65.97, qr_raw: "O-AAA" },
      ],
    });
    const uz = await najdiUlozenyBlocek(sb, FIRMA, { supplier_ico: "47793155", issue_date: "2026-10-22", total_amount: 65.97 });
    expect(uz?.id).toBe(id(5));
    expect(await najdiUlozenyBlocek(sb, FIRMA, { supplier_ico: "47793155", issue_date: "2026-10-22", total_amount: 65.97, qr_raw: "O-BBB" })).toBeNull();
  });
});

describe("zaúčtovanie vynechá duplicity (vynechajDuplicity)", () => {
  let tabulky: Record<string, Riadok[]>;
  beforeEach(() => {
    tabulky = {
      purchase_invoices: [
        { id: id(1), company_id: FIRMA, invoice_number: "FA1", supplier_ico: "123", supplier_name: "A", type: "regular", status: "received", amount_total: 10, deleted_at: null, zauctovane_at: null, exported_at: null },
        { id: id(2), company_id: FIRMA, invoice_number: "FA1", supplier_ico: "123", supplier_name: "A", type: "regular", status: "booked", amount_total: 10, deleted_at: null, zauctovane_at: "2026-10-01", exported_at: null },
        { id: id(3), company_id: FIRMA, invoice_number: "FA2", supplier_ico: "123", supplier_name: "A", type: "regular", status: "received", amount_total: 20, deleted_at: null, zauctovane_at: null, exported_at: null },
      ],
      expense_documents: [
        { id: id(5), company_id: FIRMA, supplier_ico: "9", supplier_name: "Shell", issue_date: "2026-10-22", total_amount: 5, zauctovane_at: null, exported_at: null },
        { id: id(6), company_id: FIRMA, supplier_ico: "9", supplier_name: "Shell", issue_date: "2026-10-22", total_amount: 5, zauctovane_at: null, exported_at: null },
        { id: id(7), company_id: FIRMA, supplier_ico: "9", supplier_name: "Shell", issue_date: "2026-10-23", total_amount: 5, zauctovane_at: null, exported_at: null },
      ],
      companies: [{ id: FIRMA, vat_payer: false }],
    };
  });

  it("prijatá faktúra s už zaúčtovanou duplicitou sa vynechá, ostatné prejdú", async () => {
    const { vynechajDuplicity } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient(tabulky);
    const riadky = tabulky.purchase_invoices.filter((x) => x.id !== id(2));
    const v = await vynechajDuplicity(sb, FIRMA, "prijata", riadky);
    expect(v.ok).toEqual([id(3)]);
    expect(v.duplicity.map((d) => d.id)).toEqual([id(1)]);
    expect(v.duplicity[0].druhe[0]).toMatchObject({ id: id(2), zauctovany: true });
    expect(v.preskocene.join()).toMatch(/^FA1: Duplicitný doklad — .*už zaúčtovaný/);
  });

  it("dva rovnaké nezaúčtované bločky — nezaúčtuje sa ani jeden", async () => {
    const { vynechajDuplicity } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient(tabulky);
    const v = await vynechajDuplicity(sb, FIRMA, "blocek", tabulky.expense_documents);
    expect(v.ok).toEqual([id(7)]);
    expect(v.duplicity.map((d) => d.id).sort()).toEqual([id(5), id(6)]);
    expect(v.preskocene[0]).toMatch(/^Shell: Duplicitný doklad — .*viackrát/);
  });

  it("oznacDuplicity dopíše `_duplicita` len duplicitným", async () => {
    const { oznacDuplicity } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient(tabulky);
    const rs = tabulky.expense_documents.map((r) => ({ ...r }));
    await oznacDuplicity(sb, FIRMA, "blocek", rs);
    expect(rs.map((r) => Boolean(r._duplicita))).toEqual([true, true, false]);
  });
});

describe("kontrola pred Pohodou", () => {
  it("doklad s `_duplicita` sa neodovzdá", async () => {
    const { prekazkaDokladu } = await import("./pohoda-kontrola");
    const d = prekazkaDokladu({ document_number: "B1", _duplicita: "Duplicitný doklad — x" }, { country: "SK" });
    expect(d).toBe("B1 — Duplicitný doklad — x");
  });
});
