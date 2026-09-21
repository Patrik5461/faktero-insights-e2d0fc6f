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
    expect(riadky[0]).toBe("prijate;druh;odosielatel;predmet;suma;mena;lehota;poznamka;prilohy");
    expect(riadky[1]).toBe(
      '2026-09-10;Exekúcia;Exekútorský úrad Nitra;Exekučný príkaz;1234,5;EUR;;"Zrážky od ""októbra""; 1/3";1',
    );
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
