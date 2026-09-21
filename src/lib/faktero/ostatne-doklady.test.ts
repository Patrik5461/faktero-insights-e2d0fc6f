import { describe, expect, it } from "vitest";
import { bezpecneMeno, jeCestaDokladu, nazovDruhu, stavLehoty } from "./ostatne-doklady";

describe("ostatné doklady", () => {
  it("meno súboru bez diakritiky a lomiek", () => {
    expect(bezpecneMeno("Exekučný príkaz č. 12/2026.pdf")).toBe("Exekucny_prikaz_c._12_2026.pdf");
    expect(bezpecneMeno("../../etc/passwd")).toBe("etc_passwd");
    expect(bezpecneMeno("ľščť")).toBe("lsct");
    expect(bezpecneMeno("***")).toBe("subor");
  });

  it("cesta musí byť v priečinku firmy a dokladu", () => {
    expect(jeCestaDokladu("f/d/1-a.pdf", "f", "d")).toBe(true);
    expect(jeCestaDokladu("iná/d/a.pdf", "f", "d")).toBe(false);
    expect(jeCestaDokladu("f/iny/a.pdf", "f", "d")).toBe(false);
    expect(jeCestaDokladu("f/d/x/a.pdf", "f", "d")).toBe(false);
    expect(jeCestaDokladu("f/d/", "f", "d")).toBe(false);
  });

  it("lehota po termíne a blízko", () => {
    expect(stavLehoty("2026-09-20", "2026-09-21")).toBe("po");
    expect(stavLehoty("2026-09-28", "2026-09-21")).toBe("blizko");
    expect(stavLehoty("2026-10-01", "2026-09-21")).toBe(null);
    expect(stavLehoty(null, "2026-09-21")).toBe(null);
  });

  it("neznámy druh je Iné", () => {
    expect(nazovDruhu("exekucia")).toBe("Exekúcia");
    expect(nazovDruhu("xyz")).toBe("Iné");
  });
});

import { priecinokDokladu, supisOstatnych } from "./ostatne-doklady-balik.server";

describe("balík ostatných dokladov", () => {
  const d = {
    id: "1",
    kind: "exekucia",
    sender: "Exekútorský úrad Nitra",
    subject: "Exekučný príkaz",
    received_date: "2026-09-10",
    amount: 1234.5,
    currency: "EUR",
    due_date: null,
    note: 'Zrážky od "októbra"; 1/3',
    status: "new",
    other_document_files: [{ path: "a", name: "a.pdf", position: 0 }],
  };

  it("súpis má hlavičku, desatinnú čiarku a úvodzovky", () => {
    const riadky = supisOstatnych([d]).replace("﻿", "").split("\r\n");
    expect(riadky[0]).toBe(
      "prijate;druh;odosielatel;predmet;suma;mena;lehota;zamestnanec;zmluva;poznamka;prilohy",
    );
    expect(riadky[1]).toBe(
      '2026-09-10;Exekúcia;Exekútorský úrad Nitra;Exekučný príkaz;1234,5;EUR;;;;"Zrážky od ""októbra""; 1/3";1',
    );
    const sVazbou = supisOstatnych([
      { ...d, zamestnanec: { first_name: "Ján", last_name: "Novák" }, zmluva: null },
    ]).split("\r\n")[1];
    expect(sVazbou).toContain(";Ján Novák;;");
  });

  it("priečinok sa dá triediť a nemá diakritiku", () => {
    expect(priecinokDokladu(d, 0)).toBe("001_2026-09-10_Exekucia_Exekutorsky_urad_Nitra");
  });
});

import { jeRozpoznaniePouzitelne, normalizujRozpoznanie } from "./ostatne-doklady";

describe("rozpoznanie ostatného dokladu", () => {
  it("uprace odpoveď modelu", () => {
    const r = normalizujRozpoznanie({
      kind: "exekucia",
      sender: "  JUDr. Novák, súdny exekútor ",
      subject: "Exekučný príkaz na zrážky zo mzdy",
      document_date: "12. 9. 2026",
      amount: "1 234,50 €",
      currency: "eur",
      due_date: "",
      summary: "Zrážky zo mzdy zamestnanca.",
    });
    expect(r).toEqual({
      kind: "exekucia",
      sender: "JUDr. Novák, súdny exekútor",
      subject: "Exekučný príkaz na zrážky zo mzdy",
      document_date: "2026-09-12",
      amount: 1234.5,
      currency: "EUR",
      due_date: null,
      summary: "Zrážky zo mzdy zamestnanca.",
    });
    expect(jeRozpoznaniePouzitelne(r)).toBe(true);
  });

  it("neznámy druh a nezmysly", () => {
    const r = normalizujRozpoznanie({ kind: "faktura", sender: "null", currency: "€" });
    expect(r.kind).toBe("ine");
    expect(r.sender).toBeNull();
    expect(r.currency).toBeNull();
    expect(jeRozpoznaniePouzitelne(r)).toBe(false);
    expect(normalizujRozpoznanie(null).kind).toBe("ine");
  });
});

import { jeOstatnyZMailu, ostatnyZMailu } from "./ostatne-doklady";

describe("ostatný doklad z e-mailu", () => {
  it("pri pochybnosti ostáva faktúrou", () => {
    expect(jeOstatnyZMailu({ document_type: "ostatny" })).toBe(true);
    expect(jeOstatnyZMailu({ document_type: "faktura" })).toBe(false);
    expect(jeOstatnyZMailu({})).toBe(false);
    expect(jeOstatnyZMailu(null)).toBe(false);
  });

  it("zostaví riadok aj s pôvodom v poznámke", () => {
    const r = ostatnyZMailu({
      ai: {
        document_type: "ostatny",
        other_kind: "poistovna",
        supplier_name: "Allianz - Slovenská poisťovňa",
        other_subject: "Predpis poistného na rok 2027",
        amount_total: "480,00",
        currency: "EUR",
        other_due_date: "2027-01-15",
        summary: "Ročné poistné za auto.",
      },
      odosielatel: "noreply@allianz.sk",
      predmet: "Predpis",
      nazovSuboru: "predpis.pdf",
      dnes: "2026-09-21",
    });
    expect(r).toEqual({
      kind: "poistovna",
      sender: "Allianz - Slovenská poisťovňa",
      subject: "Predpis poistného na rok 2027",
      received_date: "2026-09-21",
      amount: 480,
      currency: "EUR",
      due_date: "2027-01-15",
      note: "Ročné poistné za auto.\n\nPrišlo e-mailom od noreply@allianz.sk, predmet „Predpis“.",
    });
  });

  it("bez údajov berie odosielateľa a predmet mailu", () => {
    const r = ostatnyZMailu({ ai: null, odosielatel: "a@b.sk", predmet: null, nazovSuboru: "x.pdf", dnes: "2026-09-21" });
    expect(r.sender).toBe("a@b.sk");
    expect(r.subject).toBe("x.pdf");
    expect(r.kind).toBe("ine");
  });
});

import { lehotyNaUpozornenie, navrhniZamestnanca, navrhniZmluvu } from "./ostatne-doklady";

describe("väzby ostatných dokladov", () => {
  const ludia = [
    { id: "a", first_name: "Ján", last_name: "Novák" },
    { id: "b", first_name: "Jana", last_name: "Nováková" },
    { id: "c", first_name: "Peter", last_name: null },
  ];

  it("zamestnanec podľa celého mena v oboch poradiach", () => {
    expect(navrhniZamestnanca("Exekučný príkaz — JAN NOVAK, nar. 1985", ludia)).toBe("a");
    expect(navrhniZamestnanca("povinný: Nováková Jana", ludia)).toBe("b");
    expect(navrhniZamestnanca("povinný Novák", ludia)).toBeNull();
    expect(navrhniZamestnanca("Peter", ludia)).toBeNull();
  });

  it("pri dvoch zhodách nevyberie nikoho", () => {
    expect(navrhniZamestnanca("Ján Novák", [...ludia, { id: "d", first_name: "Jan", last_name: "Novak" }])).toBeNull();
  });

  it("zmluva podľa čísla, bez ohľadu na medzery a pomlčky", () => {
    const zmluvy = [
      { id: "x", contract_number: "LZ-2024/0815" },
      { id: "y", contract_number: "12" },
    ];
    expect(navrhniZmluvu("Oznámenie k zmluve č. LZ 2024 0815", zmluvy)).toBe("x");
    expect(navrhniZmluvu("strana 12", zmluvy)).toBeNull();
  });

  it("lehoty: zmeškané a do 7 dní, bez odovzdaných", () => {
    const d = (id: string, due: string | null, status = "new") => ({ id, due_date: due, status, sender: null, subject: null, kind: "ine" });
    const r = lehotyNaUpozornenie(
      [d("1", "2026-09-30"), d("2", "2026-09-20"), d("3", "2026-09-25", "exported"), d("4", null), d("5", "2026-09-24", "processed")],
      "2026-09-21",
    );
    expect(r.map((x) => [x.id, x.po])).toEqual([["2", true], ["5", false]]);
  });
});
