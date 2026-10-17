import { describe, expect, it } from "vitest";
import {
  STLPCE_DATEV,
  belegdatum,
  belegfeld1,
  buildDatevBuchungsstapel,
  cisloDatev,
  textDatev,
} from "./export-datev";
import { blocekNaUctovanie, prijataNaUctovanie, vystavenaNaUctovanie } from "./zauctovanie-export";
import { doCp1252, naAnsi } from "./cp1252";

const firma = { name: "Muster GmbH", country: "DE", vat_scheme: "de_regel" };
const nastavenia = { beraternummer: "29098", mandantennummer: "55003", osnova: "SKR03" };
const teraz = new Date("2026-10-17T08:09:10.123Z");

/** Rozdelí riadok CSV podľa bodkočiarky mimo úvodzoviek. */
const polia = (r: string) => r.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
const riadky = (obsah: string) => obsah.trimEnd().split("\r\n");
const stlpec = (r: string, nazov: string) => polia(r)[STLPCE_DATEV.indexOf(nazov)];

function vystavena(extra: Record<string, unknown> = {}, items?: any[]) {
  return vystavenaNaUctovanie(
    {
      id: "v1",
      type: "regular",
      invoice_number: "RE-2026-001",
      issue_date: "2026-10-05",
      delivery_date: "2026-10-03",
      due_date: "2026-10-19",
      total: 119,
      currency: "EUR",
      customer_name: "Kunde AG",
      ...extra,
    },
    items ?? [{ name: "Beratung", subtotal: 100, vat_amount: 19, vat_rate: 19 }],
    {},
  );
}

describe("DATEV Buchungsstapel — hlavička", () => {
  it("EXTF 700, kategória 21, 31 polí, poradca, mandant, WJ, dĺžka účtov, obdobie a SKR", () => {
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [vystavena()],
      nastavenia: { ...nastavenia, diktat: "fa" },
      teraz,
    });
    const [h, s] = riadky(obsah);
    const p = polia(h!);
    expect(p).toHaveLength(31);
    expect(p.slice(0, 6)).toEqual([
      '"EXTF"',
      "700",
      "21",
      '"Buchungsstapel"',
      "13",
      "20261017080910123",
    ]);
    expect(p[10]).toBe("29098");
    expect(p[11]).toBe("55003");
    expect(p[12]).toBe("20260101"); // WJ-Beginn
    expect(p[13]).toBe("4"); // Sachkontenlänge
    expect(p[14]).toBe("20261005"); // Datum vom
    expect(p[15]).toBe("20261005"); // Datum bis
    expect(p[17]).toBe('"FA"');
    expect(p[18]).toBe("1"); // Buchungstyp
    expect(p[20]).toBe("0"); // Festschreibung
    expect(p[21]).toBe('"EUR"');
    expect(p[26]).toBe('"03"');
    // Druhý riadok: 125 názvov stĺpcov, prvé presne podľa DATEV.
    expect(s!.split(";")).toHaveLength(125);
    expect(s!.split(";").slice(0, 14)).toEqual([
      "Umsatz (ohne Soll/Haben-Kz)",
      "Soll/Haben-Kennzeichen",
      "WKZ Umsatz",
      "Kurs",
      "Basis-Umsatz",
      "WKZ Basis-Umsatz",
      "Konto",
      "Gegenkonto (ohne BU-Schlüssel)",
      "BU-Schlüssel",
      "Belegdatum",
      "Belegfeld 1",
      "Belegfeld 2",
      "Skonto",
      "Buchungstext",
    ]);
  });

  it("bez Beraternummer a Mandantennummer export nepustí", () => {
    expect(() =>
      buildDatevBuchungsstapel({ firma, doklady: [vystavena()], nastavenia: {} }),
    ).toThrow(/Beraternummer/);
    expect(() =>
      buildDatevBuchungsstapel({
        firma,
        doklady: [vystavena()],
        nastavenia: { beraternummer: "1001" },
      }),
    ).toThrow(/Mandantennummer/);
  });

  it("doklady z dvoch hospodárskych rokov do jedného stapla nejdú", () => {
    expect(() =>
      buildDatevBuchungsstapel({
        firma,
        doklady: [vystavena(), vystavena({ id: "v2", issue_date: "2027-01-02" })],
        nastavenia,
      }),
    ).toThrow(/hospodárskych rokov/);
    // Hospodársky rok od júla: október 2026 aj marec 2027 sú v jednom.
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [vystavena(), vystavena({ id: "v2", issue_date: "2027-03-02" })],
      nastavenia: { ...nastavenia, zaciatokRoka: "7" },
      teraz,
    });
    expect(polia(riadky(obsah)[0]!)[12]).toBe("20260701");
  });
});

describe("DATEV Buchungsstapel — zápisy", () => {
  it("faktúra 19 %: brutto na Debitor v Soll, výnos 8400 (automatický, bez BU)", () => {
    const { obsah, preskocene } = buildDatevBuchungsstapel({
      firma,
      doklady: [vystavena()],
      nastavenia,
      teraz,
    });
    expect(preskocene).toEqual([]);
    const r = riadky(obsah)[2]!;
    expect(polia(r)).toHaveLength(125);
    expect(stlpec(r, "Umsatz (ohne Soll/Haben-Kz)")).toBe("119,00");
    expect(stlpec(r, "Soll/Haben-Kennzeichen")).toBe('"S"');
    expect(stlpec(r, "WKZ Umsatz")).toBe('"EUR"');
    expect(stlpec(r, "Konto")).toBe("10000");
    expect(stlpec(r, "Gegenkonto (ohne BU-Schlüssel)")).toBe("8400");
    expect(stlpec(r, "BU-Schlüssel")).toBe("");
    expect(stlpec(r, "Belegdatum")).toBe("0510");
    expect(stlpec(r, "Belegfeld 1")).toBe('"RE-2026-001"');
    expect(stlpec(r, "Belegfeld 2")).toBe('"191026"');
    expect(stlpec(r, "Buchungstext")).toBe('"Kunde AG"');
    expect(stlpec(r, "Leistungsdatum")).toBe("03102026");
    expect(stlpec(r, "Fälligkeit")).toBe("19102026");
  });

  it("SKR04 a dlhšie účty: 4400 → 44000, osobný účet o číslicu dlhší", () => {
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [vystavena()],
      nastavenia: { ...nastavenia, osnova: "SKR04", dlzkaUctov: "5" },
      teraz,
    });
    const [h, , r] = riadky(obsah);
    expect(polia(h!)[26]).toBe('"04"');
    expect(stlpec(r!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("44000");
    expect(stlpec(r!, "Konto")).toBe("100000");
  });

  it("zmiešané sadzby: riadok na sadzbu, 7 % na 8300", () => {
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [
        vystavena({ total: 226 }, [
          { name: "A", subtotal: 100, vat_amount: 19, vat_rate: 19 },
          { name: "B", subtotal: 100, vat_amount: 7, vat_rate: 7 },
        ]),
      ],
      nastavenia,
      teraz,
    });
    const z = riadky(obsah).slice(2);
    expect(z.map((r) => stlpec(r, "Gegenkonto (ohne BU-Schlüssel)"))).toEqual(["8400", "8300"]);
    expect(z.map((r) => stlpec(r, "Umsatz (ohne Soll/Haben-Kz)"))).toEqual(["119,00", "107,00"]);
  });

  it("dobropis: opačné S/H (Haben na Debitore), kladná suma", () => {
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [
        vystavena({ type: "credit_note", invoice_number: "GS-1", total: -119 }, [
          { name: "Beratung", subtotal: -100, vat_amount: -19, vat_rate: 19 },
        ]),
      ],
      nastavenia,
      teraz,
    });
    const r = riadky(obsah)[2]!;
    expect(stlpec(r, "Soll/Haben-Kennzeichen")).toBe('"H"');
    expect(stlpec(r, "Umsatz (ohne Soll/Haben-Kz)")).toBe("119,00");
    expect(stlpec(r, "Buchungstext")).toBe('"Gutschrift Kunde AG"');
  });

  it("reverse charge: služba do EÚ na 8336, tovar do EÚ na 8125 s IČ DPH, netto", () => {
    const sluzba = vystavena(
      {
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        eu_plnenie: "sluzba",
        customer_ic_dph: "ATU12345678",
        total: 100,
      },
      [{ name: "Beratung", subtotal: 100, vat_amount: 0, vat_rate: 0 }],
    );
    const tovar = vystavena(
      {
        id: "v2",
        invoice_number: "RE-2",
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        eu_plnenie: "tovar",
        customer_ic_dph: "FR12345678901",
        total: 500,
      },
      [{ name: "Ware", subtotal: 500, vat_amount: 0, vat_rate: 0 }],
    );
    const domaci13b = vystavena(
      {
        id: "v3",
        invoice_number: "RE-3",
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
      },
      [{ name: "Bau", subtotal: 1000, vat_amount: 0, vat_rate: 0 }],
    );
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [sluzba, tovar, domaci13b],
      nastavenia,
      teraz,
    });
    const z = riadky(obsah).slice(2);
    expect(z.map((r) => stlpec(r, "Gegenkonto (ohne BU-Schlüssel)"))).toEqual([
      "8336",
      "8125",
      "8337",
    ]);
    expect(stlpec(z[0]!, "Umsatz (ohne Soll/Haben-Kz)")).toBe("100,00");
    expect(stlpec(z[0]!, "EU-Mitgliedstaat u. UStID (Bestimmung)")).toBe('"ATU12345678"');
    expect(stlpec(z[1]!, "EU-Mitgliedstaat u. UStID (Bestimmung)")).toBe('"FR12345678901"');
    expect(z.every((r) => stlpec(r, "BU-Schlüssel") === "")).toBe(true);
  });

  it("prijatá faktúra 19 %: Kreditor v Haben, náklad 4980 s BU 9; účet z predkontácie prebije", () => {
    const p = prijataNaUctovanie(
      {
        id: "p1",
        invoice_number: "ER 4711",
        supplier_name: "Lieferant GmbH",
        supplier_ic_dph: "DE123456789",
        issue_date: "2026-10-02",
        due_date: "2026-10-30",
        amount_without_vat: 200,
        vat_amount: 38,
        amount_total: 238,
        dph_rezim: "tuzemsko",
      },
      {},
    );
    const s = prijataNaUctovanie(
      {
        id: "p2",
        invoice_number: "ER 4712",
        supplier_name: "Großhandel",
        issue_date: "2026-10-03",
        amount_without_vat: 100,
        vat_amount: 19,
        amount_total: 119,
        pohoda_predkontacia: "WE",
      },
      {},
    );
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [p, s],
      kody: { WE: { kod: "WE", popis: "Wareneingang 19 %", ucetMd: "3400", ucetD: "70000" } },
      nastavenia,
      teraz,
    });
    const [r1, r2] = riadky(obsah).slice(2);
    expect(stlpec(r1!, "Konto")).toBe("70000");
    expect(stlpec(r1!, "Soll/Haben-Kennzeichen")).toBe('"H"');
    expect(stlpec(r1!, "Umsatz (ohne Soll/Haben-Kz)")).toBe("238,00");
    expect(stlpec(r1!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("4980");
    expect(stlpec(r1!, "BU-Schlüssel")).toBe('"9"');
    // Belegfeld 1 bez medzery (DATEV ju nepripúšťa).
    expect(stlpec(r1!, "Belegfeld 1")).toBe('"ER4711"');
    // 3400 je automatický účet — BU-Schlüssel by DATEV odmietol.
    expect(stlpec(r2!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("3400");
    expect(stlpec(r2!, "BU-Schlüssel")).toBe("");
    expect(stlpec(r2!, "Buchungstext")).toBe('"Großhandel"');
  });

  it("prijatá služba z EÚ v prenesení a nadobudnutie tovaru: netto na automatické účty", () => {
    const sluzba = prijataNaUctovanie(
      {
        id: "p1",
        invoice_number: "INV-9",
        supplier_name: "Software Ltd",
        supplier_ic_dph: "IE1234567T",
        issue_date: "2026-10-02",
        amount_without_vat: 50,
        vat_amount: 0,
        amount_total: 50,
        reverse_charge: true,
      },
      {},
    );
    const tovar = prijataNaUctovanie(
      {
        id: "p2",
        invoice_number: "FA-77",
        supplier_name: "Ťažba s.r.o.",
        supplier_ic_dph: "SK2020123456",
        issue_date: "2026-10-04",
        amount_without_vat: 1000,
        vat_amount: 0,
        amount_total: 1000,
        dph_rezim: "nadobudnutie",
      },
      {},
    );
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [sluzba, tovar],
      nastavenia,
      teraz,
    });
    const [r1, r2] = riadky(obsah).slice(2);
    expect(stlpec(r1!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("3123");
    expect(stlpec(r1!, "Umsatz (ohne Soll/Haben-Kz)")).toBe("50,00");
    expect(stlpec(r2!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("3425");
    // Slovenský text bez znakov mimo Windows-1252.
    expect(stlpec(r2!, "Buchungstext")).toBe('"Tažba s.r.o."');
  });

  it("vlastný neautomatický účet pre § 13b dostane BU-Schlüssel 94", () => {
    const p = prijataNaUctovanie(
      {
        id: "p1",
        invoice_number: "B-1",
        supplier_name: "Bau GmbH",
        supplier_ic_dph: "DE111111111",
        issue_date: "2026-10-02",
        amount_without_vat: 1000,
        vat_amount: 0,
        amount_total: 1000,
        reverse_charge: true,
      },
      {},
    );
    const { obsah } = buildDatevBuchungsstapel({
      firma,
      doklady: [p],
      nastavenia: { ...nastavenia, ucty: { rcTuzemsko19: "3100" } },
      teraz,
    });
    const r = riadky(obsah)[2]!;
    expect(stlpec(r, "Gegenkonto (ohne BU-Schlüssel)")).toBe("3100");
    expect(stlpec(r, "BU-Schlüssel")).toBe('"94"');
  });

  it("bloček v hotovosti ide z pokladne 1000 v Haben", () => {
    const b = blocekNaUctovanie(
      {
        id: "b1",
        document_number: "123",
        supplier_name: "Tankstelle",
        issue_date: "2026-10-06",
        payment_method: "hotovost",
        net_amount: 50,
        vat_amount: 9.5,
        vat_rate: 19,
        total_amount: 59.5,
        status: "processed",
      },
      { blockyPodlaPlatby: true },
    );
    const { obsah } = buildDatevBuchungsstapel({ firma, doklady: [b], nastavenia, teraz });
    const r = riadky(obsah)[2]!;
    expect(stlpec(r, "Konto")).toBe("1000");
    expect(stlpec(r, "Soll/Haben-Kennzeichen")).toBe('"H"');
    expect(stlpec(r, "Umsatz (ohne Soll/Haben-Kz)")).toBe("59,50");
    expect(stlpec(r, "BU-Schlüssel")).toBe('"9"');
  });

  it("cudzia mena: Umsatz v USD, Kurs (USD za 1 EUR), Basis-Umsatz v eurách", () => {
    const f = vystavena({ currency: "USD", exchange_rate: 1.1, total: 119 }, [
      { name: "Service", subtotal: 100, vat_amount: 19, vat_rate: 19 },
    ]);
    const { obsah } = buildDatevBuchungsstapel({ firma, doklady: [f], nastavenia, teraz });
    const r = riadky(obsah)[2]!;
    expect(stlpec(r, "Umsatz (ohne Soll/Haben-Kz)")).toBe("119,00");
    expect(stlpec(r, "WKZ Umsatz")).toBe('"USD"');
    expect(stlpec(r, "Kurs")).toBe("1,100000");
    expect(stlpec(r, "Basis-Umsatz")).toBe("108,18");
    expect(stlpec(r, "WKZ Basis-Umsatz")).toBe('"EUR"');
  });

  it("cudzia mena bez kurzu a zálohová faktúra sa vynechajú s dôvodom", () => {
    const { preskocene } = buildDatevBuchungsstapel({
      firma,
      doklady: [
        vystavena({ currency: "USD" }),
        vystavena({ id: "z", invoice_number: "ZF-1", type: "proforma" }),
      ],
      nastavenia,
      teraz,
    });
    expect(preskocene).toHaveLength(2);
    expect(preskocene[0]).toMatch(/kurz/);
    expect(preskocene[1]).toMatch(/^ZF-1 — zálohová/);
  });

  it("Kleinunternehmer: výnos 8195 bez dane", () => {
    const { obsah } = buildDatevBuchungsstapel({
      firma: { ...firma, vat_scheme: "de_kleinunternehmer" },
      doklady: [
        vystavena({ total: 100 }, [{ name: "X", subtotal: 100, vat_amount: 0, vat_rate: 0 }]),
      ],
      nastavenia,
      teraz,
    });
    expect(stlpec(riadky(obsah)[2]!, "Gegenkonto (ohne BU-Schlüssel)")).toBe("8195");
  });

  it("osobné účty: ten istý partner vždy ten istý Debitor v rozsahu 10001–69999", () => {
    const n = { ...nastavenia, osobneUcty: "osobne" };
    const a = vystavena({ customer_ic_dph: "DE123456789" });
    const ucet1 = stlpec(
      riadky(buildDatevBuchungsstapel({ firma, doklady: [a], nastavenia: n, teraz }).obsah)[2]!,
      "Konto",
    );
    const ucet2 = stlpec(
      riadky(
        buildDatevBuchungsstapel({
          firma,
          doklady: [vystavena({ id: "x" }), a],
          nastavenia: n,
          teraz,
        }).obsah,
      )[3]!,
      "Konto",
    );
    expect(ucet1).toBe(ucet2);
    expect(Number(ucet1)).toBeGreaterThan(10000);
    expect(Number(ucet1)).toBeLessThan(70000);
  });
});

describe("DATEV — kódovanie čísel, dátumov a textu", () => {
  it("desatinná čiarka bez oddeľovača tisícov", () => {
    expect(cisloDatev(1234567.5)).toBe("1234567,50");
    expect(cisloDatev(0.1 + 0.2)).toBe("0,30");
    expect(cisloDatev(1.0850001, 6)).toBe("1,085000");
  });
  it("Belegdatum TTMM", () => {
    expect(belegdatum("2026-03-07")).toBe("0703");
    expect(belegdatum("2026-12-31")).toBe("3112");
  });
  it("text v úvodzovkách, úvodzovka zdvojená, bodkočiarka a zalomenie preč", () => {
    expect(textDatev('Firma "Müller"; GmbH\nBerlin')).toBe('"Firma ""Müller"" GmbH Berlin"');
    expect(textDatev("x".repeat(80), 60)).toBe(`"${"x".repeat(60)}"`);
  });
  it("Belegfeld 1 len s povolenými znakmi, najviac 36", () => {
    expect(belegfeld1("FV 2026/001_ä")).toBe("FV2026/001a");
    expect(belegfeld1("A".repeat(40))).toHaveLength(36);
  });
  it("Windows-1252: nemecké znaky a euro ostanú, slovenské sa prepíšu", () => {
    expect(naAnsi("Größe € – Žilina, Čadca, ľan")).toBe("Größe € – Žilina, Cadca, lan");
    expect([...doCp1252("ä€ß")]).toEqual([0xe4, 0x80, 0xdf]);
  });
});

describe("DATEV — sadzba prijatej faktúry bez položiek", () => {
  it("7 % odhadnuté zo súm ako slovenských 5 % sa vráti na 7 % s BU 8", () => {
    const p = prijataNaUctovanie(
      {
        id: "p7",
        invoice_number: "ER-7",
        supplier_name: "Buchhandlung",
        issue_date: "2026-10-02",
        amount_without_vat: 100,
        vat_amount: 7,
        amount_total: 107,
      },
      {},
    );
    const { obsah, upozornenia } = buildDatevBuchungsstapel({
      firma,
      doklady: [p],
      nastavenia,
      teraz,
    });
    const r = riadky(obsah)[2]!;
    expect(upozornenia).toEqual([]);
    expect(stlpec(r, "Umsatz (ohne Soll/Haben-Kz)")).toBe("107,00");
    expect(stlpec(r, "BU-Schlüssel")).toBe('"8"');
  });
});
