import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bicZIban } from "./bic-z-iban";
import { nazovBanky } from "./banka-z-iban";

/*
  Spúšťač, ktorý pridá účet pripojený v Banke medzi účty firmy, odvodzuje BIC
  a názov banky z IBAN-u v SQL (`banka_podla_iban`). Mapa musí sedieť s tou
  v TS (bic-z-iban.ts, banka-z-iban.ts) — inak by ručne a automaticky pridané
  účty tej istej banky vyzerali inak.
*/
const SQL = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261117013329_pripojene_ucty_do_firmy.sql"),
  "utf8",
);

function mapaZoSql() {
  const m = new Map<string, { swift: string | null; nazov: string }>();
  const re = /\('(SK|CZ)',\s*'(\d{4})',\s*(NULL|'[^']*'),\s*'([^']*)'\)/g;
  for (const r of SQL.matchAll(re)) {
    m.set(`${r[1]}${r[2]}`, { swift: r[3] === "NULL" ? null : r[3].slice(1, -1), nazov: r[4] });
  }
  return m;
}

describe("mapa bánk v migrácii pripojených účtov", () => {
  const sql = mapaZoSql();

  it("načíta sa", () => {
    expect(sql.size).toBeGreaterThan(25);
    expect(sql.get("SK1100")).toEqual({ swift: "TATRSKBX", nazov: "Tatra banka, a.s." });
  });

  it("zhoduje sa s bicZIban a nazovBanky pre každý kód SK aj CZ", () => {
    for (const krajina of ["SK", "CZ"]) {
      for (let n = 0; n < 10000; n++) {
        const kod = String(n).padStart(4, "0");
        const iban = `${krajina}00${kod}0000000000000000`;
        const r = sql.get(`${krajina}${kod}`);
        expect([kod, r?.swift ?? null]).toEqual([kod, bicZIban(iban)]);
        expect([kod, r?.nazov ?? null]).toEqual([kod, nazovBanky(iban)]);
      }
    }
  });
});
