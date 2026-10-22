/*
  Zámok dokladov odovzdaných do Pohody: zoznamy polí v `pohoda-zamok.ts` sa
  musia zhodovať s migráciou (spúšťače v DB) a logika v TS s tou v SQL.
  Spúšťače samotné boli preskúšané nad PGlite (skript v pracovnom adresári
  auditu); tu sa kontroluje, že sa zoznamy nerozídu.
*/
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  HISTORIA_FAKTURY,
  HLASKA_ZAMKU_FAKTURY,
  porusenieZamkuDokladu,
  porusenieZamkuFaktury,
  porusenieZamkuPolozky,
  ZAMOK_DOKLADU,
  ZAMOK_FAKTURY,
  ZAMOK_POLOZKY_FAKTURY,
  ZAMOK_PRIJATEJ,
} from "./pohoda-zamok";

const adresar = new URL("../../../supabase/migrations/", import.meta.url);
const subor = readdirSync(adresar).find((f) => /pohoda_zamok\.sql$/.test(f));
const sql = subor ? readFileSync(new URL(subor, adresar), "utf8") : "";

/** Argumenty spúšťača `create trigger <nazov> … execute function f(...)`. */
function argumenty(spustac: string): string[] {
  const m = new RegExp(
    `create trigger ${spustac}[\\s\\S]*?execute function [\\w.]+\\(([\\s\\S]*?)\\);`,
  ).exec(sql);
  if (!m) throw new Error(`spúšťač ${spustac} v migrácii chýba`);
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
}

describe("zámok po odovzdaní — migrácia a zoznamy polí", () => {
  it("migrácia existuje", () => {
    expect(subor).toBeTruthy();
  });

  it.each([
    ["invoices_zamok_odovzdania", ZAMOK_FAKTURY],
    ["invoice_items_zamok_odovzdania", ZAMOK_POLOZKY_FAKTURY],
    ["purchase_invoices_zamok_odovzdania", ZAMOK_PRIJATEJ],
    ["expense_documents_zamok_odovzdania", ZAMOK_DOKLADU],
    ["invoices_historia", HISTORIA_FAKTURY],
  ] as const)("%s nesie presne polia z pohoda-zamok.ts", (spustac, polia) => {
    expect(argumenty(spustac)).toEqual([...polia]);
  });

  it("hláška v SQL je tá istá ako v TS", () => {
    expect(sql).toContain(HLASKA_ZAMKU_FAKTURY);
  });

  it("zámok audit polí z prijatých a bločkov je doplnený", () => {
    for (const p of [
      "items",
      "dph_rezim",
      "reverse_charge",
      "exchange_rate",
      "supplier_dic",
      "type",
      "due_date",
      "variable_symbol",
      "payment_method",
      "deleted_at",
    ])
      expect(ZAMOK_PRIJATEJ).toContain(p);
    expect(ZAMOK_DOKLADU).toContain("items");
  });

  it("bločky a prijaté sa po odovzdaní nedajú zmazať natvrdo", () => {
    expect(sql).toMatch(/expense_documents_zamok_odovzdania\s+before update or delete/);
    expect(sql).toMatch(/purchase_invoices_zamok_odovzdania\s+before update or delete/);
  });

  it("úhrada, odoslanie, PDF, interná poznámka a zákazka ostávajú voľné", () => {
    for (const p of [
      "paid_at",
      "sent_at",
      "pdf_url",
      "pdf_token",
      "int_poznamka",
      "job_id",
      "zauctovane_at",
      "status",
    ])
      expect(ZAMOK_FAKTURY as readonly string[]).not.toContain(p);
  });

  it("história povoľuje agendu faktura", () => {
    expect(sql).toMatch(/check \(agenda in \('prijata', 'doklad', 'faktura'\)\)/);
  });

  it("servisný kľúč zámok nepúta, spúšťače nie sú security definer", () => {
    expect(sql).toContain("current_user not in ('authenticated', 'anon')");
    const zamok =
      /create or replace function public\.zamok_odovzdanej_faktury\(\)[\s\S]*?as \$\$/.exec(
        sql,
      )?.[0] ?? "";
    expect(zamok).not.toMatch(/security definer/);
  });
});

describe("zámok vydanej faktúry — logika", () => {
  const f = {
    exported_at: "2026-10-12T14:08:00Z",
    status: "sent",
    total: 4920,
    customer_ic_dph: "SK1",
    reverse_charge: false,
  };

  it("neodovzdaná faktúra sa mení voľne", () => {
    expect(
      porusenieZamkuFaktury({ ...f, exported_at: null }, { ...f, exported_at: null, total: 1 }),
    ).toBeNull();
  });

  it("úhrada a odoslanie prejdú", () => {
    expect(porusenieZamkuFaktury(f, { ...f, status: "paid", paid_at: "2026-10-20" })).toBeNull();
    expect(porusenieZamkuFaktury(f, { ...f, sent_at: "2026-10-13" })).toBeNull();
  });

  it("suma, PDP, odberateľ, dátum aj zmazanie neprejdú", () => {
    expect(porusenieZamkuFaktury(f, { ...f, total: 4000 })).toBe("total");
    expect(porusenieZamkuFaktury(f, { ...f, reverse_charge: true })).toBe("reverse_charge");
    expect(porusenieZamkuFaktury(f, { ...f, customer_ic_dph: null })).toBe("customer_ic_dph");
    expect(porusenieZamkuFaktury(f, { ...f, delivery_date: "2026-10-01" })).toBe("delivery_date");
    expect(porusenieZamkuFaktury(f, { ...f, deleted_at: "2026-10-12" })).toBe("deleted_at");
    expect(porusenieZamkuFaktury(f, null)).toBe("_zmazanie");
  });

  it("odovzdanie zruší len vrátenie, nie priamy zápis", () => {
    expect(porusenieZamkuFaktury(f, { ...f, exported_at: null })).toBe("exported_at");
  });

  it("storno len keď Pohoda doklad potvrdila (pôjde stornujúci doklad)", () => {
    const storno = { ...f, status: "cancelled", cancelled_at: "2026-10-22" };
    expect(porusenieZamkuFaktury(f, storno)).toBe("cancelled_at");
    expect(porusenieZamkuFaktury(f, storno, false, true)).toBeNull();
    expect(porusenieZamkuFaktury(f, { ...f, status: "draft" })).toBe("status");
  });

  it("servisný zápis prejde vždy", () => {
    expect(porusenieZamkuFaktury(f, { ...f, total: 1 }, true)).toBeNull();
  });

  it("položky odovzdanej faktúry sa nemenia, nepribúdajú ani nemiznú", () => {
    const p = { name: "x", vat_rate: 23, subtotal: 100 };
    expect(porusenieZamkuPolozky(true, p, { ...p, vat_rate: 0 })).toBe("vat_rate");
    expect(porusenieZamkuPolozky(true, null, p)).toBe("_vlozenie");
    expect(porusenieZamkuPolozky(true, p, null)).toBe("_zmazanie");
    expect(porusenieZamkuPolozky(false, p, { ...p, vat_rate: 0 })).toBeNull();
  });
});

describe("zámok prijatej faktúry a bločku — logika", () => {
  const p = {
    exported_at: "2026-10-12",
    items: [{ name: "a" }],
    status: "booked",
    payment_date: null,
  };
  it("úhrada prejde, položky nie", () => {
    expect(
      porusenieZamkuDokladu(ZAMOK_PRIJATEJ, p, {
        ...p,
        status: "paid",
        payment_date: "2026-10-20",
      }),
    ).toBeNull();
    expect(porusenieZamkuDokladu(ZAMOK_PRIJATEJ, p, { ...p, items: [] })).toBe("items");
  });
  it("vrátenie z Pohody (exported_at → null) prejde aj so zmenou", () => {
    expect(
      porusenieZamkuDokladu(ZAMOK_PRIJATEJ, p, { ...p, exported_at: null, items: [] }),
    ).toBeNull();
  });
  it("odovzdaný bloček sa nedá zmazať", () => {
    expect(porusenieZamkuDokladu(ZAMOK_DOKLADU, p, null)).toBe("_zmazanie");
    expect(porusenieZamkuDokladu(ZAMOK_DOKLADU, { ...p, exported_at: null }, null)).toBeNull();
  });
});
