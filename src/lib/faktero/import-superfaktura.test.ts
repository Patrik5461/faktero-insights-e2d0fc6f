import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { zipSync, strToU8 } from "fflate";
import {
  extractTables,
  detectMapping,
  buildPreview,
  stavDokladu,
} from "./import-superfaktura.server";

/**
 * Skutočný ISDOC súbor — v tomto formáte exportuje faktúry SuperFaktúra
 * (ZIP, jedna faktúra na súbor).
 */
const ISDOC = readFileSync(new URL("./__fixtures__/superfaktura.isdoc", import.meta.url));

/** Tvar, v akom faktúry vracia rozhranie SuperFaktúry. */
const API_XML = `<?xml version="1.0" encoding="utf-8"?>
<Invoices>
  <Invoice>
    <invoice_no>2025001</invoice_no>
    <variable>2025001</variable>
    <created>2025-03-04</created>
    <due>2025-03-18</due>
    <delivery>2025-03-04</delivery>
    <amount>100.00</amount>
    <vat>23.00</vat>
    <invoice_currency>EUR</invoice_currency>
    <comment>Poznámka</comment>
    <status>3</status>
    <client_data><name>ACME s.r.o.</name><ico>12345678</ico><dic>2020304050</dic>
      <ic_dph>SK2020304050</ic_dph><email>a@acme.sk</email><address>Hlavná 1</address>
      <city>Trnava</city><zip>91701</zip><country>Slovensko</country></client_data>
  </Invoice>
  <Invoice>
    <invoice_no>2025002</invoice_no>
    <variable>2025002</variable>
    <created>2025-03-05</created>
    <due>2025-03-19</due>
    <delivery>2025-03-05</delivery>
    <amount>250.00</amount>
    <vat>57.50</vat>
    <invoice_currency>EUR</invoice_currency>
    <comment></comment>
    <status>1</status>
    <client_data><name>Beta a.s.</name><ico>87654321</ico><dic>2010203040</dic>
      <ic_dph>SK2010203040</ic_dph><email>b@beta.sk</email><address>Vedľajšia 2</address>
      <city>Nitra</city><zip>94901</zip><country>Slovensko</country></client_data>
  </Invoice>
</Invoices>`;

async function jednaTabulka(bytes: Uint8Array, meno: string) {
  const tabulky = await extractTables(bytes, meno);
  expect(tabulky.length).toBe(1);
  return tabulky[0];
}

describe("extractTables — ISDOC zo SuperFaktúry", () => {
  // Kým sa `.isdoc` nepoznal, čítal sa ako CSV: z jednej faktúry vzniklo
  // 725 nezmyselných riadkov s hlavičkou `<?xml version=...?>`.
  it("ISDOC sa nečíta ako CSV", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    expect(t.format).toBe("xml");
    expect(t.headers).toContain("invoice_number");
    expect(t.headers).not.toContain("<?xml version=1.0 encoding=utf-8?>");
  });

  it("jeden riadok na položku faktúry", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    expect(t.rows.length).toBe(3);
    expect(new Set(t.rows.map((r) => r.invoice_number))).toEqual(new Set(["FV-111999/2011"]));
  });

  // Rozhoduje obsah, nie prípona — SuperFaktúra súbor niekedy pomenuje .xml.
  it("ISDOC pomenovaný .xml sa rozpozná tiež", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "export.xml");
    expect(t.headers).toContain("invoice_number");
  });

  it("ISDOC bez prípony sa rozpozná podľa obsahu", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "export");
    expect(t.headers).toContain("invoice_number");
  });

  // Archív sa predtým preskočil celý — import hlásil, že súbor nemá dáta.
  it("ZIP s viacerými .isdoc dá jednu tabuľku so všetkými faktúrami", async () => {
    const zip = zipSync({
      "FV-1.isdoc": new Uint8Array(ISDOC),
      "FV-2.isdoc": strToU8(
        new TextDecoder().decode(ISDOC).replace(/FV-111999\/2011/g, "FV-112000/2011"),
      ),
      "__MACOSX/ignoruj.isdoc": strToU8("x"),
    });
    const t = await jednaTabulka(zip, "export.zip");
    expect(t.rows.length).toBe(6);
    expect(new Set(t.rows.map((r) => r.invoice_number)).size).toBe(2);
  });
});

describe("detectMapping — automatické rozpoznanie stĺpcov", () => {
  /*
   * Toto je jadro chyby, pre ktorú import nikdy nefungoval sám: poradie polí
   * pri riešení konfliktov obsahovalo kľúčové polia dvakrát, takže si pri
   * druhom prechode zrazili samy seba a zmazali sa. Číslo faktúry, dátum
   * vystavenia, suma ani odberateľ sa preto nerozpoznali nikdy.
   */
  it("kľúčové polia sa rozpoznajú", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    const d = detectMapping(t.headers, t.rows);
    expect(d.mapping.invoice_number).toBe("invoice_number");
    expect(d.mapping.issue_date).toBe("issue_date");
    expect(d.mapping.total).toBe("total");
    expect(d.mapping.customer_name).toBe("customer_name");
    expect(d.confidenceLabel).toBe("high");
  });

  // Predtým sa do celkovej sumy dostala DPH, lebo stĺpec „vat_total" bol
  // v tabuľke skôr a čiastočná zhoda s bonusom dorovnala presnú zhodu mena.
  it("celková suma si neberie stĺpec s DPH", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    const d = detectMapping(t.headers, t.rows);
    expect(d.mapping.total).toBe("total");
    expect(d.mapping.vat_total).toBe("vat_total");
    expect(d.mapping.item_total).toBe("item_total");
  });

  it("rozpozná polia z rozhrania SuperFaktúry", async () => {
    const t = await jednaTabulka(strToU8(API_XML), "export.xml");
    const d = detectMapping(t.headers, t.rows);
    expect(d.mapping).toMatchObject({
      invoice_number: "invoice_no",
      variable_symbol: "variable",
      issue_date: "created",
      due_date: "due",
      delivery_date: "delivery",
      subtotal: "amount",
      vat_total: "vat",
      currency: "invoice_currency",
      customer_name: "client_data.name",
      customer_ico: "client_data.ico",
      customer_ic_dph: "client_data.ic_dph",
    });
  });

  // `vat` je v exporte suma DPH a `status` nie je krajina. Kým boli v zozname
  // synoným, import tíško zapísal sumu DPH ako IČ DPH odberateľa.
  it("suma DPH sa nezamení za IČ DPH ani stav za krajinu", async () => {
    const t = await jednaTabulka(strToU8(API_XML), "export.xml");
    const d = detectMapping(t.headers, t.rows);
    expect(d.mapping.customer_ic_dph).not.toBe("vat");
    expect(d.mapping.customer_country).not.toBe("status");
  });

  it("neznáme stĺpce nedajú vysokú istotu", () => {
    const rows = [{ alfa: "x", beta: "y", gama: "z" }];
    const d = detectMapping(["alfa", "beta", "gama"], rows);
    expect(d.confidenceLabel).toBe("low");
    expect(Object.keys(d.mapping)).toHaveLength(0);
  });
});

describe("buildPreview", () => {
  it("náhľad z ISDOC ukáže faktúru a jej sumu", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    const d = detectMapping(t.headers, t.rows);
    const p = buildPreview(t.rows, d.mapping);
    expect(p.invoicesCount).toBe(1);
    // TaxInclusiveAmount = 396,58 (PayableAmount je 0, lebo doklad je zálohovaný)
    expect(p.totalValue).toBeCloseTo(396.58, 2);
    expect(p.sampleInvoices[0].customer_name).toBe("Ministerstvo financí ČR");
    expect(p.sampleInvoices[0].issue_date).toBe("2013-02-28");
  });

  // SuperFaktúra pole „spolu" nemá — bez dopočtu by sa faktúry importovali
  // v cene bez DPH.
  it("celková suma sa dopočíta zo základu a DPH", async () => {
    const t = await jednaTabulka(strToU8(API_XML), "export.xml");
    const d = detectMapping(t.headers, t.rows);
    const p = buildPreview(t.rows, d.mapping);
    expect(p.invoicesCount).toBe(2);
    expect(p.totalValue).toBeCloseTo(123 + 307.5, 2);
  });
});

describe("detectedSource", () => {
  // Pôvodný zápis vracal pri zhode `true` namiesto reťazca, takže export
  // priamo zo SuperFaktúry sa vždy označil ako „všeobecný".
  it("ISDOC sa označí ako export zo SuperFaktúry", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    expect(detectMapping(t.headers, t.rows).detectedSource).toBe("superfaktura");
  });

  it("export z rozhrania sa označí tiež", async () => {
    const t = await jednaTabulka(strToU8(API_XML), "export.xml");
    expect(detectMapping(t.headers, t.rows).detectedSource).toBe("superfaktura");
  });

  it("cudzia tabuľka ostane všeobecná", () => {
    const rows = [{ alfa: "1", beta: "2", gama: "3" }];
    expect(detectMapping(["alfa", "beta", "gama"], rows).detectedSource).toBe("generic");
  });
});

describe("priraďovanie stĺpcov", () => {
  /*
   * Priradzovalo sa postupne po poliach, takže pole, ktoré o stĺpec prišlo, si
   * už nikdy nevybralo druhý najlepší. Sadzba DPH na položke sa tak chytila na
   * „customer_ic_dph" (cez synonymum „dph"), prehrala súboj a vypadla — a
   * položky sa importovali s prednastavenými 23 %.
   */
  it("sadzba DPH na položke sa priradí", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    const d = detectMapping(t.headers, t.rows);
    expect(d.mapping.item_vat_rate).toBe("item_vat_rate");
    expect(d.mapping.customer_ic_dph).toBe("customer_ic_dph");
  });

  // Pri rovnakom skóre rozhodovalo poradie stĺpcov v súbore.
  it("na poradí stĺpcov v súbore nezáleží", () => {
    const hlavicky = ["total", "vat_total", "subtotal"];
    const riadky = [{ total: "123.00", vat_total: "23.00", subtotal: "100.00" }];
    const a = detectMapping(hlavicky, riadky).mapping;
    const b = detectMapping([...hlavicky].reverse(), riadky).mapping;
    expect(a.total).toBe("total");
    expect(a.vat_total).toBe("vat_total");
    expect(a.subtotal).toBe("subtotal");
    expect(b).toEqual(a);
  });

  it("jeden stĺpec sa nepriradí dvom poliam", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    const hlavicky = Object.values(detectMapping(t.headers, t.rows).mapping);
    expect(new Set(hlavicky).size).toBe(hlavicky.length);
  });
});

describe("čísla ako text", () => {
  // Parser prevádzal hodnoty na čísla a zjedal vedúce nuly — z IČO `00006947`
  // sa stalo `6947`. Slovenské IČO ich má bežne (napr. 00151653).
  it("IČO si zachová vedúce nuly", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    expect(t.rows[0].customer_ico).toBe("00006947");
  });

  it("PSČ ostane textom", async () => {
    const t = await jednaTabulka(new Uint8Array(ISDOC), "faktura.isdoc");
    expect(t.rows[0].customer_zip).toBe("11810");
  });
});

describe("slovenské hlavičky", () => {
  // „Štát" musí ísť do krajiny a „Stav" do stavu — nesmú si sadnúť navzájom.
  it("Štát a Stav sa nezamenia", () => {
    const hlavicky = ["Stav", "Štát", "Číslo faktúry", "Odberateľ", "Celkom s DPH"];
    const riadky = [
      {
        Stav: "Uhradená",
        "Štát": "SK",
        "Číslo faktúry": "2025001",
        "Odberateľ": "ACME s.r.o.",
        "Celkom s DPH": "123,00",
      },
    ];
    const m = detectMapping(hlavicky, riadky).mapping;
    expect(m.customer_country).toBe("Štát");
    expect(m.status).toBe("Stav");
    expect(m.invoice_number).toBe("Číslo faktúry");
    expect(m.customer_name).toBe("Odberateľ");
    expect(m.total).toBe("Celkom s DPH");
  });

  // „IČ DPH" sa nesmie chytiť na stĺpec s daňou a naopak.
  it("DPH ako suma a IČ DPH sa nezamenia", () => {
    const hlavicky = ["DPH", "IČ DPH", "Celkom bez DPH"];
    const riadky = [{ DPH: "23,00", "IČ DPH": "SK2020304050", "Celkom bez DPH": "100,00" }];
    const m = detectMapping(hlavicky, riadky).mapping;
    expect(m.vat_total).toBe("DPH");
    expect(m.customer_ic_dph).toBe("IČ DPH");
    expect(m.subtotal).toBe("Celkom bez DPH");
  });
});

describe("stavDokladu", () => {
  /*
   * Stav sa prijímal len ako anglický kód, takže „Uhradená" z iDokladu spadlo
   * na „vystavená" — hneď po prechode vyzerala celá história ako pohľadávka.
   */
  it("slovenské a české stavy", () => {
    expect(stavDokladu("Uhradená")).toBe("paid");
    expect(stavDokladu("uhradena")).toBe("paid");
    expect(stavDokladu("Zaplatená")).toBe("paid");
    expect(stavDokladu("Zaplaceno")).toBe("paid");
    expect(stavDokladu("Neuhradená")).toBe("issued");
    expect(stavDokladu("Nezaplatená")).toBe("issued");
    expect(stavDokladu("Po splatnosti")).toBe("overdue");
    expect(stavDokladu("Stornovaná")).toBe("cancelled");
    expect(stavDokladu("Koncept")).toBe("draft");
    expect(stavDokladu("Odoslaná")).toBe("sent");
  });

  it("anglické kódy prejdú nezmenené", () => {
    for (const s of ["draft", "issued", "sent", "paid", "cancelled", "overdue"]) {
      expect(stavDokladu(s)).toBe(s);
    }
  });

  // SuperFaktúra vracia stav číslom.
  it("číselný stav zo SuperFaktúry", () => {
    expect(stavDokladu("3")).toBe("paid");
    expect(stavDokladu("1")).toBe("issued");
    expect(stavDokladu("2")).toBe("issued");
  });

  // Radšej otvorená faktúra než cudzí doklad omylom označený za zaplatený.
  it("neznáme a prázdne hodnoty ostanú vystavené", () => {
    expect(stavDokladu("")).toBe("issued");
    expect(stavDokladu(undefined)).toBe("issued");
    expect(stavDokladu("čokoľvek iné")).toBe("issued");
  });
});
