import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { naplanuj, rozbal, suhrnPlanu, vykonajImport } from "./import-prijatych.server";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" version="2.0">
 <dat:dataPackItem id="1" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader>
  <inv:invoiceType>receivedInvoice</inv:invoiceType><inv:originalDocument>FA2026/0815</inv:originalDocument>
  <inv:date>2026-09-01</inv:date><inv:dateDue>2026-09-15</inv:dateDue>
  <inv:partnerIdentity><typ:address><typ:company>Slovak Telekom, a.s.</typ:company><typ:ico>35763469</typ:ico></typ:address></inv:partnerIdentity>
 </inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency><typ:priceHigh>100</typ:priceHigh><typ:priceHighVAT>21</typ:priceHighVAT></inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem>
</dat:dataPack>`;

/*
  Klient, ktorý tvrdí, že vo firme je už faktúra FA-DUP od IČO 1. Firma je
  česká — XML je preto z českej Pohody (21 %); slovenské XML by import
  českej firmy odmietol (eurá by sa zapísali ako koruny).
*/
const klient = {
  from(tabulka: string) {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => q,
      maybeSingle: async () => ({ data: tabulka === "companies" ? { country: "CZ" } : null }),
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
    // Doklady bez meny sú v domácej mene firmy — CZ firma koruny, nie eurá.
    expect(plan.zaznamy.map((z) => z.mena)).toEqual(["CZK", "CZK", "CZK"]);
  });

  it("XML z inej krajiny sa nenaimportuje a povie prečo", async () => {
    const sk = XML.replace("<typ:priceHighVAT>21<", "<typ:priceHighVAT>23<");
    const plan = await naplanuj(klient, "firma", [{ meno: "pohoda-sk.xml", bajty: new TextEncoder().encode(sk) }]);
    expect(plan.zaznamy).toHaveLength(0);
    expect(plan.poznamky[0]).toContain("slovenskej Pohody");
  });

  it("príjmový pokladničný doklad z Pohody ide do pokladne, opakovaný import ho nezdvojí", async () => {
    const VCH = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" version="2.0">
 <dat:dataPackItem id="1" version="2.0"><vch:voucher version="2.0"><vch:voucherHeader>
  <vch:voucherType>receipt</vch:voucherType><vch:number><typ:numberRequested>PPD0007</typ:numberRequested></vch:number>
  <vch:date>2026-10-04</vch:date><vch:text>Vklad do pokladne</vch:text>
 </vch:voucherHeader><vch:voucherSummary><vch:homeCurrency><typ:priceNone>200</typ:priceNone></vch:homeCurrency></vch:voucherSummary></vch:voucher></dat:dataPackItem>
</dat:dataPack>`;
    const vlozene: any[] = [];
    const existujuce: any[] = [];
    const k = {
      rpc: async () => ({ data: { number: "PD20260001", series_id: "rad" }, error: null }),
      storage: { from: () => ({}) },
      from(tabulka: string) {
        const q: any = {
          select: () => q,
          eq: () => q,
          is: () => q,
          order: () => q,
          update: () => q,
          maybeSingle: async () => ({ data: tabulka === "companies" ? { country: "SK" } : null }),
          range: async () => ({ data: tabulka === "cash_entries" ? existujuce : [] }),
          insert: async (r: any) => {
            vlozene.push({ tabulka, ...r });
            return { error: null };
          },
          then: (ok: any) => Promise.resolve({ data: null, error: null }).then(ok),
        };
        return q;
      },
    };
    const vstup = [{ meno: "pokladna.xml", bajty: new TextEncoder().encode(VCH) }];
    const plan = await naplanuj(k, "firma", vstup);
    expect(suhrnPlanu(plan)).toMatchObject({ pokladna: 1, duplicity: 0 });
    const v = await vykonajImport({
      klient: k,
      jobId: "job",
      companyId: "firma",
      userId: "u",
      plan,
      stav: "exported" as any,
      doPokladne: true,
      citatSkeny: false,
      zdrojAplikacie: "Pohoda",
    });
    expect(v.pokladna).toBe(1);
    const zapis = vlozene.find((r) => r.tabulka === "cash_entries");
    expect(zapis).toMatchObject({
      type: "prijem",
      amount: 200,
      entry_date: "2026-10-04",
      entry_number: "PD20260001",
      description: "Vklad do pokladne",
      pohoda_cislo: "PPD0007",
    });
    expect(zapis.exported_at).toBeTruthy();
    // Druhý raz: ten istý príjem vo firme už je.
    existujuce.push({ entry_date: "2026-10-04", amount: "200.00", description: "Vklad do pokladne" });
    const znova = await naplanuj(k, "firma", vstup);
    expect(suhrnPlanu(znova)).toMatchObject({ pokladna: 0, duplicity: 1 });
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
