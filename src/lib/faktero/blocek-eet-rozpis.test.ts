import { describe, expect, it } from "vitest";
import {
  DOVOD_NAVRHU_SADZBY_QR,
  doplnRozpisEet,
  dovodKontrolyEet,
  jeNavrhRozpisuEet,
  navrhRozpisuPriUlozeni,
  rozpisZoSumy,
  zlucEetSFotkou,
} from "./blocek-eet";
import { jeDovodRozpisu } from "./rozpis-na-kontrole";
import { skontrolujDph } from "./dph-pravidlo";
import type { BlocekVysledok } from "./blocek.functions";

/*
  Český bloček z QR (EET) nesie len celkovú sumu (13. 11. 2026). Rozpis DPH
  dá fotka; bez nej návrh 21 % na kontrolu — v Česku platí aj 12 %.
*/
const QR = "EET*1.0*BKP:0123456789ABCDEF*DIC:CZ27082440*KC:605.00*DT:202610301015*R:B*";
const eet: BlocekVysledok = {
  zdroj: "qr",
  overeny: false,
  qr_raw: QR,
  supplier_ico: "27082440",
  supplier_country: "CZ",
  total: 605,
  currency: "CZK",
  date: "2026-10-30",
  items: [],
};

describe("rozpisZoSumy", () => {
  it("základ = suma / (1 + sadzba) na centy, DPH = zvyšok", () => {
    expect(rozpisZoSumy(605, 21)).toEqual({ sadzba: 21, zaklad: 500, dph: 105 });
    expect(rozpisZoSumy(605, 12)).toEqual({ sadzba: 12, zaklad: 540.18, dph: 64.82 });
    expect(rozpisZoSumy(117, 21)).toEqual({ sadzba: 21, zaklad: 96.69, dph: 20.31 });
  });
});

describe("doplnRozpisEet", () => {
  it("bez fotky: návrh 21 % zo sumy z QR a dôvod na kontrolu", () => {
    const v = doplnRozpisEet(eet);
    expect(v.vat_breakdown).toEqual([{ sadzba: 21, zaklad: 500, dph: 105 }]);
    expect(v.net_amount).toBe(500);
    expect(v.vat_amount).toBe(105);
    expect(v.vat_rate).toBe(21);
    expect(v.rozpis_odhad).toBe(true);
    expect(v.kontrola_dph).toBe(DOVOD_NAVRHU_SADZBY_QR);
    expect(v.total).toBe(605);
    // Dôvod poznajú stráže rozpisu na kontrole (Pohoda, autopilot).
    expect(jeDovodRozpisu(v.kontrola_dph)).toBe(true);
  });

  it("návrh prejde pravidlom zákonných sadzieb CZ (spúšťač ho neodmietne)", () => {
    for (const suma of [605, 117, 0.99, 1234.56, 99999.99]) {
      const v = doplnRozpisEet({ ...eet, total: suma });
      const r = v.vat_breakdown![0]!;
      expect(r.zaklad + r.dph).toBeCloseTo(suma, 2);
      const chyby = skontrolujDph({
        rozpis: v.vat_breakdown!,
        zaklad: v.net_amount!,
        dph: v.vat_amount!,
        krajina: "CZ",
        den: "2026-10-30",
      } as any);
      expect(chyby).toEqual([]);
      // Prepnutie na 12 % zo sumy prejde tiež.
      const r12 = rozpisZoSumy(suma, 12);
      expect(skontrolujDph({ rozpis: [r12], zaklad: r12.zaklad, dph: r12.dph, krajina: "CZ", den: "2026-10-30" } as any)).toEqual([]);
    }
  });

  it("zaokrúhlenie bločku nepatrí do základu", () => {
    const v = doplnRozpisEet({
      ...eet,
      total: 117,
      items: [{ name: "Zaokrouhlení", quantity: 1, unit_price: 0.2, vat_rate: 0, total: 0.2, zaokruhlenie: true }],
    });
    expect(v.vat_breakdown).toEqual([rozpisZoSumy(116.8, 21)]);
  });

  it("rozpis z fotky, ktorý sedí so sumou z QR, ostáva bez kontroly", () => {
    const v = doplnRozpisEet({
      ...eet,
      vat_breakdown: [
        { sadzba: 21, zaklad: 300, dph: 63 },
        { sadzba: 12, zaklad: 216.07, dph: 25.93 },
      ],
      vat_rate: 21,
    });
    expect(v.vat_breakdown).toHaveLength(2);
    expect(v.kontrola_dph).toBeUndefined();
    expect(v.rozpis_odhad).toBeUndefined();
  });

  it("rozpis z fotky, ktorý nesedí so sumou z QR, ide na kontrolu", () => {
    const v = doplnRozpisEet({ ...eet, vat_breakdown: [{ sadzba: 12, zaklad: 500, dph: 60 }] });
    expect(v.vat_breakdown).toEqual([{ sadzba: 12, zaklad: 500, dph: 60 }]);
    expect(v.kontrola_dph).toMatch(/^Rozpis DPH z fotky \(spolu 560,00 CZK\) nesedí so sumou z QR kódu 605,00 CZK/);
    expect(v.rozpis_odhad).toBeUndefined();
  });

  it("slovenská eKasa sa nemení", () => {
    const sk: BlocekVysledok = { ...eet, zdroj: "ekasa", qr_raw: "O-ABC123", currency: "EUR", total: 12.3 };
    expect(doplnRozpisEet(sk)).toBe(sk);
  });
});

describe("zlucEetSFotkou", () => {
  it("fotka bez rozpisu (OCR nedalo tabuľku) → návrh 21 % zo sumy z QR", () => {
    const foto: BlocekVysledok = {
      zdroj: "foto",
      overeny: false,
      total: 600,
      vat_amount: 10,
      currency: "CZK",
      items: [{ name: "Rohlík", quantity: 1, unit_price: 605, vat_rate: 12, total: 605 }],
    };
    const v = zlucEetSFotkou(eet, foto, "z fotky");
    expect(v.total).toBe(605);
    expect(v.vat_breakdown).toEqual([{ sadzba: 21, zaklad: 500, dph: 105 }]);
    expect(v.vat_amount).toBe(105);
    expect(v.rozpis_odhad).toBe(true);
    expect(v.items).toHaveLength(1);
  });

  it("fotka s rozpisom 12 % sediacim s QR → rozpis z fotky, bez kontroly", () => {
    const foto: BlocekVysledok = {
      zdroj: "foto",
      overeny: false,
      total: 605,
      currency: "CZK",
      vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }],
      net_amount: 540.18,
      vat_amount: 64.82,
      vat_rate: 12,
      items: [],
    };
    const v = zlucEetSFotkou(eet, foto);
    expect(v.vat_breakdown).toEqual([{ sadzba: 12, zaklad: 540.18, dph: 64.82 }]);
    expect(v.vat_rate).toBe(12);
    expect(v.kontrola_dph).toBeUndefined();
    expect(v.zdroj).toBe("qr");
  });
});

describe("uloženie bločku (createExpenseFn)", () => {
  const row = { qr_raw: QR, total_amount: 605, vat_breakdown: [{ sadzba: 21, zaklad: 500, dph: 105 }], items: null };

  it("dôvod od klienta sa zapíše, null = človek rozpis skontroloval", () => {
    expect(dovodKontrolyEet(row, DOVOD_NAVRHU_SADZBY_QR)).toBe(DOVOD_NAVRHU_SADZBY_QR);
    expect(dovodKontrolyEet(row, null)).toBeNull();
    expect(dovodKontrolyEet(row, "nesedí")).toBe("Rozpis DPH treba skontrolovať: nesedí");
  });

  it("starší klient bez dôvodu: návrh 21 % sa pozná podľa rozpisu", () => {
    expect(dovodKontrolyEet(row, undefined)).toBe(DOVOD_NAVRHU_SADZBY_QR);
    expect(jeNavrhRozpisuEet({ ...row, vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }] })).toBe(false);
    expect(dovodKontrolyEet({ ...row, vat_breakdown: [{ sadzba: 12, zaklad: 540.18, dph: 64.82 }] }, undefined)).toBeNull();
  });

  it("iný než český QR sa neoznačí", () => {
    expect(dovodKontrolyEet({ ...row, qr_raw: "O-ABC" }, DOVOD_NAVRHU_SADZBY_QR)).toBeNull();
    expect(navrhRozpisuPriUlozeni({ qr_raw: "O-ABC", total_amount: 10 })).toBeNull();
  });

  it("bloček bez rozpisu aj DPH (fronta appky spred 13. 11.) dostane návrh 21 %", () => {
    expect(navrhRozpisuPriUlozeni({ qr_raw: QR, total_amount: 605, vat_amount: null, vat_breakdown: null })).toEqual({
      vat_breakdown: [{ sadzba: 21, zaklad: 500, dph: 105 }],
      net_amount: 500,
      vat_amount: 105,
      vat_rate: 21,
    });
    // Rozpis alebo DPH už je — nič sa nedopĺňa.
    expect(navrhRozpisuPriUlozeni({ qr_raw: QR, total_amount: 605, vat_breakdown: [{ sadzba: 12, zaklad: 1, dph: 0.12 }] })).toBeNull();
    expect(navrhRozpisuPriUlozeni({ qr_raw: QR, total_amount: 605, vat_amount: 64.82 })).toBeNull();
    expect(navrhRozpisuPriUlozeni({ qr_raw: QR, total_amount: null })).toBeNull();
  });
});
