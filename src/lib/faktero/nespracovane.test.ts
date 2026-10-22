import { describe, expect, it } from "vitest";
import {
  blocekZUdajov,
  chybajuce,
  navrhDruhu,
  prijataZUdajov,
  rozpisZAi,
  udajeZAi,
  prazdneUdaje,
  rozdielPoloziek,
  udajeZPrijatej,
  rozdielVTolerancii,
  hromadnaZmenaUdajov,
} from "./nespracovane";

describe("nespracované doklady", () => {
  it("návrh druhu z vyťaženia", () => {
    expect(navrhDruhu({ document_type: "ostatny" })).toBe("ostatny");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "blocek" })).toBe("blocek");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "zalohova" })).toBe("zalohova");
    expect(navrhDruhu({ document_type: "faktura", amount_total: -12.3 })).toBe("dobropis");
    expect(navrhDruhu({ document_type: "faktura", document_subtype: "ostra" })).toBe("faktura");
    expect(navrhDruhu(null)).toBe("faktura");
  });

  it("rozpis po sadzbách z položiek, inak jeden riadok", () => {
    expect(
      rozpisZAi({
        amount_without_vat: 120,
        vat_amount: 24,
        amount_total: 144,
        items: [
          { name: "A", vat_rate: 23, total: 123 },
          { name: "B", vat_rate: 5, total: 21 },
        ],
      }),
    ).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 5, zaklad: 20, dph: 1 },
    ]);
    expect(rozpisZAi({ amount_without_vat: 100, vat_amount: 23, amount_total: 123 })).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
    ]);
  });

  it("povinné polia podľa druhu", () => {
    const u = udajeZAi({ supplier_name: "Orange", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }, "2026-10-07");
    expect(chybajuce("faktura", u)).toEqual(["cislo", "splatnost"]);
    expect(chybajuce("blocek", u)).toEqual(["platba"]);
    expect(chybajuce("ostatny", u)).toEqual([]);
    expect(chybajuce(null, u)).toEqual(["druh"]);
  });

  it("spôsob platby z bločku", () => {
    const zaklad = { supplier_name: "BILLA", amount_without_vat: 6.2, vat_amount: 1.18, amount_total: 7.38 };
    expect(udajeZAi({ ...zaklad, payment_method: "karta" }, "2026-10-07").platba).toBe("karta");
    expect(udajeZAi({ ...zaklad, payment_method: "Hotovost" }, "2026-10-07").platba).toBe("hotovost");
    // Neznáma hodnota sa nepoužije — radšej sa človek opýta.
    expect(udajeZAi({ ...zaklad, payment_method: "stravenky" }, "2026-10-07").platba).toBe("");
    expect(chybajuce("blocek", udajeZAi({ ...zaklad, payment_method: "karta" }, "2026-10-07"))).toEqual([]);
  });

  it("dobropis má záporné sumy, zálohová sa neodpočítava, bloček s rozpisom", () => {
    const u = udajeZAi({ supplier_name: "X", invoice_number: "D1", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3 }, "2026-10-07");
    u.kody.predkontacia = "1Fp";
    const d = prijataZUdajov("dobropis", u, "2026-10-07");
    expect([d.amount_without_vat, d.vat_amount, d.amount_total]).toEqual([-10, -2.3, -12.3]);
    expect(d.pohoda_predkontacia).toBe("1Fp");
    expect(prijataZUdajov("zalohova", u, "2026-10-07")).toMatchObject({ type: "proforma", odpocet: false });
    u.platba = "hotovost";
    expect(blocekZUdajov(u)).toMatchObject({ total_amount: 12.3, vat_rate: 23, payment_method: "hotovost" });
  });
});

describe("vyťaženie adresy, popisu a dátumov", () => {
  it("adresa dodávateľa, popis plnenia a splatnosť aj v slovenskom tvare", () => {
    const u = udajeZAi(
      {
        supplier_name: "MD BUILDING, s. r. o.",
        supplier_street: "Hlavná 12",
        supplier_city: "Bratislava",
        supplier_zip: "811 01",
        description: "Stavebné práce za október",
        issue_date: "05.10.2026",
        due_date: "19. 10. 2026",
      },
      "2026-10-07",
    );
    expect(u.dodavatel).toMatchObject({ ulica: "Hlavná 12", mesto: "Bratislava", psc: "811 01" });
    expect(u.popis).toBe("Stavebné práce za október");
    expect(u.datumVystavenia).toBe("2026-10-05");
    expect(u.splatnost).toBe("2026-10-19");
    expect(prijataZUdajov("faktura", u, "2026-10-07")).toMatchObject({
      supplier_street: "Hlavná 12",
      intro_note: "Stavebné práce za október",
      due_date: "2026-10-19",
    });
  });
});

describe("vypnuté položky (zle vyčítané)", () => {
  const zle = () => {
    const u = prazdneUdaje();
    u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }] as any;
    u.polozky = [{ name: "Nezmysel", quantity: 1, unit: null, unit_price: 999, vat_rate: 23, total: 999 }];
    return u;
  };
  it("nesúlad položiek blokuje, kým sú zapnuté", () => {
    expect(rozdielPoloziek(zle())).not.toBeNull();
  });
  it("po vypnutí sa nesúlad nekontroluje a položky idú bokom", () => {
    const u = { ...zle(), polozkyVypnute: true };
    expect(rozdielPoloziek(u)).toBeNull();
    const r: any = prijataZUdajov("faktura", u as any, "2026-10-12");
    expect(r.items).toBeNull();
    expect(r.polozky_vypnute).toHaveLength(1);
  });
  it("pri vrátení do Nespracovaných sa vypnutie zachová", () => {
    const { udaje } = udajeZPrijatej({ items: [], polozky_vypnute: [{ name: "X" }] } as any);
    expect(udaje.polozkyVypnute).toBe(true);
    expect(udaje.polozky).toHaveLength(1);
  });
});

describe("kontroly podľa nastavení firmy", () => {
  const zaklad = () => {
    const u = prazdneUdaje();
    u.dodavatel.nazov = "Dodávateľ";
    u.cislo = "F1";
    u.datumVystavenia = "2026-10-10";
    u.splatnost = "2026-10-24";
    u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    u.polozky = [{ name: "Tovar", quantity: 1, unit: null, unit_price: 122.9, vat_rate: 23, total: 122.9 }];
    return u;
  };

  it("rozdiel položiek v tolerancii doklad nezastaví", () => {
    expect(chybajuce("faktura", zaklad())).toContain("polozky");
    expect(chybajuce("faktura", zaklad(), [], { toleranciaCenty: 10 })).not.toContain("polozky");
    expect(chybajuce("faktura", zaklad(), [], { toleranciaCenty: 5 })).toContain("polozky");
    expect(rozdielVTolerancii(zaklad(), { toleranciaCenty: 10 })).toBe(true);
  });

  it("vypnutá kontrola splatnosti pustí splatnosť pred vystavením", () => {
    const u = zaklad();
    u.polozky = [];
    u.splatnost = "2026-10-01";
    expect(chybajuce("faktura", u)).toContain("splatnostPred");
    expect(chybajuce("faktura", u, [], { kontrolaSplatnosti: false })).not.toContain("splatnostPred");
  });
});

describe("hromadnaZmenaUdajov", () => {
  it("vyplnené polia prepíše, prázdne nechá", () => {
    const u = prazdneUdaje();
    u.kody.predkontacia = "518";
    u.kody.stredisko = "BA";
    const v = hromadnaZmenaUdajov(u, { predkontacia: "", stredisko: "KE", cinnost: "OBCH", jobId: "j-1" });
    expect(v.kody.predkontacia).toBe("518");
    expect(v.kody.stredisko).toBe("KE");
    expect(v.kody.cinnost).toBe("OBCH");
    expect(v.jobId).toBe("j-1");
  });
});
