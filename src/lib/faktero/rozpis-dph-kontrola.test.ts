import { describe, expect, it } from "vitest";
import { jePrenesenieZTextu, popisChybRozpisu, skontrolujRozpisDph } from "./rozpis-dph-kontrola";

const SK = { krajina: "SK", datumDodania: "2026-10-29" };

describe("kontrola rozpisu DPH", () => {
  it("správny rozpis z príkladu (0 % 26,90 + 23 % 116,87/26,88) prejde", () => {
    const v = skontrolujRozpisDph(
      [
        { rate: 0, base: 26.9, vat: 0, vat_category: "reverse_charge" },
        { rate: 23, base: 116.87, vat: 26.88, vat_category: "standard" },
      ],
      { bezDph: 143.77, dph: 26.88 },
      SK,
    );
    expect(v).toEqual({ ok: true, chyby: [] });
  });

  it("chybný rozpis z príkladu (19 % 143,77/26,88) neprejde — daň riadku nesedí", () => {
    const v = skontrolujRozpisDph(
      [{ rate: 19, base: 143.77, vat: 26.88 }],
      { bezDph: 143.77, dph: 26.88 },
      SK,
    );
    expect(v.ok).toBe(false);
    expect(v.chyby.map((c) => c.kod)).toEqual(["riadok_dph"]);
    expect(v.chyby[0]!.riadok).toBe(0);
    expect(popisChybRozpisu(v)).toContain("Rozpis DPH nesedí");
  });

  it("súčet základov a súčet DPH musia sedieť so sumami dokladu", () => {
    const v = skontrolujRozpisDph(
      [{ rate: 23, base: 116.87, vat: 26.88 }],
      { bezDph: 143.77, dph: 27.5 },
      SK,
    );
    expect(v.chyby.map((c) => c.kod).sort()).toEqual(["suma_dph", "suma_zakladov"]);
  });

  it("tolerancia 0,02 na riadok aj na súčet", () => {
    expect(
      skontrolujRozpisDph([{ rate: 23, base: 100, vat: 23.02 }], { bezDph: 100.02, dph: 23 }, SK)
        .ok,
    ).toBe(true);
    expect(
      skontrolujRozpisDph([{ rate: 23, base: 100, vat: 23.03 }], { bezDph: 100, dph: 23.03 }, SK)
        .ok,
    ).toBe(false);
  });

  it("sadzba musí platiť v krajine a v deň dodania", () => {
    // 20 % platilo na Slovensku do konca 2024.
    expect(
      skontrolujRozpisDph([{ rate: 20, base: 100, vat: 20 }], { bezDph: 100, dph: 20 }, SK).chyby[0]
        ?.kod,
    ).toBe("neplatna_sadzba");
    expect(
      skontrolujRozpisDph(
        [{ rate: 20, base: 100, vat: 20 }],
        { bezDph: 100, dph: 20 },
        { krajina: "SK", datumDodania: "2024-06-01" },
      ).ok,
    ).toBe(true);
    // Bez dátumu: len dnešné sadzby — historická 20 % neprejde.
    expect(
      skontrolujRozpisDph(
        [{ rate: 20, base: 100, vat: 20 }],
        { bezDph: 100, dph: 20 },
        { krajina: "SK" },
      ).ok,
    ).toBe(false);
    // Sadzba dopočítaná z pomeru (1,46 %) nikdy.
    expect(
      skontrolujRozpisDph(
        [{ rate: 1.46, base: 384.39, vat: 5.61 }],
        { bezDph: 384.39, dph: 5.61 },
        SK,
      ).chyby.map((c) => c.kod),
    ).toContain("neplatna_sadzba");
    // Česká firma: 21 a 12 %, nie slovenských 19.
    expect(
      skontrolujRozpisDph(
        [
          { rate: 21, base: 100, vat: 21 },
          { rate: 12, base: 50, vat: 6 },
        ],
        { bezDph: 150, dph: 27 },
        { krajina: "CZ", datumDodania: "2026-10-01" },
      ).ok,
    ).toBe(true);
    expect(
      skontrolujRozpisDph(
        [{ rate: 19, base: 100, vat: 19 }],
        { bezDph: 100, dph: 19 },
        {
          krajina: "Česko",
          datumDodania: "2026-10-01",
        },
      ).chyby[0]?.kod,
    ).toBe("neplatna_sadzba");
  });

  it("kategórie: mimo DPH a oslobodené bez dane, 0 % bez dôvodu na kontrolu", () => {
    const sumy = { bezDph: 384.39, dph: 5.61 };
    expect(
      skontrolujRozpisDph(
        [
          { rate: 0, base: 360, vat: 0, vat_category: "out_of_scope" },
          { rate: 23, base: 24.39, vat: 5.61, vat_category: "standard" },
        ],
        sumy,
        SK,
      ).ok,
    ).toBe(true);
    // 0 % bez kategórie = needs_review.
    expect(
      skontrolujRozpisDph(
        [
          { rate: 0, base: 360, vat: 0 },
          { rate: 23, base: 24.39, vat: 5.61 },
        ],
        sumy,
        SK,
      ).chyby.map((c) => c.kod),
    ).toEqual(["neplatna_kategoria"]);
    // Oslobodené s daňou.
    expect(
      skontrolujRozpisDph(
        [{ rate: 0, base: 100, vat: 5, vat_category: "exempt" }],
        { bezDph: 100, dph: 5 },
        SK,
      ).chyby.map((c) => c.kod),
    ).toContain("dph_pri_oslobodenom");
    // Zdaniteľné s 0 % je protirečenie.
    expect(
      skontrolujRozpisDph(
        [{ rate: 0, base: 100, vat: 0, vat_category: "standard" }],
        { bezDph: 100, dph: 0 },
        SK,
      ).chyby.map((c) => c.kod),
    ).toEqual(["neplatna_kategoria"]);
    // Prenesenie s 23 % nesie daň 0.
    expect(
      skontrolujRozpisDph(
        [{ rate: 23, base: 100, vat: 0, vat_category: "reverse_charge" }],
        { bezDph: 100, dph: 0 },
        SK,
      ).ok,
    ).toBe(true);
  });

  it("dobropis (záporné sumy) sa kontroluje rovnako", () => {
    expect(
      skontrolujRozpisDph([{ rate: 23, base: -100, vat: -23 }], { bezDph: -100, dph: -23 }, SK).ok,
    ).toBe(true);
  });

  it("prenesenie daňovej povinnosti z textu dokladu", () => {
    expect(jePrenesenieZTextu("Prenesenie daňovej povinnosti")).toBe(true);
    expect(jePrenesenieZTextu("PRENESENIE DANOVEJ POVINNOSTI")).toBe(true);
    expect(jePrenesenieZTextu("podľa § 69 ods. 12 písm. f) zákona o DPH")).toBe(true);
    expect(jePrenesenieZTextu("§69 ods.12")).toBe(true);
    expect(jePrenesenieZTextu("Daň odvede zákazník — přenesení daňové povinnosti")).toBe(true);
    expect(jePrenesenieZTextu("režim podle § 92a zákona o DPH")).toBe(true);
    expect(jePrenesenieZTextu("Reverse charge")).toBe(true);
    expect(jePrenesenieZTextu("Oslobodené od dane podľa § 43")).toBe(false);
    expect(jePrenesenieZTextu("§ 69 ods. 1")).toBe(false);
    expect(jePrenesenieZTextu("")).toBe(false);
  });
});

import {
  jeRozpisPotvrdeny,
  kontrolaSadziebPrijatej,
  nesuladSDokladom,
  podpisRozpisu,
  riadkyUlozenehoDokladu,
  vypocitanyCelkom,
} from "./rozpis-dph-kontrola";

describe("súčet podľa sadzieb voči sume dokladu (B1-2)", () => {
  it("správna sadzba nehlási nič", () => {
    expect(nesuladSDokladom([{ rate: 23, base: 100, vat: 23 }], 123)).toBeNull();
    expect(
      nesuladSDokladom(
        [
          { rate: 0, base: 26.9, vat: 0, vat_category: "reverse_charge" },
          { rate: 23, base: 116.87, vat: 26.88 },
        ],
        170.65,
      ),
    ).toBeNull();
  });

  it("zlá sadzba (19 namiesto 23) hlási doklad aj vypočítanú sumu", () => {
    const n = nesuladSDokladom([{ rate: 19, base: 100, vat: 23 }], 123);
    expect(n?.kod).toBe("suma_dokladu");
    expect(n?.sprava).toBe("Sadzba DPH / súčet nesedí s dokladom (doklad: 123,00 €, vypočítané: 119,00 €).");
  });

  it("tolerancia 0,01 € na sadzbu", () => {
    expect(nesuladSDokladom([{ rate: 23, base: 100, vat: 23 }], 123.01)).toBeNull();
    expect(nesuladSDokladom([{ rate: 23, base: 100, vat: 23 }], 123.02)).not.toBeNull();
    const dve = [
      { rate: 23, base: 100, vat: 23 },
      { rate: 5, base: 10, vat: 0.5 },
    ];
    expect(nesuladSDokladom(dve, 133.52)).toBeNull();
    expect(nesuladSDokladom(dve, 133.53)).not.toBeNull();
  });

  it("nezdaniteľné riadky rátajú len základ, bez sumy dokladu sa nekontroluje", () => {
    expect(vypocitanyCelkom([{ rate: 0, base: 50, vat: 0, vat_category: "out_of_scope" }])).toBe(50);
    expect(nesuladSDokladom([{ rate: 23, base: 100, vat: 23 }], null)).toBeNull();
    expect(nesuladSDokladom([], 10)).toBeNull();
  });

  it("cudzia mena v správe", () => {
    expect(nesuladSDokladom([{ rate: 21, base: 100, vat: 21 }], 115, "CZK")?.sprava).toContain("doklad: 115,00 CZK");
  });

  it("podpis sa mení so sadzbou aj sumou a potvrdenie sedí len s rovnakým", () => {
    const p = podpisRozpisu([{ rate: 23, base: 100, vat: 23 }], 123);
    expect(p).toBe(podpisRozpisu([{ rate: 23, base: -100, vat: -23 }], -123));
    expect(p).not.toBe(podpisRozpisu([{ rate: 19, base: 100, vat: 23 }], 123));
    expect(p).not.toBe(podpisRozpisu([{ rate: 23, base: 100, vat: 23 }], 124));
    expect(jeRozpisPotvrdeny({ podpis: p, at: "x" }, p)).toBe(true);
    expect(jeRozpisPotvrdeny(null, p)).toBe(false);
  });

  it("riadky uloženého dokladu: vat_breakdown (dobropis záporne, pdp) aj jedna sadzba bločku", () => {
    expect(
      riadkyUlozenehoDokladu({ vat_breakdown: [{ sadzba: 23, zaklad: -100, dph: -23 }, { sadzba: 0, zaklad: 5, dph: 0, pdp: true }] }),
    ).toEqual([
      { rate: 23, base: 100, vat: 23, vat_category: null },
      { rate: 0, base: 5, vat: 0, vat_category: "reverse_charge" },
    ]);
    expect(riadkyUlozenehoDokladu({ vat_rate: 20, net_amount: 10, vat_amount: 2 })).toEqual([
      { rate: 20, base: 10, vat: 2 },
    ]);
    expect(riadkyUlozenehoDokladu({ vat_rate: null, net_amount: 10 })).toEqual([]);
  });
});

describe("kontrola sadzieb prijatej faktúry", () => {
  const zaklad = {
    amount_without_vat: 100,
    vat_amount: 23,
    amount_total: 123,
    currency: "EUR",
    issue_date: "2026-10-29",
    supplier_ic_dph: "SK2020000000",
  };
  it("jedna sadzba nasleduje sumy hlavičky — sedí", () => {
    const s = kontrolaSadziebPrijatej({ ...zaklad, vat_breakdown: [{ sadzba: 23, zaklad: 90, dph: 20.7 }] }, "SK");
    expect(s.kontrola.ok).toBe(true);
  });
  it("zlá sadzba v rozpise vyvolá nesúlad, po potvrdení podpisu je potvrdená", () => {
    const d = { ...zaklad, vat_breakdown: [{ sadzba: 19, zaklad: 100, dph: 23 }] };
    const s = kontrolaSadziebPrijatej(d, "SK");
    expect(s.kontrola.ok).toBe(false);
    expect(s.kontrola.chyby[0]!.kod).toBe("suma_dokladu");
    expect(s.potvrdene).toBe(false);
    expect(kontrolaSadziebPrijatej({ ...d, rozpis_dph_potvrdeny: { podpis: s.podpis } }, "SK").potvrdene).toBe(true);
    // Zmena sumy zruší potvrdenie.
    expect(
      kontrolaSadziebPrijatej({ ...d, amount_total: 124, rozpis_dph_potvrdeny: { podpis: s.podpis } }, "SK").potvrdene,
    ).toBe(false);
  });
  it("bez rozpisu, zálohová a neplatiteľ bez dane sa nekontrolujú", () => {
    expect(kontrolaSadziebPrijatej({ ...zaklad, vat_breakdown: null }, "SK").kontrola.ok).toBe(true);
    expect(
      kontrolaSadziebPrijatej({ ...zaklad, type: "proforma", vat_breakdown: [{ sadzba: 19, zaklad: 100, dph: 23 }] }, "SK").kontrola.ok,
    ).toBe(true);
    expect(
      kontrolaSadziebPrijatej(
        { ...zaklad, vat_amount: 0, amount_total: 100, supplier_ic_dph: "", vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 0 }] },
        "SK",
      ).kontrola.ok,
    ).toBe(true);
  });
  it("dva riadky 0 % PDP + 23 % so správnou sumou prejdú", () => {
    const s = kontrolaSadziebPrijatej(
      {
        ...zaklad,
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
        vat_breakdown: [
          { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "reverse_charge" },
          { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
        ],
      },
      "SK",
    );
    expect(s.kontrola).toEqual({ ok: true, chyby: [] });
  });
});

describe("zaokrúhlenie dane a hotovosť", () => {
  it("daň po položkách (o 0,02 inak) sa berie z dokladu", () => {
    expect(nesuladSDokladom([{ rate: 23, base: 10.01, vat: 2.32 }], 12.33)).toBeNull();
  });
  it("hotovosť znesie 5-centové zaokrúhlenie sumy", () => {
    expect(nesuladSDokladom([{ rate: 23, base: 10, vat: 2.3 }], 12.32)).not.toBeNull();
    expect(nesuladSDokladom([{ rate: 23, base: 10, vat: 2.3 }], 12.32, "EUR", true)).toBeNull();
  });
});
