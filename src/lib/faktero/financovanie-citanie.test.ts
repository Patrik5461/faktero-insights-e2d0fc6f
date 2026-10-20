import { describe, it, expect } from "vitest";
import {
  jePouzitelna,
  normalizujOdpoved,
  normalizujSplatky,
  rozpoznajIndex,
  spojPrecitane,
  vyhradyKuKalendaru,
} from "./financovanie-citanie";

/**
 * Zmluva je záväzný dokument, model nie je spoľahlivý zdroj. Tieto testy
 * strážia hranicu medzi tým, čo sa smie prevziať, a tým, čo sa musí ukázať
 * človeku ako výhrada.
 */

describe("normalizujSplatky", () => {
  it("zoradí riadky podľa splatnosti a prečísluje ich od jednotky", () => {
    const r = normalizujSplatky([
      { number: 3, due_date: "2026-08-19", amount: 100 },
      { number: 1, due_date: "2026-06-19", amount: 100 },
      { number: 2, due_date: "2026-07-19", amount: 100 },
    ]);
    expect(r.map((x) => x.number)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.due_date)).toEqual(["2026-06-19", "2026-07-19", "2026-08-19"]);
  });

  it("prečíta sumy zapísané po slovensky", () => {
    const r = normalizujSplatky([
      { number: 1, due_date: "2026-06-19", amount: "1 234,56", principal_part: "1 000,00" },
    ]);
    expect(r[0].amount).toBe(1234.56);
    expect(r[0].principal_part).toBe(1000);
  });

  it("zahodí riadky bez dátumu alebo bez sumy", () => {
    // Hlavička tabuľky a súčtový riadok chodia z modelu ako obyčajné riadky.
    const r = normalizujSplatky([
      { number: 1, due_date: "Splatnosť", amount: "Suma" },
      { number: 2, due_date: "2026-06-19", amount: 100 },
      { number: 3, due_date: "2026-07-19", amount: 0 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].due_date).toBe("2026-06-19");
  });

  it("nedopĺňa chýbajúci rozpad — dá nulu, nie odhad", () => {
    const r = normalizujSplatky([{ number: 1, due_date: "2026-06-19", amount: 100 }]);
    expect(r[0].principal_part).toBe(0);
    expect(r[0].interest_part).toBe(0);
    expect(r[0].remaining_principal).toBe(0);
  });

  it("z nezmyslu urobí prázdny kalendár, nie výnimku", () => {
    expect(normalizujSplatky(null)).toEqual([]);
    expect(normalizujSplatky("nie je pole")).toEqual([]);
  });
});

describe("vyhradyKuKalendaru", () => {
  const riadok = (n: number, istina: number) => ({
    number: n,
    due_date: `2026-0${n}-19`,
    amount: istina + 10,
    principal_part: istina,
    interest_part: 10,
    vat_amount: 0,
    remaining_principal: 0,
  });

  it("mlčí, keď súčet istín sedí s financovanou sumou", () => {
    const v = vyhradyKuKalendaru({
      principal: 300,
      splatky: [riadok(1, 100), riadok(2, 100), riadok(3, 100)],
      term_months: 3,
    });
    expect(v).toEqual([]);
  });

  it("ozve sa, keď sa súčet istín rozchádza s financovanou sumou", () => {
    const v = vyhradyKuKalendaru({
      principal: 5000,
      splatky: [riadok(1, 100), riadok(2, 100)],
      term_months: 2,
    });
    expect(v.join(" ")).toMatch(/Súčet istín/);
  });

  it("ozve sa, keď počet riadkov nesedí s počtom splátok zo zmluvy", () => {
    const v = vyhradyKuKalendaru({
      principal: 200,
      splatky: [riadok(1, 100), riadok(2, 100)],
      term_months: 36,
    });
    expect(v.join(" ")).toMatch(/36 splátkach/);
  });

  it("povie, že kalendár nemá rozpad na istinu a úrok", () => {
    const v = vyhradyKuKalendaru({
      principal: null,
      splatky: [
        {
          number: 1,
          due_date: "2026-06-19",
          amount: 100,
          principal_part: 0,
          interest_part: 0,
          vat_amount: 0,
          remaining_principal: 0,
        },
      ],
      term_months: 1,
    });
    expect(v.join(" ")).toMatch(/rozpad/);
  });

  it("povie, keď kalendár v dokumente vôbec nebol", () => {
    const v = vyhradyKuKalendaru({ principal: 1000, splatky: [], term_months: 12 });
    expect(v.join(" ")).toMatch(/nenašiel splátkový kalendár/);
  });
});

describe("normalizujOdpoved", () => {
  it("počet splátok a prvú splatnosť berie z kalendára, nie z vety v zmluve", () => {
    const z = normalizujOdpoved({
      kind: "leasing",
      term_months: 36,
      first_due_date: "2030-01-01",
      principal: 300,
      splatky: [
        { number: 1, due_date: "2026-06-19", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 2, due_date: "2026-07-19", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 3, due_date: "2026-08-19", amount: 110, principal_part: 100, interest_part: 10 },
      ],
    });
    expect(z.term_months).toBe(3);
    expect(z.first_due_date).toBe("2026-06-19");
    // Rozpor so zmluvou sa nezamlčí.
    expect(z.vyhrady.join(" ")).toMatch(/36 splátkach/);
  });

  it("chýbajúcu prvú splatnosť povie, namiesto aby dosadila dnešok", () => {
    // Spätne zapísaná zmluva bez čitateľného dátumu: dosadený dnešok by posunul
    // celý kalendár o roky a vyzeral by ako údaj zo zmluvy.
    const z = normalizujOdpoved({ kind: "uver", principal: 1000, splatky: [] });
    expect(z.first_due_date).toBeNull();
    expect(z.vyhrady.join(" ")).toMatch(/Splatnosť prvej splátky/);
  });

  it("keď je kalendár prečítaný, o prvú splatnosť sa nesťažuje", () => {
    const z = normalizujOdpoved({
      kind: "uver",
      principal: 200,
      splatky: [
        { number: 1, due_date: "2025-02-20", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 2, due_date: "2025-03-20", amount: 110, principal_part: 100, interest_part: 10 },
      ],
    });
    expect(z.first_due_date).toBe("2025-02-20");
    expect(z.vyhrady.join(" ")).not.toMatch(/Splatnosť prvej splátky/);
  });

  it("neznámy druh nechá na človeku a nehádže leasing naslepo", () => {
    const z = normalizujOdpoved({ kind: "nieco ine", principal: 1000, splatky: [] });
    expect(z.kind).toBeNull();
  });

  it("prázdna odpoveď nie je použiteľná", () => {
    expect(jePouzitelna(normalizujOdpoved({}))).toBe(false);
    expect(jePouzitelna(normalizujOdpoved({ principal: 1000 }))).toBe(true);
  });
});

describe("zle prečítaný dátum", () => {
  // Riadky sa zoraďujú podľa splatnosti, takže riadok so zle prečítaným rokom
  // sa ticho presunie inam. Kalendár potom vyzerá spojito a chyba sa objaví až
  // pri párovaní platby o rok neskôr.
  it("dvakrát ten istý deň v kalendári povie", () => {
    const v = vyhradyKuKalendaru({
      principal: 300,
      term_months: null,
      splatky: normalizujSplatky([
        { number: 1, due_date: "2025-01-09", amount: 100, principal_part: 100 },
        { number: 2, due_date: "2025-02-09", amount: 100, principal_part: 100 },
        { number: 3, due_date: "2025-02-09", amount: 100, principal_part: 100 },
      ]),
    });
    expect(v.join(" ")).toMatch(/rovnakú splatnosť/);
  });

  it("dieru po presunutom riadku povie", () => {
    const v = vyhradyKuKalendaru({
      principal: 300,
      term_months: null,
      splatky: normalizujSplatky([
        { number: 1, due_date: "2025-01-09", amount: 100, principal_part: 100 },
        { number: 2, due_date: "2025-02-09", amount: 100, principal_part: 100 },
        { number: 3, due_date: "2025-06-09", amount: 100, principal_part: 100 },
      ]),
    });
    expect(v.join(" ")).toMatch(/odstup/);
  });

  it("pravidelný mesačný kalendár nekomentuje", () => {
    const v = vyhradyKuKalendaru({
      principal: 300,
      term_months: null,
      splatky: normalizujSplatky([
        // Február je krátky a január dlhý — odstup kolíše, a to je v poriadku.
        { number: 1, due_date: "2025-01-31", amount: 100, principal_part: 100 },
        { number: 2, due_date: "2025-02-28", amount: 100, principal_part: 100 },
        { number: 3, due_date: "2025-03-31", amount: 100, principal_part: 100 },
      ]),
    });
    expect(v.filter((x) => /odstup|rovnakú splatnosť/.test(x))).toEqual([]);
  });
});

describe("spojPrecitane", () => {
  // Banka posiela zmluvu a splátkový kalendár ako dve samostatné PDF: v zmluve
  // je úrok a akontácia, v kalendári riadky. Ani jedno samo nestačí.
  const zoZmluvy = normalizujOdpoved({
    kind: "uver",
    provider_name: "ČSOB Leasing, a.s.",
    contract_number: "UZF/24/81047",
    principal: 23500,
    interest_rate: 6.95,
    term_months: 72,
    down_payment: 7000,
    splatky: [],
  });
  const zKalendara = normalizujOdpoved({
    variable_symbol: "2481047",
    interest_from: "2024-12-10",
    splatky: [
      { number: 1, due_date: "2025-01-09", amount: 399.99, principal_part: 265.82 },
      { number: 2, due_date: "2025-02-09", amount: 399.99, principal_part: 262.91 },
    ],
  });

  it("vezme riadky z kalendára a hlavičku zo zmluvy", () => {
    const z = spojPrecitane([zoZmluvy, zKalendara]);
    expect(z.splatky.length).toBe(2);
    expect(z.interest_rate).toBe(6.95);
    expect(z.down_payment).toBe(7000);
    expect(z.variable_symbol).toBe("2481047");
    expect(z.interest_from).toBe("2024-12-10");
    expect(z.first_due_date).toBe("2025-01-09");
  });

  it("na poradí nahratia nezáleží", () => {
    const a = spojPrecitane([zoZmluvy, zKalendara]);
    const b = spojPrecitane([zKalendara, zoZmluvy]);
    expect(b.splatky).toEqual(a.splatky);
    expect(b.interest_rate).toBe(a.interest_rate);
    expect(b.principal).toBe(a.principal);
  });

  it("výhrady o chýbajúcom kalendári zo zmluvy zmiznú, keď kalendár dorazil druhým súborom", () => {
    expect(zoZmluvy.vyhrady.join(" ")).toMatch(/nenašiel sa|nenašiel/i);
    const z = spojPrecitane([zoZmluvy, zKalendara]);
    expect(z.vyhrady.join(" ")).not.toMatch(/nenašiel/);
    expect(z.vyhrady.join(" ")).not.toMatch(/Splatnosť prvej splátky/);
  });

  it("jediný dokument prejde nezmenený", () => {
    expect(spojPrecitane([zKalendara])).toBe(zKalendara);
  });
});

describe("kontokorent", () => {
  // Kontokorent je úver tiež — model ho rád vráti ako "uver". Rozhoduje to,
  // že nemá splátkový kalendár a má úverový rámec k bežnému účtu.
  const kontokorent = {
    kind: "kontokorent",
    product_name: "Kontokorentný úver",
    provider_name: "Slovenská sporiteľňa, a.s.",
    contract_number: "KTK/2026/0042",
    credit_limit: "20 000,00",
    interest_rate: 7.5,
    limit_fee: 100,
    limit_fee_period: "ročne",
    valid_until: "2027-09-30",
    interest_period: "mesačne",
    account_iban: "SK31 1200 0000 1987 4263 7541",
    splatky: [],
  };

  it("vyčíta limit, sadzbu, poplatok, platnosť a účet", () => {
    const z = normalizujOdpoved(kontokorent);
    expect(z.kind).toBe("kontokorent");
    expect(z.credit_limit).toBe(20000);
    expect(z.interest_rate).toBe(7.5);
    expect(z.limit_fee_yearly).toBe(100);
    expect(z.valid_until).toBe("2027-09-30");
    expect(z.interest_period).toBe("mesacne");
    expect(z.account_iban).toBe("SK3112000000198742637541");
    expect(z.vyhrady).toEqual([]);
  });

  it("nemá kalendár ani istinu — ani keď model nejaké riadky pošle", () => {
    const z = normalizujOdpoved({
      ...kontokorent,
      principal: 20000,
      term_months: 12,
      first_due_date: "2026-10-31",
      splatky: [{ number: 1, due_date: "2026-10-31", amount: 125 }],
    });
    expect(z.kind).toBe("kontokorent");
    expect(z.splatky).toEqual([]);
    expect(z.principal).toBeNull();
    expect(z.term_months).toBeNull();
    expect(z.first_due_date).toBeNull();
    expect(z.vyhrady.join(" ")).not.toMatch(/Splatnosť prvej splátky|splátkový kalendár/);
  });

  it.each([
    ["uver", "Kontokorentný úver k podnikateľskému účtu"],
    ["uver", "Povolené prečerpanie bežného účtu"],
    ["uver", "Kontokorentní úvěr"],
    [null, "Revolvingový úver k bežnému účtu"],
    ["uver", "Úverový rámec k bežnému účtu"],
  ])("druh %s s produktom „%s“ je kontokorent", (kind, product_name) => {
    const z = normalizujOdpoved({ kind, product_name, credit_limit: 5000 });
    expect(z.kind).toBe("kontokorent");
  });

  it("úver bez kalendára s rámcom je kontokorent, aj keď ho model nazve úverom", () => {
    const z = normalizujOdpoved({
      kind: "uver",
      credit_limit: 15000,
      account_iban: "SK2075000000004034449488",
      interest_rate: 6,
      splatky: [],
    });
    expect(z.kind).toBe("kontokorent");
    expect(z.credit_limit).toBe(15000);
  });

  it("úver so splátkovým kalendárom ostáva úverom", () => {
    const z = normalizujOdpoved({
      kind: "uver",
      product_name: "Podnikateľský úver",
      principal: 200,
      splatky: [
        { number: 1, due_date: "2025-02-20", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 2, due_date: "2025-03-20", amount: 110, principal_part: 100, interest_part: 10 },
      ],
    });
    expect(z.kind).toBe("uver");
    expect(z.splatky).toHaveLength(2);
    expect(z.credit_limit).toBeNull();
  });

  it("úver s počtom splátok, ale bez rámca, ostáva úverom", () => {
    const z = normalizujOdpoved({ kind: "uver", principal: 23500, term_months: 72, splatky: [] });
    expect(z.kind).toBe("uver");
  });

  it("leasing sa na kontokorent neprepíše ani s rámcom", () => {
    const z = normalizujOdpoved({ kind: "leasing", principal: 30000, credit_limit: 30000 });
    expect(z.kind).toBe("leasing");
  });

  it("pohyblivú sadzbu so známym indexom uloží do polí zmluvy, nie do poznámky", () => {
    const z = normalizujOdpoved({
      ...kontokorent,
      interest_rate: null,
      reference_rate_name: "EURIBOR 1-mesačný",
      interest_margin: 4.3,
      fixing_rule: "vždy dva pracovné dni pred začiatkom príslušného obdobia fixácie",
      fixing_offset_days: 2,
      rate_reset_period: "mesacne",
      day_count: "ACT/360",
    });
    expect(z).toMatchObject({
      rate_type: "pohybliva",
      reference_index: "EURIBOR_1M",
      rate_margin: 4.3,
      index_floor: null,
      fixing_rule: "pred_zaciatkom_obdobia",
      fixing_offset_days: 2,
      rate_reset: "mesacne",
      day_count: "ACT/360",
      note: null,
    });
    // Výslednú sadzbu dopočíta Faktero z ECB — nechýba, a len marža to nie je.
    expect(z.interest_rate).toBeNull();
    expect(z.vyhrady.join(" ")).not.toMatch(/sadzba/i);
  });

  it("so známou hodnotou referenčnej ju na náhľad sčíta s maržou, floor aj frekvenciu podľa indexu", () => {
    const z = normalizujOdpoved({
      ...kontokorent,
      interest_rate: null,
      reference_rate_name: "3M EURIBOR",
      reference_rate_value: 2.05,
      interest_margin: 2.5,
      index_floor: 0,
    });
    expect(z.interest_rate).toBe(4.55);
    expect(z).toMatchObject({
      reference_index: "EURIBOR_3M",
      rate_reset: "stvrtrocne",
      index_floor: 0,
    });
  });

  it("rozpozná indexy podľa rôznych pomenovaní", () => {
    expect(rozpoznajIndex("1M EURIBOR")).toBe("EURIBOR_1M");
    expect(rozpoznajIndex("EURIBOR 6-mesačný")).toBe("EURIBOR_6M");
    expect(rozpoznajIndex("12M EURIBOR")).toBe("EURIBOR_12M");
    expect(rozpoznajIndex("3M PRIBOR")).toBe("PRIBOR_3M");
    expect(rozpoznajIndex("PRIBOR 1R")).toBe("PRIBOR_1R");
    expect(rozpoznajIndex("€STR")).toBe("ESTR");
    expect(rozpoznajIndex("EURIBOR")).toBeNull();
    expect(rozpoznajIndex("základná sadzba banky")).toBeNull();
  });

  it("nerozpoznaný index — sadzba postaru: marža s výhradou a popis v poznámke", () => {
    const z = normalizujOdpoved({
      ...kontokorent,
      interest_rate: null,
      reference_rate_name: "Referenčná sadzba banky",
      interest_margin: 3,
    });
    expect(z.rate_type).toBe("pevna");
    expect(z.interest_rate).toBe(3);
    expect(z.note).toMatch(/Referenčná sadzba banky \+ marža 3 %/);
    expect(z.vyhrady.join(" ")).toMatch(/len marža 3 %/);
  });

  it("pohyblivú sadzbu spozná aj pri úvere a spojenie dokumentov ju nestratí", () => {
    const uver = normalizujOdpoved({
      kind: "uver",
      principal: 50000,
      term_months: 60,
      first_due_date: "2026-11-20",
      reference_rate_name: "3M EURIBOR",
      interest_margin: 2,
      day_count: "rok s 360 dňami",
    });
    expect(uver).toMatchObject({
      rate_type: "pohybliva",
      reference_index: "EURIBOR_3M",
      day_count: "ACT/360",
    });
    const kalendar = normalizujOdpoved({ kind: "uver", principal: 50000, splatky: [] });
    const z = spojPrecitane([kalendar, uver]);
    expect(z).toMatchObject({
      rate_type: "pohybliva",
      reference_index: "EURIBOR_3M",
      rate_margin: 2,
    });
  });

  it("mesačný poplatok prepočíta na rok, percento z limitu tiež", () => {
    expect(
      normalizujOdpoved({ ...kontokorent, limit_fee: 10, limit_fee_period: "mesačne" })
        .limit_fee_yearly,
    ).toBe(120);
    expect(
      normalizujOdpoved({ ...kontokorent, limit_fee: null, limit_fee_percent: 0.5 })
        .limit_fee_yearly,
    ).toBe(100);
  });

  it("povie, čo chýba — limit a účet", () => {
    const z = normalizujOdpoved({ kind: "kontokorent", interest_rate: 8 });
    expect(z.vyhrady.join(" ")).toMatch(/Úverový rámec/);
    expect(z.vyhrady.join(" ")).toMatch(/Číslo účtu/);
    expect(jePouzitelna(z)).toBe(false);
    expect(jePouzitelna(normalizujOdpoved({ kind: "kontokorent", credit_limit: 1000 }))).toBe(true);
  });

  it("zmluva o kontokorente a sadzobník sa spoja bez kalendára", () => {
    const zmluva = normalizujOdpoved({ ...kontokorent, account_iban: null, interest_rate: null });
    const sadzobnik = normalizujOdpoved({
      kind: "uver",
      interest_rate: 7.5,
      account_iban: "SK3112000000198742637541",
      splatky: [],
    });
    const z = spojPrecitane([sadzobnik, zmluva]);
    expect(z.kind).toBe("kontokorent");
    expect(z.splatky).toEqual([]);
    expect(z.credit_limit).toBe(20000);
    expect(z.interest_rate).toBe(7.5);
    expect(z.account_iban).toBe("SK3112000000198742637541");
    expect(z.vyhrady).toEqual([]);
  });
});
