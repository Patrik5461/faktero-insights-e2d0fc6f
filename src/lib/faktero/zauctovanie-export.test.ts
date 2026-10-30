import { describe, expect, it } from "vitest";
import {
  blocekNaUctovanie,
  datumPoUzavierke,
  prekazkaZaokruhlenia,
  prijataNaUctovanie,
  rozdelUcet,
  vystavenaNaUctovanie,
} from "./zauctovanie-export";

const nast = {
  predkontacia: "3Fv",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  predkontaciaDoklady: "1Pv",
  clenenieDph: "UD",
  pomeryPredkontacii: {
    AUTO: {
      typ: "dph5050",
      zaklad: 100,
      zdanitelna: "AUTO1",
      lenZaklad: "AUTO2",
      nezdanitelna: "AUTO3",
    },
  },
  podlaKategorie: { fuel: { predkontacia: "PHM" } },
  blockyPodlaPlatby: true,
  zamknuteDo: "2026-08-31",
};

describe("doklady na zaúčtovanie", () => {
  it("bloček: kód podľa kategórie, forma podľa platby, uzávierka", () => {
    const d = blocekNaUctovanie(
      {
        id: "b1",
        category: "fuel",
        payment_method: "hotovost",
        issue_date: "2026-08-20",
        total_amount: 123,
        vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
      },
      nast,
    );
    expect(d.predkontacia).toBe("PHM");
    expect(d.clenenie).toBe("PD");
    expect(d.forma).toBe("pokladna");
    expect(d.datumZauctovania).toBe("2026-09-01");
    expect(d.riadky).toEqual([
      {
        sadzba: 23,
        zaklad: 100,
        dph: 23,
        predkontacia: "PHM",
        clenenie: "PD",
        kv: null,
        odpocet: true,
        text: null,
      },
    ]);
  });

  it("prijatá: pomer 50 % DPH rozdelí riadky s odpočtom a bez neho", () => {
    const d = prijataNaUctovanie(
      {
        id: "p1",
        invoice_number: "F1",
        pohoda_predkontacia: "AUTO",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
      },
      nast,
    );
    expect(d.rozuctovany).toBe(true);
    expect(d.riadky.map((r) => [r.predkontacia, r.zaklad, r.dph, r.odpocet])).toEqual([
      ["AUTO1", 50, 11.5, true],
      ["AUTO2", 50, 11.5, false],
    ]);
    expect(d.zaklad + d.dph).toBe(123);
  });

  it("prijatý dobropis má kladné sumy a druh dobropis", () => {
    const d = prijataNaUctovanie(
      {
        id: "p2",
        invoice_number: "D1",
        amount_without_vat: -10,
        vat_amount: -2.3,
        amount_total: -12.3,
      },
      nast,
    );
    expect(d.druh).toBe("dobropis");
    expect(d.celkom).toBe(12.3);
    expect(d.riadky[0]!.zaklad).toBe(10);
  });

  it("vystavená: kódy po položkách sa zlúčia po sadzbe a kóde", () => {
    const d = vystavenaNaUctovanie(
      {
        id: "v1",
        type: "regular",
        invoice_number: "2026001",
        issue_date: "2026-10-01",
        total: 246,
      },
      [
        { name: "A", subtotal: 100, vat_amount: 23, vat_rate: 23 },
        { name: "B", subtotal: 100, vat_amount: 23, vat_rate: 23, pohoda_predkontacia: "3Fs" },
      ],
      nast,
    );
    expect(d.riadky.map((r) => [r.predkontacia, r.clenenie, r.zaklad])).toEqual([
      ["3Fv", "UD", 100],
      ["3Fs", "UD", 100],
    ]);
    expect(d.rozuctovany).toBe(true);
    expect(d.datumZauctovania).toBeNull();
  });

  it("pomôcky", () => {
    expect(rozdelUcet("501100")).toEqual({ synteticky: "501", analyticky: "100" });
    expect(rozdelUcet("343.200")).toEqual({ synteticky: "343", analyticky: "200" });
    expect(rozdelUcet("321")).toEqual({ synteticky: "321", analyticky: "" });
    expect(rozdelUcet("x")).toBeNull();
    expect(datumPoUzavierke("2026-10-02", "2026-09-30")).toBeNull();
  });
});

describe("znamienka riadkov — zľava a odpočet zálohy sa neotáčajú", () => {
  it("vystavená s riadkom „Sleva“ ho odpočíta", () => {
    const d = vystavenaNaUctovanie(
      { id: "v-sleva", type: "regular", invoice_number: "26810240", total: 110.7 },
      [
        { name: "Tlač", subtotal: 100, vat_amount: 23, vat_rate: 23, quantity: 1, unit_price: 100 },
        {
          name: "Sleva",
          subtotal: -10,
          vat_amount: -2.3,
          vat_rate: 23,
          quantity: 1,
          unit_price: -10,
        },
      ],
      nast,
    );
    expect(d.zaklad).toBe(90);
    expect(d.dph).toBe(20.7);
    expect(d.zaokruhlenie).toBe(0);
    expect(d.polozky[1]).toMatchObject({ zaklad: -10, dph: -2.3, cena: -10, mnozstvo: 1 });
  });

  it("záporne uložený dobropis so zľavou: celok kladne, zľava ostane záporná", () => {
    const d = vystavenaNaUctovanie(
      { id: "v-dob", type: "credit_note", invoice_number: "D1", total: -110.7 },
      [
        {
          name: "Vrátenie",
          subtotal: -100,
          vat_amount: -23,
          vat_rate: 23,
          quantity: -1,
          unit_price: 100,
        },
        {
          name: "Sleva",
          subtotal: 10,
          vat_amount: 2.3,
          vat_rate: 23,
          quantity: 1,
          unit_price: -10,
        },
      ],
      nast,
    );
    expect(d.druh).toBe("dobropis");
    expect(d.zaklad).toBe(90);
    expect(d.celkom).toBe(110.7);
    expect(d.zaokruhlenie).toBe(0);
    expect(d.polozky.map((p) => p.zaklad)).toEqual([100, -10]);
  });

  it("prijatý dobropis so zápornými sumami ide kladne aj s položkami", () => {
    const d = prijataNaUctovanie(
      {
        id: "p-dob",
        invoice_number: "DP1",
        amount_total: -123,
        amount_without_vat: -100,
        vat_amount: -23,
        items: [{ name: "Vrátenie", total: -123, quantity: 1, vat_rate: 23 }],
      },
      nast,
    );
    expect(d.druh).toBe("dobropis");
    expect([d.zaklad, d.dph, d.celkom, d.zaokruhlenie]).toEqual([100, 23, 123, 0]);
    expect(d.polozky).toMatchObject([{ zaklad: 100, dph: 23 }]);
  });

  it("doklad s rozdielom nad 1 € sa nevyvezie, halierové zaokrúhlenie áno", () => {
    const zle = prijataNaUctovanie(
      {
        id: "p-zle",
        invoice_number: "X1",
        amount_total: 150,
        amount_without_vat: 100,
        vat_amount: 23,
      },
      nast,
    );
    expect(zle.zaokruhlenie).toBe(27);
    expect(prekazkaZaokruhlenia(zle)).toMatch(/^X1 — súčet riadkov/);
    const ok = prijataNaUctovanie(
      {
        id: "p-ok",
        invoice_number: "X2",
        amount_total: 123.01,
        amount_without_vat: 100,
        vat_amount: 23,
      },
      nast,
    );
    expect(prekazkaZaokruhlenia(ok)).toBeNull();
  });
});
