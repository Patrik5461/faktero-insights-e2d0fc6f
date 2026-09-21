import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { naplanuj, rozbal, suhrnPlanu } from "./import-prijatych.server";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" version="2.0">
 <dat:dataPackItem id="1" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader>
  <inv:invoiceType>receivedInvoice</inv:invoiceType><inv:originalDocument>FA2026/0815</inv:originalDocument>
  <inv:date>2026-09-01</inv:date><inv:dateDue>2026-09-15</inv:dateDue>
  <inv:partnerIdentity><typ:address><typ:company>Slovak Telekom, a.s.</typ:company><typ:ico>35763469</typ:ico></typ:address></inv:partnerIdentity>
 </inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency><typ:priceHigh>100</typ:priceHigh><typ:priceHighVAT>23</typ:priceHighVAT></inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem>
</dat:dataPack>`;

/** Klient, ktorý tvrdí, že vo firme je už faktúra FA-DUP od IČO 1. */
const klient = {
  from(tabulka: string) {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => q,
      range: async () => ({
        data:
          tabulka === "purchase_invoices"
            ? [{ invoice_number: "FA-DUP", supplier_ico: "1", supplier_name: "X" }]
            : [],
      }),
    };
    return q;
  },
};

describe("import prijatých dokladov — balík z Doklado", () => {
  it("ZIP s XML, PDF a XLSX: doklady, skeny aj duplicity", async () => {
    const zosit = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      zosit,
      XLSX.utils.aoa_to_sheet([
        ["Typ dokladu", "Číslo dokladu", "Dodávateľ", "IČO", "Dátum vystavenia", "Suma s DPH"],
        ["Blok", "B-1", "Shell", "", "3.9.2026", 45.1],
        ["Prijatá faktúra", "FA-DUP", "X", "1", "1.8.2026", 10],
      ]),
      "Doklady",
    );
    const xlsx = XLSX.write(zosit, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const zip = new JSZip();
    zip.file("export/pohoda.xml", XML);
    zip.file("export/pdf/FA2026-0815.pdf", "%PDF-1.4 skúška");
    zip.file("export/pdf/neznamy.pdf", "%PDF-1.4");
    zip.file("export/doklady.xlsx", xlsx);
    zip.file("__MACOSX/._pohoda.xml", "x");
    zip.file("export/readme.html", "<p/>");
    const bajty = await zip.generateAsync({ type: "uint8array" });

    const r = await rozbal([{ meno: "doklado.zip", bajty }]);
    expect(r.zaznamy).toHaveLength(3);
    expect(r.skeny.map((s) => s.meno).sort()).toEqual(["FA2026-0815.pdf", "neznamy.pdf"]);
    expect(r.poznamky.some((p) => p.includes("readme.html"))).toBe(true);

    const plan = await naplanuj(klient, "firma", [{ meno: "doklado.zip", bajty }]);
    const s = suhrnPlanu(plan);
    expect(s).toMatchObject({ faktury: 1, blocky: 1, duplicity: 1, skenyPriradene: 1, skenyBezParu: 1 });
    expect(s.ukazka.find((u) => u.cislo === "FA2026/0815")?.sken).toBe("FA2026-0815.pdf");
  });

  it("CSV v kódovaní Windows-1250 prečíta s diakritikou", async () => {
    const text = "Číslo dokladu;Dodávateľ;Dátum vystavenia;Suma s DPH\r\nB-9;Čerpacia stanica Žilina;5.9.2026;12,30\r\n";
    // Windows-1250: ručne preložené znaky, ktoré sa v texte vyskytujú.
    const mapa: Record<string, number> = { Č: 0xc8, í: 0xed, á: 0xe1, ľ: 0xbe, Ž: 0x8e, č: 0xe8 };
    const bajty = Uint8Array.from([...text].map((c) => mapa[c] ?? c.charCodeAt(0)));
    const r = await rozbal([{ meno: "doklady.csv", bajty }]);
    expect(r.zaznamy[0]).toMatchObject({ cislo: "B-9", dodavatel: "Čerpacia stanica Žilina", spolu: 12.3 });
  });
});
