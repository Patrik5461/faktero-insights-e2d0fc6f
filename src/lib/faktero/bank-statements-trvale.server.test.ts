import { describe, expect, it } from "vitest";
import { jeTrvalaChyba } from "./bank-statements.server";

/**
 * Rozhodnutie, či sa o výpis oplatí pýtať znova.
 *
 * Účet MaxiTicketu vracal `403 NO_ACCOUNT` a pretože to bolo vedené ako bežné
 * zlyhanie, nočný beh ho skúšal každý deň znova — dvakrát denne 403 do
 * chybového logu. Tu sa rozhoduje, čo je trvalé; ak sa to pokazí, buď sa log
 * znova zaplní, alebo (horšie) sa výpis prestane sťahovať pri dočasnom výpadku.
 */
describe("jeTrvalaChyba", () => {
  it("PRODUCT_UNKNOWN je účet mimo Tatra banky", () => {
    expect(jeTrvalaChyba("tb_statement_task_failed: 422 PRODUCT_UNKNOWN")).toBe("mimo-tb");
  });

  it("NO_ACCOUNT znamená, že banka účet nepozná", () => {
    const skutocna = 'tb_statement_task_failed: 403 {"errorCode": "NO_ACCOUNT"}';
    expect(jeTrvalaChyba(skutocna)).toBe("nepozna");
  });

  it("rozpozná aj slovný popis od banky", () => {
    expect(jeTrvalaChyba('403 {"errorDescription": "Account does not exist"}')).toBe("nepozna");
  });

  it("výpadok ani vypršaný token trvalé nie sú — na tie sa beh vráti", () => {
    expect(jeTrvalaChyba("tb_statement_task_failed: 500 Internal Server Error")).toBeNull();
    expect(jeTrvalaChyba("401 Unauthorized")).toBeNull();
    expect(jeTrvalaChyba("fetch failed")).toBeNull();
    expect(jeTrvalaChyba("")).toBeNull();
  });

  it('samotné slovo „account" na trvalé zlyhanie nestačí', () => {
    // Inak by hociktorá veta o účte navždy zastavila sťahovanie výpisu.
    expect(jeTrvalaChyba("Account is temporarily blocked")).toBeNull();
  });
});
