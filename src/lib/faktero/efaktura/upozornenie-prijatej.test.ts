import { describe, expect, it } from "vitest";
import {
  cakaNaZaevidovanie,
  nadpisZluceny,
  notifikacieEfaktur,
  predmetEmailu,
  zostavEmailPrijatych,
  type PrijataEfaktura,
} from "./upozornenie-prijatej";
import { applyReadState, kluceNaPrecitanie } from "../notifications";

const DNES = "2026-10-29";

function ef(id: string, o: Partial<PrijataEfaktura> = {}): PrijataEfaktura {
  return {
    id,
    sender_name: "SFC, s.r.o.",
    document_number: "20260001",
    total: "1.23",
    currency: "EUR",
    received_at: "2026-10-28T13:29:25Z",
    status: "parsed",
    matched_supplier_invoice_id: null,
    druh: "invoice",
    ...o,
  };
}

describe("cakaNaZaevidovanie", () => {
  it("rozobratá aj len prijatá eFaktúra bez prijatej faktúry čaká", () => {
    expect(cakaNaZaevidovanie(ef("a"))).toBe(true);
    expect(cakaNaZaevidovanie(ef("a", { status: "received", druh: null }))).toBe(true);
  });

  it("zaevidovaná, zamietnutá ani archivovaná nečaká", () => {
    expect(
      cakaNaZaevidovanie(ef("a", { matched_supplier_invoice_id: "x", status: "matched" })),
    ).toBe(false);
    expect(cakaNaZaevidovanie(ef("a", { matched_supplier_invoice_id: "x" }))).toBe(false);
    expect(cakaNaZaevidovanie(ef("a", { status: "rejected" }))).toBe(false);
    expect(cakaNaZaevidovanie(ef("a", { status: "archived" }))).toBe(false);
  });

  it("samofaktúra medzi prijaté nepatrí — v počítadle by visela navždy", () => {
    expect(cakaNaZaevidovanie(ef("a", { druh: "self_billing" }))).toBe(false);
    expect(cakaNaZaevidovanie(ef("a", { druh: "self_billing_credit_note" }))).toBe(false);
    expect(cakaNaZaevidovanie(ef("a", { druh: "credit_note" }))).toBe(true);
  });
});

describe("notifikacieEfaktur", () => {
  it("bez čakajúcich nič", () => {
    expect(notifikacieEfaktur([], DNES)).toEqual([]);
    expect(
      notifikacieEfaktur([ef("a", { status: "matched", matched_supplier_invoice_id: "x" })], DNES),
    ).toEqual([]);
  });

  it("jedna eFaktúra: dodávateľ, číslo, suma a odkaz priamo na doklad", () => {
    const [n] = notifikacieEfaktur([ef("a")], DNES);
    expect(n.key).toBe("efaktura_prijata:a");
    expect(n.title).toBe("Nová eFaktúra od {dodavatel} — {cislo}, {suma}");
    expect(n.params).toMatchObject({ dodavatel: "SFC, s.r.o.", cislo: "20260001" });
    expect(String(n.params?.suma)).toMatch(/1,23/);
    expect(n.to).toBe("/efaktura/prijate");
    expect(n.search).toEqual({ q: "20260001" });
    expect(n.date).toBe("2026-10-28");
  });

  it("chýbajúce údaje sa nevymýšľajú, len pomenujú", () => {
    const [n] = notifikacieEfaktur(
      [ef("a", { sender_name: null, document_number: " ", total: null, received_at: null })],
      DNES,
    );
    expect(n.params).toMatchObject({
      dodavatel: "neznámeho dodávateľa",
      cislo: "bez čísla",
      suma: "—",
    });
    expect(n.search).toBeUndefined();
    expect(n.date).toBe(DNES);
  });

  it("dve sa ukážu zvlášť, najnovšia prvá", () => {
    const z = notifikacieEfaktur(
      [
        ef("stara", { received_at: "2026-10-01T08:00:00Z" }),
        ef("nova", { received_at: "2026-10-28T08:00:00Z" }),
      ],
      DNES,
    );
    expect(z.map((n) => n.key)).toEqual(["efaktura_prijata:nova", "efaktura_prijata:stara"]);
  });

  it("tri a viac sa zlúčia do jednej s kľúčmi členov", () => {
    const z = notifikacieEfaktur(
      [
        ef("a", { sender_name: "Alfa", received_at: "2026-10-26T08:00:00Z" }),
        ef("b", { sender_name: "Beta", received_at: "2026-10-28T08:00:00Z" }),
        ef("c", { sender_name: "Alfa", received_at: "2026-10-27T08:00:00Z" }),
        ef("x", { druh: "self_billing" }),
      ],
      DNES,
    );
    expect(z).toHaveLength(1);
    expect(z[0].key).toBe("efaktury_prijate:b");
    expect(z[0].title).toBe("{n} nové eFaktúry");
    expect(z[0].params).toMatchObject({ n: 3, prvy: "Beta", druhy: "Alfa" });
    expect(z[0].detail).toBe("Od {prvy} a {druhy} — čakajú na zaevidovanie.");
    expect(z[0].kluceClenov).toEqual([
      "efaktura_prijata:b",
      "efaktura_prijata:c",
      "efaktura_prijata:a",
    ]);
    expect(z[0].search).toBeUndefined();
  });

  it("tvar nadpisu podľa počtu", () => {
    expect(nadpisZluceny(3)).toBe("{n} nové eFaktúry");
    expect(nadpisZluceny(4)).toBe("{n} nové eFaktúry");
    expect(nadpisZluceny(5)).toBe("{n} nových eFaktúr");
  });
});

describe("prečítanie zlúčenej položky", () => {
  const tri = [ef("a"), ef("b"), ef("c")];

  it("prečítanie zlúčenej zapíše aj kľúče členov", () => {
    const [n] = notifikacieEfaktur(tri, DNES);
    expect(kluceNaPrecitanie([n]).sort()).toEqual(
      [
        "efaktury_prijate:a",
        "efaktura_prijata:a",
        "efaktura_prijata:b",
        "efaktura_prijata:c",
      ].sort(),
    );
  });

  it("po zaevidovaní jednej sa prečítaná zlúčená nevráti ako nová", () => {
    const [n] = notifikacieEfaktur(tri, DNES);
    const precitane = kluceNaPrecitanie([n]);
    // „b“ niekto zaevidoval — ostali dve, zobrazia sa zvlášť a obe sú prečítané.
    const potom = notifikacieEfaktur([tri[0]!, tri[2]!], DNES);
    expect(applyReadState(potom, precitane).unread).toBe(0);
  });

  it("nová eFaktúra spraví zlúčenú znova neprečítanou", () => {
    const precitane = kluceNaPrecitanie(notifikacieEfaktur(tri, DNES));
    const potom = notifikacieEfaktur(
      [...tri, ef("d", { received_at: "2026-10-29T08:00:00Z" })],
      DNES,
    );
    const r = applyReadState(potom, precitane);
    expect(r.unread).toBe(1);
    expect(r.items[0].key).toBe("efaktury_prijate:d");
  });

  it("zlúčená je prečítaná, keď sú prečítané jednotlivé", () => {
    const precitane = notifikacieEfaktur([tri[0]!, tri[1]!], DNES).map((n) => n.key);
    // Pribudla tretia — tá prečítaná nie je, takže zlúčená svieti.
    expect(applyReadState(notifikacieEfaktur(tri, DNES), precitane).unread).toBe(1);
    expect(
      applyReadState(notifikacieEfaktur(tri, DNES), [...precitane, "efaktura_prijata:c"]).unread,
    ).toBe(0);
  });
});

describe("e-mail firme", () => {
  it("predmet bez mena dodávateľa, so správnym tvarom", () => {
    expect(predmetEmailu(1, "PALIERA s.r.o.")).toBe("Prišla vám eFaktúra — PALIERA s.r.o.");
    expect(predmetEmailu(3, null)).toBe("Prišli vám 3 eFaktúry");
    expect(predmetEmailu(7, "")).toBe("Prišlo vám 7 eFaktúr");
  });

  it("cudzí text ide do HTML ošetrený, odkaz je v texte aj v HTML", () => {
    const m = zostavEmailPrijatych({
      firma: "PALIERA",
      riadky: [ef("a", { sender_name: '<img src=x onerror="alert(1)">' })],
      odkaz: "https://www.faktero.sk/moje-ulohy?firma=1&dalej=efaktury",
      odkazNastavenia: "https://www.faktero.sk/firma",
    });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
    expect(m.text).toContain("https://www.faktero.sk/moje-ulohy?firma=1&dalej=efaktury");
    expect(m.html).toContain("firma=1&amp;dalej=efaktury");
    expect(m.text).toContain("20260001");
  });

  it("veľa eFaktúr: vypíše prvých desať a zvyšok spočíta", () => {
    const riadky = Array.from({ length: 13 }, (_, i) => ef(`id${i}`, { document_number: `C${i}` }));
    const m = zostavEmailPrijatych({ firma: null, riadky, odkaz: "o", odkazNastavenia: "n" });
    expect(m.predmet).toBe("Prišlo vám 13 eFaktúr");
    expect(m.text).toContain("C9");
    expect(m.text).not.toContain("C10");
    expect(m.text).toContain("…a ďalšie (3)");
  });
});
