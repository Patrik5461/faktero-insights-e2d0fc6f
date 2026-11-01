import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  hlaskaZamkuFaktury,
  NAZVY_PROGRAMOV_EXPORTU,
  nazovProgramuExportu,
  predvoleneOznacit,
  predvolenyMesiacOdovzdania,
  predvolenyZaciatokExportu,
  PROGRAM_FORMATU,
  sumyOdovzdania,
  uctovnyProgramFirmy,
  uzOdovzdanaRiadok,
} from "./odovzdanie-exportu";
import { HLASKA_ZAMKU_FAKTURY } from "./pohoda-zamok";
import { PROGRAMY_UCTOVANIA } from "./uctovanie-programy";

const adresar = new URL("../../../supabase/migrations/", import.meta.url);
const migracia = (vzor: RegExp) => {
  const f = readdirSync(adresar).find((x) => vzor.test(x));
  return f ? readFileSync(new URL(f, adresar), "utf8") : "";
};

describe("Označiť ako odovzdané — predvolený stav", () => {
  it("zapnuté len pre formát účtovného programu firmy", () => {
    expect(predvoleneOznacit("pohoda_xml", "pohoda")).toBe(true);
    expect(predvoleneOznacit("money_s3_xml", "money_s3")).toBe(true);
    expect(predvoleneOznacit("omega_txt", "omega")).toBe(true);
    expect(predvoleneOznacit("flexi_xml", "flexi")).toBe(true);
    expect(predvoleneOznacit("mrp_xml", "mrp")).toBe(true);
    // Iný program, než firma vedie.
    expect(predvoleneOznacit("money_s3_xml", "pohoda")).toBe(false);
    expect(predvoleneOznacit("pohoda_xml", "money_s3")).toBe(false);
  });

  it("ISDOC, CSV a BIS sú predvolene vypnuté pre každú firmu", () => {
    for (const p of ["pohoda", "money_s3", "csv", "omega", null])
      for (const f of ["isdoc_zip", "csv_univerzal", "bis_zip"] as const)
        expect(predvoleneOznacit(f, p)).toBe(false);
  });

  it("firma bez nastaveného programu = Pohoda", () => {
    expect(predvoleneOznacit("pohoda_xml", null)).toBe(true);
    expect(predvoleneOznacit("money_s3_xml", undefined)).toBe(false);
  });

  it("program formátu je skutočný účtovný program z uctovanie-programy", () => {
    const programy = PROGRAMY_UCTOVANIA.map((p) => p.program as string);
    for (const p of Object.values(PROGRAM_FORMATU)) if (p) expect(programy).toContain(p);
  });
});

describe("hláška zámku podľa programu", () => {
  it("Pohoda a neznámy formát ostávajú pri pôvodnej hláške", () => {
    expect(hlaskaZamkuFaktury("pohoda_xml")).toBe(HLASKA_ZAMKU_FAKTURY);
    expect(hlaskaZamkuFaktury(null)).toBe(HLASKA_ZAMKU_FAKTURY);
  });

  it("iný program Pohodu nespomína", () => {
    const h = hlaskaZamkuFaktury("money_s3_xml");
    expect(h).toContain("(Money S3)");
    expect(h).not.toMatch(/Pohod/);
    expect(uzOdovzdanaRiadok("2026001", "flexi_uct")).toContain("ABRA Flexi");
    expect(uzOdovzdanaRiadok("2026001", "flexi_uct")).not.toMatch(/Pohod/);
  });

  it("každý formát programu z uctovanie-programy má meno (okrem Pohody)", () => {
    for (const p of PROGRAMY_UCTOVANIA)
      if (p.program !== "pohoda") expect(nazovProgramuExportu(p.format)).toBeTruthy();
  });

  it("spúšťač v migrácii skladá tie isté texty a mená ako TS", () => {
    const sql = migracia(/_hlaska_zamku_podla_programu\.sql$/);
    expect(sql).toBeTruthy();
    expect(sql).toContain(`'${HLASKA_ZAMKU_FAKTURY}'`);
    const sablona = hlaskaZamkuFaktury("isdoc_zip").split("(ISDOC)");
    expect(sql).toContain(`'${sablona[0]}(' || _nazov || ')${sablona[1]}'`);
    // Každá dvojica formát → názov zo SQL sa musí zhodovať s TS.
    const dvojice = [...sql.matchAll(/when '([a-z0-9_]+)' then '([^']+)'/g)];
    expect(dvojice.length).toBeGreaterThan(8);
    for (const [, f, n] of dvojice) expect(nazovProgramuExportu(f)).toBe(n);
    for (const n of NAZVY_PROGRAMOV_EXPORTU) expect(sql).toContain(`'${n}'`);
  });
});

describe("uplatni_pravidla_uctovania bez cudzích faktúr", () => {
  it("vetva prijatých faktúr vynecháva odberatel_nesedi", () => {
    const sql = migracia(/_pravidla_bez_cudzich_faktur\.sql$/);
    const prijate = sql.slice(sql.indexOf("update public.purchase_invoices"));
    expect(prijate.slice(0, prijate.indexOf("get diagnostics"))).toContain(
      "p.odberatel_nesedi is null",
    );
    // Podpis aj návratový typ ostávajú — starý kód volá tú istú RPC.
    expect(sql).toMatch(/uplatni_pravidla_uctovania\(_company uuid\)\s+returns integer/);
  });
});

const zdroj = (cesta: string) => readFileSync(new URL(cesta, import.meta.url), "utf8");

describe("E-15 — účtovný program firmy (pohoda + DE → DATEV)", () => {
  it("nemecká firma s predvolenou Pohodou dostane DATEV", () => {
    expect(uctovnyProgramFirmy("pohoda", "DE")).toBe("datev");
    expect(uctovnyProgramFirmy(null, "Deutschland")).toBe("datev");
    expect(uctovnyProgramFirmy("money_s3", "DE")).toBe("money_s3");
    expect(uctovnyProgramFirmy("pohoda", "SK")).toBe("pohoda");
    expect(uctovnyProgramFirmy(null, "CZ")).toBe("pohoda");
  });
  it("DE firma má pri Pohoda XML predvolene nezaškrtnuté „Označiť ako odovzdané“", () => {
    expect(predvoleneOznacit("pohoda_xml", uctovnyProgramFirmy("pohoda", "DE"))).toBe(false);
    expect(predvoleneOznacit("pohoda_xml", uctovnyProgramFirmy("pohoda", "SK"))).toBe(true);
  });
  it("server aj stránka Exporty používajú tú istú funkciu", () => {
    expect(zdroj("./uctovanie-export.functions.ts")).toMatch(/uctovnyProgramFirmy\(/);
    expect(zdroj("../../routes/_authenticated/exporty.tsx")).toMatch(/uctovnyProgramFirmy\(/);
  });
});

describe("E-01/E-02 — súčet Odovzdať za mesiac", () => {
  it("meny sa nesčítavajú, domáca je prvá", () => {
    expect(
      sumyOdovzdania(
        [
          { type: "regular", total: 100, currency: "EUR" },
          { type: "regular", total: 2400, currency: "CZK" },
          { type: "regular", total: 50.5, currency: "EUR" },
        ],
        "CZK",
      ),
    ).toEqual([
      { mena: "CZK", suma: 2400 },
      { mena: "EUR", suma: 150.5 },
    ]);
  });
  it("zálohová faktúra a doklad k platbe nejdú do sumy, dobropis odpočítava", () => {
    expect(
      sumyOdovzdania([
        { type: "regular", total: 1000, currency: "EUR" },
        { type: "proforma", total: 500, currency: "EUR" },
        { type: "advance_payment", total: 300, currency: "EUR" },
        { type: "credit_note", total: -200, currency: "EUR" },
        { type: "credit_note", total: 50, currency: "EUR" },
        { type: "debit_note", total: 25, currency: "EUR" },
        { type: null, total: 10, currency: null },
      ]),
    ).toEqual([{ mena: "EUR", suma: 785 }]);
  });
  it("prázdny mesiac = prázdny súčet", () => {
    expect(sumyOdovzdania([])).toEqual([]);
  });
});

describe("E-16/E-17 — predvolené dátumy podľa Bratislavy", () => {
  // 1. 11. 2026 0:30 v Bratislave = 31. 10. 23:30 UTC.
  const poPolnoci = new Date("2026-10-31T23:30:00Z");
  // 15. 7. 2026 poludnie (letný čas).
  const leto = new Date("2026-07-15T10:00:00Z");
  it("„Od“ je 1. deň mesiaca, nie posledný deň predošlého", () => {
    expect(predvolenyZaciatokExportu(0, poPolnoci)).toBe("2026-11-01");
    expect(predvolenyZaciatokExportu(0, leto)).toBe("2026-07-01");
    expect(predvolenyZaciatokExportu(1, poPolnoci)).toBe("2026-10-01");
    expect(predvolenyZaciatokExportu(1, new Date("2026-01-10T10:00:00Z"))).toBe("2025-12-01");
  });
  it("mesiac odovzdania podľa Bratislavy, nie UTC", () => {
    expect(predvolenyMesiacOdovzdania(poPolnoci)).toBe("2026-11");
    expect(predvolenyMesiacOdovzdania(leto)).toBe("2026-07");
  });
  it("Exporty už nepočítajú dátumy cez toISOString", () => {
    const s = zdroj("../../routes/_authenticated/exporty.tsx");
    expect(s).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 7\)/);
    expect(s).not.toMatch(/getMonth\(\)[^\n]*\)\.toISOString\(\)/);
  });
});

describe("E-06 — Zaúčtované doklady do programu stránkujú", () => {
  it("všetky tri agendy idú cez vsetkyRiadky so stabilným poradím", () => {
    const s = zdroj("../../routes/_authenticated/exporty.tsx");
    const cast = s.slice(s.indexOf("async function nacitajRiadky"));
    for (const tabulka of ["invoices", "purchase_invoices", "expense_documents"]) {
      const i = cast.indexOf(`.from("${tabulka}")`);
      expect(i).toBeGreaterThan(-1);
      const dotaz = cast.slice(Math.max(0, i - 200), i + 900);
      expect(dotaz).toMatch(/vsetkyRiadky/);
      expect(dotaz).toMatch(/\.order\("id"\)\s*\.range\(zac, kon\)/);
    }
  });
});
