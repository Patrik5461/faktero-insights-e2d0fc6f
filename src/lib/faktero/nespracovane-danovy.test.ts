import { describe, expect, it } from "vitest";
import {
  DRUHY_NESPRACOVANYCH,
  chybajuce,
  jeDruhPrijatej,
  naUhraduZNespracovaneho,
  navrhDruhu,
  prazdneUdaje,
  prijataZUdajov,
  typPrijatejZDruhu,
  udajeZPrijatej,
  type UdajeNespracovaneho,
} from "./nespracovane";
import { jeDanovyDokladKPlatbe, jeZalohovaFaktura } from "./zalohova-rozpoznanie";
import { dvojitaDphZalohy, obsadzujeZalohu, typZoznamuPrijatych, zalohaVolnaPreDanovy } from "./prijaty-danovy-doklad";
import { typPrijatej } from "./pravidla-uctovania";
import { zhodnePravidla } from "./nespracovane-pravidlo";
import { kvAutoNespracovaneho } from "./kv-auto";
import { polozkaPrijatej } from "./suhrn-vyberu";

/** Údaje daňového dokladu k prijatej platbe tak, ako ich človek skontroloval. */
function udaje(z: Partial<UdajeNespracovaneho> = {}): UdajeNespracovaneho {
  return {
    ...prazdneUdaje(),
    dodavatel: { ...prazdneUdaje().dodavatel, nazov: "Stavebniny s.r.o.", ico: "36111222", icDph: "SK2022111222" },
    cislo: "DD2026010",
    vs: "2026010",
    datumVystavenia: "2026-10-09",
    datumDodania: "2026-10-08",
    datumPrijatia: "2026-10-12",
    rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
    celkom: 123,
    ...z,
  };
}

describe("druh „Daňový doklad k prijatej platbe“ v Nespracovaných", () => {
  it("je v ponuke hneď za prijatou zálohovou faktúrou a vznikne z neho prijatá faktúra", () => {
    const kluce = DRUHY_NESPRACOVANYCH.map((d) => d.kluc);
    expect(kluce.indexOf("danovy")).toBe(kluce.indexOf("zalohova") + 1);
    expect(DRUHY_NESPRACOVANYCH.find((d) => d.kluc === "danovy")?.nazov).toBe("Daňový doklad k prijatej platbe");
    expect(jeDruhPrijatej("danovy")).toBe(true);
    expect(jeDruhPrijatej("blocek")).toBe(false);
    expect(typPrijatejZDruhu("danovy")).toBe("advance_payment");
    expect(typPrijatejZDruhu("zalohova")).toBe("proforma");
    expect(typPrijatejZDruhu("faktura")).toBe("regular");
  });

  it("AI ho spozná podľa nadpisu (SK aj CZ) aj podľa odpovede modelu — pred zálohovou", () => {
    expect(navrhDruhu({ document_title: "Daňový doklad k prijatej platbe" })).toBe("danovy");
    expect(navrhDruhu({ document_title: "DAŇOVÝ DOKLAD K PŘIJATÉ PLATBĚ č. 2026010" })).toBe("danovy");
    expect(
      navrhDruhu({ document_title: "Daňový doklad k prijatej platbe k zálohovej faktúre ZF2026010", invoice_number: "ZF2026010" }),
    ).toBe("danovy");
    expect(navrhDruhu({ document_title: "Daňový doklad k záloze" })).toBe("danovy");
    expect(navrhDruhu({ document_title: "Daňový doklad k úhrade zálohy" })).toBe("danovy");
    expect(navrhDruhu({ document_subtype: "danovy_doklad_k_platbe", document_title: "Doklad" })).toBe("danovy");
    expect(navrhDruhu({ document_title: "Tax document for received payment" })).toBe("danovy");
  });

  it("bežná faktúra, zálohová a faktúra s odpočtom zálohy ostávajú, čím boli", () => {
    expect(navrhDruhu({ document_title: "Faktúra - daňový doklad" })).toBe("faktura");
    expect(navrhDruhu({ document_title: "Zálohová faktúra" })).toBe("zalohova");
    expect(navrhDruhu({ document_title: "Faktúra", document_subtype: "ostra" })).toBe("faktura");
    expect(navrhDruhu({ document_title: "Vyúčtovacia faktúra – odpočet zálohy" })).toBe("faktura");
    expect(jeDanovyDokladKPlatbe({ nazovDokladu: "Faktúra — daňový doklad č. 2026" })).toBe(false);
    // Odpoveď modelu „danovy…“ zálohovú nikdy neurobí.
    expect(jeZalohovaFaktura({ druhOdAi: "danovy_doklad_k_platbe", nazovDokladu: "Daňový doklad k zálohovej platbe" })).toBe(false);
  });

  it("povinný je dátum prijatia platby (DUZP), splatnosť nie", () => {
    expect(chybajuce("danovy", udaje({ splatnost: "" }))).toEqual([]);
    expect(chybajuce("danovy", udaje({ datumDodania: "" }))).toContain("datumPlatby");
    expect(chybajuce("faktura", udaje({ splatnost: "" }))).toContain("splatnost");
  });

  it("vytvorí zaplatený doklad typu advance_payment s väzbou na zálohovú a odpočtom DPH", () => {
    const r = prijataZUdajov("danovy", udaje({ zalohaId: "zf-1", splatnost: "2026-12-31", zaloha: 50 }), "2026-10-20");
    expect(r).toMatchObject({
      type: "advance_payment",
      odpocet: true,
      payment_date: "2026-10-08",
      delivery_date: "2026-10-08",
      received_date: "2026-10-12",
      // Splatnosť sa neeviduje — neplatí sa.
      due_date: "2026-10-09",
      advance_invoice_id: "zf-1",
      advance_amount: null,
      opravuje_cislo: null,
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
    });
    expect(prijataZUdajov("danovy", udaje(), "2026-10-20").advance_invoice_id).toBeNull();
    // Bežná faktúra platobné polia daňového dokladu nedostane.
    expect(prijataZUdajov("faktura", udaje(), "2026-10-20")).not.toHaveProperty("payment_date");
  });

  it("vrátenie do Nespracovaných zachová druh aj zálohovú", () => {
    const { druh, udaje: u } = udajeZPrijatej({
      type: "advance_payment",
      advance_invoice_id: "zf-1",
      invoice_number: "DD1",
      amount_total: 123,
      amount_without_vat: 100,
      vat_amount: 23,
    });
    expect(druh).toBe("danovy");
    expect(u.zalohaId).toBe("zf-1");
  });

  it("do príkazu na úhradu nejde a KV dostane ako faktúra (B.2)", () => {
    const n = naUhraduZNespracovaneho({ id: "x", druh: "danovy", udaje: udaje() }, "2026-10-20");
    expect(n.dovod).toMatch(/záloha je už zaplatená/);
    expect(kvAutoNespracovaneho("danovy", { rozpis: [{ dph: 23 }], celkom: 123 }, { predvolene: "B2" })).toBe("B2");
    expect(kvAutoNespracovaneho("zalohova", { rozpis: [{ dph: 23 }], celkom: 123 })).toBe("");
  });
});

describe("pravidlá účtovania a daňový doklad k platbe", () => {
  const pravidla = [
    { id: "dod", nazov: "Stavebniny náklad", dodavatel_ico: "36111222", predkontacia: "1Fp", aktivne: true, poradie: 1 },
    { id: "ddp", nazov: "DPH zo zálohy", typ_dokladu: "advance_payment", predkontacia: "343/314", aktivne: true, poradie: 2 },
  ] as any[];
  it("typ prijatej je advance_payment (ako `faktero_typ_prijatej`)", () => {
    expect(typPrijatej("advance_payment", 123, null)).toBe("advance_payment");
    expect(typPrijatej("regular", 123, null)).toBe("regular");
  });
  it("pravidlo dodávateľa pre náklady sa na daňový doklad nepoužije, pravidlo s typom áno", () => {
    const d = { supplier_ico: "36111222", supplier_name: "Stavebniny s.r.o.", druh: "prijata", typ: "advance_payment" } as any;
    expect(zhodnePravidla(pravidla, d).map((p) => p.id)).toEqual(["ddp"]);
    expect(zhodnePravidla(pravidla, { ...d, typ: "regular" }).map((p) => p.id)).toEqual(["dod"]);
  });
});

describe("pomocníky agendy Prijaté daňové doklady", () => {
  it("zoznam: bez parametra len bežné prijaté faktúry, s type=danove daňové doklady", () => {
    expect(typZoznamuPrijatych(undefined)).toBe("regular");
    expect(typZoznamuPrijatych("danove")).toBe("advance_payment");
    expect(typZoznamuPrijatych("nieco")).toBe("regular");
  });

  it("daňový doklad zálohu vyúčtovacej faktúre neobsadí; druhý daňový doklad k tej istej zálohe áno", () => {
    const doklady = [
      { id: "fa", type: "regular", advance_invoice_id: "zf" },
      { id: "dd", type: "advance_payment", advance_invoice_id: "zf" },
    ];
    expect(obsadzujeZalohu(doklady[1])).toBe(false);
    expect(obsadzujeZalohu(doklady[0])).toBe(true);
    expect(zalohaVolnaPreDanovy("zf", doklady)).toBe(false);
    expect(zalohaVolnaPreDanovy("zf", doklady, "dd")).toBe(true);
    expect(zalohaVolnaPreDanovy("zf", [doklady[0]])).toBe(true);
  });

  it("dvojitá DPH: vyúčtovacia faktúra s advance_amount k zálohe s daňovým dokladom", () => {
    const doklady = [
      { id: "dd", type: "advance_payment", status: "paid", advance_invoice_id: "zf" },
      { id: "fa", type: "regular", status: "received", advance_invoice_id: "zf", advance_amount: 123, invoice_number: "FA1" },
      { id: "fb", type: "regular", status: "received", advance_invoice_id: "zf2", advance_amount: 50 },
      { id: "fc", type: "regular", status: "received", advance_invoice_id: "zf", advance_amount: 0 },
    ];
    expect(dvojitaDphZalohy(doklady)).toEqual([{ fakturaId: "fa", cislo: "FA1", zalohaId: "zf" }]);
    // Zmazaný daňový doklad nevadí.
    expect(dvojitaDphZalohy([{ ...doklady[0], deleted_at: "2026-11-01" }, doklady[1]])).toEqual([]);
  });

  it("súčet výberu: daňový doklad je mimo súčtu a neplatí sa", () => {
    const p = polozkaPrijatej({ type: "advance_payment", status: "paid", amount_total: 123, currency: "EUR" });
    expect(p.typ).toBe("advance_payment");
    expect(p.naUhradu).toBe(false);
  });
});
