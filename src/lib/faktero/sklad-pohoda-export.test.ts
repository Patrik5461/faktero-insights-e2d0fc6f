/*
  Sklad do Pohody — audit exportov 14. 11. 2026 (V16, S15).
  Výsledné XML sa overuje proti schémam Stormware (e2e/schemy/pohoda).
*/
import { describe, expect, it } from "vitest";
import { buildPohodaMovementsXml, buildPohodaStockXml, zoskupPohyby } from "./export.server";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

const firma: any = { id: "c1", ico: "36123456", country: "SK" };
const karta = "88888888-8888-8888-8888-888888888888";
const zasoba = {
  id: karta,
  updated_at: "2026-11-01T07:00:00.000Z",
  nazov: "Skrutka M8",
  sku: "SKR-M8",
  unit: "ks",
  vat_rate: 23,
  purchase_price: 0.12,
  sale_price: 0.29,
};
const pohyb = (o: Record<string, unknown>) => ({
  stock_item_id: karta,
  nazov: "Skrutka M8",
  sku: "SKR-M8",
  unit: "ks",
  vat_rate: 23,
  ...o,
});

describe("V16: skladová karta s cenovou skupinou", () => {
  it("karta nesie stk:typePrice za členením skladu a XML prejde schémou", async () => {
    const xml = buildPohodaStockXml({
      company: firma,
      zasoby: [zasoba],
      nastavenia: { sklad: "TOVAR", cenovaSkupina: "Predaj" } as any,
    });
    expect(xml).toContain(
      "<stk:storage><typ:ids>TOVAR</typ:ids></stk:storage>\n        <stk:typePrice><typ:ids>Predaj</typ:ids></stk:typePrice>",
    );
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("bez cenovej skupiny sa neposiela karta ani pohyb (Pohoda by kartu odmietla)", () => {
    const nastavenia = { sklad: "TOVAR" } as any;
    expect(buildPohodaStockXml({ company: firma, zasoby: [zasoba], nastavenia })).not.toContain("stk:stock ");
    const pohyby = buildPohodaMovementsXml({
      company: firma,
      skupiny: zoskupPohyby([pohyb({ id: "a", type: "prijem", quantity: 1, created_at: "2026-11-01T08:00:00Z" })]),
      nastavenia,
    });
    expect(pohyby).not.toContain("pri:prijemka");
  });
});

describe("S15: skladové pohyby", () => {
  const nastavenia = { sklad: "TOVAR", cenovaSkupina: "Predaj" } as any;

  it("deň pohybu je bratislavský, nie UTC (1. 11. o 00:30 nie je 31. 10.)", async () => {
    const skupiny = zoskupPohyby([
      pohyb({ id: "a", type: "vydaj", quantity: -2, unit_price: 0.29, created_at: "2026-10-31T23:30:00Z" }),
      pohyb({ id: "b", type: "prijem", quantity: 5, unit_price: 0.1, created_at: "2026-07-31T22:30:00Z" }),
    ]);
    expect(skupiny.map((s) => s.datum)).toEqual(["2026-11-01", "2026-08-01"]);
    const xml = buildPohodaMovementsXml({ company: firma, skupiny, nastavenia });
    expect(xml).toContain("<vyd:date>2026-11-01</vyd:date>");
    expect(xml).toContain("<pri:date>2026-08-01</pri:date>");
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("príjemka ide v obstarávacej cene s vedľajšími nákladmi (unit_cost)", async () => {
    // 10 ks × 1,00 € + doprava 2,00 € → obstarávacia cena 1,20 €/ks.
    const xml = buildPohodaMovementsXml({
      company: firma,
      skupiny: zoskupPohyby([
        pohyb({ id: "a", type: "prijem", quantity: 10, unit_price: 1, unit_cost: 1.2, side_costs_total: 2, created_at: "2026-11-02T08:00:00Z" }),
      ]),
      nastavenia,
    });
    expect(xml).toContain("<typ:unitPrice>1.20</typ:unitPrice>");
    expect(await chybaXsd(xml)).toBeNull();
  });
});
