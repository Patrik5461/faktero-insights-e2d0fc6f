import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  cisloZavazkuXml,
  kodyPolozky,
  nazovSuboruSplatok,
  polozkySplatky,
  symbolSplatky,
  ucinneKody,
  xmlSplatokDoPohody,
  zauctovanieKalendaraZmenene,
  type SplatkaPreExport,
  type ZmluvaPreExport,
} from "./financovanie-pohoda";

xmlRegisterFsInputProviders();

let validator: XsdValidator | null = null;
function chybySchemy(xml: string): string[] {
  if (!validator) {
    const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
    validator = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  }
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const prvok = m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      validator.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const leasing: ZmluvaPreExport = {
  id: "z1",
  kind: "leasing",
  name: "Škoda Octavia",
  provider_name: "ČSOB Leasing, a.s.",
  contract_number: "UZF/26/80613",
  variable_symbol: "2680613",
  currency: "EUR",
  vat_rate: 0,
  term_months: 60,
  pohoda_predkontacia: "1Lz",
  pohoda_clenenie_dph: "PN",
  kv_clenenie: "X",
};

const s1: SplatkaPreExport = {
  id: "s1",
  number: 1,
  due_date: "2026-11-15",
  amount: 512.4,
  principal_part: 430.1,
  interest_part: 62.3,
  vat_amount: 0,
  insurance_part: 20,
};

describe("splátky do Ostatných záväzkov", () => {
  it("rozpadne splátku na istinu, úrok a poistenie a dorovná zvyšok", () => {
    const { polozky, vyhrady } = polozkySplatky(leasing, { ...s1, amount: 515.4 });
    expect(vyhrady).toEqual([]);
    expect(polozky.map((p) => [p.text, p.zaklad, p.dph])).toEqual([
      ["Istina", 430.1, 0],
      ["Úrok", 62.3, 0],
      ["Poistenie", 20, 0],
      ["Ostatné (poplatky)", 3, 0],
    ]);
  });

  it("DPH v splátke rozdelí na istinu a úrok pomerom a sedí na cent", () => {
    const op = { ...leasing, vat_rate: 23 };
    const s = { ...s1, amount: 100 + 23.01 + 0, principal_part: 66.67, interest_part: 33.33, vat_amount: 23.01, insurance_part: 0 };
    const { polozky } = polozkySplatky(op, s);
    expect(polozky.map((p) => p.sadzba)).toEqual([23, 23]);
    expect(polozky.reduce((a, p) => a + p.dph, 0)).toBeCloseTo(23.01, 2);
    expect(polozky.reduce((a, p) => a + p.zaklad + p.dph, 0)).toBeCloseTo(123.01, 2);
  });

  it("splátka bez rozpadu ide ako jedna položka", () => {
    const { polozky } = polozkySplatky(leasing, { ...s1, principal_part: 0, interest_part: 0, insurance_part: 0 });
    expect(polozky).toEqual([{ text: "Splátka", zlozka: null, zaklad: 512.4, dph: 0, sadzba: 0 }]);
  });

  it("časti nad sumu splátky → výhrada", () => {
    const { vyhrady } = polozkySplatky(leasing, { ...s1, amount: 400 });
    expect(vyhrady[0]).toMatch(/viac než splátka/);
  });

  it("kódy splátky prebíjajú kalendár", () => {
    expect(ucinneKody(leasing, s1)).toMatchObject({ predkontacia: "1Lz", clenenie: "PN", vlastne: false });
    expect(ucinneKody(leasing, { ...s1, pohoda_predkontacia: "1Lu" })).toMatchObject({
      predkontacia: "1Lu",
      clenenie: "PN",
      vlastne: true,
    });
  });

  it("XML je záväzok podľa invoice.xsd a nesie kódy", () => {
    const s2 = { ...s1, id: "s2", number: 2, due_date: "2026-12-15", pohoda_predkontacia: "1Lu", kv_clenenie: "B2" };
    const r = xmlSplatokDoPohody({ ico: "36123456", krajinaFirmy: "SK", zmluva: leasing, splatky: [s2, s1] });
    expect(r.pocet).toBe(2);
    expect(r.idSplatok).toEqual(["s1", "s2"]);
    expect(chybySchemy(r.xml)).toEqual([]);
    expect(r.xml).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    expect(r.xml).toContain("<inv:symVar>2680613</inv:symVar>");
    expect(r.xml).toContain("<inv:text>Splátka 1/60 – leasing UZF/26/80613</inv:text>");
    expect(r.xml).toContain("<typ:ids>1Lu</typ:ids>");
    // „X“ (nezahŕňať) sa do Pohody neposiela, vlastné KV splátky áno.
    expect(r.xml.match(/classificationKVDPH><typ:ids>B2/g)?.length).toBeGreaterThan(0);
    expect(r.xml).not.toContain("<typ:ids>X</typ:ids>");
  });

  it("operatívny leasing s DPH prejde schémou s priceHigh", () => {
    const op = { ...leasing, vat_rate: 23, pohoda_clenenie_dph: "PD", kv_clenenie: "B2" };
    const s = { ...s1, amount: 615, principal_part: 450, interest_part: 50, vat_amount: 115, insurance_part: 0 };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: op, splatky: [s] });
    expect(chybySchemy(r.xml)).toEqual([]);
    expect(r.xml).toContain("<typ:priceHigh>500.00</typ:priceHigh>");
    expect(r.xml).toContain("<typ:priceHighVAT>115.00</typ:priceHighVAT>");
  });

  it("kalendár bez predkontácie dá výhradu, cudzia mena sa neexportuje", () => {
    const bez = { ...leasing, pohoda_predkontacia: null };
    expect(xmlSplatokDoPohody({ zmluva: bez, splatky: [s1] }).vyhrady.join(" ")).toMatch(/Neviem/);
    const czk = xmlSplatokDoPohody({ zmluva: { ...leasing, currency: "CZK" }, splatky: [s1] });
    expect(czk.pocet).toBe(0);
    expect(czk.vyhrady[0]).toMatch(/CZK/);
  });

  it("český kalendár nemá členenie KV", () => {
    const r = xmlSplatokDoPohody({
      krajinaFirmy: "CZ",
      zmluva: { ...leasing, currency: "CZK", kv_clenenie: "B2" },
      splatky: [s1],
    });
    expect(r.xml).not.toContain("classificationKVDPH");
    expect(chybySchemy(r.xml)).toEqual([]);
  });

  it("názov súboru", () => {
    expect(nazovSuboruSplatok(leasing, [3, 1, 2])).toBe("splatky-UZF-26-80613-1-3.xml");
  });
});

describe("rozúčtovanie splátky po zložkách", () => {
  const rozuct = {
    ...leasing,
    pohoda_rozuctovanie: {
      istina: { predkontacia: "1Li" },
      urok: { predkontacia: "1Lu", clenenie: "PN" },
      poistenie: { predkontacia: "1Lp", clenenie: "PN" },
    },
  };

  it("každá položka dostane predkontáciu svojej zložky, chýbajúca ide podľa kalendára", () => {
    expect(kodyPolozky(rozuct, s1, "istina")).toMatchObject({ predkontacia: "1Li", clenenie: "PN" });
    expect(kodyPolozky(rozuct, s1, "urok").predkontacia).toBe("1Lu");
    expect(kodyPolozky(rozuct, s1, "poplatky").predkontacia).toBe("1Lz");
    expect(kodyPolozky(rozuct, s1, null).predkontacia).toBe("1Lz");
  });

  it("XML nesie kód na každej položke a prejde schémou", () => {
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: rozuct, splatky: [{ ...s1, amount: 515.4 }] });
    expect(chybySchemy(r.xml)).toEqual([]);
    const polozky = [...r.xml.matchAll(/<inv:invoiceItem>([\s\S]*?)<\/inv:invoiceItem>/g)].map((m) => [
      m[1].match(/<inv:text>([^<]+)/)?.[1],
      m[1].match(/<inv:accounting><typ:ids>([^<]+)/)?.[1],
    ]);
    expect(polozky).toEqual([
      ["Istina", "1Li"],
      ["Úrok", "1Lu"],
      ["Poistenie", "1Lp"],
      ["Ostatné (poplatky)", "1Lz"],
    ]);
  });

  it("KV ide len na položky s DPH, nie na poistenie", () => {
    const op = { ...rozuct, vat_rate: 23, kv_clenenie: "B2" };
    const s = { ...s1, amount: 635, principal_part: 450, interest_part: 50, vat_amount: 115, insurance_part: 20 };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: op, splatky: [s] });
    const poistenie = r.xml.match(/<inv:text>Poistenie<\/inv:text>[\s\S]*?<\/inv:invoiceItem>/)?.[0] ?? "";
    expect(poistenie).not.toContain("classificationKVDPH");
    expect(r.xml.match(/<inv:invoiceItem>[\s\S]*?classificationKVDPH/g)?.length).toBe(2);
  });

  it("bez predkontácie kalendára vymenuje zložky, ktorým chýba", () => {
    // Splátka s poplatkom (3 € nad istinu, úrok a poistenie) — položka poplatkov kód nemá.
    const r = xmlSplatokDoPohody({ zmluva: { ...rozuct, pohoda_predkontacia: null }, splatky: [{ ...s1, amount: 515.4 }] });
    expect(r.vyhrady.join(" ")).toMatch(/Bez predkontácie: poplatky/);
  });

  it("splátka: vlastná zložka > vlastný kód splátky > zložka kalendára > kalendár", () => {
    const sVlastna = { ...s1, pohoda_predkontacia: "1Sx", pohoda_rozuctovanie: { urok: { predkontacia: "1Su", kv: "B2" } } };
    expect(kodyPolozky(rozuct, sVlastna, "urok")).toMatchObject({ predkontacia: "1Su", kv: "B2", vlastne: true });
    expect(kodyPolozky(rozuct, sVlastna, "istina").predkontacia).toBe("1Sx");
    expect(kodyPolozky(rozuct, s1, "istina").predkontacia).toBe("1Li");
  });

  it("výslovné KV zložky ide aj na položku bez DPH", () => {
    const z = { ...rozuct, pohoda_rozuctovanie: { ...rozuct.pohoda_rozuctovanie, poistenie: { predkontacia: "1Lp", kv: "B2" } } };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: z, splatky: [s1] });
    expect(chybySchemy(r.xml)).toEqual([]);
    const poistenie = r.xml.match(/<inv:text>Poistenie<\/inv:text>[\s\S]*?<\/inv:invoiceItem>/)?.[0] ?? "";
    expect(poistenie).toContain("<inv:classificationKVDPH><typ:ids>B2</typ:ids>");
  });
});

describe("veriteľ, KV, dátum dodania a variabilný symbol", () => {
  const sVeritelom: ZmluvaPreExport = {
    ...leasing,
    provider_ico: "35704713",
    provider_dic: "2020264818",
    provider_ic_dph: "SK2020264818",
    provider_street: "Žižkova 11",
    provider_city: "Bratislava",
    provider_zip: "811 02",
    provider_country: "SK",
    kv_clenenie: "B2",
    vat_rate: 23,
  };
  const sDph = { ...s1, amount: 615, principal_part: 450, interest_part: 50, vat_amount: 115, insurance_part: 0 };

  it("partnerIdentity nesie plné údaje veriteľa v poradí addressType a prejde schémou", () => {
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: sVeritelom, splatky: [sDph] });
    expect(chybySchemy(r.xml)).toEqual([]);
    const adresa = r.xml.match(/<typ:address>([\s\S]*?)<\/typ:address>/)?.[1] ?? "";
    expect([...adresa.matchAll(/<typ:(\w+)>/g)].map((m) => m[1]).filter((x) => x !== "ids")).toEqual([
      "company",
      "city",
      "street",
      "zip",
      "ico",
      "dic",
      "icDph",
      "country",
    ]);
    expect(adresa).toContain("<typ:company>ČSOB Leasing, a.s.</typ:company>");
    expect(adresa).toContain("<typ:ico>35704713</typ:ico>");
    expect(adresa).toContain("<typ:dic>2020264818</typ:dic>");
    expect(adresa).toContain("<typ:icDph>SK2020264818</typ:icDph>");
    expect(adresa).toContain("<typ:country><typ:ids>SK</typ:ids></typ:country>");
    expect(r.vyhrady.join(" ")).not.toMatch(/IČ DPH veriteľa/);
  });

  it("KV B2 ide na hlavičku aj položky s DPH", () => {
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: sVeritelom, splatky: [sDph] });
    const hlavicka = r.xml.match(/<inv:invoiceHeader>[\s\S]*?<\/inv:invoiceHeader>/)?.[0] ?? "";
    expect(hlavicka).toContain("<inv:classificationKVDPH><typ:ids>B2</typ:ids></inv:classificationKVDPH>");
    expect(r.xml.match(/<inv:invoiceItem>[\s\S]*?classificationKVDPH/g)?.length).toBe(2);
  });

  it("KV B2 bez IČ DPH veriteľa → výhrada", () => {
    const r = xmlSplatokDoPohody({
      ico: "1",
      krajinaFirmy: "SK",
      zmluva: { ...sVeritelom, provider_ic_dph: null },
      splatky: [sDph, { ...sDph, id: "s2", number: 2 }],
    });
    const v = r.vyhrady.filter((x) => /bez IČ DPH veriteľa Pohoda nezaradí do KV B\.2/.test(x.replace("záväzok ", "")));
    expect(v).toHaveLength(1);
    // Bez B2 výhrada nie je.
    const bezKv = xmlSplatokDoPohody({ zmluva: { ...sVeritelom, provider_ic_dph: null, kv_clenenie: "X" }, splatky: [sDph] });
    expect(bezKv.vyhrady.join(" ")).not.toMatch(/IČ DPH veriteľa/);
  });

  it("SK: dateDelivery = splatnosť splátky, CZ: dateKHDPH", () => {
    const sk = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: sVeritelom, splatky: [sDph] });
    expect(sk.xml).toContain("<inv:dateDelivery>2026-11-15</inv:dateDelivery>");
    expect(sk.xml).not.toContain("dateKHDPH");
    expect(chybySchemy(sk.xml)).toEqual([]);
    const cz = xmlSplatokDoPohody({
      ico: "1",
      krajinaFirmy: "CZ",
      zmluva: { ...sVeritelom, currency: "CZK", vat_rate: 21, provider_country: "CZ" },
      splatky: [{ ...sDph, vat_amount: 105, amount: 605 }],
    });
    expect(cz.xml).toContain("<inv:dateKHDPH>2026-11-15</inv:dateKHDPH>");
    expect(cz.xml).not.toContain("dateDelivery");
    expect(chybySchemy(cz.xml)).toEqual([]);
    // Poradie podľa invoice.xsd: date, dateTax, dateAccounting, (dateKHDPH), dateDue, (dateDelivery).
    const datumy = (x: string) =>
      [...x.matchAll(/<inv:(date\w*)>/g)].map((m) => m[1]);
    expect(datumy(sk.xml)).toEqual(["date", "dateTax", "dateAccounting", "dateDue", "dateDelivery"]);
    expect(datumy(cz.xml)).toEqual(["date", "dateTax", "dateAccounting", "dateKHDPH", "dateDue"]);
  });

  it("variabilný symbol: zo zmluvy, inak číslo zmluvy bez lomítok — nič vymyslené", () => {
    expect(symbolSplatky(leasing)).toBe("2680613");
    expect(symbolSplatky({ ...leasing, variable_symbol: null })).toBe("UZF2680613");
    expect(symbolSplatky({ ...leasing, variable_symbol: " ", contract_number: "00526/0445" })).toBe("005260445");
    expect(symbolSplatky({ ...leasing, variable_symbol: null, contract_number: "LZ-2024 / 15 A" })).toBe("LZ-202415A");
    expect(symbolSplatky({ ...leasing, variable_symbol: null, contract_number: "ABCDEFGHIJ/1234567890/XYZ" })).toHaveLength(20);
    expect(symbolSplatky({ ...leasing, variable_symbol: null, contract_number: null })).toBe("");
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: { ...leasing, variable_symbol: null }, splatky: [s1] });
    expect(r.xml).toContain("<inv:symVar>UZF2680613</inv:symVar>");
    expect(r.xml).toContain("<inv:symPar>UZF2680613</inv:symPar>");
    expect(chybySchemy(r.xml)).toEqual([]);
    const bez = xmlSplatokDoPohody({ zmluva: { ...leasing, variable_symbol: null, contract_number: null }, splatky: [s1] });
    expect(bez.xml).not.toContain("symVar");
  });

  describe("vlastné číslo dokladu splátky", () => {
    const s2 = { ...s1, id: "s2", number: 2, due_date: "2026-12-15" };

    it("pošle numberRequested aj skratku radu Pohody a prejde schémou", () => {
      const r = xmlSplatokDoPohody({
        ico: "1",
        krajinaFirmy: "SK",
        zmluva: { ...leasing, pohoda_rad: "ZavL" },
        splatky: [
          { ...s1, cislo_dokladu: "LEAS2026001" },
          { ...s2, cislo_dokladu: "LEAS2026002" },
        ],
      });
      expect(chybySchemy(r.xml)).toEqual([]);
      expect(r.xml).toContain(
        "<inv:number><typ:ids>ZavL</typ:ids><typ:numberRequested>LEAS2026001</typ:numberRequested></inv:number>",
      );
      expect(r.xml).toContain("<typ:numberRequested>LEAS2026002</typ:numberRequested>");
      // VS a párovací symbol ostávajú zo zmluvy, pôvodný doklad = zmluva/splátka.
      expect(r.xml).toContain("<inv:symVar>2680613</inv:symVar>");
      expect(r.xml).toContain("<inv:symPar>2680613</inv:symPar>");
      expect(r.xml).toContain("<inv:originalDocument>UZF/26/80613/1</inv:originalDocument>");
    });

    it("číslo bez radu Pohody, rad bez čísla a bez oboch nič", () => {
      const lenCislo = xmlSplatokDoPohody({ zmluva: leasing, splatky: [{ ...s1, cislo_dokladu: "SPL-2026/0001" }] });
      expect(chybySchemy(lenCislo.xml)).toEqual([]);
      expect(lenCislo.xml).toContain(
        "<inv:number><typ:numberRequested>SPL-2026/0001</typ:numberRequested></inv:number>",
      );
      const lenRad = xmlSplatokDoPohody({ zmluva: { ...leasing, pohoda_rad: "ZavL" }, splatky: [s1] });
      expect(lenRad.xml).toContain("<inv:number><typ:ids>ZavL</typ:ids></inv:number>");
      expect(lenRad.xml).not.toContain("numberRequested");
      expect(xmlSplatokDoPohody({ zmluva: leasing, splatky: [s1] }).xml).not.toContain("<inv:number>");
    });

    it("pridlhé číslo (> 32 znakov) sa nepošle a dá výhradu", () => {
      const dlhe = "X".repeat(33);
      const r = xmlSplatokDoPohody({ zmluva: leasing, splatky: [{ ...s1, cislo_dokladu: dlhe }] });
      expect(r.xml).not.toContain(dlhe);
      expect(r.vyhrady.join(" ")).toMatch(/dlhšie ako 32/);
      expect(chybySchemy(r.xml)).toEqual([]);
      expect(cisloZavazkuXml(null, "X".repeat(32))).toContain("numberRequested");
      expect(cisloZavazkuXml("", " ")).toBe("");
    });

    it("číslo sa escapuje", () => {
      expect(cisloZavazkuXml(null, "A&B<1>")).toContain("A&amp;B&lt;1&gt;");
    });
  });
});

describe("zvolené predkontácie sa dostanú do exportu", () => {
  const bezKodov: ZmluvaPreExport = { ...leasing, pohoda_predkontacia: null, pohoda_clenenie_dph: null, kv_clenenie: null };
  const prazdnyFormular = {
    predkontacia: "",
    clenenie: "",
    kv: "",
    rad: "",
    rozuctovanie: {
      istina: { predkontacia: "", clenenie: "", kv: "" },
      urok: { predkontacia: "", clenenie: "", kv: "" },
      poistenie: { predkontacia: "", clenenie: "", kv: "" },
      poplatky: { predkontacia: "", clenenie: "", kv: "" },
    },
  };

  it("prázdny formulár nad kalendárom bez kódov nie je zmena (null = \"\")", () => {
    expect(zauctovanieKalendaraZmenene({ ...bezKodov, pohoda_rozuctovanie: {} }, prazdnyFormular)).toBe(false);
  });

  it("vybraná, ale neuložená predkontácia je zmena — export ju musí najprv uložiť", () => {
    expect(zauctovanieKalendaraZmenene(bezKodov, { ...prazdnyFormular, predkontacia: "1Lz" })).toBe(true);
    const r = { ...prazdnyFormular.rozuctovanie, urok: { predkontacia: "1Lu", clenenie: "", kv: "" } };
    expect(zauctovanieKalendaraZmenene(bezKodov, { ...prazdnyFormular, rozuctovanie: r })).toBe(true);
    // Po uložení (server zahodí prázdne polia) sa formulár s kalendárom zhoduje.
    expect(
      zauctovanieKalendaraZmenene({ ...bezKodov, pohoda_rozuctovanie: { urok: { predkontacia: "1Lu" } } }, { ...prazdnyFormular, rozuctovanie: r }),
    ).toBe(false);
  });

  it("kalendár bez kódov (BÝVAJLEPŠIE 9. 11.) ide bez predkontácie a s výhradou", () => {
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: bezKodov, splatky: [s1] });
    expect(r.xml).not.toContain("<inv:accounting>");
    expect(r.vyhrady.join(" ")).toMatch(/Kalendár nemá predkontáciu/);
  });

  it("predkontácia na splátke stačí aj bez kódu kalendára — bez výhrady", () => {
    const s = { ...s1, pohoda_predkontacia: "1Sx" };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: bezKodov, splatky: [s] });
    expect(r.xml.match(/<inv:invoiceItem>[\s\S]*?<inv:accounting><typ:ids>1Sx</g)?.length).toBe(3);
    expect(r.vyhrady.join(" ")).not.toMatch(/predkontáci/);
  });

  it("rozúčtovanie na splátke pokryje všetky položky — bez výhrady", () => {
    const s = {
      ...s1,
      pohoda_rozuctovanie: { istina: { predkontacia: "1Li" }, urok: { predkontacia: "1Lu" }, poistenie: { predkontacia: "1Lp" } },
    };
    const r = xmlSplatokDoPohody({ ico: "1", krajinaFirmy: "SK", zmluva: bezKodov, splatky: [s] });
    const kody = [...r.xml.matchAll(/<inv:invoiceItem>[\s\S]*?<inv:accounting><typ:ids>([^<]+)/g)].map((m) => m[1]);
    expect(kody).toEqual(["1Li", "1Lu", "1Lp"]);
    expect(r.vyhrady.join(" ")).not.toMatch(/predkontáci/);
  });

  it("predkontácia, ktorú preklad na skratky zahodí, dostane výhradu", () => {
    const z = { ...bezKodov, pohoda_predkontacia: "518/325" };
    const r = xmlSplatokDoPohody({
      ico: "1",
      krajinaFirmy: "SK",
      zmluva: z,
      splatky: [s1],
      chybajuceSkratky: (kody) => kody.filter((k) => k.includes("/")),
      prelozPredkontacie: (xml) => xml.replace(/<inv:accounting><typ:ids>518\/325<\/typ:ids><\/inv:accounting>/g, ""),
    });
    expect(r.xml).not.toContain("518/325");
    expect(r.vyhrady.join(" ")).toMatch(/„518\/325“ je dvojica účtov bez skratky/);
  });
});
