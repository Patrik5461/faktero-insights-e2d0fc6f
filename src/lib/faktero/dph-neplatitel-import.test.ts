import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importDphNeplatitela, UPOZORNENIE_IMPORT_DPH_NEPLATITELA } from "./dph-neplatitel-import";

describe("import s DPH u neplatiteľa", () => {
  it("odznak len pri importe, neplatiteľovi a nenulovej DPH", () => {
    const neplatitel = { vat_payer: false };
    expect(importDphNeplatitela({ import_source: "Pohoda", vat_total: 23 }, neplatitel)).toBe(true);
    expect(importDphNeplatitela({ import_source: "doklado", vat_total: "-4.60" }, neplatitel)).toBe(
      true,
    );
    expect(importDphNeplatitela({ import_source: null, vat_total: 23 }, neplatitel)).toBe(false);
    expect(importDphNeplatitela({ import_source: "  ", vat_total: 23 }, neplatitel)).toBe(false);
    expect(importDphNeplatitela({ import_source: "Pohoda", vat_total: 0 }, neplatitel)).toBe(false);
    expect(
      importDphNeplatitela({ import_source: "Pohoda", vat_total: 23 }, { vat_payer: true }),
    ).toBe(false);
    // Neznámy stav platiteľa (firma ešte nenačítaná) — nič nehlási.
    expect(
      importDphNeplatitela({ import_source: "Pohoda", vat_total: 23 }, { vat_payer: null }),
    ).toBe(false);
    expect(importDphNeplatitela(null, neplatitel)).toBe(false);
  });

  it("migrácia: výnimka len mimo authenticated/anon a s import_source, text upozornenia sedí", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261101134332_dph_neplatitela_vynimka_importu.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain(UPOZORNENIE_IMPORT_DPH_NEPLATITELA);
    // Obe poistky (faktúra aj položka) majú tú istú podmienku výnimky.
    expect(sql.match(/current_user not in \('authenticated', 'anon'\)/g)).toHaveLength(2);
    expect(sql.match(/import_source/g)!.length).toBeGreaterThanOrEqual(2);
    // Nie premenná relácie, ktorú si klient nastaví cez REST.
    expect(sql).not.toMatch(/current_setting\(/);
  });
});
