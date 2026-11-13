import { describe, expect, it } from "vitest";
import riss from "./__fixtures__/rozpis-dph/riss-0-a-23.json";
import registracia from "./__fixtures__/rozpis-dph/registracny-poplatok-mimo-dph.json";
import { OCAKAVANY_REGISTRACIA, OCAKAVANY_RISS } from "./__fixtures__/rozpis-dph/vystupy";
import { kontrolaUlozenehoBlocku, rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { kontrolaRozpisuUdajov, prijataZUdajov, udajeZAi } from "./nespracovane";

const ai = riss as unknown as Record<string, unknown>;
const ai2 = registracia as unknown as Record<string, unknown>;

describe("rozpis DPH z vyťaženia — príklad RISS Plus (0 % + 23 %)", () => {
  it("z položiek so sumou bez DPH vznikne 0 % 26,90 a 23 % 116,87 / 26,88, nie 19 %", () => {
    const v = rozpisZVytazenia(ai, { krajina: "SK" });
    expect(v.zdroj).toBe("polozky");
    expect(v.kontrola).toEqual({ ok: true, chyby: [] });
    expect(v.rozpis).toEqual(OCAKAVANY_RISS);
    expect(v.rozpis.some((r) => r.sadzba === 19)).toBe(false);
  });

  it("tabuľka rozpisu z dokladu má prednosť pred položkami", () => {
    const v = rozpisZVytazenia(
      {
        ...ai,
        items: [],
        vat_breakdown: [
          { rate: 23, base: 116.87, vat: 26.88, vat_category: "standard" },
          { rate: 0, base: 26.9, vat: 0, vat_category: "reverse_charge" },
          { rate: 5, base: 0, vat: 0 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.zdroj).toBe("doklad");
    expect(v.rozpis).toEqual(OCAKAVANY_RISS);
  });

  it("zlá tabuľka od AI (všetko v 19 %) sa nepoužije, keď položky sedia", () => {
    const v = rozpisZVytazenia(
      { ...ai, vat_breakdown: [{ rate: 19, base: 143.77, vat: 26.88 }] },
      { krajina: "SK" },
    );
    expect(v.zdroj).toBe("polozky");
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis.map((r) => r.sadzba)).toEqual([0, 23]);
  });

  it("len sumy bez položiek a tabuľky: sadzba sa nedopočíta → na kontrolu", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK1",
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
        delivery_date: "2026-10-29",
      },
      { krajina: "SK" },
    );
    expect(v.zdroj).toBe("sumy");
    expect(v.rozpis).toEqual([
      // DPH bez sadzby sa do riadku 0 % nedá (revízia 13. 11.) — ostáva v sumách dokladu.
      { sadzba: 0, zaklad: 143.77, dph: 0, vat_category: "needs_review" },
    ]);
    expect(v.kontrola.ok).toBe(false);
    expect(v.kontrola.chyby.map((c) => c.kod)).toContain("neplatna_kategoria");
  });

  it("len sumy, ktoré pri jednej povolenej sadzbe naozaj sedia, prejdú", () => {
    const v = rozpisZVytazenia(
      { amount_without_vat: 100, vat_amount: 23, amount_total: 123 },
      { krajina: "SK" },
    );
    expect(v.rozpis).toEqual([{ sadzba: 23, zaklad: 100, dph: 23, vat_category: "standard" }]);
    expect(v.kontrola.ok).toBe(true);
    // 19 % len vtedy, keď ho doklad naozaj má.
    expect(
      rozpisZVytazenia(
        { amount_without_vat: 100, vat_amount: 19, amount_total: 119 },
        { krajina: "SK" },
      ).rozpis,
    ).toEqual([{ sadzba: 19, zaklad: 100, dph: 19, vat_category: "standard" }]);
  });

  it("položky so sumou s DPH (brutto) sa rozpoznajú tiež", () => {
    const v = rozpisZVytazenia(
      {
        amount_without_vat: 120,
        vat_amount: 24,
        amount_total: 144,
        items: [
          { name: "A", vat_rate: 23, total: 123 },
          { name: "B", vat_rate: 5, total: 21 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.rozpis).toEqual([
      { sadzba: 5, zaklad: 20, dph: 1, vat_category: "standard" },
      { sadzba: 23, zaklad: 100, dph: 23, vat_category: "standard" },
    ]);
  });

  it("česká firma — sadzby 21/12 sú platné", () => {
    const v = rozpisZVytazenia(
      {
        amount_without_vat: 300,
        vat_amount: 45,
        amount_total: 345,
        vat_breakdown: [
          { rate: 21, base: 100, vat: 21 },
          { rate: 12, base: 200, vat: 24 },
        ],
        delivery_date: "2026-10-01",
      },
      { krajina: "CZ" },
    );
    expect(v.kontrola.ok).toBe(true);
    expect(v.rozpis.map((r) => r.sadzba)).toEqual([12, 21]);
  });

  it("0 % + text o prenesení → prenesenie celej faktúry", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK1",
        amount_without_vat: 500,
        vat_amount: 0,
        amount_total: 500,
        reverse_charge_text: "Prenesenie daňovej povinnosti podľa § 69 ods. 12",
      },
      { krajina: "SK" },
    );
    expect(v.rozpis).toEqual([{ sadzba: 0, zaklad: 500, dph: 0, vat_category: "reverse_charge" }]);
    expect(v.prenesenie).toBe(true);
    expect(v.kontrola.ok).toBe(true);
    // Zmiešaná faktúra (0 % + 23 %) nie je prenesená celá.
    expect(rozpisZVytazenia(ai, { krajina: "SK" }).prenesenie).toBe(false);
  });

  it("0 % bez dôvodu od platiteľa DPH → na kontrolu", () => {
    const v = rozpisZVytazenia(
      { supplier_ic_dph: "SK1", amount_without_vat: 500, vat_amount: 0, amount_total: 500 },
      { krajina: "SK" },
    );
    expect(v.rozpis[0]!.vat_category).toBe("needs_review");
    expect(v.kontrola.ok).toBe(false);
  });
});

describe("rozpis DPH — doklad č. 2 (registračný poplatok mimo DPH + 23 %)", () => {
  it("stĺpcová rekapitulácia dá 23 % 24,39 / 5,61 a „nie je predmetom DPH“ 360,00", () => {
    const v = rozpisZVytazenia(ai2, { krajina: "SK" });
    expect(v.zdroj).toBe("doklad");
    expect(v.kontrola).toEqual({ ok: true, chyby: [] });
    expect(v.rozpis).toEqual(OCAKAVANY_REGISTRACIA);
  });

  it("stĺpec „Celkom“ nie je riadok sadzby", () => {
    const v = rozpisZVytazenia(
      {
        ...ai2,
        items: [],
        vat_breakdown: [
          ...(ai2.vat_breakdown as any[]),
          { label: "Celkom", rate: 0, base: 384.39, vat: 5.61 },
        ],
      },
      { krajina: "SK" },
    );
    expect(v.rozpis).toEqual(OCAKAVANY_REGISTRACIA);
  });

  it("bez tabuľky z položiek s kategóriou — rovnaký výsledok", () => {
    const v = rozpisZVytazenia({ ...ai2, vat_breakdown: undefined }, { krajina: "SK" });
    expect(v.zdroj).toBe("polozky");
    expect(v.rozpis).toEqual(OCAKAVANY_REGISTRACIA);
  });

  it("chybná extrakcia „1,46 %“ zo súm sa nikdy neuloží ako platná sadzba", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK1",
        amount_without_vat: 384.39,
        vat_amount: 5.61,
        amount_total: 390,
        delivery_date: "2026-10-20",
      },
      { krajina: "SK" },
    );
    expect(v.rozpis.some((r) => r.sadzba === 1.46)).toBe(false);
    expect(v.rozpis[0]!.vat_category).toBe("needs_review");
    expect(v.kontrola.ok).toBe(false);
  });

  it("tabuľka od AI so sadzbou 1,46 % neprejde kontrolou (neplatná sadzba)", () => {
    const v = rozpisZVytazenia(
      {
        supplier_ic_dph: "SK1",
        amount_without_vat: 384.39,
        vat_amount: 5.61,
        amount_total: 390,
        delivery_date: "2026-10-20",
        vat_breakdown: [{ rate: 1.46, base: 384.39, vat: 5.61 }],
      },
      { krajina: "SK" },
    );
    expect(v.kontrola.ok).toBe(false);
    expect(v.kontrola.chyby.map((c) => c.kod)).toContain("neplatna_sadzba");
    // Nespracovaný doklad dostane dôvod „na kontrolu“.
    const u = udajeZAi(
      { ...ai2, items: [], vat_breakdown: [{ rate: 1.46, base: 384.39, vat: 5.61 }] },
      "2026-11-05",
      { krajina: "SK" },
    );
    expect(u.kontrolaDph?.dovod).toMatch(/1,46 % nie je povolená/);
  });
});

describe("nespracovaný doklad z príkladu", () => {
  it("formulár dostane 0 % + 23 % a nič na kontrolu", () => {
    const u = udajeZAi(ai, "2026-11-05", { krajina: "SK" });
    expect(u.rozpis).toEqual(OCAKAVANY_RISS);
    expect(u.kontrolaDph).toBeUndefined();
    expect(kontrolaRozpisuUdajov(u, "SK").ok).toBe(true);
  });

  it("nesediaci rozpis sa označí na kontrolu s dôvodom a sumami dokladu", () => {
    const u = udajeZAi(
      {
        supplier_name: "X",
        supplier_ic_dph: "SK1",
        amount_without_vat: 143.77,
        vat_amount: 26.88,
        amount_total: 170.65,
      },
      "2026-11-05",
      { krajina: "SK" },
    );
    expect(u.kontrolaDph).toMatchObject({ bezDph: 143.77, dph: 26.88 });
    expect(u.kontrolaDph?.dovod).toMatch(/Rozpis DPH nesedí/);
    expect(kontrolaRozpisuUdajov(u, "SK").ok).toBe(false);
    // Človek rozpis opraví podľa dokladu → kontrola prejde.
    expect(kontrolaRozpisuUdajov({ ...u, rozpis: [...OCAKAVANY_RISS] }, "SK").ok).toBe(true);
    // „Rozpis je správny“ — vedomé potvrdenie človekom.
    expect(kontrolaRozpisuUdajov({ ...u, rozpisPotvrdeny: true }, "SK").ok).toBe(true);
  });

  it("prijatá faktúra si rozpis odnesie vo vat_breakdown aj s kategóriou (dobropis záporne)", () => {
    const u = udajeZAi(ai2, "2026-11-05", { krajina: "SK" });
    expect(prijataZUdajov("faktura", u, "2026-11-05").vat_breakdown).toEqual(OCAKAVANY_REGISTRACIA);
    expect(prijataZUdajov("dobropis", u, "2026-11-05").vat_breakdown).toEqual([
      { sadzba: 0, zaklad: -360, dph: 0, vat_category: "out_of_scope" },
      { sadzba: 23, zaklad: -24.39, dph: -5.61, vat_category: "standard" },
    ]);
  });
});

describe("kontrola uloženého bločku", () => {
  it("rozpis aj jediná sadzba hlavičky", () => {
    expect(
      kontrolaUlozenehoBlocku({
        supplier_ic_dph: "SK1",
        net_amount: 384.39,
        vat_amount: 5.61,
        vat_breakdown: [...OCAKAVANY_REGISTRACIA],
        issue_date: "2026-10-20",
      }).ok,
    ).toBe(true);
    // Uložený rozpis bez kategórie s 0 % (stav pred migráciou) → na kontrolu.
    expect(
      kontrolaUlozenehoBlocku({
        supplier_ic_dph: "SK1",
        net_amount: 384.39,
        vat_amount: 5.61,
        vat_breakdown: [
          { sadzba: 0, zaklad: 360, dph: 0 },
          { sadzba: 23, zaklad: 24.39, dph: 5.61 },
        ],
        issue_date: "2026-10-20",
      }).ok,
    ).toBe(false);
    expect(
      kontrolaUlozenehoBlocku({
        net_amount: 143.77,
        vat_amount: 26.88,
        vat_rate: 19,
        issue_date: "2026-10-29",
      }).ok,
    ).toBe(false);
    // Len suma spolu — nie je čo kontrolovať; neplatiteľ bez dane tiež nie.
    expect(kontrolaUlozenehoBlocku({ net_amount: null, vat_amount: null, vat_rate: 23 }).ok).toBe(
      true,
    );
    expect(
      kontrolaUlozenehoBlocku({
        net_amount: 10,
        vat_amount: 0,
        vat_breakdown: [{ sadzba: 0, zaklad: 10, dph: 0 }],
      }).ok,
    ).toBe(true);
  });
});

describe("ručná úprava rozpisu v Nespracovaných", async () => {
  const { rozpisUpravenyClovekom } = await import("./nespracovane");
  it("rozpis ako z vyťaženia nie je ručná úprava, opravený áno", () => {
    const u = udajeZAi(ai, "2026-11-05", { krajina: "SK" });
    expect(rozpisUpravenyClovekom(u, ai, "2026-11-05", "SK")).toBe(false);
    expect(
      rozpisUpravenyClovekom(
        { rozpis: [{ sadzba: 23, zaklad: 143.77, dph: 33.07 }] },
        ai,
        "2026-11-05",
        "SK",
      ),
    ).toBe(true);
  });
});
