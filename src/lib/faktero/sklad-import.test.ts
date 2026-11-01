import { describe, expect, it } from "vitest";
import {
  automatickeMapovanie,
  cisloZImportu,
  dekodujCsv,
  pripravRiadky,
  rozpoznajStlpec,
} from "./sklad-import";

describe("cisloZImportu (SA-12b)", () => {
  it("číta desatinnú čiarku aj medzery v tisícoch", () => {
    expect(cisloZImportu("1,5")).toBe(1.5);
    expect(cisloZImportu("1 234,50")).toBe(1234.5);
    expect(cisloZImportu("1 234,50 €")).toBe(1234.5);
    expect(cisloZImportu("1.234,50")).toBe(1234.5);
    expect(cisloZImportu("1,234.50")).toBe(1234.5);
    expect(cisloZImportu("23 %")).toBe(23);
    expect(cisloZImportu(12.4)).toBe(12.4);
  });
  it("prázdna bunka je null, nezmysel NaN", () => {
    expect(cisloZImportu("")).toBeNull();
    expect(cisloZImportu("  ")).toBeNull();
    expect(cisloZImportu(undefined)).toBeNull();
    expect(cisloZImportu("abc")).toBeNaN();
    expect(cisloZImportu("1,2,3x")).toBeNaN();
  });
});

describe("rozpoznajStlpec (SA-12c)", () => {
  it("„Stav“ a „Aktuálny stav“ z exportu sa ignorujú — nevznikne príjem", () => {
    expect(rozpoznajStlpec("Stav")).toBeNull();
    expect(rozpoznajStlpec("Aktuálny stav")).toBeNull();
    expect(rozpoznajStlpec("Aktuální stav")).toBeNull();
    expect(rozpoznajStlpec("Aktueller Bestand")).toBeNull();
    expect(rozpoznajStlpec("Hodnota skladu")).toBeNull();
    expect(rozpoznajStlpec("Počiatočný stav")).toBe("initial_stock");
  });
  it("rozpozná krátke stĺpce exportu výberu", () => {
    const m = automatickeMapovanie([
      "SKU",
      "Názov",
      "Čiarový kód",
      "Jednotka",
      "Stav",
      "Min",
      "Nákup",
      "Predaj",
      "DPH %",
    ]);
    expect(m).toEqual({
      SKU: "sku",
      Názov: "name",
      "Čiarový kód": "barcode",
      Jednotka: "unit",
      Min: "min_stock",
      Nákup: "purchase_price",
      Predaj: "sale_price",
      "DPH %": "vat_rate",
    });
  });
  it("rozpozná plný export aj po česky a nemecky", () => {
    const sk = automatickeMapovanie([
      "SKU",
      "Názov produktu",
      "Sklad",
      "Aktuálny stav",
      "Minimálny stav",
      "Nákupná cena",
      "Predajná cena",
      "DPH %",
      "Hodnota skladu",
    ]);
    expect(Object.values(sk).sort()).toEqual(
      [
        "sku",
        "name",
        "warehouse_name",
        "min_stock",
        "purchase_price",
        "sale_price",
        "vat_rate",
      ].sort(),
    );
    const cs = automatickeMapovanie([
      "Název produktu",
      "Nákupní cena",
      "Prodejní cena",
      "Minimální stav",
      "Aktuální stav",
    ]);
    expect(Object.values(cs).sort()).toEqual(["min_stock", "name", "purchase_price", "sale_price"]);
    const de = automatickeMapovanie([
      "Produktbezeichnung",
      "Einkaufspreis",
      "Verkaufspreis",
      "Mindestbestand",
      "MwSt. %",
    ]);
    expect(Object.values(de).sort()).toEqual([
      "min_stock",
      "name",
      "purchase_price",
      "sale_price",
      "vat_rate",
    ]);
  });
});

describe("pripravRiadky (SA-12a/b)", () => {
  const mapovanie = {
    Názov: "name",
    Nákup: "purchase_price",
    Predaj: "sale_price",
    DPH: "vat_rate",
    Min: "min_stock",
  };
  it("prázdne bunky vynechá, aby sa na karte nezmenili", () => {
    const { riadky, chyby } = pripravRiadky(
      [{ Názov: "Skrutka", Nákup: "", Predaj: "1,20", DPH: "", Min: "" }],
      mapovanie,
    );
    expect(chyby).toEqual([]);
    expect(riadky).toEqual([{ riadok: 2, name: "Skrutka", sale_price: 1.2 }]);
    expect("vat_rate" in riadky[0]).toBe(false);
    expect("purchase_price" in riadky[0]).toBe(false);
  });
  it("zlé číslo vyradí len svoj riadok", () => {
    const { riadky, chyby } = pripravRiadky(
      [
        { Názov: "A", Nákup: "1,50" },
        { Názov: "B", Nákup: "jeden euro" },
        { Názov: "C", Nákup: "-3" },
        { Názov: "", Nákup: "9" },
      ],
      mapovanie,
    );
    expect(riadky.map((r) => r.name)).toEqual(["A"]);
    expect(riadky[0].purchase_price).toBe(1.5);
    expect(chyby.map((c) => c.riadok)).toEqual([3, 4]);
    expect(chyby[0].pole).toBe("purchase_price");
  });
  it("reimport exportu výberu nenesie počiatočný stav ani nuly", () => {
    const hlavicky = [
      "SKU",
      "Názov",
      "Čiarový kód",
      "Jednotka",
      "Stav",
      "Min",
      "Nákup",
      "Predaj",
      "DPH %",
    ];
    const m = automatickeMapovanie(hlavicky);
    const { riadky } = pripravRiadky(
      [
        {
          SKU: "A1",
          Názov: "Skrutka",
          "Čiarový kód": "",
          Jednotka: "ks",
          Stav: "12",
          Min: "5",
          Nákup: "0,8",
          Predaj: "1,2",
          "DPH %": "23",
        },
      ],
      m,
    );
    expect(riadky[0]).toEqual({
      riadok: 2,
      sku: "A1",
      name: "Skrutka",
      unit: "ks",
      min_stock: 5,
      purchase_price: 0.8,
      sale_price: 1.2,
      vat_rate: 23,
    });
    expect(riadky[0].initial_stock).toBeUndefined();
  });
});

describe("dekodujCsv (F-31)", () => {
  it("UTF-8 bez BOM číta ako UTF-8", () => {
    const bajty = new TextEncoder().encode("Názov;Čiarový kód\nŽľté;1");
    expect(dekodujCsv(bajty)).toBe("Názov;Čiarový kód\nŽľté;1");
  });
  it("BOM odstráni", () => {
    const bajty = new TextEncoder().encode("﻿Názov");
    expect(dekodujCsv(bajty)).toBe("Názov");
  });
  it("neplatné UTF-8 číta ako Windows-1250", () => {
    // „Čaj“ v cp1250: Č = 0xC8
    expect(dekodujCsv(new Uint8Array([0xc8, 0x61, 0x6a]))).toBe("Čaj");
  });
});
