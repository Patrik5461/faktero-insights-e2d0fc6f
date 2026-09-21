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
