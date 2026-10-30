import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  hlaskaZamkuFaktury,
  NAZVY_PROGRAMOV_EXPORTU,
  nazovProgramuExportu,
  predvoleneOznacit,
  PROGRAM_FORMATU,
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
