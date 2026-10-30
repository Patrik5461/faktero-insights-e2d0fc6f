/*
  Kontrola exportov 29. 10. 2026: kód predkontácie podľa agendy dokladu
  (BÝVAJLEPŠIE „2“ v prijatých, záväzkoch aj vydaných), členenie DPH proti
  smeru dokladu (PALIERA FA20260004 s PD), neplatiteľ s DPH (allthingers)
  a české prenesenie bez slovenského „UDpdp“.
*/
import { describe, expect, it } from "vitest";
import {
  agendyDokladu,
  jeNeplatitel,
  kodPreDoklad,
  mapaKodov,
  prekazkaClenenia,
  prekazkaUctovania,
  smerClenenia,
  smerKv,
  zavazkoveKody,
} from "./uctovanie-agenda";
import { blocekNaUctovanie, prijataNaUctovanie, vystavenaNaUctovanie } from "./zauctovanie-export";
import { buildOmegaUctovanie } from "./export-omega-uctovanie";
import { buildCsvUctovanie } from "./export-csv-uctovanie";
import { buildPohodaInvoiceXml } from "./export.server";
import { clenenieVydanejPdp, prekazkaDokladu, prekazkaVydanej } from "./pohoda-kontrola";

/** Číselník ako v BÝVAJLEPŠIE: kód „2“ v troch agendách s inými účtami. */
const ciselnik = [
  { kod: "2", agenda: "receivedInvoice", popis: "Služby", ucet_md: "518", ucet_d: "321" },
  { kod: "2", agenda: "commitment", popis: "Záväzok", ucet_md: "548", ucet_d: "379" },
  { kod: "2", agenda: "issuedInvoice", popis: "Tržby", ucet_md: "311", ucet_d: "602" },
  { kod: "OZ1", agenda: "commitment", popis: "Nájom", ucet_md: "518", ucet_d: "379" },
  { kod: "V", agenda: "", popis: "Všetky", ucet_md: "501", ucet_d: "321" },
];
const kody = mapaKodov(ciselnik);

const prijata = (extra: Record<string, unknown> = {}) =>
  prijataNaUctovanie(
    {
      id: "p1",
      invoice_number: "FV014-2026/00049",
      issue_date: "2026-09-10",
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
      supplier_name: "Dodávateľ",
      pohoda_predkontacia: "2",
      pohoda_clenenie_dph: "PD",
      ...extra,
    },
    {},
  );
const vystavena = (extra: Record<string, unknown> = {}) =>
  vystavenaNaUctovanie(
    {
      id: "v1",
      type: "regular",
      invoice_number: "FA20260004",
      issue_date: "2026-10-01",
      total: 123,
      customer_name: "Odberateľ",
      pohoda_predkontacia: "2",
      pohoda_clenenie_dph: "UD",
      ...extra,
    },
    [{ name: "Tovar", subtotal: 100, vat_amount: 23, vat_rate: 23 }],
    {},
  );

describe("kód predkontácie podľa agendy dokladu", () => {
  it("prijatá faktúra dostane účty z prijatých faktúr, vystavená z vydaných", () => {
    expect(kodPreDoklad(kody, "2", prijata())?.ucetMd).toBe("518");
    expect(kodPreDoklad(kody, "2", vystavena())?.ucetD).toBe("602");
  });

  it("kód len v záväzkoch sa prijatej nájde, kód pre všetky agendy každému", () => {
    expect(kodPreDoklad(kody, "OZ1", prijata())?.ucetD).toBe("379");
    expect(kodPreDoklad(kody, "V", vystavena())?.ucetMd).toBe("501");
    expect(kodPreDoklad(kody, "V", prijata())?.ucetMd).toBe("501");
  });

  it("kód len z opačnej strany sa nepoužije, prázdny kód nič nevráti", () => {
    const len = mapaKodov([{ kod: "9", agenda: "issuedInvoice", ucet_md: "311", ucet_d: "602" }]);
    expect(kodPreDoklad(len, "9", prijata())).toBeUndefined();
    expect(kodPreDoklad(len, "9", vystavena())?.ucetD).toBe("602");
    expect(kodPreDoklad(kody, "", prijata())).toBeUndefined();
    expect(kodPreDoklad(kody, null, prijata())).toBeUndefined();
  });

  it("mapa v starom tvare (kľúč = kód) funguje ďalej", () => {
    const stara = { "1Fp": { kod: "1Fp", popis: null, ucetMd: "501", ucetD: "321" } };
    expect(kodPreDoklad(stara, "1Fp", prijata())?.ucetMd).toBe("501");
  });

  it("bloček hľadá podľa formy — pokladňa v cashPaid, karta v interných", () => {
    const k = mapaKodov([
      { kod: "B", agenda: "cashPaid", ucet_md: "501", ucet_d: "211" },
      { kod: "B", agenda: "internalDocument", ucet_md: "501", ucet_d: "261" },
      { kod: "B", agenda: "receivedInvoice", ucet_md: "501", ucet_d: "321" },
    ]);
    const blocek = (platba: string) =>
      blocekNaUctovanie(
        {
          id: "b",
          document_number: "1",
          total_amount: 10,
          payment_method: platba,
          pohoda_predkontacia: "B",
        },
        { blockyPodlaPlatby: true },
      );
    expect(kodPreDoklad(k, "B", blocek("hotovost"))?.ucetD).toBe("211");
    expect(kodPreDoklad(k, "B", blocek("karta"))?.ucetD).toBe("261");
    expect(kodPreDoklad(k, "B", blocek("prevod"))?.ucetD).toBe("321");
  });

  it("zálohová prijatá hľadá najprv v prijatých zálohách", () => {
    expect(agendyDokladu({ agenda: "prijata", druh: "zaloha", forma: "faktura" })[0]).toBe(
      "receivedAdvanceInvoice",
    );
    expect(
      agendyDokladu({
        agenda: "vystavena",
        druh: "faktura",
        forma: "faktura",
        dokladKPlatbe: true,
      })[0],
    ).toBe("issuedAdvanceInvoice");
  });

  it("Omega zaúčtuje prijatú 033 na 518/321, nie na 311/602", () => {
    const d = prijata({ invoice_number: "FV014-2026/00033" });
    const evidencie = Object.fromEntries(
      ["OF", "DF", "PD", "ID"].map((x) => [x, { evidencia: x, rad: x }]),
    );
    const { obsah, preskocene } = buildOmegaUctovanie({
      firma: { name: "BÝVAJLEPŠIE", ico: "12345678" },
      doklady: [d],
      kody,
      nastavenia: { evidencie },
    });
    expect(preskocene).toEqual([]);
    const zapisy = obsah
      .trimEnd()
      .split("\r\n")
      .map((r) => r.split("\t"))
      .filter((r) => r[0] === "R02");
    expect(zapisy[0]!.slice(2, 5)).toEqual(["518", "", "321"]);
    expect(obsah).not.toContain("\t602\t");
  });

  it("súpiska CSV nesie účty z agendy dokladu", () => {
    const csv = buildCsvUctovanie({ doklady: [prijata(), vystavena()], kody });
    const [, riadokPrijatej, riadokVystavenej] = csv.trimEnd().split(/\r?\n/);
    expect(riadokPrijatej).toContain(";518;");
    expect(riadokPrijatej).not.toContain(";602;");
    expect(riadokVystavenej).toContain(";602;");
  });
});

describe("Ostatné záväzky v Pohode", () => {
  it("kód aj v prijatých faktúrach záväzkom nie je", () => {
    expect(zavazkoveKody(ciselnik)).toEqual(["OZ1"]);
  });
  it("prijatá s kódom „2“ ide ako prijatá faktúra, s OZ1 ako záväzok", () => {
    // Rovnako ako v `nastaveniaDokladov`: zoznam záväzkových kódov ide do generátora.
    expect(zavazkoveKody(ciselnik).includes("2")).toBe(false);
    expect(zavazkoveKody([{ kod: "2", agenda: "commitment" }])).toEqual(["2"]);
    expect(zavazkoveKody([{ kod: " ", agenda: "commitment" }])).toEqual([]);
  });
});

describe("členenie DPH proti smeru dokladu", () => {
  it("smer podľa kódu a riadku KV", () => {
    expect(smerClenenia("UDpdp")).toBe("vydane");
    expect(smerClenenia("PD")).toBe("prijate");
    expect(smerClenenia("19A")).toBeNull();
    expect(smerClenenia("Prvé")).toBeNull();
    expect(smerKv("A2")).toBe("vydane");
    expect(smerKv("B.3")).toBe("prijate");
    expect(smerKv("X")).toBeNull();
  });

  it("PD na vystavenej a UD na prijatej sa ohlási", () => {
    expect(prekazkaClenenia("vydane", ["PD"])).toMatch(/členenie DPH PD patrí prijatým/);
    expect(prekazkaClenenia("prijate", ["UD"])).toMatch(/patrí vydaným/);
    expect(prekazkaClenenia("vydane", ["UD"], ["B2"])).toMatch(/kontrolného výkazu B2/);
    expect(prekazkaClenenia("vydane", ["UD", null, ""], ["A1", "X"])).toBeNull();
  });

  it("Pohoda: vystavená FA20260004 s PD neodíde, s UD áno", () => {
    const f = { invoice_number: "FA20260004", type: "regular", vat_total: 23, total: 123 };
    const it = [{ name: "a", vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 }];
    const firma = { country: "SK" };
    expect(
      prekazkaVydanej({ ...f, pohoda_clenenie_dph: "PD", kv_clenenie: "X" }, it, firma),
    ).toMatch(/^FA20260004 — členenie DPH PD patrí prijatým/);
    // Predvolené členenie firmy z opačnej strany tiež.
    expect(prekazkaVydanej(f, it, firma, { clenenieDph: "PD" })).toMatch(/PD patrí prijatým/);
    expect(prekazkaVydanej(f, [{ ...it[0], pohoda_clenenie_dph: "PN" }], firma)).toMatch(/PN/);
    expect(prekazkaVydanej({ ...f, pohoda_clenenie_dph: "UD" }, it, firma)).toBeNull();
  });

  it("Pohoda: prijatý doklad s UD alebo KV A.1 neodíde", () => {
    const d = {
      _typPohody: "receivedInvoice",
      _povodneCislo: "FV-1",
      vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
    };
    const firma = { country: "SK" };
    expect(prekazkaDokladu({ ...d, pohoda_clenenie_dph: "UD" }, firma)).toMatch(
      /^FV-1 — členenie DPH UD patrí vydaným/,
    );
    expect(prekazkaDokladu({ ...d, kv_clenenie: "A1" }, firma)).toMatch(/výkazu A1/);
    expect(prekazkaDokladu(d, firma, { clenenieDphPrijata: "UD" })).toMatch(/UD patrí vydaným/);
    expect(
      prekazkaDokladu({ ...d, pohoda_clenenie_dph: "PD", kv_clenenie: "B2" }, firma),
    ).toBeNull();
  });

  it("ostatné programy: model účtovania doklad s cudzím členením vynechá", () => {
    expect(prekazkaUctovania(vystavena({ pohoda_clenenie_dph: "PD" }), { country: "SK" })).toMatch(
      /^FA20260004 — členenie DPH PD/,
    );
    expect(prekazkaUctovania(prijata({ pohoda_clenenie_dph: "UD" }), {})).toMatch(
      /UD patrí vydaným/,
    );
    expect(prekazkaUctovania(prijata(), {})).toBeNull();
    expect(prekazkaUctovania(vystavena(), {})).toBeNull();
  });
});

describe("neplatiteľ DPH", () => {
  const neplatitel = { country: "SK", vat_payer: false, vat_scheme: null };
  const platitel = { country: "SK", vat_payer: true };

  it("rozhoduje vat_payer / vat_scheme, bez nich sa nič neblokuje", () => {
    expect(jeNeplatitel(neplatitel)).toBe(true);
    expect(jeNeplatitel({ country: "SK", vat_scheme: "sk_7", vat_payer: false })).toBe(true);
    expect(jeNeplatitel(platitel)).toBe(false);
    expect(jeNeplatitel({ country: "SK" })).toBe(false);
    expect(jeNeplatitel({ country: "SK", ic_dph: "" })).toBe(false);
    expect(jeNeplatitel(null)).toBe(false);
  });

  it("vystavená s 23 % a prijatá s odpočtom sa vynechajú, platiteľovi nie", () => {
    expect(prekazkaUctovania(vystavena(), neplatitel)).toMatch(
      /nie je platiteľ DPH, faktúra má DPH/,
    );
    expect(prekazkaUctovania(prijata(), neplatitel)).toMatch(/bez nároku na odpočet/);
    expect(prekazkaUctovania(vystavena(), platitel)).toBeNull();
    expect(prekazkaUctovania(prijata(), platitel)).toBeNull();
  });

  it("bez odpočtu, s PN, s KV X, bez DPH a v prenesení prejde", () => {
    expect(prekazkaUctovania(prijata({ odpocet: false }), neplatitel)).toBeNull();
    expect(prekazkaUctovania(prijata({ pohoda_clenenie_dph: "PN" }), neplatitel)).toBeNull();
    expect(prekazkaUctovania(prijata({ kv_clenenie: "X" }), neplatitel)).toBeNull();
    expect(
      prekazkaUctovania(
        prijata({ vat_amount: 0, amount_total: 100, pohoda_clenenie_dph: null }),
        neplatitel,
      ),
    ).toBeNull();
    expect(prekazkaUctovania(prijata({ reverse_charge: true }), neplatitel)).toBeNull();
    expect(
      prekazkaUctovania(
        vystavenaNaUctovanie(
          { id: "v", type: "regular", invoice_number: "1", total: 100 },
          [{ name: "x", subtotal: 100, vat_amount: 0, vat_rate: 0 }],
          {},
        ),
        neplatitel,
      ),
    ).toBeNull();
  });

  it("bloček s PD/B3 u neplatiteľa sa vynechá", () => {
    const b = blocekNaUctovanie(
      {
        id: "b",
        document_number: "77",
        total_amount: 12.3,
        net_amount: 10,
        vat_amount: 2.3,
        vat_rate: 23,
        pohoda_clenenie_dph: "PD",
        kv_clenenie: "B3",
      },
      {},
    );
    expect(prekazkaUctovania(b, neplatitel)).toMatch(/^77 — firma nie je platiteľ DPH/);
  });

  it("Pohoda: vystavená s DPH aj bloček s odpočtom sa zastavia", () => {
    const f = { invoice_number: "A1", type: "regular", vat_total: 23, total: 123 };
    const it = [{ name: "a", vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 }];
    expect(prekazkaVydanej(f, it, neplatitel)).toMatch(/^A1 — firma nie je platiteľ DPH/);
    expect(prekazkaVydanej(f, it, platitel)).toBeNull();
    const b = { document_number: "77", vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }] };
    expect(prekazkaDokladu(b, neplatitel)).toMatch(/^77 — firma nie je platiteľ DPH/);
    expect(prekazkaDokladu({ ...b, odpocet: false }, neplatitel)).toBeNull();
    expect(prekazkaDokladu({ ...b, pohoda_clenenie_dph: "PN" }, neplatitel)).toBeNull();
    expect(prekazkaDokladu(b, neplatitel, { clenenieDphDoklady: "PNx" })).toBeNull();
    expect(prekazkaDokladu(b, platitel)).toBeNull();
  });
});

describe("česká firma a prenesenie", () => {
  const cz = { ico: "12345678", country: "CZ", default_currency: "CZK" };
  const faktura = {
    id: "f-cz",
    invoice_number: "20260006",
    type: "regular",
    issue_date: "2026-10-08",
    due_date: "2026-10-22",
    customer_name: "Odběratel s.r.o.",
    customer_country: "CZ",
    customer_dic: "CZ12345678",
    reverse_charge: true,
    reverse_charge_type: "domestic_69",
    subtotal: 1000,
    vat_total: 0,
    total: 1000,
    currency: "CZK",
  };
  const polozky = [
    {
      name: "Stavební práce",
      quantity: 1,
      unit_price: 1000,
      vat_rate: 0,
      subtotal: 1000,
      vat_amount: 0,
      total: 1000,
    },
  ];

  it("predvolené UDpdp dostane len slovenská firma", () => {
    expect(clenenieVydanejPdp(null, { country: "SK" })).toBe("UDpdp");
    expect(clenenieVydanejPdp(null, cz)).toBe("");
    expect(clenenieVydanejPdp({ clenenieDphPdp: "UDA5" }, cz)).toBe("UDA5");
  });

  it("bez členenia sa faktúra ohlási a do XML nejde", () => {
    expect(prekazkaVydanej(faktura, polozky, cz)).toMatch(
      /^20260006 — prenesenie daňovej povinnosti \(§ 92a\) bez členenia/,
    );
    const xml = buildPohodaInvoiceXml({
      company: cz,
      invoices: [{ invoice: faktura, items: polozky }],
    });
    expect(xml).not.toContain("UDpdp");
    expect(xml).not.toContain(">20260006<");
  });

  it("s členením firmy alebo dokladu prejde a UDpdp v ňom nie je", () => {
    const xml = buildPohodaInvoiceXml({
      company: cz,
      invoices: [{ invoice: faktura, items: polozky }],
      nastavenia: { clenenieDphPdp: "UDA5" },
    });
    expect(xml).toContain("<typ:ids>UDA5</typ:ids>");
    expect(xml).not.toContain("UDpdp");
    expect(prekazkaVydanej({ ...faktura, pohoda_clenenie_dph: "UDA5" }, polozky, cz)).toBeNull();
  });

  it("položka v prenesení na bežnej českej faktúre tiež potrebuje členenie", () => {
    const f = { ...faktura, reverse_charge: false, reverse_charge_type: null };
    const p = [{ ...polozky[0], prenesenie: true }];
    expect(prekazkaVydanej(f, p, cz)).toMatch(/§ 92a/);
    expect(prekazkaVydanej(f, [{ ...p[0], pohoda_clenenie_dph: "UDA5" }], cz)).toBeNull();
    const xml = buildPohodaInvoiceXml({ company: cz, invoices: [{ invoice: f, items: p }] });
    expect(xml).not.toContain("UDpdp");
  });
});
