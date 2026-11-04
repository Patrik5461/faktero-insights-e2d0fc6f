import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { naplanuj, suhrnPlanu, vykonajImport } from "./import-prijatych.server";

/*
  Import prijatých faktúr: tá istá faktúra (číslo + dodávateľ + suma + rok)
  sa nezaloží a je v súhrne; rovnaké číslo s inou sumou či z iného roka
  (Alza opakuje čísla) sa naimportuje. Pravidlo: duplicita-zauctovania.ts.
*/

const EXISTUJUCA = {
  id: "0658bcaf-84e6-4e49-b65e-993aa3d0b463",
  invoice_number: "1126817",
  type: "regular",
  status: "paid",
  supplier_ico: "47699167",
  supplier_name: "MOKOŠÁK PLUS s.r.o.",
  amount_total: "78.30",
  currency: "EUR",
  issue_date: "2026-10-15",
  zauctovane_at: "2026-10-27",
  exported_at: "2026-10-27",
};

function xlsx(riadky: (string | number)[][]) {
  const zosit = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    zosit,
    XLSX.utils.aoa_to_sheet([
      ["Typ dokladu", "Číslo dokladu", "Dodávateľ", "IČO", "Dátum vystavenia", "Suma s DPH"],
      ...riadky,
    ]),
    "Doklady",
  );
  return new Uint8Array(XLSX.write(zosit, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function klient(o: { chybaVlozenia?: (r: any) => string | null } = {}) {
  const vlozene: any[] = [];
  const k = {
    storage: { from: () => ({}) },
    from(tabulka: string) {
      let vlozeny: any = null;
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        update: () => q,
        maybeSingle: async () => ({ data: tabulka === "companies" ? { country: "SK" } : null }),
        range: async () => ({ data: tabulka === "purchase_invoices" ? [EXISTUJUCA] : [] }),
        insert: (r: any) => {
          vlozeny = r;
          return q;
        },
        single: async () => {
          const chyba = o.chybaVlozenia?.(vlozeny) ?? null;
          if (chyba) return { data: null, error: { message: chyba } };
          vlozene.push({ tabulka, ...vlozeny });
          return { data: { id: `nove-${vlozene.length}` }, error: null };
        },
        then: (ok: any) => Promise.resolve({ data: null, error: null }).then(ok),
      };
      return q;
    },
  };
  return { k, vlozene };
}

const spusti = (k: any, plan: any) =>
  vykonajImport({
    klient: k,
    jobId: "job",
    companyId: "firma",
    userId: "u",
    plan,
    stav: "new" as any,
    doPokladne: false,
    citatSkeny: false,
    zdrojAplikacie: "Pohoda",
  });

describe("import prijatých — duplicity", () => {
  it("tá istá faktúra sa preskočí a je v súhrne, iný rok či suma sa naimportuje, dvojitý riadok raz", async () => {
    const { k, vlozene } = klient();
    const bajty = xlsx([
      // Tá istá (číslo zapísané s pomlčkou a nulou) — preskočí sa.
      ["Prijatá faktúra", "0112-6817", "MOKOŠÁK PLUS s.r.o.", "47699167", "15.10.2026", 78.3],
      // Rovnaké číslo, iný rok — možná duplicita, naimportuje sa.
      ["Prijatá faktúra", "1126817", "MOKOŠÁK PLUS s.r.o.", "47699167", "15.10.2025", 78.3],
      // Rovnaké číslo, iná suma — naimportuje sa.
      ["Prijatá faktúra", "1126817", "MOKOŠÁK PLUS s.r.o.", "47699167", "20.10.2026", 99],
      ["Prijatá faktúra", "FA-77", "Iná s.r.o.", "12345678", "1.11.2026", 10],
    ]);
    // Tá istá nová faktúra aj v druhom súbore toho istého importu — naimportuje sa raz.
    const druhy = xlsx([["Prijatá faktúra", "FA 77", "Iná s.r.o.", "12345678", "1.11.2026", 10]]);
    const plan = await naplanuj(k, "firma", [
      { meno: "doklady.xlsx", bajty },
      { meno: "doklady2.xlsx", bajty: druhy },
    ]);
    const s = suhrnPlanu(plan);
    expect(s).toMatchObject({ faktury: 3, duplicity: 2 });
    expect(s.duplicityZoznam).toHaveLength(2);
    expect(s.duplicityZoznam[0]).toContain("0112-6817 (MOKOŠÁK PLUS s.r.o.): už je v evidencii — 1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR");
    expect(s.duplicityZoznam[1]).toContain("FA 77 (Iná s.r.o.): už je v evidencii — FA-77");

    const v = await spusti(k, plan);
    expect(v.faktury).toBe(3);
    expect(v.preskocene).toBe(2);
    expect(v.duplicity).toHaveLength(2);
    expect(vlozene.map((r) => [r.invoice_number, r.issue_date])).toEqual([
      ["1126817", "2025-10-15"],
      ["1126817", "2026-10-20"],
      ["FA-77", "2026-11-01"],
    ]);
  });

  it("chyba spúšťača „Táto faktúra už je v evidencii“ je preskočenie, nie chyba", async () => {
    const { k } = klient({
      chybaVlozenia: (r) =>
        r?.invoice_number === "X-1"
          ? "Táto faktúra už je v evidencii: X-1, Dodávateľ, 5,00 EUR [11111111-1111-1111-1111-111111111111]"
          : null,
    });
    const plan = await naplanuj(k, "firma", [
      { meno: "d.xlsx", bajty: xlsx([["Prijatá faktúra", "X-1", "Dodávateľ", "999", "1.11.2026", 5]]) },
    ]);
    const v = await spusti(k, plan);
    expect(v.chyby).toEqual([]);
    expect(v.preskocene).toBe(1);
    expect(v.duplicity[0]).toContain("X-1 (Dodávateľ): už je v evidencii — X-1, Dodávateľ, 5,00 EUR");
  });
});
