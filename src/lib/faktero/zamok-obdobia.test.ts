/*
  Uzamknuté obdobie: zoznamy polí a názvy v `zamok-obdobia.ts` sa musia
  zhodovať s migráciou `*_zamok_obdobia_storno_duzp.sql` (spúšťače v DB) a
  logika v TS s tou v SQL. Spúšťače samotné boli preskúšané nad PGlite.
*/
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  NAZVY_POLI,
  ZAMOK_OBDOBIA_DOKLADU,
  ZAMOK_OBDOBIA_FAKTURY,
  ZAMOK_OBDOBIA_POLOZKY,
  ZAMOK_OBDOBIA_PRIJATEJ,
  denZamku,
  hlaskaZamkuObdobia,
  jeVZamknutomObdobi,
  porusenieZamkuObdobia,
} from "./zamok-obdobia";
import { ZAMOK_DOKLADU, ZAMOK_PRIJATEJ } from "./pohoda-zamok";

const adresar = new URL("../../../supabase/migrations/", import.meta.url);
const subor = readdirSync(adresar).find((f) => /_zamok_obdobia_storno_duzp\.sql$/.test(f));
const sql = subor ? readFileSync(new URL(subor, adresar), "utf8") : "";

function argumenty(spustac: string): string[] {
  const m = new RegExp(
    `create trigger ${spustac}\\s[\\s\\S]*?execute function [\\w.]+\\(([\\s\\S]*?)\\);`,
  ).exec(sql);
  if (!m) throw new Error(`spúšťač ${spustac} v migrácii chýba`);
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
}

const ZAMOK = "2026-10-31";

describe("zámok obdobia — migrácia a zoznamy polí", () => {
  it("migrácia existuje", () => expect(subor).toBeTruthy());

  it.each([
    ["invoices_locked_period", ZAMOK_OBDOBIA_FAKTURY],
    ["purchase_invoices_locked_period", ZAMOK_OBDOBIA_PRIJATEJ],
    ["expense_documents_locked_period", ZAMOK_OBDOBIA_DOKLADU],
    ["invoice_items_locked_period", ZAMOK_OBDOBIA_POLOZKY],
  ] as const)("%s nesie presne polia zo zamok-obdobia.ts", (spustac, polia) => {
    expect(argumenty(spustac)).toEqual([...polia]);
  });

  it("ľudské názvy polí v SQL a TS sú tie isté", () => {
    const telo = sql.slice(
      sql.indexOf("function public.nazov_pola_dokladu"),
      sql.indexOf("else 'údaje dokladu'"),
    );
    const sqlNazvy = Object.fromEntries(
      [...telo.matchAll(/when '([a-z_0-9]+)' then '([^']+)'/g)].map(([, k, v]) => [k, v]),
    );
    expect(sqlNazvy).toEqual(NAZVY_POLI);
  });

  it("každé chránené pole (aj zámok odovzdania) má ľudský názov", () => {
    for (const p of [
      ...ZAMOK_OBDOBIA_FAKTURY,
      ...ZAMOK_OBDOBIA_PRIJATEJ,
      ...ZAMOK_OBDOBIA_DOKLADU,
      ...ZAMOK_OBDOBIA_POLOZKY,
      ...ZAMOK_PRIJATEJ,
      ...ZAMOK_DOKLADU,
    ])
      expect(NAZVY_POLI[p], p).toBeTruthy();
  });

  it("hlášky v SQL nenesú technický názov stĺpca", () => {
    expect(sql).not.toMatch(/najprv ho vráťte z Pohody \(%\)\.', _s/);
    expect(sql).toContain("public.nazov_pola_dokladu(_s)");
  });

  it("vydaná: storno a DPH údaje chránené, úhrada a zaúčtovanie voľné", () => {
    for (const p of ["cancelled_at", "delivery_date", "pohoda_clenenie_dph", "kv_clenenie", "oprava_25a"])
      expect(ZAMOK_OBDOBIA_FAKTURY as readonly string[]).toContain(p);
    for (const p of ["status", "paid_at", "pohoda_predkontacia", "notes", "int_poznamka", "job_id", "exported_at"])
      expect(ZAMOK_OBDOBIA_FAKTURY as readonly string[]).not.toContain(p);
  });

  it("prijatá: všetko, čo mení deň odpočtu a výkaz, je chránené", () => {
    for (const p of [
      "delivery_date",
      "received_date",
      "odpocet",
      "dph_rezim",
      "reverse_charge",
      "kv_clenenie",
      "pohoda_clenenie_dph",
      "items",
      "vat_breakdown",
      "supplier_ic_dph",
      "currency",
      "exchange_rate",
      "opravuje_cislo",
      "amount_total",
      "vat_amount",
    ])
      expect(ZAMOK_OBDOBIA_PRIJATEJ as readonly string[]).toContain(p);
    for (const p of ["status", "payment_date", "pohoda_predkontacia", "rozuctovanie", "note", "exported_at"])
      expect(ZAMOK_OBDOBIA_PRIJATEJ as readonly string[]).not.toContain(p);
  });
});

describe("zámok obdobia — deň a stav", () => {
  it("vydaná: deň dodania, opravná deň vystavenia", () => {
    expect(denZamku("invoices", { issue_date: "2026-11-03", delivery_date: "2026-10-28" })).toBe("2026-10-28");
    expect(
      denZamku("invoices", {
        type: "credit_note",
        issue_date: "2026-11-10",
        delivery_date: "2026-10-20",
      }),
    ).toBe("2026-11-10");
  });

  it("prijatá: rozhoduje len deň odpočtu", () => {
    // vystavená 20. 10., prijatá 5. 11. — odpočet v nov., zámok ju nedrží
    const neskoro = { status: "received", issue_date: "2026-10-20", received_date: "2026-11-05", vat_amount: 23 };
    expect(denZamku("purchase_invoices", neskoro)).toBe("2026-11-05");
    expect(jeVZamknutomObdobi("purchase_invoices", neskoro, ZAMOK)).toBe(false);
    expect(porusenieZamkuObdobia("purchase_invoices", null, neskoro, ZAMOK)).toBeNull();
    expect(porusenieZamkuObdobia("purchase_invoices", neskoro, { ...neskoro, amount_total: 5 }, ZAMOK)).toBeNull();
    // prijatá 20. 10. — zamknutá
    const vcas = { ...neskoro, received_date: "2026-10-20" };
    expect(jeVZamknutomObdobi("purchase_invoices", vcas, ZAMOK)).toBe(true);
    expect(porusenieZamkuObdobia("purchase_invoices", null, vcas, ZAMOK)).toEqual({ dovod: "vstup" });
    // samozdanenie: odpočet na DUZP v okt.
    expect(
      denZamku("purchase_invoices", {
        issue_date: "2026-11-03",
        delivery_date: "2026-10-30",
        received_date: "2026-11-11",
        vat_amount: 0,
        pohoda_clenenie_dph: "PDsluz",
      }),
    ).toBe("2026-10-30");
  });

  it("koncept, stornovaná a nespracovaný bloček nie sú v zámku", () => {
    expect(jeVZamknutomObdobi("invoices", { status: "draft", issue_date: "2026-10-01" }, ZAMOK)).toBe(false);
    expect(jeVZamknutomObdobi("invoices", { status: "issued", issue_date: "2026-10-01" }, ZAMOK)).toBe(true);
    expect(jeVZamknutomObdobi("expense_documents", { status: "new", issue_date: "2026-10-01" }, ZAMOK)).toBe(false);
  });
});

describe("zámok obdobia — logika ako spúšťač", () => {
  const f = { status: "issued", issue_date: "2026-10-20", delivery_date: "2026-10-20", total: 100 };

  it("storno vydanej v uzavretom období neprejde, mimo neho áno", () => {
    expect(porusenieZamkuObdobia("invoices", f, { ...f, status: "cancelled", cancelled_at: "x" }, ZAMOK)).toEqual({
      dovod: "storno",
    });
    const nov = { ...f, issue_date: "2026-11-05", delivery_date: "2026-11-05" };
    expect(porusenieZamkuObdobia("invoices", nov, { ...nov, status: "cancelled" }, ZAMOK)).toBeNull();
    expect(porusenieZamkuObdobia("invoices", f, { ...f, status: "cancelled" }, null)).toBeNull();
  });

  it("koncept ↔ vystavená, obnovenie storna a zmazanie", () => {
    expect(porusenieZamkuObdobia("invoices", f, { ...f, status: "draft" }, ZAMOK)).toEqual({ dovod: "odchod" });
    expect(porusenieZamkuObdobia("invoices", { ...f, status: "draft" }, f, ZAMOK)).toEqual({ dovod: "vstup" });
    expect(porusenieZamkuObdobia("invoices", { ...f, status: "cancelled" }, f, ZAMOK)).toEqual({ dovod: "vstup" });
    expect(porusenieZamkuObdobia("invoices", f, { ...f, deleted_at: "x" }, ZAMOK)).toEqual({ dovod: "zmazanie" });
    expect(porusenieZamkuObdobia("invoices", f, null, ZAMOK)).toEqual({ dovod: "zmazanie" });
    // koncept sa smie meniť aj zmazať
    const k = { ...f, status: "draft" };
    expect(porusenieZamkuObdobia("invoices", k, { ...k, total: 5 }, ZAMOK)).toBeNull();
    expect(porusenieZamkuObdobia("invoices", k, null, ZAMOK)).toBeNull();
  });

  it("úhrada, predkontácia a poznámka prejdú", () => {
    expect(
      porusenieZamkuObdobia(
        "invoices",
        f,
        { ...f, status: "paid", paid_at: "x", pohoda_predkontacia: "3FV", notes: "x" },
        ZAMOK,
      ),
    ).toBeNull();
  });

  it("prijatá: presun DUZP z obdobia aj do obdobia neprejde", () => {
    const p = { status: "received", issue_date: "2026-10-15", delivery_date: "2026-10-15", received_date: "2026-10-16", vat_amount: 23 };
    expect(porusenieZamkuObdobia("purchase_invoices", p, { ...p, delivery_date: "2026-11-01" }, ZAMOK)).toEqual({
      dovod: "pole",
      pole: "delivery_date",
    });
    const n = { ...p, issue_date: "2026-11-02", delivery_date: "2026-11-02", received_date: "2026-11-04" };
    expect(porusenieZamkuObdobia("purchase_invoices", n, { ...n, amount_total: 5 }, ZAMOK)).toBeNull();
    expect(
      porusenieZamkuObdobia("purchase_invoices", n, { ...n, received_date: "2026-10-30", delivery_date: "2026-10-30" }, ZAMOK),
    ).not.toBeNull();
    expect(porusenieZamkuObdobia("purchase_invoices", p, { ...p, odpocet: false }, ZAMOK)).toEqual({
      dovod: "pole",
      pole: "odpocet",
    });
  });

  it("predkontácia v položkách prejde, zmena položky nie", () => {
    const b = { status: "processed", issue_date: "2026-10-12", items: [{ name: "a", total: 10 }] };
    expect(
      porusenieZamkuObdobia("expense_documents", b, { ...b, items: [{ name: "a", total: 10, predkontacia: "5Pv" }] }, ZAMOK),
    ).toBeNull();
    expect(porusenieZamkuObdobia("expense_documents", b, { ...b, items: [{ name: "a", total: 11 }] }, ZAMOK)).toEqual({
      dovod: "pole",
      pole: "items",
    });
  });

  it("hlášky bez technických názvov", () => {
    expect(hlaskaZamkuObdobia("invoices", { dovod: "storno" }, ZAMOK)).toBe(
      "Obdobie je uzamknuté do 31.10.2026. Faktúru z uzavretého obdobia už nemožno stornovať. Odomknite obdobie, alebo vystavte dobropis v otvorenom období.",
    );
    const h = hlaskaZamkuObdobia("purchase_invoices", { dovod: "pole", pole: "due_date" }, ZAMOK);
    expect(h).toContain("(splatnosť)");
    expect(h).not.toMatch(/due_date/);
    // Texty sú v migrácii doslova (rovnaké vety ako zamok_obdobia_hlaska).
    expect(sql).toContain("Faktúru z uzavretého obdobia už nemožno stornovať. ");
    expect(sql).toContain("'Odomknite obdobie, alebo vystavte dobropis v otvorenom období.'");
  });
});
