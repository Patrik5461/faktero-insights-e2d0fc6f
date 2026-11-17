/*
  Neplatiteľ DPH a prijatý doklad (Patrik 17. 11. 2026): „Pri neplatiteľskej
  s.r.o. nesmie na bločku rozpisovať DPH, lebo mi ho nedovolí zaúčtovať.“
  RHJ s. r. o. (sk_neplatitel) mala bločky s 23 % + 19 % a `odpocet = true`
  — kontrola pred zaúčtovaním ich zastavila (DOVOD_NEPLATITEL_PRIJATY).
*/
import { describe, expect, it } from "vitest";
import {
  bezKontrolyRozpisuDph,
  doplnRozpisNeplatitela,
  odpocetPodlaFirmy,
  prijataVPreneseni,
  VETA_NEPLATITEL_DPH,
} from "./neplatitel-dph";
import { firmaJeNeplatitel, firmaPreDph } from "./neplatitel-dph.server";
import { overDphZapisu } from "./dph-pravidlo.server";
import { kontrolaRozpisuUdajov, kontrolaSadziebUdajov, prazdneUdaje, type UdajeNespracovaneho } from "./nespracovane";
import { kontrolaNespracovaneho } from "@/components/faktero/dph-formular";
import { jeNeplatitel, prekazkaUctovania } from "./uctovanie-agenda";
import { blocekNaUctovanie, prijataNaUctovanie } from "./zauctovanie-export";
import { prekazkaDokladu } from "./pohoda-kontrola";

const RHJ = { country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel", ic_dph: null };
const TOBIFY = { country: "SK", vat_payer: false, vat_scheme: "sk_7", ic_dph: "SK2122358579" };
const PLATITEL = { country: "SK", vat_payer: true, vat_scheme: "sk_4", ic_dph: "SK2020000000" };

/** Falošný klient Supabase: `companies` vráti zadanú firmu. */
function klient(firma: Record<string, unknown> | null) {
  const volania: string[] = [];
  return {
    volania,
    from(tabulka: string) {
      volania.push(tabulka);
      return {
        select(stlpce: string) {
          volania.push(stlpce);
          return { eq: () => ({ maybeSingle: async () => ({ data: firma, error: null }) }) };
        },
      };
    },
  };
}

/** Bloček RHJ: 23 % + 19 % (Lidl — potraviny a drogéria), november 2026. */
const blocekRhj = {
  id: "b-rhj",
  document_number: "RHJ-77",
  issue_date: "2026-11-10",
  net_amount: 20,
  vat_amount: 4.2,
  total_amount: 24.2,
  vat_breakdown: [
    { sadzba: 23, zaklad: 10, dph: 2.3 },
    { sadzba: 19, zaklad: 10, dph: 1.9 },
  ],
  pohoda_predkontacia: "1",
};

const udaje = (z: Partial<UdajeNespracovaneho>): UdajeNespracovaneho => ({
  ...prazdneUdaje(),
  datumVystavenia: "2026-11-10",
  ...z,
});

describe("pravidlá neplatiteľa", () => {
  it("rozpis sa nekontroluje len neplatiteľovi bez prenesenia", () => {
    expect(bezKontrolyRozpisuDph(true)).toBe(true);
    expect(bezKontrolyRozpisuDph(true, false)).toBe(true);
    expect(bezKontrolyRozpisuDph(true, true)).toBe(false);
    expect(bezKontrolyRozpisuDph(false)).toBe(false);
    expect(bezKontrolyRozpisuDph(null)).toBe(false);
  });

  it("odpočet podľa firmy — neplatiteľ nikdy", () => {
    expect(odpocetPodlaFirmy(RHJ, true)).toBe(false);
    expect(odpocetPodlaFirmy(TOBIFY, true)).toBe(false);
    expect(odpocetPodlaFirmy(PLATITEL, true)).toBe(true);
    expect(odpocetPodlaFirmy(PLATITEL, false)).toBe(false);
    // Firma bez schémy (prenos) sa neplatiteľom nepovažuje.
    expect(odpocetPodlaFirmy({ country: "SK", vat_payer: false, vat_scheme: null }, true)).toBe(true);
  });

  it("prenesenie prijatej faktúry", () => {
    expect(prijataVPreneseni({ reverse_charge: true })).toBe(true);
    expect(prijataVPreneseni({ dph_rezim: "samozdanenie" })).toBe(true);
    expect(prijataVPreneseni({ dph_rezim: "tuzemsko" })).toBe(false);
    expect(prijataVPreneseni(null)).toBe(false);
  });

  it("veta pre formuláre", () => {
    expect(VETA_NEPLATITEL_DPH).toBe("Neplatiteľ DPH — DPH sa neodpočítava, celá suma ide do nákladov.");
  });

  it("doklad bez rozpisu dostane celú sumu bez dane, prečítaný rozpis ostáva", () => {
    const u = doplnRozpisNeplatitela(udaje({ celkom: 24.22, zaokruhlenie: 0.02 }), true);
    expect(u.rozpis).toEqual([{ sadzba: 0, zaklad: 24.2, dph: 0 }]);
    const sRozpisom = udaje({ celkom: 24.2, rozpis: blocekRhj.vat_breakdown });
    expect(doplnRozpisNeplatitela(sRozpisom, true).rozpis).toEqual(blocekRhj.vat_breakdown);
    // Platiteľ ani prenesenie sa nedopĺňa.
    expect(doplnRozpisNeplatitela(udaje({ celkom: 10 }), false).rozpis).toEqual([]);
    expect(doplnRozpisNeplatitela(udaje({ celkom: 10, prenesenie: true }), true).rozpis).toEqual([]);
    expect(doplnRozpisNeplatitela(udaje({ celkom: null }), true).rozpis).toEqual([]);
  });
});

describe("Nespracované — kontrola rozpisu DPH neplatiteľa", () => {
  // Brána zákonných sadzieb rozpis s 21 % zahodila (RHJ METRO) — DPH na doklade ostala.
  const bezRozpisu = udaje({
    celkom: 24.2,
    kontrolaDph: { bezDph: 20, dph: 4.2, dovod: "Sadzba 21 % nie je v SK k 10. 11. 2026 zákonná" },
  });
  const zlaSadzba = udaje({ celkom: 121, rozpis: [{ sadzba: 21, zaklad: 100, dph: 21 }] });
  const rhj = udaje({ celkom: 24.2, rozpis: blocekRhj.vat_breakdown, platba: "karta" });

  it("platiteľa „bez rozpisu neprejde“ a zlá sadzba zastavia, neplatiteľa nie", () => {
    expect(kontrolaNespracovaneho(bezRozpisu, "SK", "blocek").ok).toBe(false);
    expect(kontrolaNespracovaneho(bezRozpisu, "SK", "blocek", true)).toEqual({ ok: true, chyby: [] });
    expect(kontrolaNespracovaneho(zlaSadzba, "SK", "faktura").ok).toBe(false);
    expect(kontrolaNespracovaneho(zlaSadzba, "SK", "faktura", true)).toEqual({ ok: true, chyby: [] });
  });

  it("RHJ bloček 23 % + 19 % — žiadna chyba rozpisu", () => {
    expect(kontrolaNespracovaneho(rhj, "SK", "blocek", true).ok).toBe(true);
    expect(kontrolaSadziebUdajov(rhj, "SK", { neplatitel: true }).ok).toBe(true);
  });

  it("serverová kontrola (kontrolaSadziebUdajov / kontrolaRozpisuUdajov) rovnako", () => {
    expect(kontrolaRozpisuUdajov(bezRozpisu, "SK").ok).toBe(false);
    expect(kontrolaRozpisuUdajov(bezRozpisu, "SK", { neplatitel: true }).ok).toBe(true);
    expect(kontrolaSadziebUdajov(zlaSadzba, "SK").ok).toBe(false);
    expect(kontrolaSadziebUdajov(zlaSadzba, "SK", { neplatitel: true }).ok).toBe(true);
  });

  it("prenesenie (samozdanenie § 7) sa kontroluje ďalej", () => {
    const pdp = { ...zlaSadzba, prenesenie: true };
    expect(kontrolaNespracovaneho(pdp, "SK", "faktura", true).ok).toBe(false);
    expect(kontrolaSadziebUdajov(pdp, "SK", { neplatitel: true }).ok).toBe(false);
  });
});

describe("zaúčtovanie dokladu neplatiteľa", () => {
  it("RHJ bloček s odpočtom sa zastaví — bez odpočtu je zaúčtovateľný", () => {
    expect(jeNeplatitel(RHJ)).toBe(true);
    const sOdpoctom = blocekNaUctovanie({ ...blocekRhj, odpocet: true }, {});
    expect(prekazkaUctovania(sOdpoctom, RHJ)).toMatch(/firma nie je platiteľ DPH/);
    // Po zmene: spúšťač aj server dajú neplatiteľovi odpocet = false.
    const bez = blocekNaUctovanie({ ...blocekRhj, odpocet: odpocetPodlaFirmy(RHJ, true) }, {});
    expect(prekazkaUctovania(bez, RHJ)).toBeNull();
    expect(bez.riadky.every((r) => r.odpocet === false)).toBe(true);
  });

  it("Pohoda kontrola: RHJ bloček bez odpočtu prejde", () => {
    expect(prekazkaDokladu({ ...blocekRhj, odpocet: true }, RHJ)).toMatch(/firma nie je platiteľ DPH/);
    expect(prekazkaDokladu({ ...blocekRhj, odpocet: false }, RHJ)).toBeNull();
  });

  it("prijatá faktúra Tobify (§ 7) bez odpočtu je zaúčtovateľná", () => {
    const p = prijataNaUctovanie(
      {
        id: "p-tob",
        invoice_number: "2026/118",
        issue_date: "2026-11-05",
        amount_without_vat: 100,
        vat_amount: 23,
        amount_total: 123,
        supplier_name: "Dodávateľ s. r. o.",
        pohoda_predkontacia: "2",
        odpocet: odpocetPodlaFirmy(TOBIFY, true),
      },
      {},
    );
    expect(prekazkaUctovania(p, TOBIFY)).toBeNull();
  });
});

describe("server — firma a zákonné sadzby", () => {
  it("firmaPreDph číta režim DPH a firmaJeNeplatitel rozhodne podľa schémy", async () => {
    const k = klient(RHJ);
    expect(await firmaPreDph(k, "rhj")).toEqual(RHJ);
    expect(k.volania).toEqual(["companies", "country, ic_dph, vat_payer, vat_scheme"]);
    expect(await firmaJeNeplatitel(klient(RHJ), "rhj")).toBe(true);
    expect(await firmaJeNeplatitel(klient(TOBIFY), "tob")).toBe(true);
    expect(await firmaJeNeplatitel(klient(PLATITEL), "x")).toBe(false);
    expect(await firmaJeNeplatitel(klient(null), "x")).toBe(false);
    expect(await firmaJeNeplatitel(klient(RHJ), null)).toBe(false);
  });

  const blocek21 = {
    issue_date: "2026-11-10",
    net_amount: 100,
    vat_amount: 21,
    total_amount: 121,
    vat_breakdown: [{ sadzba: 21, zaklad: 100, dph: 21 }],
  };

  it("bloček neplatiteľa s nezákonnou sadzbou sa smie zapísať, platiteľa nie", async () => {
    expect((await overDphZapisu(klient(PLATITEL), "x", "expense_documents", blocek21)).length).toBeGreaterThan(0);
    expect(await overDphZapisu(klient(RHJ), "rhj", "expense_documents", blocek21)).toEqual([]);
    // RHJ 23 % + 19 % prejde vždy.
    expect(await overDphZapisu(klient(RHJ), "rhj", "expense_documents", blocekRhj)).toEqual([]);
  });

  it("prijatá v prenesení sa kontroluje aj u neplatiteľa", async () => {
    const prijata = {
      issue_date: "2026-11-10",
      delivery_date: "2026-11-10",
      amount_without_vat: 100,
      vat_amount: 21,
      amount_total: 121,
      vat_breakdown: [{ sadzba: 21, zaklad: 100, dph: 21 }],
      status: "received",
      type: "regular",
    };
    expect(await overDphZapisu(klient(TOBIFY), "tob", "purchase_invoices", prijata)).toEqual([]);
    expect(
      (await overDphZapisu(klient(TOBIFY), "tob", "purchase_invoices", { ...prijata, reverse_charge: true })).length,
    ).toBeGreaterThan(0);
  });
});
