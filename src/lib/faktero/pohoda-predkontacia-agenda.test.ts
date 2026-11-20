/*
  Predkontácia z inej agendy Pohody — upozornenie pred odovzdaním.

  Skúška importu 20. 11. 2026: daňový doklad k prijatej platbe (do Pohody ako
  interný doklad) s predkontáciou „311000 602000“, ktorú má číselník Pohody
  len pre vydané faktúry → Pohoda dala „Neviem“. „324000 324000“ (interné
  doklady) prešla. Firma a doklady sú vymyslené.
*/
import { describe, expect, it } from "vitest";
import { buildPohodaInvoiceXml, buildPohodaExpensesXml } from "./export.server";
import {
  agendyKoduMimo,
  mapaPredkontacii,
  predkontacieMimoAgendy,
  predkontacieNaSkratky,
  textAgendyMimo,
  varovanieAgendyPredkontacie,
} from "./pohoda-predkontacia";
import { agendaVoVybere, podlaPoradiaAgend } from "./predkontacie";
import { cisloZDovodu } from "./pohoda-kontrola";

const firma: any = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Skúšobná firma s.r.o.",
  ico: "12345678",
  country: "SK",
  vat_payer: true,
};

const ciselnik = [
  { druh: "predkontacia", kod: "311000 602000", agenda: "issuedInvoice", zdroj: "pohoda", ucet_md: "311000", ucet_d: "602000" },
  { druh: "predkontacia", kod: "311000 602000", agenda: "", zdroj: "subor", ucet_md: "311000", ucet_d: "602000" },
  { druh: "predkontacia", kod: "324000 324000", agenda: "internalDocument", zdroj: "pohoda", ucet_md: "324000", ucet_d: "324000" },
  { druh: "predkontacia", kod: "1Fv", agenda: "issuedInvoice", zdroj: "pohoda", ucet_md: "311000", ucet_d: "604000" },
  { druh: "predkontacia", kod: "LEN-SUBOR", agenda: "issuedInvoice", zdroj: "subor" },
  { druh: "predkontacia", kod: "BEZ-AGENDY", agenda: "", zdroj: "obrazok" },
];
const mapa = mapaPredkontacii(ciselnik, {});

const dokladKPlatbe = (cislo: string, predkontacia: string): any => ({
  id: `00000000-0000-4000-8000-00000000010${cislo.slice(-1)}`,
  company_id: firma.id,
  type: "advance_payment",
  status: "paid",
  invoice_number: cislo,
  variable_symbol: cislo,
  issue_date: "2026-11-02",
  delivery_date: "2026-11-02",
  due_date: "2026-11-02",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  customer_name: "Odberateľ Test s.r.o.",
  customer_country: "SK",
  pohoda_predkontacia: predkontacia,
  pohoda_clenenie_dph: "UD",
  kv_clenenie: "A1",
  exported_at: null,
});
const polozky = [
  { name: "Záloha", quantity: 1, unit: "ks", unit_price: 100, subtotal: 100, vat_rate: 23, vat_amount: 23, total: 123 },
];
/** XML tak, ako ho skladá kontrola: bez prekladu na skratky. */
const xmlFaktury = (inv: any) =>
  buildPohodaInvoiceXml({
    company: firma,
    invoices: [{ invoice: inv, items: polozky }] as any,
    nastavenia: { mapaPredkontacii: null } as any,
  });

describe("predkontácia z inej agendy", () => {
  it("mapa nesie agendy len z riadkov Pohody", () => {
    expect(mapa.agendy).toEqual({
      "311000 602000": ["issuedInvoice"],
      "324000 324000": ["internalDocument"],
      "1Fv": ["issuedInvoice"],
    });
  });

  it("daňový doklad k platbe (interný doklad) s predkontáciou vydaných faktúr → upozornenie", () => {
    const xml = xmlFaktury(dokladKPlatbe("260900001", "311000 602000"));
    expect(xml).toContain("<int:intDoc ");
    const zle = predkontacieMimoAgendy(xml, mapa);
    expect(zle).toEqual([
      { kod: "311000 602000", skratka: "311000 602000", agenda: "internalDocument", agendyKodu: ["issuedInvoice"] },
    ]);
    const v = varovanieAgendyPredkontacie("260900001", zle)!;
    expect(v).toBe(
      "260900001 — Predkontácia 311000 602000 je v Pohode pre vydané faktúry — interný doklad ju nepoužije a zaúčtuje sa ako „Neviem“. Vyberte predkontáciu pre interné doklady.",
    );
    expect(cisloZDovodu(v)).toBe("260900001");
  });

  it("predkontácia interných dokladov prejde", () => {
    const xml = xmlFaktury(dokladKPlatbe("260900002", "324000 324000"));
    expect(predkontacieMimoAgendy(xml, mapa)).toEqual([]);
  });

  it("vydaná faktúra s predkontáciou vydaných faktúr prejde, s internou upozorní", () => {
    const faktura = { ...dokladKPlatbe("260900003", "311000 602000"), type: "regular" };
    expect(predkontacieMimoAgendy(xmlFaktury(faktura), mapa)).toEqual([]);
    const zle = predkontacieMimoAgendy(xmlFaktury({ ...faktura, pohoda_predkontacia: "324000 324000" }), mapa);
    expect(zle.map((z) => [z.kod, z.agenda])).toEqual([["324000 324000", "issuedInvoice"]]);
    expect(varovanieAgendyPredkontacie("260900003", zle)).toContain("vydaná faktúra ju nepoužije");
  });

  it("kód bez agendy z Pohody (súbor, obrázok, mimo číselníka) sa nehlási", () => {
    for (const k of ["LEN-SUBOR", "BEZ-AGENDY", "NEZNAMY"])
      expect(predkontacieMimoAgendy(xmlFaktury(dokladKPlatbe("260900004", k)), mapa)).toEqual([]);
  });

  it("kontroluje sa skratka po preklade (ručná tabuľka)", () => {
    const sTabulkou = mapaPredkontacii(ciselnik, { "311000 604000": "1Fv" });
    const zle = predkontacieMimoAgendy(xmlFaktury(dokladKPlatbe("260900005", "311000 604000")), sTabulkou);
    expect(zle).toEqual([
      { kod: "311000 604000", skratka: "1Fv", agenda: "internalDocument", agendyKodu: ["issuedInvoice"] },
    ]);
    expect(varovanieAgendyPredkontacie("260900005", zle)).toContain("Predkontácia 311000 604000 (v Pohode 1Fv)");
  });

  it("bez mapy alebo staršia mapa bez agend — nič", () => {
    const xml = xmlFaktury(dokladKPlatbe("260900006", "311000 602000"));
    expect(predkontacieMimoAgendy(xml, null)).toEqual([]);
    expect(predkontacieMimoAgendy(xml, { ...mapa, agendy: undefined })).toEqual([]);
    expect(varovanieAgendyPredkontacie("x", [])).toBeNull();
  });

  it("bloček kartou ide do Ostatných záväzkov — predkontácia vydaných faktúr upozorní", () => {
    const blocek: any = {
      id: "00000000-0000-4000-8000-000000000201",
      company_id: firma.id,
      document_number: "B-1",
      supplier_name: "Obchod Test",
      issue_date: "2026-11-02",
      net_amount: 10,
      vat_amount: 2.3,
      total_amount: 12.3,
      currency: "EUR",
      vat_rate: 23,
      payment_method: "karta",
      status: "processed",
      pohoda_predkontacia: "311000 602000",
    };
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [blocek], nastavenia: { mapaPredkontacii: null } as any });
    const zle = predkontacieMimoAgendy(xml, mapa);
    expect(zle.length).toBe(1);
    expect(zle[0]!.agendyKodu).toEqual(["issuedInvoice"]);
    expect(["commitment", "receivedInvoice", "cashPaid"]).toContain(zle[0]!.agenda);
  });

  it("XML sa nemení — agendy v mape preklad neovplyvnia", () => {
    const xml = xmlFaktury(dokladKPlatbe("260900007", "311000 602000"));
    const bezAgend = { ...mapa, agendy: undefined };
    expect(predkontacieNaSkratky(xml, mapa)).toBe(predkontacieNaSkratky(xml, bezAgend));
  });

  it("panel zaúčtovania: kód z inej agendy", () => {
    const agendy = mapa.agendy!;
    expect(agendyKoduMimo("311000 602000", "internalDocument", agendy)).toEqual(["issuedInvoice"]);
    expect(agendyKoduMimo("324000 324000", "internalDocument", agendy)).toBeNull();
    expect(agendyKoduMimo("311000 602000", "issuedInvoice", agendy)).toBeNull();
    expect(agendyKoduMimo("NEZNAMY", "internalDocument", agendy)).toBeNull();
    expect(agendyKoduMimo("", "internalDocument", agendy)).toBeNull();
    expect(agendyKoduMimo("311000 602000", null, agendy)).toBeNull();
    expect(textAgendyMimo("311000 602000", "internalDocument", ["issuedInvoice"])).toBe(
      "Predkontácia 311000 602000 je v Pohode pre vydané faktúry — interný doklad ju nepoužije a zaúčtuje sa ako „Neviem“. Vyberte predkontáciu pre interné doklady.",
    );
  });
});

describe("výber predkontácie daňového dokladu k platbe", () => {
  it("kódy interných dokladov pred vydanými faktúrami, inak poradie ostáva", () => {
    const m = [
      { kod: "A", agenda: "issuedInvoice" },
      { kod: "B", agenda: "internalDocument" },
      { kod: "C", agenda: "" },
      { kod: "D", agenda: "internalDocument" },
      { kod: "E", agenda: "issuedInvoice" },
    ];
    expect(podlaPoradiaAgend(m, ["internalDocument", "issuedInvoice"]).map((x) => x.kod)).toEqual([
      "B",
      "D",
      "A",
      "E",
      "C",
    ]);
  });

  it("názov agendy do výberu", () => {
    expect(agendaVoVybere("internalDocument")).toBe("Interné doklady");
    expect(agendaVoVybere("issuedInvoice")).toBe("Vydané faktúry");
    expect(agendaVoVybere("")).toBeNull();
    expect(agendaVoVybere("PD")).toBeNull();
  });
});
