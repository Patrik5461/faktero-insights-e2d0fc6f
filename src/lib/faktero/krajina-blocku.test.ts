/*
  Regresia 13. 11. 2026: `expense_documents.supplier_country` bola všade
  prázdna, takže bloček so zahraničnou DPH (HU 27 %, AT 20 %, CZ 21 %)
  pravidlo DPH vždy odmietlo. Krajina sa doplní pri uložení a kontrola ju
  odvodí aj z prefixu IČ DPH.
*/
import { describe, expect, it } from "vitest";
import { krajinaBlocku, krajinaZTextu } from "./krajina-blocku";
import { skontrolujDph, skontrolujDphDokladu } from "./dph-pravidlo";
import { skontrolujRozpisDph } from "./rozpis-dph-kontrola";
import { blocekZUdajov, prazdneUdaje } from "./nespracovane";
import { kontrolaNespracovaneho, sadzbyNaVyber } from "@/components/faktero/dph-formular";

describe("krajinaBlocku", () => {
  it("uvedený kód alebo názov štátu", () => {
    expect(krajinaBlocku({ krajina: "hu" })).toBe("HU");
    expect(krajinaBlocku({ krajina: "Magyarország" })).toBe("HU");
    expect(krajinaBlocku({ krajina: "Österreich" })).toBe("AT");
    expect(krajinaBlocku({ krajina: "EL" })).toBe("GR");
    expect(krajinaZTextu("AUT")).toBe("AT");
  });
  it("inak prefix IČ DPH", () => {
    expect(krajinaBlocku({ icDph: "HU12345678" })).toBe("HU");
    expect(krajinaBlocku({ icDph: "ATU12345678" })).toBe("AT");
    expect(krajinaBlocku({ icDph: "el 123456789" })).toBe("GR");
    expect(krajinaBlocku({ icDph: "2020123456" })).toBeNull();
  });
  it("inak štát na konci adresy, nie ulica s názvom štátu", () => {
    expect(krajinaBlocku({ adresa: "Fő utca 1, 1051 Budapest, Magyarország" })).toBe("HU");
    expect(krajinaBlocku({ adresa: "Hauptstraße 5, 1010 Wien, AT" })).toBe("AT");
    expect(krajinaBlocku({ adresa: "Slovenská 12, Praha" })).toBeNull();
    expect(krajinaBlocku({ adresa: "Hlavná 5, 040 01 Košice" })).toBeNull();
  });
  it("uvedená krajina má prednosť pred IČ DPH", () => {
    expect(krajinaBlocku({ krajina: "AT", icDph: "HU12345678" })).toBe("AT");
  });
});

const hu = { net_amount: 100, vat_amount: 27, total_amount: 127, issue_date: "2026-10-15" };

describe("pravidlo DPH pri zahraničnom bločku", () => {
  it("HU 27 % s IČ DPH HU… prejde aj bez supplier_country", () => {
    expect(
      skontrolujDphDokladu(
        "expense_documents",
        { ...hu, vat_breakdown: [{ sadzba: 27, zaklad: 100, dph: 27 }], supplier_ic_dph: "HU12345678" },
        "SK",
      ),
    ).toEqual([]);
  });
  it("HU 27 % so supplier_country HU prejde", () => {
    expect(
      skontrolujDphDokladu(
        "expense_documents",
        { ...hu, vat_breakdown: [{ sadzba: 27, zaklad: 100, dph: 27 }], supplier_country: "HU" },
        "SK",
      ),
    ).toEqual([]);
  });
  it("27 % bez krajiny alebo so slovenským IČ DPH neprejde", () => {
    for (const ic of [null, "SK2020123456"]) {
      const ch = skontrolujDphDokladu(
        "expense_documents",
        { ...hu, vat_breakdown: [{ sadzba: 27, zaklad: 100, dph: 27 }], supplier_ic_dph: ic },
        "SK",
      );
      expect(ch.map((c) => c.kod)).toContain("sadzba");
    }
  });
  it("zahraničný dodávateľ — DPH sa stále počíta zo základu", () => {
    const ch = skontrolujDph({
      rozpis: [{ sadzba: 27, zaklad: 100, dph: 30 }],
      zaklad: 100,
      dph: 30,
      krajina: "SK",
      den: "2026-10-15",
      icDphDodavatela: "HU12345678",
    });
    expect(ch.map((c) => c.kod)).toContain("dph");
  });
  it("CZ palivo 21 % u slovenskej firmy (krajina z IČ DPH CZ)", () => {
    expect(
      skontrolujDphDokladu(
        "expense_documents",
        {
          net_amount: 1000,
          vat_amount: 210,
          total_amount: 1210,
          issue_date: "2026-10-15",
          vat_breakdown: [{ sadzba: 21, zaklad: 1000, dph: 210 }],
          supplier_ic_dph: "CZ25097563",
        },
        "SK",
      ),
    ).toEqual([]);
  });
  it("úprava len IČ DPH na zahraničné sa kontroluje (stĺpec IČ DPH mení výsledok)", () => {
    const stary = { ...hu, vat_breakdown: [{ sadzba: 27, zaklad: 100, dph: 27 }], supplier_ic_dph: "HU1" };
    expect(skontrolujDphDokladu("expense_documents", { supplier_ic_dph: "SK2020123456" }, "SK", stary).length).toBe(1);
  });
});

describe("kontrola rozpisu z čítania (Nespracované, uložený bloček)", () => {
  it("skontrolujRozpisDph prijme HU 27 % pri krajine dodávateľa HU", () => {
    const r = skontrolujRozpisDph([{ rate: 27, base: 100, vat: 27 }], { bezDph: 100, dph: 27 }, {
      krajina: "SK",
      datumDodania: "2026-10-15",
      icDphDodavatela: "HU12345678",
    });
    expect(r.ok).toBe(true);
    const tuzemsky = skontrolujRozpisDph([{ rate: 27, base: 100, vat: 27 }], { bezDph: 100, dph: 27 }, {
      krajina: "SK",
      datumDodania: "2026-10-15",
    });
    expect(tuzemsky.ok).toBe(false);
  });
  it("kontrolaNespracovaneho vezme krajinu z IČ DPH dodávateľa", () => {
    const k = kontrolaNespracovaneho(
      {
        rozpis: [{ sadzba: 27, zaklad: 100, dph: 27 }],
        datumVystavenia: "2026-10-15",
        dodavatel: { icDph: "HU12345678" },
      },
      "SK",
      "blocek",
    );
    expect(k.ok).toBe(true);
  });
});

describe("formulár a uloženie", () => {
  it("sadzbyNaVyber ponúkne sadzby štátu dodávateľa vrátane historických", () => {
    expect(sadzbyNaVyber("SK", "2026-10-15", "HU")).toEqual(expect.arrayContaining([27, 18, 5, 23]));
    expect(sadzbyNaVyber("SK", "2026-10-15", "FI")).toEqual(expect.arrayContaining([25.5, 24]));
    expect(sadzbyNaVyber("SK", "2026-10-15")).not.toContain(27);
  });
  it("bloček z Nespracovaných dostane krajinu z IČ DPH", () => {
    const u = prazdneUdaje();
    u.dodavatel.icDph = "HU12345678";
    expect(blocekZUdajov(u).supplier_country).toBe("HU");
    u.dodavatel.krajina = "AT";
    expect(blocekZUdajov(u).supplier_country).toBe("AT");
    const bez = prazdneUdaje();
    expect(blocekZUdajov(bez).supplier_country).toBeNull();
  });
});
