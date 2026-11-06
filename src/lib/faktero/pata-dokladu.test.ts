import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString } from "pdf-lib";
import {
  menoVystavitela,
  odkazNaWeb,
  polozkyPaty,
  vlastnyTextPaty,
  webBezProtokolu,
} from "./pata-dokladu";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

describe("pätička dokladu — údaje", () => {
  it("web bez protokolu, odkaz s https", () => {
    expect(webBezProtokolu("https://www.firma.sk/")).toBe("www.firma.sk");
    expect(webBezProtokolu("http://firma.sk")).toBe("firma.sk");
    expect(odkazNaWeb("www.firma.sk")).toBe("https://www.firma.sk");
    expect(odkazNaWeb("http://firma.sk")).toBe("http://firma.sk");
    expect(odkazNaWeb("  ")).toBeUndefined();
  });

  it("prázdne položky sa vynechajú, e-mail je mailto", () => {
    const p = polozkyPaty({ vystavil: "Jana", phone: " ", email: "a@b.sk", website: null });
    expect(p.map((x) => x.popis)).toEqual(["Vystavil", "E-mail"]);
    expect(p[1].odkaz).toBe("mailto:a@b.sk");
  });

  it("popisy v jazyku dokladu", () => {
    const p = polozkyPaty({ vystavil: "A", phone: "1", email: "e@x.de", website: "x.de" }, "de");
    expect(p.map((x) => x.popis)).toEqual(["Ausgestellt von", "Telefon", "E-Mail", "Web"]);
  });

  it("vystavil: meno z profilu, inak firma", () => {
    expect(menoVystavitela({ full_name: " Jana Nová " }, { name: "Firma" })).toBe("Jana Nová");
    expect(menoVystavitela({ full_name: "" }, { name: "Firma" })).toBe("Firma");
    expect(menoVystavitela(null, { name: "Firma" })).toBe("Firma");
  });

  it("pätička z nastavení neopakuje zápis v OR", () => {
    const or = "OR Mestského súdu BA III, oddiel: Sro, vložka č. 1/B";
    expect(vlastnyTextPaty(or, or)).toBeNull();
    expect(vlastnyTextPaty(`${or} · Ďakujeme`, or)).toBe("Ďakujeme");
    expect(vlastnyTextPaty("Ďakujeme", or)).toBe("Ďakujeme");
    expect(vlastnyTextPaty(or, null)).toBe(or);
    expect(vlastnyTextPaty("", or)).toBeNull();
  });
});

const firma = {
  name: "Pätička s.r.o.",
  ico: "12345678",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  street: "Hlavná 1",
  city: "Trnava",
  zip: "917 01",
  country: "SK",
  phone: "+421900000000",
  email: "fakturacia.a.uctovnictvo.oddelenie@velmi-dlha-domena-firmy-na-skusku.sk",
  website: "https://www.velmi-dlha-domena-firmy-na-skusku.sk/",
  registracia_text: "Obchodný register Okresného súdu Trnava, oddiel: Sro, vložka č. 12345/T",
  iban: "SK3112000000198742637541",
};
const faktura = {
  invoice_number: "2026001",
  type: "regular",
  issue_date: "2026-11-06",
  delivery_date: "2026-11-06",
  due_date: "2026-11-20",
  currency: "EUR",
  customer_name: "Odberateľ s.r.o.",
  customer_street: "Dolná 2",
  customer_city: "Nitra",
  customer_zip: "949 01",
  customer_country: "SK",
  subtotal: 100,
  vat_total: 23,
  total: 123,
};
const polozka = (i: number) => ({
  id: String(i),
  name: `Položka ${i}`,
  quantity: 1,
  unit: "ks",
  unit_price: 100,
  vat_rate: 23,
  total: 123,
  position: i,
});

function odkazy(stranka: any): string[] {
  const annots = stranka.node.lookup(PDFName.of("Annots"), PDFArray) as PDFArray | undefined;
  if (!annots) return [];
  return annots
    .asArray()
    .map((a) => stranka.doc.context.lookup(a, PDFDict) as PDFDict)
    .map((d) => d.lookup(PDFName.of("A"), PDFDict)?.lookup(PDFName.of("URI")))
    .filter((u): u is PDFString => u instanceof PDFString)
    .map((u) => u.decodeText());
}

describe("pätička dokladu — PDF", () => {
  it("každá strana viacstranovej faktúry má odkaz na e-mail aj web", async () => {
    const bajty = await generateInvoicePdfBytes({
      company: firma,
      invoice: faktura,
      items: Array.from({ length: 40 }, (_, i) => polozka(i)),
      vystavil: "Jana Nová",
    });
    const doc = await PDFDocument.load(bajty);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    for (const s of doc.getPages()) {
      const o = odkazy(s);
      expect(o).toContain(`mailto:${firma.email}`);
      expect(o).toContain("https://www.velmi-dlha-domena-firmy-na-skusku.sk/");
    }
  });

  it("zápis v OR a pätička nepridajú krátkej faktúre druhú stranu", async () => {
    const bajty = await generateInvoicePdfBytes({
      company: firma,
      invoice: faktura,
      items: [polozka(1), polozka(2), polozka(3)],
    });
    expect((await PDFDocument.load(bajty)).getPageCount()).toBe(1);
  });
});
