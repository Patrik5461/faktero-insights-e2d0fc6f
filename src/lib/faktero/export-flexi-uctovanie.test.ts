import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildFlexiUctovanie } from "./export-flexi-uctovanie";
import {
  blocekNaUctovanie,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type NastaveniaUctovania,
} from "./zauctovanie-export";

const nast: NastaveniaUctovania = {
  predkontacia: "PRODEJ",
  predkontaciaPrijata: "NÁKUP MATERIÁLU A",
  clenenieDphPrijata: "40-41",
  clenenieDph: "01-02",
  stredisko: "C",
  blockyPodlaPlatby: true,
  pomeryPredkontacii: {
    AUTO: { typ: "dph5050", zaklad: 100, zdanitelna: "AUTO1", lenZaklad: "AUTO2", nezdanitelna: "AUTO3" },
  },
};
const firma = { default_currency: "EUR" };
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

function postav(doklady: any[], nastavenia = {}) {
  const r = buildFlexiUctovanie({ firma, doklady, kody: {}, nastavenia });
  expect(XMLValidator.validate(r.xml)).toBe(true);
  return { ...r, w: parser.parse(r.xml).winstrom };
}

const prijata = prijataNaUctovanie(
  {
    id: "p1",
    invoice_number: "FV-778",
    variable_symbol: "778",
    supplier_name: "Kancelária & spol.",
    supplier_ico: "36123455",
    supplier_ic_dph: "SK2021234567",
    supplier_iban: "SK3112000000198742637541",
    issue_date: "2026-10-01",
    received_date: "2026-10-03",
    delivery_date: "2026-09-30",
    due_date: "2026-10-15",
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    currency: "EUR",
  },
  nast,
);

describe("ABRA Flexi so zaúčtovaním", () => {
  it("prijatá faktúra: bezpoložková, kódy v hlavičke, číslo dodávateľa v cisDosle", () => {
    const { w, preskocene } = postav([prijata]);
    expect(preskocene).toEqual([]);
    const f = w["faktura-prijata"];
    expect(f.id).toBe("ext:FAKTERO:prijata:p1");
    expect(f.kod).toBeUndefined();
    expect(f.typDokl).toBe("code:FAKTURA");
    expect(f.cisDosle).toBe("FV-778");
    expect(f.datVyst).toBe("2026-10-03");
    expect(f.duzpPuv).toBe("2026-09-30");
    expect(f.bezPolozek).toBe("true");
    expect(f.sumZklZakl).toBe("100.00");
    expect(f.sumDphZakl).toBe("23.00");
    expect(f.sumCelkem).toBe("123.00");
    expect(f.typUcOp).toBe("code:NÁKUP MATERIÁLU A");
    expect(f.clenDph).toBe("code:40-41");
    expect(f.stredisko).toBe("code:C");
    expect(f.nazFirmy).toBe("Kancelária & spol.");
    expect(f.dic).toBe("SK2021234567");
  });

  it("rozúčtovaná faktúra ide s účtovnými položkami, každá s vlastným predpisom", () => {
    const d = prijataNaUctovanie(
      { id: "p2", invoice_number: "A1", pohoda_predkontacia: "AUTO", amount_without_vat: 100, vat_amount: 23, amount_total: 123 },
      nast,
    );
    const { w } = postav([d]);
    const f = w["faktura-prijata"];
    expect(f.bezPolozek).toBe("false");
    const pol = f.polozkyFaktury["faktura-prijata-polozka"];
    expect(pol).toHaveLength(2);
    expect(pol.map((p: any) => p.typUcOp)).toEqual(["code:AUTO1", "code:AUTO2"]);
    expect(pol.every((p: any) => p.typPolozkyK === "typPolozky.ucetni")).toBe(true);
    expect(pol.map((p: any) => p.sumZkl)).toEqual(["50.00", "50.00"]);
    expect(pol[0].typSzbDphK).toBe("typSzbDph.dphZakl");
  });

  it("prijatý dobropis má záporné sumy a vlastný typ, keď je nastavený", () => {
    const d = prijataNaUctovanie(
      { id: "p3", invoice_number: "D1", amount_without_vat: -10, vat_amount: -2.3, amount_total: -12.3 },
      nast,
    );
    const { w } = postav([d], { typDoklDobropisPrijaty: "DOBROPIS PŘ" });
    const f = w["faktura-prijata"];
    expect(f.typDokl).toBe("code:DOBROPIS PŘ");
    expect(f.sumZklZakl).toBe("-10.00");
    expect(f.sumCelkem).toBe("-12.30");
  });

  it("bloček v hotovosti je výdaj z pokladne, bez kódu pokladne sa preskočí", () => {
    const b = blocekNaUctovanie(
      {
        id: "b1",
        document_number: "BL-5",
        supplier_name: "Slovnaft",
        payment_method: "hotovost",
        issue_date: "2026-10-02",
        total_amount: 61.5,
        vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
      },
      nast,
    );
    expect(postav([b]).preskocene[0]).toMatch(/^BL-5 — .*pokladne/);
    const { w } = postav([b], { pokladna: "POKLADNA EUR" });
    const p = w["pokladni-pohyb"];
    expect(p.typPohybuK).toBe("typPohybu.vydej");
    expect(p.pokladna).toBe("code:POKLADNA EUR");
    expect(p.typDokl).toBe("code:STANDARD");
    expect(p.sumCelkem).toBe("61.50");
  });

  it("bloček kartou je interný doklad", () => {
    const b = blocekNaUctovanie(
      { id: "b2", document_number: "K1", payment_method: "karta", issue_date: "2026-10-02", total_amount: 12.3, vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }] },
      nast,
    );
    const { w } = postav([b]);
    expect(w["interni-doklad"].typDokl).toBe("code:INT. DOKLAD");
    expect(w["interni-doklad"].sumZklZakl).toBe("10.00");
  });

  it("vystavená faktúra: interné číslo, VS, dve sadzby v priehradkách", () => {
    const d = vystavenaNaUctovanie(
      { id: "v1", type: "regular", invoice_number: "2026001", issue_date: "2026-10-01", due_date: "2026-10-15", total: 128.5, customer_name: "Odberateľ" },
      [
        { name: "A", subtotal: 100, vat_amount: 23, vat_rate: 23 },
        { name: "B", subtotal: 5, vat_amount: 0.5, vat_rate: 10 },
      ],
      nast,
    );
    const { w } = postav([d]);
    const f = w["faktura-vydana"];
    expect(f.kod).toBe("2026001");
    expect(f.varSym).toBe("2026001");
    expect(f.typDokl).toBe("code:FAKTURA");
    expect(f.sumZklZakl).toBe("100.00");
    expect(f.sumZklSniz).toBe("5.00");
    expect(f.sumDphSniz).toBe("0.50");
    expect(f.typUcOp).toBe("code:PRODEJ");
  });

  it("cudzia mena, záloha a odpočet zálohy sa vynechajú s dôvodom", () => {
    const czk = { ...prijata, id: "x", cislo: "CZK1", mena: "CZK" };
    const zal = { ...prijata, id: "y", cislo: "Z1", druh: "zaloha" as const };
    const odp = { ...prijata, id: "z", cislo: "O1", odpocetZalohy: 50 };
    const { preskocene, xml } = postav([czk, zal, odp]);
    expect(preskocene).toHaveLength(3);
    expect(preskocene[0]).toMatch(/^CZK1 — .*CZK/);
    expect(xml).not.toContain("<faktura-prijata>");
  });
});
