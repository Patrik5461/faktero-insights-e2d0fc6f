/**
 * Nemecká firma v rozhraní a na doklade (E2E test 30. 10. 2026, tok
 * e2e/toky/36-de-firma.mjs): lehota vystavenia podľa UStG, merná jednotka
 * v jazyku dokladu, 0 % namiesto „RC“ pri oslobodenom dodaní a texty
 * daňového režimu bez slovenských paragrafov.
 */
import { describe, expect, it } from "vitest";
import { skontrolujDatumy } from "./faktura-nalezitosti";
import { jednotkaNaDoklade, uvodOpravnehoDokladu } from "./faktura-jazyk";
import { DB_PREDVOLENY_PREDMET, DB_PREDVOLENY_TEXT, vlastnyMailFirmy } from "./email-jazyk";
import { textRezimuDe } from "./rezim-texty-de";
import { generateInvoicePdfBytes } from "./pdf-generator.server";
import de from "@/lib/i18n/de/t4-de";
import cs from "@/lib/i18n/cs/t4-de";

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

describe("lehota vystavenia faktúry", () => {
  it("slovenská firma: nad 15 dní upozornenie s kľúčom prekladu a počtom dní", () => {
    const r = skontrolujDatumy({
      platitel: true,
      datumDodania: "2026-09-15",
      datumVystavenia: "2026-10-30",
    });
    expect(r.upozornenie).toMatch(/45 dní.*§ 73/);
    expect(r.kluc).toContain("{n}");
    expect(r.parametre).toEqual({ n: 45 });
  });

  it("nemecká firma: 45 dní je v poriadku, lehota je šesť mesiacov (§ 14 Abs. 2 UStG)", () => {
    expect(
      skontrolujDatumy({
        platitel: true,
        datumDodania: "2026-09-15",
        datumVystavenia: "2026-10-30",
        krajina: "DE",
      }),
    ).toEqual({});
    expect(
      skontrolujDatumy({
        platitel: true,
        datumDodania: "2026-03-15",
        datumVystavenia: "2026-09-15",
        krajina: "DE",
      }),
    ).toEqual({});
    const r = skontrolujDatumy({
      platitel: true,
      datumDodania: "2026-03-15",
      datumVystavenia: "2026-09-16",
      krajina: "DE",
    });
    expect(r.kluc).toMatch(/§ 14 ods. 2 UStG/);
    expect(r.parametre).toEqual({ n: 185 });
    // 31. 8. + 6 mesiacov = 28. 2. (posledný deň mesiaca)
    expect(
      skontrolujDatumy({
        platitel: true,
        datumDodania: "2026-08-31",
        datumVystavenia: "2027-02-28",
        krajina: "DE",
      }),
    ).toEqual({});
  });

  it("nemecká firma bez dátumu dodania: chyba odkazuje na UStG, nie § 74", () => {
    const r = skontrolujDatumy({ platitel: true, datumDodania: "", krajina: "DE" });
    expect(r.chyba).toMatch(/§ 14 ods. 4/);
    expect(r.chyba).not.toMatch(/§ 74/);
  });
});

describe("merná jednotka v jazyku dokladu", () => {
  it("ks a hod sa prekladajú, vlastná jednotka ostáva", () => {
    expect(jednotkaNaDoklade("ks", "de")).toBe("Stk.");
    expect(jednotkaNaDoklade("hod", "de")).toBe("Std.");
    expect(jednotkaNaDoklade("ks", "en")).toBe("pcs");
    expect(jednotkaNaDoklade("ks", "sk")).toBe("ks");
    expect(jednotkaNaDoklade("ks", "cs")).toBe("ks");
    expect(jednotkaNaDoklade("m2", "de")).toBe("m2");
    expect(jednotkaNaDoklade(null, "de")).toBe("");
  });
});

describe("texty daňového režimu pre nemeckú firmu", () => {
  it("bez slovenských paragrafov a s prekladom do nemčiny aj češtiny", () => {
    for (const sk of [
      "Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)",
      "Vývoz tovaru (oslobodené podľa § 47)",
      "Tovar ide aj do priznania (r. 13 a 14), služba len do súhrnného výkazu.",
      "Bežne sa fakturuje so slovenskou DPH. Prepnite len vtedy, keď daň odvedie odberateľ alebo predávate spotrebiteľovi v inom štáte EÚ.",
    ]) {
      const k = textRezimuDe(sk);
      expect(k).not.toBe(sk);
      expect(k).not.toMatch(/slovensk|§ ?69|§ 47|r\. 13/);
      expect((de as Record<string, string>)[k]).toBeTruthy();
      expect((cs as Record<string, string>)[k]).toBeTruthy();
    }
    expect(textRezimuDe("Iný text")).toBe("Iný text");
  });
});

describe("PDF nemeckej firmy", () => {
  const firma = {
    name: "Muster GmbH",
    country: "DE",
    street: "Hauptstraße 5",
    city: "München",
    zip: "80331",
    dic: "143/123/45678",
    ic_dph: "DE811907980",
    vat_payer: true,
    vat_scheme: "de_regel",
  };
  const faktura = {
    invoice_number: "RE-2",
    type: "regular",
    status: "issued",
    issue_date: "2026-10-30",
    delivery_date: "2026-10-30",
    due_date: "2026-11-13",
    currency: "EUR",
    subtotal: 1000,
    vat_total: 0,
    total: 1000,
    customer_name: "Kunde Wien GmbH",
    customer_country: "AT",
    customer_ic_dph: "ATU12345678",
    language: "de",
  };
  const polozky = [
    {
      name: "Ware",
      quantity: 2,
      unit: "ks",
      unit_price: 500,
      vat_rate: 0,
      subtotal: 1000,
      vat_amount: 0,
      total: 1000,
    },
  ];
  const pdf = (inv: any) =>
    generateInvoicePdfBytes({ company: firma, invoice: inv, items: polozky } as any).then(textPdf);

  it("dodanie tovaru do EÚ: 0 % a USt., nie RC; jednotka Stk.", async () => {
    const t = await pdf({
      ...faktura,
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "tovar",
    });
    expect(t).toContain("§ 4 Nr. 1b UStG");
    expect(t).not.toMatch(/\bRC\b|Reverse-Charge/);
    expect(t).toMatch(/0\s?%/);
    expect(t).toContain("Stk.");
    expect(t).not.toMatch(/\bks\b/);
  });

  it("vývoz: 0 %, nie RC", async () => {
    const t = await pdf({
      ...faktura,
      customer_country: "CH",
      customer_ic_dph: null,
      reverse_charge: true,
      reverse_charge_type: "export",
      eu_plnenie: "tovar",
    });
    expect(t).toContain("§ 4 Nr. 1a UStG");
    expect(t).not.toMatch(/\bRC\b|Reverse-Charge/);
  });

  it("služba do EÚ ostáva RC — daň platí odberateľ", async () => {
    const t = await pdf({
      ...faktura,
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "sluzba",
    });
    expect(t).toContain("USt. (Reverse-Charge)");
  });
});

describe("úvod opravného dokladu v jazyku dokladu", () => {
  it("nemecká firma: Rechnungskorrektur, iná firma po nemecky Gutschrift, slovensky ako doteraz", () => {
    expect(uvodOpravnehoDokladu("credit_note", "20260001", "de", "DE")).toBe(
      "Rechnungskorrektur zur Rechnung Nr. 20260001",
    );
    expect(uvodOpravnehoDokladu("credit_note", "1", "de", "SK")).toBe(
      "Gutschrift zur Rechnung Nr. 1",
    );
    expect(uvodOpravnehoDokladu("debit_note", "1", "de", "DE")).toMatch(/^Belastungsanzeige/);
    expect(uvodOpravnehoDokladu("credit_note", "1", "sk", "SK")).toBe("Dobropis k faktúre č. 1");
    expect(uvodOpravnehoDokladu("debit_note", "1", "sk", "SK")).toBe("Ťarchopis k faktúre č. 1");
  });
});

describe("predvolený mail firmy z databázy", () => {
  const firma = {
    email_default_subject: DB_PREDVOLENY_PREDMET,
    email_default_message: DB_PREDVOLENY_TEXT,
  };
  it("pri nemeckom doklade sa slovenská hodnota z databázy neberie", () => {
    expect(vlastnyMailFirmy(firma, "de")).toEqual({ predmet: null, text: null });
    // aj keď prišla s \n namiesto \r\n
    expect(
      vlastnyMailFirmy(
        { ...firma, email_default_message: DB_PREDVOLENY_TEXT.replace(/\r\n/g, "\n") },
        "cs",
      ).text,
    ).toBeNull();
  });
  it("slovenský doklad a vlastný text firmy ostávajú", () => {
    expect(vlastnyMailFirmy(firma, "sk")).toEqual({
      predmet: DB_PREDVOLENY_PREDMET,
      text: DB_PREDVOLENY_TEXT,
    });
    expect(
      vlastnyMailFirmy({ email_default_subject: "Rechnung {invoice_number} von uns" }, "de")
        .predmet,
    ).toBe("Rechnung {invoice_number} von uns");
    expect(vlastnyMailFirmy({ email_default_subject: "  " }, "de").predmet).toBeNull();
  });
});
