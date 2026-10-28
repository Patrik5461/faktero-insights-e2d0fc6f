/* Zaokrúhlenie ako položka — predkontácia, členenie DPH a KV podľa znamienka rozdielu. */
import { describe, expect, it } from "vitest";
import { polozkyDokladov } from "./export.server";

const company: any = {
  name: "Firma s.r.o.",
  ico: "12345678",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  vat_payer: true,
  country: "SK",
};
const doklad = (celkom: number): any => ({
  id: "d1",
  company_id: "c1",
  supplier_name: "Kaufland",
  supplier_ico: "35790164",
  document_number: "B-1",
  issue_date: "2026-10-10",
  currency: "EUR",
  payment_method: "karta",
  total_amount: celkom,
  net_amount: 10,
  vat_amount: 2.3,
  vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
  items: [{ name: "Tovar", quantity: 1, unit_price: 12.3, vat_rate: 23, total: 12.3 }],
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
});
const nastavenia: any = {
  polozkyBlockov: true,
  predkontaciaZaokruhlenie: "ZAOK",
  zaokruhlenieFirmy: {
    pohoda_predkontacia_zaokruhlenie_plus: "548100",
    pohoda_predkontacia_zaokruhlenie_minus: "648100",
    pohoda_clenenie_dph_zaokruhlenie_plus: "PN",
    kv_clenenie_zaokruhlenie_plus: "KN",
  },
};
const polozkaZaokruhlenia = (xml: string) => {
  const i = xml.indexOf("Zaokrúhlenie</");
  return i < 0 ? "" : xml.slice(i, xml.indexOf("Item>", i));
};

describe("zaokrúhlenie do Pohody", () => {
  it("kladný rozdiel → kladná predkontácia, členenie aj KV", () => {
    const p = polozkaZaokruhlenia(
      polozkyDokladov({ company, doklady: [doklad(12.31)], nastavenia }),
    );
    expect(p).toContain("<typ:ids>548100</typ:ids>");
    expect(p).toContain("classificationVAT><typ:ids>PN</typ:ids>");
    expect(p).toContain("classificationKVDPH><typ:ids>KN</typ:ids>");
  });
  it("záporný rozdiel → záporná predkontácia", () => {
    const p = polozkaZaokruhlenia(
      polozkyDokladov({ company, doklady: [doklad(12.29)], nastavenia }),
    );
    expect(p).toContain("<typ:ids>648100</typ:ids>");
    expect(p).not.toContain("classificationVAT");
  });
  it("bez kladnej/zápornej platí spoločná", () => {
    const p = polozkaZaokruhlenia(
      polozkyDokladov({
        company,
        doklady: [doklad(12.31)],
        nastavenia: { ...nastavenia, zaokruhlenieFirmy: null },
      }),
    );
    expect(p).toContain("<typ:ids>ZAOK</typ:ids>");
  });
});
