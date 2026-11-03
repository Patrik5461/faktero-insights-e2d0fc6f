import { describe, expect, it } from "vitest";
import {
  historiaDokladu,
  hodnotaPola,
  ktoZaznamu,
  odvodeneUdalosti,
  textInfo,
  textZmien,
  udalostiZHistorie,
  type ZaznamHistorie,
} from "./historia-dokladu";

const t = (s: string, p?: Record<string, string | number>) =>
  p ? s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? "")) : s;
const loc = "sk-SK";
let n = 0;
const z = (pole: string, pred: unknown, po: unknown, kedy: string, extra: Partial<ZaznamHistorie> = {}): ZaznamHistorie => ({
  id: String(++n),
  pole,
  pred,
  po,
  kto: "u1",
  kto_typ: "clovek",
  kto_popis: null,
  kedy,
  ...extra,
});

describe("ktoZaznamu", () => {
  it("typy autora", () => {
    expect(ktoZaznamu({ pole: "x", kto: null, kto_typ: "automat", kto_popis: "ai" })).toEqual({ typ: "automat", zdroj: "ai" });
    expect(ktoZaznamu({ pole: "x", kto: null, kto_typ: "api", kto_popis: "Shoptet" })).toEqual({ typ: "api", nazov: "Shoptet" });
    expect(ktoZaznamu({ pole: "x", kto: "u1", kto_typ: "appka" })).toEqual({ typ: "appka", id: "u1" });
    expect(ktoZaznamu({ pole: "x", kto: "u1", kto_typ: "clovek", kto_popis: "pravidlo" })).toEqual({
      typ: "clovek",
      id: "u1",
      cez: "pravidlo",
    });
    // Starý riadok bez kto_typ.
    expect(ktoZaznamu({ pole: "x", kto: "u2" })).toEqual({ typ: "clovek", id: "u2" });
    expect(ktoZaznamu({ pole: "x", kto: null })).toEqual({ typ: "system" });
    expect(ktoZaznamu({ pole: "Doklado (a@b.sk) · paymentStatus", kto: null })).toEqual({ typ: "doklado", ucet: "a@b.sk" });
  });
});

describe("udalostiZHistorie", () => {
  it("zaúčtovanie s kódmi je jedna udalosť", () => {
    const k = "2026-11-02T09:02:00Z";
    const u = udalostiZHistorie([
      z("zauctovane_at", null, k, k),
      z("zauctovanie_zdroj", null, "manual", k),
      z("pohoda_predkontacia", null, "501/321", k),
    ]);
    expect(u).toHaveLength(1);
    expect(u[0].druh).toBe("zauctovanie");
    expect(textZmien(u[0], t, loc)).toEqual([{ pole: null, pred: null, po: "501/321" }]);
  });
  it("zmena predkontácie: staré → nové, bez názvu poľa", () => {
    const u = udalostiZHistorie([z("pohoda_predkontacia", "501/321", "518/321", "2026-11-02T10:02:00Z")]);
    expect(u[0].druh).toBe("zmena_zauctovania");
    expect(textZmien(u[0], t, loc)).toEqual([{ pole: null, pred: "501/321", po: "518/321" }]);
  });
  it("úprava: suma, dátum, položky zhrnuté", () => {
    const k = "2026-11-02T10:00:00Z";
    const u = udalostiZHistorie([
      z("amount_total", 100, 120.5, k),
      z("due_date", "2026-11-10", "2026-11-20", k),
      z("items", { pocet: 2, suma: 100 }, { pocet: 3, suma: 120.5 }, k),
    ]);
    expect(u).toHaveLength(1);
    expect(u[0].druh).toBe("uprava");
    const txt = textZmien(u[0], t, loc);
    expect(txt[0]).toEqual({ pole: "Suma", pred: "100,00", po: "120,50" });
    expect(txt[1]).toEqual({ pole: "Splatnosť", pred: "10. 11. 2026", po: "20. 11. 2026" });
    expect(txt[2]).toEqual({ pole: "Položky", pred: "{n} riadky, 100,00".replace("{n}", "2"), po: "3 riadky, 120,50" });
  });
  it("zrušenie zaúčtovania, odovzdanie, vrátenie, zmazanie, obnovenie", () => {
    const druhy = (zz: ZaznamHistorie[]) => udalostiZHistorie(zz).map((u) => u.druh);
    expect(druhy([z("zauctovane_at", "2026-11-01T00:00:00Z", null, "2026-11-02T00:00:00Z")])).toEqual(["zrusenie_zauctovania"]);
    expect(
      druhy([
        z("exported_at", null, "2026-11-02T00:00:00Z", "2026-11-02T00:00:00Z"),
        z("status", "processed", "exported", "2026-11-02T00:00:00Z"),
      ]),
    ).toEqual(["odovzdanie"]);
    expect(druhy([z("exported_at", "2026-11-02T00:00:00Z", null, "2026-11-03T00:00:00Z")])).toEqual(["vratenie"]);
    expect(druhy([z("deleted_at", null, "2026-11-03T00:00:00Z", "2026-11-03T00:00:00Z")])).toEqual(["zmazanie"]);
    expect(druhy([z("deleted_at", "2026-11-03T00:00:00Z", null, "2026-11-04T00:00:00Z")])).toEqual(["obnovenie"]);
  });
  it("úhrada (stav aj paid_at) a spárovanie s platbou", () => {
    const k = "2026-11-02T00:00:00Z";
    expect(udalostiZHistorie([z("status", "unpaid", "paid", k)]).map((u) => u.druh)).toEqual(["uhrada"]);
    expect(
      udalostiZHistorie([z("paid_at", null, k, k), z("status", "sent", "paid", k)]).map((u) => u.druh),
    ).toEqual(["uhrada"]);
    const p = udalostiZHistorie([
      z("_platba", null, { suma: -120, mena: "EUR", datum: "2026-11-02", protistrana: "Dodávateľ s.r.o." }, k),
    ]);
    expect(p[0].druh).toBe("sparovanie");
    expect(textInfo(p[0], t, loc)).toBe("-120,00 EUR, 2. 11. 2026, Dodávateľ s.r.o.");
  });
  it("rôzni autori v tú istú chvíľu sú dve udalosti; najnovšia hore", () => {
    const u = udalostiZHistorie([
      z("note", "a", "b", "2026-11-01T00:00:00Z"),
      z("pohoda_predkontacia", null, "X", "2026-11-02T00:00:00Z", { kto: null, kto_typ: "automat", kto_popis: "pravidlo" }),
      z("category", "a", "b", "2026-11-02T00:00:00Z"),
    ]);
    expect(u).toHaveLength(3);
    expect(u[2].kedy).toBe("2026-11-01T00:00:00Z");
    expect(u.find((x) => x.druh === "zmena_zauctovania")?.kto).toEqual({ typ: "automat", zdroj: "pravidlo" });
  });
  it("starý zápis automatu bez kto_typ spozná podľa zdroja zaúčtovania", () => {
    const k = "2026-10-28T00:00:00Z";
    const u = udalostiZHistorie([
      z("zauctovane_at", null, k, k, { kto: null, kto_typ: null }),
      z("zauctovanie_zdroj", null, "ai", k, { kto: null, kto_typ: null }),
    ]);
    expect(u[0].kto).toEqual({ typ: "automat", zdroj: "ai" });
  });
  it("prenos z Doklada: autor je účet Doklada, pole bez predpony", () => {
    const u = udalostiZHistorie([
      z("Doklado (office@sfc.sk) · deliveryDate", "", "2024-05-06T16:27:40.000Z", "2025-07-09T18:40:45Z", { kto: null, kto_typ: null }),
    ]);
    expect(u[0].kto).toEqual({ typ: "doklado", ucet: "office@sfc.sk" });
    expect(textZmien(u[0], t, loc)[0]).toEqual({ pole: "Dátum dodania", pred: null, po: "6. 5. 2024" });
    const p = udalostiZHistorie([z("Doklado · paymentStatus", "not_paid", "paid", "2026-04-29T00:00:00Z", { kto: null })]);
    expect(p[0].druh).toBe("uhrada");
  });
});

describe("odvodeneUdalosti — staré doklady", () => {
  const stary = {
    created_by: "u1",
    created_at: "2026-09-01T08:00:00Z",
    spracoval: "u2",
    spracovane_at: "2026-09-02T09:00:00Z",
    zauctoval: null,
    zauctovanie_zdroj: "pravidlo",
    zauctovane_at: "2026-09-02T09:00:30Z",
    pohoda_predkontacia: "501/321",
    exported_at: "2026-10-01T10:00:00Z",
    export_cesta: "konektor",
  };
  it("nahratie, uloženie, zaúčtovanie automatom s kódmi, odovzdanie", () => {
    const u = odvodeneUdalosti(stary, "prijata");
    expect(u.map((x) => x.druh)).toEqual(["nahratie", "ulozenie", "zauctovanie", "odovzdanie"]);
    expect(u[2].kto).toEqual({ typ: "automat", zdroj: "pravidlo" });
    expect(u[2].zmeny).toEqual([{ pole: "pohoda_predkontacia", pred: null, po: "501/321" }]);
    expect(textInfo(u[3], t, loc)).toBe("Pohoda konektor");
    expect(u.every((x) => x.odvodena)).toBe(true);
  });
  it("neskoršia zmena kódov: kódy sa k prvému zaúčtovaniu nepripíšu", () => {
    const u = odvodeneUdalosti(
      { ...stary, zauctoval: "u2", naposledy_zauctoval: "u3", naposledy_zauctovane_at: "2026-09-20T09:00:00Z" },
      "prijata",
    );
    const z1 = u.find((x) => x.druh === "zauctovanie");
    expect(z1?.zmeny).toEqual([]);
    expect(u.find((x) => x.druh === "zmena_zauctovania")?.kto).toEqual({ typ: "clovek", id: "u3" });
  });
  it("čo už je v histórii, sa neodvodzuje", () => {
    const h = udalostiZHistorie([z("exported_at", null, "2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z")]);
    expect(odvodeneUdalosti(stary, "prijata", h).some((x) => x.druh === "odovzdanie")).toBe(false);
  });
  it("vystavená: úhrada z paid_at, ostatný doklad bez zaúčtovania", () => {
    expect(odvodeneUdalosti({ created_by: "u1", created_at: "x", paid_at: "2026-10-05T00:00:00Z" }, "faktura").map((x) => x.druh)).toContain(
      "uhrada",
    );
    expect(
      odvodeneUdalosti({ created_by: "u1", created_at: "2026-10-01T00:00:00Z", zauctovane_at: "2026-10-01T00:00:00Z" }, "ostatny").map(
        (x) => x.druh,
      ),
    ).toEqual(["nahratie"]);
  });
});

describe("historiaDokladu", () => {
  it("vytvorenie zo zápisu splynie s nahratím, appka prejde do nahratia", () => {
    const r = { created_by: "u1", created_at: "2026-11-02T08:00:00Z", nahrane_at: "2026-11-02T08:00:00Z" };
    const u = historiaDokladu(
      [z("_vytvoreny", null, null, "2026-11-02T08:00:00.100Z", { kto_typ: "appka" })],
      r,
      "doklad",
    );
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ druh: "nahratie", kto: { typ: "appka", id: "u1" } });
  });
  it("e-mail: odosielateľ zo stĺpca ostane; Vytvoriť v Nespracovaných = uloženie", () => {
    const r = {
      created_by: "u1",
      source: "mail",
      odosielatel_mailu: "fa@dodavatel.sk",
      nahrane_at: "2026-11-01T07:00:00Z",
      created_at: "2026-11-02T09:00:00Z",
      spracoval: "u2",
      spracovane_at: "2026-11-02T09:00:00Z",
    };
    const u = historiaDokladu([z("_vytvoreny", null, null, "2026-11-02T09:00:00Z", { kto: "u2" })], r, "prijata");
    expect(u.map((x) => x.druh)).toEqual(["ulozenie", "nahratie"]);
    expect(u[1].kto).toEqual({ typ: "mail", adresa: "fa@dodavatel.sk" });
  });
  it("bez riadku a bez zápisov prázdna", () => {
    expect(historiaDokladu([], null, "prijata")).toEqual([]);
  });
});

describe("hodnotaPola", () => {
  it("stav, peniaze, áno/nie, prázdne", () => {
    expect(hodnotaPola("status", "paid", t, loc)).toBe("uhradená");
    expect(hodnotaPola("total", 1234.5, t, loc)).toBe("1 234,50".replace(" ", " "));
    expect(hodnotaPola("reverse_charge", true, t, loc)).toBe("áno");
    expect(hodnotaPola("note", "", t, loc)).toBe("—");
    expect(hodnotaPola("items", { pocet: 1, suma: null }, t, loc)).toBe("1 riadok");
  });
});

describe("stavy a kódy slovami", () => {
  it("stav podľa agendy — tak ako odznak v zozname", () => {
    expect(hodnotaPola("status", "received", t, loc, "prijata")).toBe("Prijaté");
    expect(hodnotaPola("status", "booked", t, loc, "prijata")).toBe("Zaúčtované");
    expect(hodnotaPola("status", "paid", t, loc, "prijata")).toBe("Zaplatené");
    expect(hodnotaPola("status", "new", t, loc, "doklad")).toBe("Nespracovaný");
    expect(hodnotaPola("status", "exported", t, loc, "ostatny")).toBe("Odovzdaný");
    expect(hodnotaPola("status", "issued", t, loc, "faktura")).toBe("Vystavená");
    expect(hodnotaPola("status", "cancelled", t, loc, "faktura")).toBe("Stornovaná");
    // Bez agendy všeobecný názov, neznámy kód ostane.
    expect(hodnotaPola("status", "booked", t, loc)).toBe("zaúčtovaná");
    expect(hodnotaPola("status", "xyz", t, loc, "prijata")).toBe("xyz");
  });
  it("spôsob úhrady, typ faktúry, druh ostatného dokladu", () => {
    expect(hodnotaPola("payment_method", "karta", t, loc, "doklad")).toBe("Karta");
    expect(hodnotaPola("payment_method", "bank_transfer", t, loc, "faktura")).toBe("Prevod");
    expect(hodnotaPola("type", "proforma", t, loc, "prijata")).toBe("Zálohová faktúra");
    expect(hodnotaPola("kind", "exekucia", t, loc, "ostatny")).toBe("Exekúcia");
  });
  it("„Stav received → booked“ pri zaúčtovaní sa neopakuje ako úprava", () => {
    const k = "2026-11-03T09:00:00Z";
    const u = udalostiZHistorie([
      z("zauctovane_at", null, k, k),
      z("pohoda_predkontacia", null, "501/321", k),
      z("status", "received", "booked", k),
    ]);
    expect(u.map((x) => x.druh)).toEqual(["zauctovanie"]);
  });
  it("samostatná zmena stavu ide do úpravy slovami", () => {
    const k = "2026-11-03T09:00:00Z";
    const u = udalostiZHistorie([z("status", "received", "booked", k)]);
    expect(u[0].druh).toBe("uprava");
    expect(textZmien(u[0], t, loc, "prijata")).toEqual([{ pole: "Stav", pred: "Prijaté", po: "Zaúčtované" }]);
  });
});
