/**
 * Dobropis s kladnými sumami: v databáze ostáva záporný, človek ho vidí a
 * zadáva kladne. Testy strážia obe strany — že sa zobrazuje bez mínusu a že
 * formulár uloží presne to isté ako predtým.
 */
import { describe, it, expect } from "vitest";
import {
  dokladNaZobrazenie,
  jeDobropisNaZobrazenie,
  polozkaNaZobrazenie,
  riadkyNaZapis,
  sumaFormulara,
  sumaNaZobrazenie,
  znamienkoFormulara,
  znamienkoZobrazenia,
} from "./dobropis-zobrazenie";
import {
  riadokNaZapis,
  sumyFormulara,
  sumyNaZapis,
  type RiadokFormulara,
} from "./faktura-formular-sumy";
import { hodnotyMailu } from "./email-jazyk";
import { generateInvoicePdfBytes } from "./pdf-generator.server";
import { znamienkoDokladu } from "./faktury-sumy";

describe("sumaNaZobrazenie", () => {
  it("záporný dobropis ukáže kladne, ostatné doklady nemení", () => {
    expect(sumaNaZobrazenie({ type: "credit_note", total: -123 }, -123)).toBe(123);
    expect(sumaNaZobrazenie({ type: "credit_note", total: -123 }, -23)).toBe(23);
    expect(sumaNaZobrazenie({ type: "regular", total: 123 }, 123)).toBe(123);
    expect(sumaNaZobrazenie({ type: "debit_note", total: 50 }, 50)).toBe(50);
    // Faktúra so zápornou sumou (oprava) ostáva záporná — Patrik chcel dobropisy.
    expect(sumaNaZobrazenie({ type: "regular", total: -10 }, -10)).toBe(-10);
  });

  it("starší kladne uložený dobropis sa neotáča", () => {
    expect(sumaNaZobrazenie({ type: "credit_note", total: 123 }, 123)).toBe(123);
  });

  it("§ 25a si znamienko nechá — býva záporný aj kladný", () => {
    expect(sumaNaZobrazenie({ type: "credit_note", total: -50, oprava_25a: true }, -50)).toBe(-50);
    expect(sumaNaZobrazenie({ type: "credit_note", total: 50, oprava_25a: true }, 50)).toBe(50);
    expect(jeDobropisNaZobrazenie({ type: "credit_note", oprava_25a: true })).toBe(false);
  });

  it("nula nie je „−0“", () => {
    expect(Object.is(sumaNaZobrazenie({ type: "credit_note", total: -5 }, 0), 0)).toBe(true);
    expect(Object.is(sumaFormulara(0, -1), 0)).toBe(true);
  });

  it("súčty so znamienkom (znamienkoDokladu) sa nemenia", () => {
    expect(znamienkoDokladu("credit_note", -123)).toBe(1);
    expect(znamienkoZobrazenia({ type: "credit_note", total: -123 })).toBe(-1);
  });
});

describe("dokladNaZobrazenie a polozkaNaZobrazenie", () => {
  const dobropis = {
    type: "credit_note",
    subtotal: -100,
    vat_total: -23,
    total: -123,
    total_eur: -123,
    vat_total_eur: null,
  };

  it("hlavičku otočí na kópii, originál ostane záporný", () => {
    const z = dokladNaZobrazenie(dobropis);
    expect(z).toMatchObject({
      subtotal: 100,
      vat_total: 23,
      total: 123,
      total_eur: 123,
      vat_total_eur: null,
    });
    expect(dobropis.total).toBe(-123);
  });

  it("riadok: mínus sa berie z množstva, alebo z ceny pri staršom ručnom zadaní", () => {
    expect(
      polozkaNaZobrazenie(dobropis, {
        quantity: -2,
        unit_price: 50,
        subtotal: -100,
        vat_amount: -23,
        total: -123,
      }),
    ).toEqual({ quantity: 2, unit_price: 50, subtotal: 100, vat_amount: 23, total: 123 });
    expect(
      polozkaNaZobrazenie(dobropis, {
        quantity: 1,
        unit_price: -100,
        subtotal: -100,
        vat_amount: -23,
        total: -123,
      }),
    ).toEqual({ quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23, total: 123 });
  });

  it("kladný riadok v dobropise (poplatok) po otočení ukáže mínus", () => {
    expect(polozkaNaZobrazenie(dobropis, { quantity: 1, unit_price: 5, total: 5 })).toEqual({
      quantity: -1,
      unit_price: 5,
      total: -5,
    });
  });

  it("faktúru nechá tak, ako je", () => {
    const f = { type: "regular", total: 10 };
    expect(dokladNaZobrazenie(f)).toBe(f);
    const r = { quantity: 1, unit_price: 10, total: 10 };
    expect(polozkaNaZobrazenie(f, r)).toBe(r);
  });
});

/*
  Formulár: predtým dostal dobropis z detailu faktúry položky so záporným
  množstvom (`quantity: -Math.abs(q)`) a súčty sa počítali priamo z nich.
  Toto je ten výpočet doslovne, ako bol vo `faktury.nova.tsx`.
*/
function staryZapis(
  riadky: RiadokFormulara[],
  mode: "per_item" | "per_document" | "retail",
  rc = false,
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let sub = 0,
    vat = 0;
  for (const it of riadky) {
    let s =
      Number(it.quantity) *
      Number(it.unit_price) *
      (1 - Math.min(Math.max(Number(it.discount_percent ?? 0), 0), 100) / 100);
    let v = rc || it.prenesenie ? 0 : s * (Number(it.vat_rate) / 100);
    if (mode === "per_item") {
      s = r2(s);
      v = r2(v);
    }
    sub += s;
    vat += v;
  }
  let total = sub + vat;
  if (mode === "per_document") {
    sub = r2(sub);
    vat = r2(vat);
    total = r2(sub + vat);
  }
  if (mode === "retail") {
    sub = r2(sub);
    vat = r2(vat);
    total = Math.round((sub + vat) * 20) / 20;
  }
  const hlavicka = {
    subtotal: Number(sub.toFixed(2)),
    vat_total: Number(vat.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
  const polozky = riadky.map((it) => {
    const s =
      Number(it.quantity) *
      Number(it.unit_price) *
      (1 - Math.min(Math.max(Number(it.discount_percent ?? 0), 0), 100) / 100);
    const effRate = rc || it.prenesenie ? 0 : Number(it.vat_rate);
    const v = s * (effRate / 100);
    return {
      quantity: it.quantity,
      unit_price: it.unit_price,
      vat_rate: effRate,
      subtotal: Number(s.toFixed(2)),
      vat_amount: Number(v.toFixed(2)),
      total: Number((s + v).toFixed(2)),
    };
  });
  return { hlavicka, polozky };
}

/** Nový formulár: človek zadá kladne, pri zápise sa množstvo otočí. */
function novyZapis(
  zadane: RiadokFormulara[],
  mode: "per_item" | "per_document" | "retail",
  rc = false,
) {
  const zn = znamienkoFormulara("credit_note");
  const naZapis = riadkyNaZapis(zadane, zn);
  const s = sumyFormulara(naZapis, {
    rounding_mode: mode,
    reverse_charge: rc,
    discount_type: "",
    discount_value: 0,
  });
  return {
    hlavicka: sumyNaZapis(s),
    polozky: naZapis.map((it) => {
      const { discount_percent: _d, ...r } = riadokNaZapis(it, rc);
      return r;
    }),
    zobrazene: sumaFormulara(s.total, zn),
  };
}

const zaporne = (rs: RiadokFormulara[]) =>
  rs.map((r) => ({ ...r, quantity: -Math.abs(r.quantity) }));

describe("formulár dobropisu uloží to isté ako predtým", () => {
  it("dobropis na 1 položku 100 € + 23 %", () => {
    const zadane = [{ quantity: 1, unit_price: 100, vat_rate: 23 }];
    const novy = novyZapis(zadane, "per_document");
    expect(novy.hlavicka).toEqual({ subtotal: -100, vat_total: -23, total: -123 });
    expect(novy.polozky).toEqual([
      { quantity: -1, unit_price: 100, vat_rate: 23, subtotal: -100, vat_amount: -23, total: -123 },
    ]);
    expect(novy).toMatchObject(staryZapis(zaporne(zadane), "per_document"));
    // Vo formulári to človek vidí kladne.
    expect(novy.zobrazene).toBe(123);
  });

  it("čiastočný dobropis — vybrané položky, polovice centov, všetky spôsoby zaokrúhlenia", () => {
    const zadane: RiadokFormulara[] = [
      { quantity: 3, unit_price: 12.345, vat_rate: 23 },
      { quantity: 1.5, unit_price: 0.33, vat_rate: 19, discount_percent: 10 },
      { quantity: 2, unit_price: 49.99, vat_rate: 5 },
      { quantity: 1, unit_price: 80, vat_rate: 23, prenesenie: true },
    ];
    for (const mode of ["per_item", "per_document", "retail"] as const) {
      for (const rc of [false, true]) {
        const novy = novyZapis(zadane, mode, rc);
        expect(novy).toMatchObject(staryZapis(zaporne(zadane), mode, rc));
        expect(novy.hlavicka.total).toBeLessThan(0);
        expect(novy.zobrazene).toBe(-novy.hlavicka.total || 0);
      }
    }
  });

  it("úprava: záporný dobropis sa načíta kladne a uloží späť rovnako", () => {
    const ulozeny = { type: "credit_note", total: -123 };
    const zn = znamienkoFormulara(ulozeny.type, ulozeny);
    const vDb = [{ quantity: -1, unit_price: 100, vat_rate: 23 }];
    const voFormulari = riadkyNaZapis(vDb, zn);
    expect(voFormulari[0].quantity).toBe(1);
    expect(riadkyNaZapis(voFormulari, zn)).toEqual(vDb);
  });

  it("úprava: starší kladný dobropis, § 25a a faktúra sa neotáčajú", () => {
    expect(znamienkoFormulara("credit_note", { type: "credit_note", total: 50 })).toBe(1);
    expect(
      znamienkoFormulara("credit_note", { type: "credit_note", total: -50, oprava_25a: true }),
    ).toBe(1);
    expect(znamienkoFormulara("regular")).toBe(1);
    expect(znamienkoFormulara("debit_note")).toBe(1);
  });
});

describe("e-mail s dobropisom", () => {
  it("{total} bez mínusu", () => {
    const h = hodnotyMailu({ type: "credit_note", total: -123, currency: "EUR" }, "sk");
    expect(h.total).not.toMatch(/[-−]/);
    expect(h.total).toMatch(/123/);
    expect(hodnotyMailu({ type: "regular", total: 99, currency: "EUR" }, "sk").total).toMatch(/99/);
  });
});

async function textPdf(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((x: any) => x.str).join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ");
}

describe("PDF dobropisu", () => {
  const firma = {
    name: "Test s.r.o.",
    country: "SK",
    street: "Hlavná 1",
    city: "Bratislava",
    zip: "81101",
    ico: "12345678",
    dic: "2020123456",
    ic_dph: "SK2020123456",
    iban: "SK3112000000198742637541",
    vat_payer: true,
  };
  const dobropis = {
    invoice_number: "DB-2026-1",
    type: "credit_note",
    status: "issued",
    issue_date: "2026-10-21",
    delivery_date: "2026-10-21",
    due_date: "2026-11-04",
    currency: "EUR",
    variable_symbol: "20261",
    subtotal: -150,
    vat_total: -32.5,
    total: -182.5,
    customer_name: "Odberateľ a.s.",
    customer_country: "SK",
    opravuje_cislo: "FA-2026-7",
  };
  const polozky = [
    {
      name: "Vrátený tovar",
      quantity: -2,
      unit: "ks",
      unit_price: 50,
      vat_rate: 23,
      subtotal: -100,
      vat_amount: -23,
      total: -123,
    },
    {
      name: "Doprava",
      quantity: -1,
      unit: "ks",
      unit_price: 50,
      vat_rate: 19,
      subtotal: -50,
      vat_amount: -9.5,
      total: -59.5,
    },
  ];

  it("sumy bez mínusu, „CELKOM“ namiesto „K úhrade“, bez QR, s odkazom na faktúru", async () => {
    const vstupFaktura = structuredClone(dobropis);
    const vstupPolozky = structuredClone(polozky);
    const t = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: vstupFaktura,
        items: vstupPolozky,
      } as any),
    );
    expect(t).toContain("DOBROPIS");
    expect(t).toContain("FA-2026-7");
    expect(t).toMatch(/182,50/);
    expect(t).toMatch(/123,00/);
    expect(t).toMatch(/32,50/);
    // Žiadna suma ani množstvo s mínusom.
    expect(t).not.toMatch(/(^|\s)[-−]\s?\d/);
    expect(t).not.toContain("SPOLU K ÚHRADE");
    expect(t).toContain("CELKOM");
    expect(t).not.toMatch(/QR platba/i);
    // Vstup (z neho sa potom skladá ZUGFeRD) ostal so znamienkami.
    expect(vstupFaktura).toEqual(dobropis);
    expect(vstupPolozky).toEqual(polozky);
  });

  it("faktúra sa kreslí ako predtým (K úhrade aj QR)", async () => {
    const t = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: {
          ...dobropis,
          type: "regular",
          subtotal: 150,
          vat_total: 32.5,
          total: 182.5,
          opravuje_cislo: null,
        },
        items: polozky.map((p) => ({
          ...p,
          quantity: -p.quantity,
          subtotal: -p.subtotal,
          vat_amount: -p.vat_amount,
          total: -p.total,
        })),
      } as any),
    );
    expect(t).toContain("SPOLU K ÚHRADE");
    expect(t).toMatch(/182,50/);
  });
});
