/*
  Regresné testy k revízii opravy DPH na prijatých dokladoch (13. 11. 2026):
  zahraničná DPH na bločku, historické sadzby štátov EÚ, prenos z Doklada na
  kontrole, poistka zákonných sadzieb, samozdanenie a skratka „ZF“.
*/
import { describe, expect, it } from "vitest";
import {
  jePovoleneZaokruhlenie,
  krajinaDodavatelaDph,
  krajinaZIcDph,
  maxZaokruhlenie,
  skontrolujDph,
  skontrolujDphDokladu,
  zaokruhlenieDokladu,
} from "./dph-pravidlo";
import { sadzbyStatuSHistoriou } from "./sadzby-eu";
import { lenZakonneSadzby } from "./napravy-dph-vytazenia";
import { rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { jePolozkaOdpoctuZalohy } from "./odpocet-zalohy-vytazenie";

const r = (sadzba: number, zaklad: number, dph: number, vat_category = "standard") => ({
  sadzba,
  zaklad,
  dph,
  vat_category: vat_category as any,
});

describe("1 — bloček so zahraničnou DPH: krajina z IČ DPH", () => {
  it("krajina z prefixu IČ DPH, EL = GR, bez prefixu null", () => {
    expect(krajinaZIcDph("HU12345678")).toBe("HU");
    expect(krajinaZIcDph("ATU 12345678")).toBe("AT");
    expect(krajinaZIcDph("EL123456789")).toBe("GR");
    expect(krajinaZIcDph("2020123456")).toBeNull();
    expect(krajinaDodavatelaDph(null, "CZ12345678")).toBe("CZ");
    expect(krajinaDodavatelaDph("sk", "HU12345678")).toBe("SK");
  });

  const blocekHu = {
    net_amount: 100,
    vat_amount: 27,
    total_amount: 127,
    vat_breakdown: [{ sadzba: 27, zaklad: 100, dph: 27 }],
    issue_date: "2026-10-01",
    supplier_country: null,
  };

  it("maďarské palivo 27 % s IČ DPH HU… prejde, aj keď supplier_country chýba", () => {
    expect(skontrolujDphDokladu("expense_documents", { ...blocekHu, supplier_ic_dph: "HU10625790" }, "SK")).toEqual([]);
  });
  it("27 % so slovenským IČ DPH (alebo bez neho) neprejde", () => {
    expect(skontrolujDphDokladu("expense_documents", { ...blocekHu, supplier_ic_dph: "SK2020123456" }, "SK")).not.toEqual([]);
    expect(skontrolujDphDokladu("expense_documents", { ...blocekHu, supplier_ic_dph: null }, "SK")).not.toEqual([]);
  });
  it("český hotel 21 % a rakúsky 20 % na slovenskom bločku", () => {
    expect(
      skontrolujDph({
        rozpis: [{ sadzba: 21, zaklad: 100, dph: 21 }],
        zaklad: 100,
        dph: 21,
        krajina: "SK",
        den: "2026-10-01",
        icDphDodavatela: "CZ25097563",
      }),
    ).toEqual([]);
    expect(
      skontrolujDph({
        rozpis: [{ sadzba: 20, zaklad: 100, dph: 20 }],
        zaklad: 100,
        dph: 20,
        krajina: "SK",
        den: "2026-10-01",
        krajinaDodavatela: "AT",
      }),
    ).toEqual([]);
  });
});

describe("7 — historické sadzby štátov EÚ", () => {
  it("tabuľka obsahuje staré sadzby zmenených štátov", () => {
    expect(sadzbyStatuSHistoriou("FI")).toEqual(expect.arrayContaining([25.5, 24, 14]));
    expect(sadzbyStatuSHistoriou("EE")).toEqual(expect.arrayContaining([24, 22, 20]));
    expect(sadzbyStatuSHistoriou("RO")).toEqual(expect.arrayContaining([21, 19, 11, 9]));
  });
  it.each([
    ["FI", 24, "2024-06-01"],
    ["EE", 22, "2025-03-01"],
    ["RO", 19, "2025-05-01"],
    ["LU", 16, "2023-05-01"],
  ])("%s %s %% (%s) prejde pravidlom aj poistkou vyťaženia", (stat, sadzba, den) => {
    const rozpis = [{ sadzba, zaklad: 100, dph: sadzba }];
    expect(
      skontrolujDph({ rozpis, zaklad: 100, dph: sadzba, krajina: "SK", den, krajinaDodavatela: stat }),
    ).toEqual([]);
    expect(lenZakonneSadzby([r(sadzba, 100, sadzba)], { krajina: "SK", den, krajinaDodavatela: stat })).toEqual([
      r(sadzba, 100, sadzba),
    ]);
  });
  it("vymyslená sadzba zahraničného dodávateľa z EÚ stále neprejde", () => {
    expect(
      skontrolujDph({
        rozpis: [{ sadzba: 22.46, zaklad: 100, dph: 22.46 }],
        zaklad: 100,
        dph: 22.46,
        krajina: "SK",
        den: "2026-10-01",
        krajinaDodavatela: "AT",
      }).map((c) => c.kod),
    ).toEqual(["sadzba"]);
  });
});

describe("2 — prenos z Doklada na kontrole", () => {
  const zly = {
    amount_without_vat: 300,
    vat_amount: 33,
    amount_total: 333,
    vat_breakdown: null,
    issue_date: "2026-05-01",
    type: "regular",
    status: "unpaid",
  };
  it("bez príznaku neprejde, s doklado_id a na_kontrolu_at prejde", () => {
    expect(skontrolujDphDokladu("purchase_invoices", zly, "SK")).not.toEqual([]);
    expect(
      skontrolujDphDokladu(
        "purchase_invoices",
        { ...zly, doklado_id: "123", na_kontrolu_at: "2026-11-13T10:00:00Z" },
        "SK",
      ),
    ).toEqual([]);
    expect(
      skontrolujDphDokladu(
        "expense_documents",
        { net_amount: 300, vat_amount: 33, total_amount: 333, doklado_id: "9", na_kontrolu_at: "2026-11-13" },
        "SK",
      ),
    ).toEqual([]);
  });
  it("príznak kontroly bez doklado_id výnimku nedáva", () => {
    expect(
      skontrolujDphDokladu("purchase_invoices", { ...zly, na_kontrolu_at: "2026-11-13T10:00:00Z" }, "SK"),
    ).not.toEqual([]);
  });
  it("zrušenie príznaku bez opravy rozpisu neprejde; s opraveným rozpisom áno", () => {
    const stary = { ...zly, doklado_id: "123", na_kontrolu_at: "2026-11-13T10:00:00Z" };
    expect(skontrolujDphDokladu("purchase_invoices", { na_kontrolu_at: null }, "SK", stary)).not.toEqual([]);
    expect(
      skontrolujDphDokladu(
        "purchase_invoices",
        {
          na_kontrolu_at: null,
          vat_breakdown: [
            { sadzba: 5, zaklad: 200, dph: 10 },
            { sadzba: 23, zaklad: 100, dph: 23 },
          ],
        },
        "SK",
        stary,
      ),
    ).toEqual([]);
  });
  it("úprava poznámky na doklade z Doklada, ktorý je stále na kontrole, prejde", () => {
    const stary = { ...zly, doklado_id: "123", na_kontrolu_at: "2026-11-13T10:00:00Z" };
    expect(skontrolujDphDokladu("purchase_invoices", { note: "x" }, "SK", stary)).toEqual([]);
  });
});

describe("4 — poistka zákonných sadzieb nikdy nevyrobí 0 % s DPH", () => {
  const sk = { krajina: "SK", den: "2026-10-01" };
  it("neplatná sadzba, ktorú model prečítal, ostane (kontrola ju ohlási)", () => {
    expect(lenZakonneSadzby([r(22.46, 100, 22.46)], sk)).toEqual([r(22.46, 100, 22.46)]);
    expect(lenZakonneSadzby([r(20, 100, 20)], sk)).toEqual([r(20, 100, 20)]);
  });
  it("0 % s nenulovou DPH bez sediacej sadzby stratí DPH (na kontrolu), so sediacou dostane jej sadzbu", () => {
    expect(lenZakonneSadzby([r(0, 300, 33, "needs_review")], sk)).toEqual([r(0, 300, 0, "needs_review")]);
    expect(lenZakonneSadzby([r(0, 100, 23, "needs_review")], sk)).toEqual([r(23, 100, 23)]);
  });
  it("vyťaženie so zmiešanými sadzbami bez rozpisu: žiadny riadok 0 % s DPH, kontrola neprejde", () => {
    const v = rozpisZVytazenia(
      { supplier_ic_dph: "SK2020123456", amount_without_vat: 300, vat_amount: 33, amount_total: 333, issue_date: "2026-05-01" },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(false);
    expect(v.rozpis.some((x) => x.sadzba === 0 && Math.abs(x.dph) > 0.004)).toBe(false);
  });
  it("20 % v roku 2026 ostane 20 % a kontrola neprejde", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK1",
        amount_without_vat: 100,
        vat_amount: 20,
        amount_total: 120,
        issue_date: "2026-05-01",
        vat_breakdown: [{ rate: 20, base: 100, vat: 20 }],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(false);
    expect(v.rozpis.map((x) => x.sadzba)).toEqual([20]);
  });
});

describe("9 — základ = celkom pri samozdanení sa neprepočíta", () => {
  it("prenesenie s vytlačenou samozdanenou DPH: základ ostane celkom", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK2020123456",
        amount_without_vat: 1000,
        vat_amount: 230,
        amount_total: 1000,
        issue_date: "2026-05-01",
        note: "Prenesenie daňovej povinnosti podľa § 69 ods. 12 zákona o DPH",
      },
      { krajina: "SK" },
    );
    expect(v.sumy?.bezDph).toBe(1000);
  });
  it("DPH = základ × 23 % bez vety o prenesení — tiež samozdanenie, základ ostane", () => {
    const v = rozpisZVytazenia(
      { supplier_ic_dph: "DE123456789", amount_without_vat: 500, vat_amount: 115, amount_total: 500, issue_date: "2026-05-01" },
      { krajina: "SK" },
    );
    expect(v.sumy?.bezDph).toBe(500);
  });
  it("AI prečítala „Celkom“ ako základ (123 / DPH 23) — základ sa opraví na 100", () => {
    const v = rozpisZVytazenia(
      { supplier_ic_dph: "SK2020123456", amount_without_vat: 123, vat_amount: 23, amount_total: 123, issue_date: "2026-05-01" },
      { krajina: "SK" },
    );
    expect(v.sumy?.bezDph).toBe(100);
  });
});

describe("10 — skratka ZF", () => {
  it("značka ZF nie je záloha", () => {
    expect(jePolozkaOdpoctuZalohy({ name: "ZF olej prevodovky", total: -20 })).toBe(false);
    expect(jePolozkaOdpoctuZalohy({ name: "ZF 8HP olej", total: -20 })).toBe(false);
    expect(jePolozkaOdpoctuZalohy({ name: "zf 2026001", total: -20 })).toBe(false);
  });
  it("ZF s číslom dokladu alebo slovo záloha je odpočet", () => {
    expect(jePolozkaOdpoctuZalohy({ name: "ZF 9180431, 14.10.2026", total: -14980 })).toBe(true);
    expect(jePolozkaOdpoctuZalohy({ name: "ZF č. 12", total: -100 })).toBe(true);
    expect(jePolozkaOdpoctuZalohy({ name: "Odpočet zálohovej faktúry", total: -100 })).toBe(true);
  });
});

describe("8 — zaokrúhlenie celkovej sumy", () => {
  it("limit podľa meny", () => {
    expect(maxZaokruhlenie("CZK")).toBe(1);
    expect(maxZaokruhlenie("EUR")).toBe(0.5);
    expect(maxZaokruhlenie(null)).toBe(0.5);
  });
  it("rozdiel a povolenie", () => {
    expect(zaokruhlenieDokladu(1210, 1000.4, 210.08)).toBe(-0.48);
    expect(jePovoleneZaokruhlenie(-0.48, "CZK")).toBe(true);
    expect(jePovoleneZaokruhlenie(0.6, "EUR")).toBe(false);
  });
});
