import { describe, expect, it } from "vitest";
import {
  bajtyZBase64,
  daSaZaevidovatVAppke,
  filtrujEfaktury,
  poZaevidovani,
  spravaPoZaevidovani,
  stavEfaktury,
  tonStavu,
  type PrijataEfakturaApp,
} from "./efaktury-prijate";
import { cakaNaZaevidovanie } from "@/lib/faktero/efaktura/upozornenie-prijatej";

const zaklad: PrijataEfakturaApp = {
  id: "a",
  sender_name: "SFC, s.r.o.",
  sender_participant_id: "0245:2121372693",
  document_number: "20260001",
  issue_date: "2026-10-30",
  due_date: "2026-11-13",
  currency: "EUR",
  total: 123,
  vat_total: 23,
  status: "parsed",
  received_at: "2026-10-30T10:00:00Z",
  matched_supplier_invoice_id: null,
  nespracovany_id: null,
};

describe("stav prijatej eFaktúry v appke", () => {
  it("nerozobratá aj rozobratá bez dokladu je nová", () => {
    expect(stavEfaktury({ ...zaklad, status: "received" })).toBe("nova");
    expect(stavEfaktury(zaklad)).toBe("nova");
  });

  it("s prijatou faktúrou je zaevidovaná, s Nespracovaným v Nespracovaných", () => {
    expect(stavEfaktury({ ...zaklad, matched_supplier_invoice_id: "x" })).toBe("zaevidovana");
    expect(stavEfaktury({ ...zaklad, status: "matched" })).toBe("zaevidovana");
    expect(stavEfaktury({ ...zaklad, nespracovany_id: "n" })).toBe("nespracovane");
  });

  it("odmietnutá, nečitateľná, archivovaná a samofaktúra sa nezaevidujú", () => {
    for (const [r, s] of [
      [{ ...zaklad, status: "rejected" }, "odmietnuta"],
      [{ ...zaklad, status: "parse_error" }, "necitatelna"],
      [{ ...zaklad, status: "archived" }, "archivovana"],
      [{ ...zaklad, druh: "self_billing" }, "samofaktura"],
    ] as const) {
      expect(stavEfaktury(r)).toBe(s);
      expect(daSaZaevidovatVAppke(r)).toBe(false);
    }
    expect(daSaZaevidovatVAppke(zaklad)).toBe(true);
  });

  /* Dlaždica na Prehľade počíta `dotazNezaevidovanych` — filter „na zaevidovanie“ musí sedieť s ňou. */
  it("„nová“ je presne to, čo počíta upozornenie na webe", () => {
    const vzorky: PrijataEfakturaApp[] = [
      zaklad,
      { ...zaklad, id: "b", status: "received" },
      { ...zaklad, id: "c", matched_supplier_invoice_id: "x" },
      { ...zaklad, id: "d", status: "rejected" },
      { ...zaklad, id: "e", druh: "self_billing_credit_note" },
      { ...zaklad, id: "f", status: "archived" },
    ];
    for (const r of vzorky) expect(stavEfaktury(r) === "nova").toBe(cakaNaZaevidovanie(r));
    expect(filtrujEfaktury(vzorky, "nove").map((r) => r.id)).toEqual(["a", "b"]);
    expect(filtrujEfaktury(vzorky, "vsetky")).toHaveLength(6);
  });

  it("farby: nová oranžová, vybavená zelená, chybná červená", () => {
    expect(tonStavu("nova")).toBe("pozor");
    expect(tonStavu("zaevidovana")).toBe("zelena");
    expect(tonStavu("odmietnuta")).toBe("cervena");
    expect(tonStavu("archivovana")).toBe("neutral");
  });
});

describe("po zaevidovaní", () => {
  it("hlásenie zodpovedá výsledku servera ako na webe", () => {
    expect(spravaPoZaevidovani({ kam: "prijate", id: "1", typ: "regular" })).toBe(
      "efp.zaevidovana",
    );
    expect(spravaPoZaevidovani({ kam: "prijate", id: "1", typ: "proforma" })).toBe(
      "efp.zaevidovanaZalohova",
    );
    expect(spravaPoZaevidovani({ kam: "nespracovane", id: "1" })).toBe("efp.odlozenaNespracovane");
    expect(spravaPoZaevidovani({ kam: "prijate", id: "1", uzExistovala: true })).toBe(
      "efp.uzZaevidovana",
    );
    expect(spravaPoZaevidovani({ kam: "prijate", id: "1", pripojena: true })).toBe(
      "efp.pripojenaPrijate",
    );
    expect(spravaPoZaevidovani({ kam: "nespracovane", id: "1", pripojena: true })).toBe(
      "efp.pripojenaNespracovane",
    );
  });

  it("riadok sa prepne na zaevidovaný bez nového načítania", () => {
    const r = poZaevidovani(zaklad, { kam: "prijate", id: "pi" });
    expect(r.matched_supplier_invoice_id).toBe("pi");
    expect(stavEfaktury(r)).toBe("zaevidovana");
    expect(stavEfaktury(poZaevidovani(zaklad, { kam: "nespracovane", id: "n" }))).toBe(
      "nespracovane",
    );
  });

  it("base64 náhľadu sa prevedie na bajty", () => {
    expect(Array.from(bajtyZBase64(btoa("%PDF")))).toEqual([37, 80, 68, 70]);
  });
});
