/**
 * Nemecké názvoslovie dobropisu podľa krajiny firmy: „Rechnungskorrektur“
 * len pre firmu z Nemecka, slovenská a česká firma v nemčine „Gutschrift“.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nemeckeNazvoslovie, pomenovanieDobropisu } from "./dobropis-de";
import { JazykProvider, KrajinaFirmyProvider, useT } from "./useT";
import { popisky } from "@/lib/faktero/faktura-jazyk";
import { predvolenyMailFaktury } from "@/lib/faktero/email-jazyk";
import { generateInvoicePdfBytes } from "@/lib/faktero/pdf-generator.server";
import { buildDatevBuchungsstapel } from "@/lib/faktero/export-datev";
import { prijataNaUctovanie, vystavenaNaUctovanie } from "@/lib/faktero/zauctovanie-export";
import { textyDodavatela } from "@/lib/faktero/samofakturacia-texty";
import type { KrajinaDane } from "@/lib/faktero/vat-rates";

describe("pomenovanieDobropisu", () => {
  it("firma mimo Nemecka: Rechnungskorrektur → Gutschrift vo všetkých tvaroch", () => {
    for (const k of ["SK", "CZ"] as const) {
      expect(pomenovanieDobropisu("Rechnungskorrektur ausstellen", k)).toBe(
        "Gutschrift ausstellen",
      );
      expect(pomenovanieDobropisu("Ausgehende Rechnungskorrekturen – Nummernkreis", k)).toBe(
        "Ausgehende Gutschriften – Nummernkreis",
      );
      expect(pomenovanieDobropisu("RECHNUNGSKORREKTUR", k)).toBe("GUTSCHRIFT");
      expect(pomenovanieDobropisu("Rechnungskorrektur-Nr. 5", k)).toBe("Gutschrift-Nr. 5");
    }
  });

  it("nemecká firma a bez firmy: bez zmeny", () => {
    const s = "Eine Rechnungskorrektur und eine neue Rechnung.";
    expect(pomenovanieDobropisu(s, "DE")).toBe(s);
    expect(pomenovanieDobropisu(s, null)).toBe(s);
    expect(pomenovanieDobropisu(s, undefined)).toBe(s);
    expect(nemeckeNazvoslovie(null)).toBe(true);
    expect(nemeckeNazvoslovie("SK")).toBe(false);
  });

  it("„Korrektur der Gutschrift“ a Gutschrift ostávajú", () => {
    expect(pomenovanieDobropisu("Korrektur der Gutschrift (Selbstfakturierung)", "SK")).toBe(
      "Korrektur der Gutschrift (Selbstfakturierung)",
    );
    expect(pomenovanieDobropisu("Eingehende Gutschrift", "SK")).toBe("Eingehende Gutschrift");
  });
});

describe("popisky PDF a e-mail", () => {
  it("nadpis dobropisu podľa krajiny firmy", () => {
    expect(popisky("de", "SK").dobropis).toBe("GUTSCHRIFT");
    expect(popisky("de", "CZ").dobropis).toBe("GUTSCHRIFT");
    expect(popisky("de", "DE").dobropis).toBe("RECHNUNGSKORREKTUR");
    expect(popisky("de").dobropis).toBe("RECHNUNGSKORREKTUR");
    // Ostatné jazyky sa nemenia.
    expect(popisky("sk", "SK").dobropis).toBe(popisky("sk").dobropis);
  });

  it("predvolený e-mail k dobropisu", () => {
    const sk = predvolenyMailFaktury("de", "credit_note", "SK");
    expect(sk.predmet).toBe("Gutschrift {invoice_number}");
    expect(sk.text).toContain("unsere Gutschrift {invoice_number}");
    expect(sk.text).not.toMatch(/Rechnungskorrektur/);
    expect(predvolenyMailFaktury("de", "credit_note", "DE").predmet).toBe(
      "Rechnungskorrektur {invoice_number}",
    );
  });

  it("samofaktúra: oprava je Korrektur der Gutschrift", () => {
    const T = textyDodavatela("de");
    expect(T.dobropis).toBe("Korrektur der Gutschrift");
    expect(T.mailTelo(T.dobropis, "SF-2", "10,00 €", "SF-1")).toContain(
      "die Korrektur der Gutschrift SF-2",
    );
  });
});

describe("DATEV Buchungstext", () => {
  const doklad = (agenda: "vystavena" | "prijata") =>
    agenda === "vystavena"
      ? vystavenaNaUctovanie(
          {
            id: "v1",
            type: "credit_note",
            invoice_number: "GS-1",
            issue_date: "2026-10-05",
            delivery_date: "2026-10-03",
            due_date: "2026-10-19",
            total: -119,
            currency: "EUR",
            customer_name: "Kunde AG",
          },
          [{ name: "Beratung", subtotal: -100, vat_amount: -19, vat_rate: 19 }],
          {},
        )
      : prijataNaUctovanie(
          {
            id: "p1",
            invoice_number: "ER 1",
            supplier_name: "Lieferant GmbH",
            issue_date: "2026-10-02",
            due_date: "2026-10-30",
            amount_without_vat: -100,
            vat_amount: -19,
            amount_total: -119,
            opravuje_cislo: "ER 0",
            dph_rezim: "tuzemsko",
          },
          {},
        );
  const obsah = (country: string, agenda: "vystavena" | "prijata") =>
    buildDatevBuchungsstapel({
      firma: { name: "X", country, vat_scheme: "de_regel" },
      doklady: [doklad(agenda)],
      nastavenia: { beraternummer: "29098", mandantennummer: "55003", osnova: "SKR03" },
      teraz: new Date("2026-10-17T08:00:00Z"),
    }).obsah;

  it("vystavený: DE Rechnungskorrektur, SK Gutschrift; prijatý vždy Gutschrift", () => {
    expect(obsah("DE", "vystavena")).toContain('"Rechnungskorrektur Kunde AG"');
    expect(obsah("SK", "vystavena")).toContain('"Gutschrift Kunde AG"');
    expect(obsah("DE", "prijata")).toContain('"Gutschrift Lieferant GmbH"');
  });
});

describe("useT s krajinou firmy", () => {
  function Ukazka() {
    const { t } = useT();
    return <span>{t("Vystaviť dobropis")}</span>;
  }
  const html = (krajina: KrajinaDane | null, jazyk: "sk" | "de" = "de") =>
    renderToString(
      <JazykProvider jazyk={jazyk}>
        <KrajinaFirmyProvider krajina={krajina}>
          <Ukazka />
        </KrajinaFirmyProvider>
      </JazykProvider>,
    );

  it("SK/CZ firma Gutschrift, DE firma a bez firmy Rechnungskorrektur", () => {
    expect(html("SK")).toContain("Gutschrift ausstellen");
    expect(html("CZ")).toContain("Gutschrift ausstellen");
    expect(html("DE")).toContain("Rechnungskorrektur ausstellen");
    expect(html(null)).toContain("Rechnungskorrektur ausstellen");
    expect(html("SK", "sk")).toContain("Vystaviť dobropis");
  });

  it("tlačidlo opravy samofaktúry", () => {
    function Samo() {
      const { t } = useT();
      return <span>{t("samofaktura::Vystaviť dobropis")}</span>;
    }
    const h = renderToString(
      <JazykProvider jazyk="de">
        <KrajinaFirmyProvider krajina="DE">
          <Samo />
        </KrajinaFirmyProvider>
      </JazykProvider>,
    );
    expect(h).toContain("Gutschrift korrigieren");
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

describe("PDF dobropisu v nemčine", () => {
  const firma = (country: string) => ({
    name: "Firma",
    country,
    street: "Hlavná 1",
    city: "Bratislava",
    zip: "81101",
    ic_dph: country === "DE" ? "DE123456789" : "SK2020123456",
    iban: "SK3112000000198742637541",
    vat_payer: true,
    vat_scheme: country === "DE" ? "de_regel" : "sk_4",
  });
  const dobropis = {
    invoice_number: "D-1",
    type: "credit_note",
    language: "de",
    opravuje_cislo: "F-1",
    status: "issued",
    issue_date: "2026-10-15",
    delivery_date: "2026-10-14",
    due_date: "2026-10-29",
    currency: "EUR",
    subtotal: -100,
    vat_total: -23,
    total: -123,
    customer_name: "Kunde AG",
    customer_country: "DE",
  };
  const polozky = [
    {
      name: "Rabatt",
      quantity: -1,
      unit: "ks",
      unit_price: 100,
      vat_rate: 23,
      subtotal: -100,
      vat_amount: -23,
      total: -123,
    },
  ];
  const pdf = (country: string, inv: any = dobropis) =>
    generateInvoicePdfBytes({ company: firma(country), invoice: inv, items: polozky } as any).then(
      textPdf,
    );

  it("slovenská firma: GUTSCHRIFT", async () => {
    const t = await pdf("SK");
    expect(t).toContain("GUTSCHRIFT");
    expect(t).not.toMatch(/RECHNUNGSKORREKTUR/i);
  });

  it("oprava samofaktúry: GUTSCHRIFT aj pri nemeckom vystavovateľovi, bez zdvojenia", async () => {
    const t = await pdf("DE", { ...dobropis, samofakturacia: true });
    expect(t).toContain("GUTSCHRIFT");
    expect(t).not.toMatch(/RECHNUNGSKORREKTUR/);
    expect(t).not.toMatch(/GUTSCHRIFT.*Gutschrift/);
  });

  it("nemecká firma: RECHNUNGSKORREKTUR", async () => {
    const t = await pdf("DE");
    expect(t).toContain("RECHNUNGSKORREKTUR");
    expect(t).not.toMatch(/GUTSCHRIFT/);
  });
});
