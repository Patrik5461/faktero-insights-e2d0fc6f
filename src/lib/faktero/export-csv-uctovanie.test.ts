import { describe, expect, it } from "vitest";
import { buildCsvUctovanie } from "./export-csv-uctovanie";
import { prijataNaUctovanie } from "./zauctovanie-export";

describe("zaúčtovaná súpiska CSV", () => {
  it("riadok na riadok zaúčtovania s účtami z číselníka, dobropis so mínusom", () => {
    const f = prijataNaUctovanie(
      {
        id: "1",
        invoice_number: "F;1",
        supplier_name: "Orange",
        pohoda_predkontacia: "1Fp",
        pohoda_clenenie_dph: "PD",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        stredisko: "BA",
      },
      {},
    );
    const d = prijataNaUctovanie(
      { id: "2", invoice_number: "D1", amount_without_vat: -10, vat_amount: -2.3, amount_total: -12.3 },
      { predkontaciaPrijata: "1Fp" },
    );
    const csv = buildCsvUctovanie({
      doklady: [f, d],
      kody: { "1Fp": { kod: "1Fp", popis: "Materiál", ucetMd: "501", ucetD: "321" } },
    });
    const r = csv.trim().split("\r\n");
    expect(r).toHaveLength(3);
    const h = r[0]!.split(";");
    const riadok = (i: number) => Object.fromEntries(r[i]!.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v, j) => [h[j], v]));
    expect(riadok(1)).toMatchObject({
      cislo: '"F;1"',
      zaklad: "100,00",
      dph: "23,00",
      predkontacia: "1Fp",
      ucet_md: "501",
      ucet_d: "321",
      clenenie_dph: "PD",
      stredisko: "BA",
    });
    expect(riadok(2)).toMatchObject({ druh: "dobropis", zaklad: "-10,00", celkom_doklad: "-12,30" });
  });
});
