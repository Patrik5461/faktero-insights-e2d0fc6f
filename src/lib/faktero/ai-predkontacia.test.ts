import { describe, expect, it } from "vitest";
import {
  bezNepotvrdenehoAi,
  doplnNavrhDoUdajov,
  navykPola,
  nepotvrdeneAi,
  odtlacok,
  oznaceniaZUdajov,
  platnyZPamate,
  pokynAi,
  poliaPreAi,
  potrebujeAi,
  potvrdNavrhAi,
  povoleneKody,
  spracujOdpoved,
  vstupZBlocku,
  vstupZPrijatej,
  zahodNavrhAi,
  zlucNavrhy,
  type PovoleneKody,
} from "./ai-predkontacia";
import { blocekZUdajov, prazdneUdaje, prijataZUdajov } from "./nespracovane";
import { rozpisPrijatej } from "./prijate-do-pohody";

const KV = [
  { kod: "B2", nazov: "B.2" },
  { kod: "X", nazov: "Nezahŕňať" },
];
const KAT = [
  { kod: "software", nazov: "Softvér a telekomunikácie" },
  { kod: "palivo", nazov: "Nákup PHM" },
];

const povolene: PovoleneKody = {
  predkontacia: [
    { kod: "1Fp", popis: "Služby", agenda: "receivedInvoice", ucty: "518/321" },
    { kod: "2Fm", popis: "Materiál", agenda: "receivedInvoice", ucty: "501/321" },
  ],
  clenenie: [
    { kod: "PD", popis: "Tuzemské s odpočtom", agenda: "", ucty: null },
    { kod: "PN", popis: "Bez odpočtu", agenda: "", ucty: null },
  ],
  kv: KV,
  kategoria: KAT,
};

describe("poradie zdrojov: pravidlo > návyk > AI", () => {
  it("pravidlo prebije návyk aj AI, návyk prebije AI", () => {
    const z = zlucNavrhy({
      pravidlo: { predkontacia: "2Fm" },
      navyk: { predkontacia: "1Fp", clenenie: "PN" },
      ai: { predkontacia: "1Fp", clenenie: "PD", kategoria: "software" },
    });
    expect(z.predkontacia).toEqual({ hodnota: "2Fm", zdroj: "pravidlo" });
    expect(z.clenenie).toEqual({ hodnota: "PN", zdroj: "navyk" });
    expect(z.kategoria).toEqual({ hodnota: "software", zdroj: "ai" });
  });

  it("čo je na doklade, sa nenavrhuje vôbec; prázdny zdroj sa preskočí", () => {
    const z = zlucNavrhy({
      doklad: { predkontacia: "1Fp", clenenie: "" },
      pravidlo: { predkontacia: "2Fm", clenenie: "  " },
      ai: { clenenie: "PD" },
    });
    expect(z.predkontacia?.zdroj).toBe("doklad");
    expect(z.clenenie).toEqual({ hodnota: "PD", zdroj: "ai" });
  });

  it("AI sa volá, len keď predkontácia či členenie ostanú prázdne a firma má kódy", () => {
    expect(
      potrebujeAi(zlucNavrhy({ navyk: { predkontacia: "1Fp", clenenie: "PD" } }), povolene),
    ).toBe(false);
    expect(potrebujeAi(zlucNavrhy({ pravidlo: { predkontacia: "1Fp" } }), povolene)).toBe(true);
    const bezKodov = { ...povolene, predkontacia: [], clenenie: [] };
    expect(potrebujeAi(zlucNavrhy({}), bezKodov)).toBe(false);
    // Od modelu sa pýtajú len polia, ktoré nič nevyplnilo.
    expect(
      poliaPreAi(zlucNavrhy({ pravidlo: { predkontacia: "1Fp", kategoria: "palivo" } }), povolene),
    ).toEqual(["clenenie", "kv"]);
  });

  it("návyk berie ustálenú voľbu, inak aspoň poslednú neprázdnu", () => {
    expect(navykPola([{ h: "1Fp" }, { h: "2Fm" }], "1Fp")).toBe("1Fp");
    expect(navykPola([{ h: "1Fp" }, { h: "2Fm" }], null)).toBe("2Fm");
    expect(navykPola([{ h: "1Fp" }, { h: "" }], null)).toBeNull();
    expect(navykPola(null, null)).toBeNull();
  });
});

describe("povolené kódy", () => {
  const ciselnik = [
    { druh: "predkontacia", kod: "1Fp", popis: "Služby", agenda: "receivedInvoice" },
    { druh: "predkontacia", kod: "3Fv", popis: "Tržby", agenda: "issuedInvoice" },
    { druh: "predkontacia", kod: "4Fx", popis: "Stará", agenda: "receivedInvoice", aktivne: false },
    {
      druh: "predkontacia",
      kod: "5Fb",
      popis: "Len bločky",
      agenda: "receivedInvoice",
      druhy_dokladov: ["doklady"],
    },
    { druh: "clenenie_dph", kod: "PD", popis: "Tuzemské", agenda: "inland" },
  ];
  const zaklad = {
    ciselnik,
    agendy: ["receivedInvoice"],
    kluc: "prijata",
    pouzitePredkontacie: ["1Fp", "9Ux"],
    pouziteClenenia: [],
    pouziteKv: [],
    pouziteKategorie: [],
    kvMoznosti: KV,
    kategorieMoznosti: KAT,
  };

  it("číselník bez neaktívnych, cudzej agendy a iného druhu dokladu; použité kódy za ním", () => {
    const p = povoleneKody(zaklad);
    expect(p.predkontacia.map((m) => m.kod)).toEqual(["1Fp", "9Ux"]);
    expect(p.clenenie.map((m) => m.kod)).toEqual(["PD"]);
  });

  it("KV a kategória len firme, ktorá ich na dokladoch vypĺňa", () => {
    expect(povoleneKody(zaklad).kv).toEqual([]);
    expect(povoleneKody(zaklad).kategoria).toEqual([]);
    const p = povoleneKody({ ...zaklad, pouziteKv: ["B2"], pouziteKategorie: ["palivo"] });
    expect(p.kv.length).toBe(2);
    expect(p.kategoria.length).toBe(2);
  });

  it("prázdny číselník — len kódy, ktoré firma už mala", () => {
    const p = povoleneKody({ ...zaklad, ciselnik: [], pouziteClenenia: ["PD"] });
    expect(p.predkontacia.map((m) => m.kod)).toEqual(["1Fp", "9Ux"]);
    expect(p.clenenie.map((m) => m.kod)).toEqual(["PD"]);
    expect(povoleneKody({ ...zaklad, ciselnik: [], pouzitePredkontacie: [] }).predkontacia).toEqual(
      [],
    );
  });
});

describe("spracovanie odpovede AI", () => {
  it("platná odpoveď, aj zabalená v ```json", () => {
    const n = spracujOdpoved(
      '```json\n{"predkontacia":"1Fp","clenenie":"PD","kv":null,"kategoria":"software","dovod":"telekomunikačné služby → 518"}\n```',
      povolene,
    );
    expect(n).toEqual({
      predkontacia: "1Fp",
      clenenie: "PD",
      kategoria: "software",
      dovod: "telekomunikačné služby → 518",
    });
  });

  it("zlý JSON a prázdna odpoveď nedajú nič", () => {
    expect(spracujOdpoved("toto nie je JSON", povolene)).toBeNull();
    expect(spracujOdpoved("", povolene)).toBeNull();
    expect(spracujOdpoved(null, povolene)).toBeNull();
    expect(spracujOdpoved("[1,2]", povolene)).toBeNull();
    expect(
      spracujOdpoved('{"predkontacia":null,"clenenie":null,"dovod":"neviem"}', povolene),
    ).toBeNull();
  });

  it("neznámy (vymyslený) kód sa zahodí, zvyšok ostane", () => {
    const n = spracujOdpoved(
      '{"predkontacia":"518","clenenie":"PD","kv":"Z9","kategoria":"letenky"}',
      povolene,
    );
    expect(n).toEqual({ clenenie: "PD" });
    expect(spracujOdpoved('{"predkontacia":"518"}', povolene)).toBeNull();
  });

  it("kód s inou veľkosťou písmen sa prevedie na kód z číselníka; nevyžiadané pole sa zahodí", () => {
    expect(spracujOdpoved('{"predkontacia":"1fp","clenenie":"pd"}', povolene)).toEqual({
      predkontacia: "1Fp",
      clenenie: "PD",
    });
    expect(
      spracujOdpoved('{"predkontacia":"1Fp","clenenie":"PD"}', povolene, ["clenenie"]),
    ).toEqual({
      clenenie: "PD",
    });
    expect(spracujOdpoved('{"predkontacia":123}', povolene)).toBeNull();
  });

  it("pokyn obsahuje kódy číselníka a potrebné údaje, nie celý doklad", () => {
    const v = vstupZPrijatej(
      {
        supplier_name: "Orange Slovensko, a.s.",
        supplier_ico: "35697270",
        supplier_ic_dph: "SK2020310578",
        amount_without_vat: 20,
        vat_amount: 4.6,
        amount_total: 24.6,
        items: [{ name: "Paušál Go" }],
        file_path: "tajne/cesta.pdf",
        supplier_iban: "SK0011",
      },
      "SK",
      [{ sadzba: 23 }],
    );
    const p = pokynAi(v, povolene, ["predkontacia", "clenenie"]);
    expect(p).toContain("1Fp | Služby | 518/321");
    expect(p).toContain("PD | Tuzemské s odpočtom");
    expect(p).toContain("Paušál Go");
    expect(p).toContain("23 %");
    expect(p).not.toContain("SK0011");
    expect(p).not.toContain("cesta.pdf");
    expect(p).toContain("kv: vráť null");
  });
});

describe("pamäť návrhu", () => {
  const v = vstupZPrijatej(
    { supplier_name: "Orange", amount_total: 24.6, items: [{ name: "Paušál" }] },
    "SK",
    [],
  );
  const odtl = odtlacok(v);

  it("odtlačok je stabilný a mení sa so sumou či dodávateľom", () => {
    expect(odtlacok({ ...v })).toBe(odtl);
    expect(odtlacok({ ...v, celkom: 30 })).not.toBe(odtl);
    expect(odtlacok({ ...v, dodavatel: { ...v.dodavatel, nazov: "Telekom" } })).not.toBe(odtl);
  });

  it("nespracovaný doklad a z neho vytvorená faktúra majú rovnaký odtlačok", () => {
    const u = prazdneUdaje();
    u.dodavatel.nazov = "Orange Slovensko";
    u.dodavatel.ico = "35697270";
    u.rozpis = [{ sadzba: 23, zaklad: 20, dph: 4.6 }];
    u.polozky = [
      { name: "Paušál", quantity: 1, unit: null, unit_price: 20, vat_rate: 23, total: 24.6 },
    ];
    const riadok = prijataZUdajov("faktura", u, "2026-10-19");
    // Tak, ako sa riadok vráti z databázy.
    const zDb = JSON.parse(JSON.stringify({ ...riadok, id: "x", company_id: "y" }));
    expect(odtlacok(vstupZPrijatej(zDb, "SK", rozpisPrijatej(zDb)))).toBe(
      odtlacok(vstupZPrijatej(riadok, "SK", rozpisPrijatej(riadok))),
    );
    const b = blocekZUdajov(u);
    expect(odtlacok(vstupZBlocku(b, "SK"))).toBe(
      odtlacok(vstupZBlocku(JSON.parse(JSON.stringify(b)), "SK")),
    );
  });

  it("zapamätaný návrh sa použije, kým sedí odtlačok a kódy sú v číselníku", () => {
    const ulozeny = {
      odtlacok: odtl,
      stav: "navrh",
      navrh: { predkontacia: "1Fp", clenenie: "PD", dovod: "služby" },
    };
    expect(platnyZPamate(ulozeny, odtl, povolene)).toEqual({
      predkontacia: "1Fp",
      clenenie: "PD",
      dovod: "služby",
    });
    expect(platnyZPamate(ulozeny, "iny", povolene)).toBeUndefined();
    expect(platnyZPamate(null, odtl, povolene)).toBeUndefined();
  });

  it("„nič nenavrhla“ sa pamätá tiež — znova sa nepýta", () => {
    expect(
      platnyZPamate({ odtlacok: odtl, stav: "prazdny", navrh: {} }, odtl, povolene),
    ).toBeNull();
  });

  it("kód, ktorý z číselníka zmizol, sa zahodí; keď nezostane nič, počíta sa znova", () => {
    const bez1Fp = { ...povolene, predkontacia: povolene.predkontacia.slice(1) };
    const ulozeny = {
      odtlacok: odtl,
      stav: "navrh",
      navrh: { predkontacia: "1Fp", clenenie: "PD" },
    };
    expect(platnyZPamate(ulozeny, odtl, bez1Fp)).toEqual({ clenenie: "PD" });
    expect(
      platnyZPamate({ ...ulozeny, navrh: { predkontacia: "1Fp" } }, odtl, bez1Fp),
    ).toBeUndefined();
  });
});

describe("návrh v nespracovanom doklade", () => {
  const navrh = zlucNavrhy({
    navyk: { kategoria: "software" },
    ai: { predkontacia: "1Fp", clenenie: "PD" },
  });

  it("doplní len prázdne polia a označí, čo je od AI a čo naučené", () => {
    const u0 = prazdneUdaje();
    u0.kody.clenenie = "PN";
    const u = doplnNavrhDoUdajov(u0, navrh, "služby → 518");
    expect(u.kody.predkontacia).toBe("1Fp");
    expect(u.kody.clenenie).toBe("PN");
    expect(u.kategoria).toBe("software");
    expect(u.navrhAi).toEqual({ predkontacia: "1Fp" });
    expect(u.naucene).toEqual({ kategoria: "software" });
    expect(u.navrhAiDovod).toBe("služby → 518");
    expect(oznaceniaZUdajov(u)).toEqual({ predkontacia: "ai", kategoria: "navyk" });
  });

  it("pravidlo sa do formulára nedopĺňa — doplní ho spúšťač pri zápise", () => {
    const u = doplnNavrhDoUdajov(prazdneUdaje(), zlucNavrhy({ pravidlo: { predkontacia: "2Fm" } }));
    expect(u.kody.predkontacia).toBe("");
    expect(u.navrhAi).toBeUndefined();
  });

  it("potvrdenie nechá hodnoty, zahodenie ich vyprázdni; zmenené pole už nie je návrh", () => {
    const u = doplnNavrhDoUdajov(prazdneUdaje(), navrh, "x");
    expect(nepotvrdeneAi(u).sort()).toEqual(["clenenie", "predkontacia"]);
    const potvrdene = potvrdNavrhAi(u);
    expect(potvrdene.kody.predkontacia).toBe("1Fp");
    expect(nepotvrdeneAi(potvrdene)).toEqual([]);
    const zahodene = zahodNavrhAi(u);
    expect(zahodene.kody.predkontacia).toBe("");
    expect(zahodene.kody.clenenie).toBe("");
    expect(zahodene.kategoria).toBe("software");
    const zmenene = { ...u, kody: { ...u.kody, predkontacia: "2Fm" } };
    expect(nepotvrdeneAi(zmenene)).toEqual(["clenenie"]);
  });

  it("nepotvrdený návrh AI do dokladu nejde — doklad sa ním nezaúčtuje", () => {
    const u = doplnNavrhDoUdajov(prazdneUdaje(), navrh, "x");
    const naZapis = bezNepotvrdenehoAi(u);
    const riadok = prijataZUdajov("faktura", naZapis, "2026-10-19");
    expect(riadok.pohoda_predkontacia).toBeNull();
    expect(riadok.pohoda_clenenie_dph).toBeNull();
    // Potvrdený už ide.
    const potvrdeny = prijataZUdajov("faktura", bezNepotvrdenehoAi(potvrdNavrhAi(u)), "2026-10-19");
    expect(potvrdeny.pohoda_predkontacia).toBe("1Fp");
  });
});

describe("oznaceniaZUdajov — pravidlo účtovania", () => {
  it("hodnota z pravidla má hviezdičku pred naučenou aj AI, po zmene zmizne", () => {
    const u = prazdneUdaje();
    u.kody.predkontacia = "518";
    u.kategoria = "telefon";
    u.naucene = { kategoria: "telefon" };
    u.zPravidla = { predkontacia: "518", kategoria: "telefon" };
    expect(oznaceniaZUdajov(u)).toEqual({ predkontacia: "pravidlo", kategoria: "pravidlo" });
    u.kody.predkontacia = "501";
    expect(oznaceniaZUdajov(u).predkontacia).toBeUndefined();
  });
});
