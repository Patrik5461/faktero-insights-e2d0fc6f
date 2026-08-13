import { describe, it, expect } from "vitest";
import {
  akcieNaProdukt,
  akciaPlati,
  cenaPodlaMnozstva,
  cenaPreOdberatela,
  cenaZAkcie,
  cenaZPodkladov,
  poZlave,
  uspora,
  zlavaVRozsahu,
  type Podklady,
} from "./ceny";

const ODB = "odb-1";
const SKUP = "sk-1";

describe("zlavaVRozsahu", () => {
  it("prázdne a nezmyselné hodnoty sú nula", () => {
    expect(zlavaVRozsahu(null)).toBe(0);
    expect(zlavaVRozsahu(undefined)).toBe(0);
    expect(zlavaVRozsahu("")).toBe(0);
    expect(zlavaVRozsahu("abc")).toBe(0);
  });

  // Záporná zľava by cenu zdvihla, zľava nad 100 by ju poslala pod nulu.
  it("orezáva sa na 0 až 100", () => {
    expect(zlavaVRozsahu(-20)).toBe(0);
    expect(zlavaVRozsahu(140)).toBe(100);
    expect(zlavaVRozsahu(100)).toBe(100);
  });

  it("percentá ako reťazec z PostgREST", () => {
    expect(zlavaVRozsahu("12.5")).toBe(12.5);
  });
});

describe("poZlave", () => {
  it("počíta a zaokrúhľuje na centy", () => {
    expect(poZlave(100, 15)).toBe(85);
    expect(poZlave(9.99, 15)).toBe(8.49);
    expect(poZlave(10, 33.33)).toBe(6.67);
  });

  it("stopercentná zľava dá nulu, nie záporné číslo", () => {
    expect(poZlave(50, 100)).toBe(0);
  });

  // 1.005 sa v pohyblivej desatinnej čiarke ukladá tesne pod, takže naivné
  // Math.round(x * 100) / 100 dá 1,00 namiesto 1,01.
  it("polovičný cent sa zaokrúhli nahor", () => {
    expect(poZlave(2.01, 50)).toBe(1.01);
  });
});

describe("akciaPlati", () => {
  const a = { valid_from: "2026-08-01", valid_to: "2026-08-31" };

  it("obe hranice sú vrátane", () => {
    expect(akciaPlati(a, "2026-08-01")).toBe(true);
    expect(akciaPlati(a, "2026-08-31")).toBe(true);
  });

  it("mimo obdobia neplatí", () => {
    expect(akciaPlati(a, "2026-07-31")).toBe(false);
    expect(akciaPlati(a, "2026-09-01")).toBe(false);
  });

  it("bez konca platí donekonečna", () => {
    expect(akciaPlati({ valid_from: "2026-01-01", valid_to: null }, "2030-05-05")).toBe(true);
  });

  it("vypnutá akcia neplatí ani v období", () => {
    expect(akciaPlati({ ...a, active: false }, "2026-08-10")).toBe(false);
  });

  it("bez dátumu dokladu sa akcia neuplatní", () => {
    expect(akciaPlati(a, "")).toBe(false);
  });
});

describe("cenaZAkcie", () => {
  it("pevná cena prebíja percentá", () => {
    expect(cenaZAkcie({ unit_price: 7.5, discount_percent: 50 }, 20)).toBe(7.5);
  });

  // Pevná cena nula je platná („1 € akcia" na 0 €), preto sa nesmie testovať
  // pravdivostnou hodnotou — 0 je falsy a cena by tíško vypadla na percentá.
  it("pevná cena nula je platná cena", () => {
    expect(cenaZAkcie({ unit_price: 0, discount_percent: 50 }, 20)).toBe(0);
  });

  it("bez ceny aj bez percent akcia cenu neurčuje", () => {
    expect(cenaZAkcie({ discount_percent: 0 }, 20)).toBeNull();
    expect(cenaZAkcie({}, 20)).toBeNull();
  });

  it("prázdny reťazec v pevnej cene sa berie ako nevyplnené", () => {
    expect(cenaZAkcie({ unit_price: "", discount_percent: 10 }, 20)).toBe(18);
  });
});

describe("cenaPodlaMnozstva", () => {
  const ceny = [
    { customer_id: ODB, unit_price: 10, min_quantity: 0 },
    { customer_id: ODB, unit_price: 9, min_quantity: 10 },
    { customer_id: ODB, unit_price: 8, min_quantity: 100 },
  ];

  it("vyberie najvyšší prah, ktorý množstvo dosiahne", () => {
    expect(cenaPodlaMnozstva(ceny, 1)?.unit_price).toBe(10);
    expect(cenaPodlaMnozstva(ceny, 9)?.unit_price).toBe(10);
    expect(cenaPodlaMnozstva(ceny, 10)?.unit_price).toBe(9);
    expect(cenaPodlaMnozstva(ceny, 250)?.unit_price).toBe(8);
  });

  it("keď ani najnižší prah nie je dosiahnutý, cena neplatí", () => {
    expect(cenaPodlaMnozstva([{ unit_price: 5, min_quantity: 50 }], 10)).toBeNull();
  });

  it("prázdny cenník nevráti nič", () => {
    expect(cenaPodlaMnozstva([], 5)).toBeNull();
  });
});

describe("cenaPreOdberatela", () => {
  it("bez čohokoľvek platí základná cena", () => {
    const r = cenaPreOdberatela({ zakladna: 12.4 });
    expect(r.cena).toBe(12.4);
    expect(r.zdroj).toBe("zakladna");
  });

  it("zľava odberateľa sa uplatní na základnú cenu", () => {
    const r = cenaPreOdberatela({ zakladna: 100, zlavaOdberatela: 10 });
    expect(r.cena).toBe(90);
    expect(r.zdroj).toBe("zlava-odberatel");
    expect(r.dovod).toBe("Zľava odberateľa 10 %");
  });

  // Zľavy sa nesčítavajú. 10 % a 5 % nie je 15 % ani 14,5 %.
  it("zľava odberateľa prebíja zľavu skupiny, nesčítavajú sa", () => {
    const r = cenaPreOdberatela({ zakladna: 100, zlavaOdberatela: 10, zlavaSkupiny: 5 });
    expect(r.cena).toBe(90);
  });

  it("bez vlastnej zľavy platí zľava skupiny", () => {
    const r = cenaPreOdberatela({ zakladna: 100, zlavaSkupiny: 5 });
    expect(r.cena).toBe(95);
    expect(r.zdroj).toBe("zlava-skupina");
  });

  it("individuálna cena prebíja cenu skupiny", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      price_group_id: SKUP,
      ceny: [
        { customer_id: ODB, unit_price: 70 },
        { price_group_id: SKUP, unit_price: 80 },
      ],
    });
    expect(r.cena).toBe(70);
    expect(r.zdroj).toBe("individualna");
  });

  // Toto je dôvod, prečo tu nevyhráva „najnižšia cena": stály odberateľ má
  // občas dohodnutú cenu vyššiu než pultovú a tá musí prejsť.
  it("dohodnutá cena platí aj keď je vyššia ako základná", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      ceny: [{ customer_id: ODB, unit_price: 130 }],
    });
    expect(r.cena).toBe(130);
    expect(uspora(r)).toBe(-30);
  });

  it("dohodnutá cena vypne percentuálnu zľavu", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      zlavaOdberatela: 20,
      ceny: [{ customer_id: ODB, unit_price: 90 }],
    });
    expect(r.cena).toBe(90);
  });

  it("cena iného odberateľa sa na tohto nevzťahuje", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      ceny: [{ customer_id: "iny", unit_price: 10 }],
    });
    expect(r.cena).toBe(100);
    expect(r.zdroj).toBe("zakladna");
  });

  it("cena cudzej skupiny sa nevzťahuje", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      price_group_id: SKUP,
      ceny: [{ price_group_id: "ina", unit_price: 10 }],
    });
    expect(r.cena).toBe(100);
  });

  it("množstevná cena sa vyberie podľa množstva na riadku", () => {
    const ceny = [
      { customer_id: ODB, unit_price: 10, min_quantity: 0 },
      { customer_id: ODB, unit_price: 8, min_quantity: 50 },
    ];
    expect(cenaPreOdberatela({ zakladna: 12, customer_id: ODB, ceny, mnozstvo: 5 }).cena).toBe(10);
    expect(cenaPreOdberatela({ zakladna: 12, customer_id: ODB, ceny, mnozstvo: 50 }).cena).toBe(8);
  });

  it("akcia sa uplatní, keď je výhodnejšia", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      datum: "2026-08-10",
      akcie: [
        {
          id: "a",
          name: "Jarný výpredaj",
          discount_percent: 30,
          valid_from: "2026-08-01",
          valid_to: "2026-08-31",
        },
      ],
    });
    expect(r.cena).toBe(70);
    expect(r.zdroj).toBe("akcia");
    expect(r.dovod).toBe("Akcia Jarný výpredaj −30 %");
    expect(r.akcia?.id).toBe("a");
  });

  // Akcia je marketing — nesmie zdvihnúť cenu, ktorú má odberateľ dohodnutú.
  it("akcia horšia než dohodnutá cena sa neuplatní", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      ceny: [{ customer_id: ODB, unit_price: 60 }],
      datum: "2026-08-10",
      akcie: [{ name: "Akcia", discount_percent: 20, valid_from: "2026-08-01" }],
    });
    expect(r.cena).toBe(60);
    expect(r.zdroj).toBe("individualna");
  });

  it("akcia lepšia než dohodnutá cena sa uplatní", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      customer_id: ODB,
      ceny: [{ customer_id: ODB, unit_price: 60 }],
      datum: "2026-08-10",
      akcie: [{ name: "Výpredaj", unit_price: 45, valid_from: "2026-08-01" }],
    });
    expect(r.cena).toBe(45);
    expect(r.zdroj).toBe("akcia");
  });

  it("z viacerých akcií vyhrá najvýhodnejšia", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      datum: "2026-08-10",
      akcie: [
        { name: "Malá", discount_percent: 10, valid_from: "2026-08-01" },
        { name: "Veľká", discount_percent: 40, valid_from: "2026-08-01" },
      ],
    });
    expect(r.cena).toBe(60);
    expect(r.dovod).toContain("Veľká");
  });

  it("akcia mimo obdobia dokladu neplatí", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      datum: "2026-09-05",
      akcie: [
        {
          name: "Augustová",
          discount_percent: 50,
          valid_from: "2026-08-01",
          valid_to: "2026-08-31",
        },
      ],
    });
    expect(r.cena).toBe(100);
  });

  // Faktúra vystavená spätne musí dostať cenu platnú v deň vystavenia,
  // nie tú, ktorá platí dnes.
  it("rozhoduje dátum dokladu, nie dnešok", () => {
    const akcie = [
      { name: "Júlová", discount_percent: 50, valid_from: "2026-07-01", valid_to: "2026-07-31" },
    ];
    expect(cenaPreOdberatela({ zakladna: 100, datum: "2026-07-15", akcie }).cena).toBe(50);
    expect(cenaPreOdberatela({ zakladna: 100, datum: "2026-08-15", akcie }).cena).toBe(100);
  });

  it("sumy ako reťazce sa počítajú ako čísla", () => {
    const r = cenaPreOdberatela({
      zakladna: "19.90",
      customer_id: ODB,
      ceny: [{ customer_id: ODB, unit_price: "17.50", min_quantity: "0" }],
    });
    expect(r.cena).toBe(17.5);
    expect(r.zakladna).toBe(19.9);
    expect(uspora(r)).toBe(2.4);
  });

  it("záporná základná cena sa nikdy nedostane do výsledku", () => {
    expect(cenaPreOdberatela({ zakladna: -5 }).cena).toBe(0);
  });

  it("bez odberateľa sa individuálne ceny neuplatnia", () => {
    const r = cenaPreOdberatela({
      zakladna: 100,
      ceny: [{ customer_id: ODB, unit_price: 50 }],
    });
    expect(r.cena).toBe(100);
  });
});

describe("akcieNaProdukt", () => {
  const p: Podklady = {
    datum: "2026-08-10",
    ceny: [],
    akcie: [
      {
        id: "vsetko",
        name: "Celý sortiment",
        discount_percent: 10,
        applies_to_all: true,
        produkty: [],
      },
      {
        id: "vybrane",
        name: "Vybrané kusy",
        discount_percent: 5,
        applies_to_all: false,
        produkty: [{ product_id: "p1", unit_price: 3 }],
      },
    ],
  };

  it("akcia na celý sortiment platí aj na produkt mimo zoznamu", () => {
    expect(akcieNaProdukt(p, "p9").map((a) => a.id)).toEqual(["vsetko"]);
  });

  it("akcia na vybrané kusy sa iných produktov netýka", () => {
    const naP1 = akcieNaProdukt(p, "p1");
    expect(naP1.map((a) => a.id).sort()).toEqual(["vsetko", "vybrane"]);
    expect(naP1.find((a) => a.id === "vybrane")?.unit_price).toBe(3);
  });

  // Akcia na celý sortiment nesmie prebrať akciovú cenu iného produktu.
  it("plošná akcia nemá pevnú cenu", () => {
    expect(akcieNaProdukt(p, "p1").find((a) => a.id === "vsetko")?.unit_price).toBeUndefined();
  });
});

describe("cenaZPodkladov", () => {
  const podklady: Podklady = {
    customer_id: "odb-1",
    price_group_id: "sk-1",
    zlavaOdberatela: null,
    zlavaSkupiny: 10,
    datum: "2026-08-10",
    ceny: [
      { product_id: "p1", customer_id: "odb-1", unit_price: 80, min_quantity: 0 },
      { product_id: "p1", customer_id: "odb-1", unit_price: 70, min_quantity: 100 },
      { product_id: "p2", price_group_id: "sk-1", unit_price: 45, min_quantity: 0 },
    ],
    akcie: [
      {
        id: "a1",
        name: "Letná",
        discount_percent: 0,
        applies_to_all: false,
        valid_from: "2026-08-01",
        valid_to: "2026-08-31",
        produkty: [{ product_id: "p3", unit_price: 1.5 }],
      },
    ],
  };

  it("dohodnutá cena podľa množstva na riadku", () => {
    expect(cenaZPodkladov(podklady, { id: "p1", unit_price: 100 }, 1).cena).toBe(80);
    expect(cenaZPodkladov(podklady, { id: "p1", unit_price: 100 }, 100).cena).toBe(70);
  });

  it("cena skupiny na inom produkte", () => {
    const r = cenaZPodkladov(podklady, { id: "p2", unit_price: 60 });
    expect(r.cena).toBe(45);
    expect(r.zdroj).toBe("skupina");
  });

  it("produkt bez dohodnutej ceny dostane zľavu skupiny", () => {
    const r = cenaZPodkladov(podklady, { id: "p9", unit_price: 200 });
    expect(r.cena).toBe(180);
    expect(r.zdroj).toBe("zlava-skupina");
  });

  it("akciová cena na konkrétnom produkte", () => {
    const r = cenaZPodkladov(podklady, { id: "p3", unit_price: 5 });
    expect(r.cena).toBe(1.5);
    expect(r.zdroj).toBe("akcia");
  });

  // Bez odberateľa nesmie prepadnúť cena dohodnutá pre niekoho iného.
  it("prázdne podklady vrátia základnú cenu", () => {
    const r = cenaZPodkladov(
      { datum: "2026-08-10", ceny: [], akcie: [] },
      { id: "p1", unit_price: 12 },
    );
    expect(r.cena).toBe(12);
    expect(r.zdroj).toBe("zakladna");
  });
});
