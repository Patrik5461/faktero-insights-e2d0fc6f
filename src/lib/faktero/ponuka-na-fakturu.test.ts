import { describe, expect, it } from "vitest";
import { hlavickaZPonuky, plusDni, polozkyZPonuky } from "./ponuka-na-fakturu";

const ponuka = {
  company_id: "f",
  customer_id: "c",
  quote_number: "Q20260001",
  currency: "EUR",
  customer_name: "ABC Audit s.r.o.",
  customer_country: "SK",
  subtotal: 270,
  vat_total: 62.1,
  total: 332.1,
  discount_type: "percent",
  discount_value: 10,
  discount_total: 30,
  job_id: "z",
};

describe("faktúra z cenovej ponuky", () => {
  it("má dátum dodania, text nad položkami, rad a zľavu ponuky", () => {
    const h = hlavickaZPonuky(
      ponuka,
      { invoice_number: "NK20260044", sequence_number: 44, series_id: "rad" },
      "2026-10-30",
      "sk",
    );
    expect(h.issue_date).toBe("2026-10-30");
    expect(h.delivery_date).toBe("2026-10-30");
    expect(h.due_date).toBe("2026-11-13");
    expect(h.number_series_id).toBe("rad");
    expect(h.variable_symbol).toBe("20260044");
    expect(h.intro_note).toBe("Fakturujeme Vám podľa cenovej ponuky č. Q20260001");
    expect(h.discount_total).toBe(30);
    expect(h.job_id).toBe("z");
    expect(h.status).toBe("issued");
  });

  it("text nad položkami v jazyku faktúry", () => {
    const h = hlavickaZPonuky(
      ponuka,
      { invoice_number: "1", sequence_number: 1 },
      "2026-10-30",
      "de",
    );
    expect(h.language).toBe("de");
    expect(h.intro_note).toBe("Wir stellen Ihnen in Rechnung gemäß Angebot Nr. Q20260001");
  });

  it("položky nesú percento zľavy", () => {
    const [r] = polozkyZPonuky("inv", [
      {
        position: 0,
        name: "Montáž",
        quantity: 2,
        unit: "ks",
        unit_price: 150,
        discount_percent: 10,
        vat_rate: 23,
        subtotal: 270,
        vat_amount: 62.1,
        total: 332.1,
      },
    ]);
    expect(r.discount_percent).toBe(10);
    expect(r.invoice_id).toBe("inv");
  });

  it("splatnosť cez koniec mesiaca bez posunu pásma", () => {
    expect(plusDni("2026-10-25", 14)).toBe("2026-11-08");
    expect(plusDni("2026-03-20", 14)).toBe("2026-04-03");
  });
});
