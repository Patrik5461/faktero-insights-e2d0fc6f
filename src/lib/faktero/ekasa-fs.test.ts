import { describe, it, expect } from "vitest";
import { identifikatoryZQr, mapujFsDoklad, sposobUhrady } from "./ekasa";
import { odpovedNaJson } from "./json-odpoved";

describe("identifikátory z QR kódu", () => {
  it("holý identifikátor dokladu", () => {
    expect(identifikatoryZQr("O-97CFC3A0F4F14D0DA0F4F14D0DA0F4F1")).toEqual({
      receiptId: "O-97CFC3A0F4F14D0DA0F4F14D0DA0F4F1",
    });
  });

  it("identifikátor v odkaze aj s medzerami navyše", () => {
    expect(
      identifikatoryZQr("  https://ekasa.financnasprava.sk/mdu/#/receipt/O-1A2B3C4D5E6F  "),
    ).toEqual({ receiptId: "O-1A2B3C4D5E6F" });
  });

  it("odkaz bez predpony O-", () => {
    const r = identifikatoryZQr("https://opd.financnasprava.sk/#/opd/88812345678900001/AB12CD34EF");
    expect(r).toEqual({ receiptId: "AB12CD34EF" });
  });

  /*
   * Doklad vydaný offline ešte identifikátor nemá — QR vtedy nesie overovací
   * kód podnikateľa spolu s kódom pokladnice, dátumom, poradovým číslom a sumou.
   */
  it("offline doklad podľa OKP a pätice údajov", () => {
    const qr =
      "1a2b3c4d-5e6f7081-92a3b4c5-d6e7f809-0a1b2c3d|88812345678900001|2026-08-09T14:32|42|17,90";
    expect(identifikatoryZQr(qr)).toEqual({
      okp: "1a2b3c4d-5e6f7081-92a3b4c5-d6e7f809-0a1b2c3d",
      cashRegisterCode: "88812345678900001",
      issueDate: "2026-08-09",
      receiptNumber: "42",
      totalAmount: 17.9,
    });
  });

  it("z cudzieho QR sa nič nevyrobí", () => {
    expect(identifikatoryZQr("https://www.google.com")).toBeNull();
    expect(identifikatoryZQr("")).toBeNull();
    expect(identifikatoryZQr("SPD*1.0*ACC:SK1234")).toBeNull();
  });
});

describe("doklad z Finančnej správy", () => {
  /** Tvar podľa rozhrania, na ktorom stojí aplikácia Overenie dokladu. */
  const odpoved = {
    receiptId: "O-97CFC3A0F4F14D0DA0F4F14D0DA0F4F1",
    receiptNumber: "0042",
    cashRegisterCode: "88812345678900001",
    okp: "1a2b3c4d-5e6f7081-92a3b4c5-d6e7f809-0a1b2c3d",
    issueDate: "2026-08-09T14:32:11+02:00",
    createDate: 1786385735598,
    ico: "31347037",
    dic: "2020312503",
    icDph: "SK2020312503",
    organization: {
      name: "BILLA s.r.o.",
      streetName: "Bajkalská",
      buildingNumber: "19/A",
      postalCode: "82102",
      municipality: "Bratislava",
    },
    priceWithVat: 7.96,
    taxBaseBasic: 6.69,
    vatAmountBasic: 1.27,
    // Sadzba chodí ako zlomok — ich vlastná aplikácia ju násobí stovkou.
    vatRateBasic: 0.19,
    items: [
      { name: "Mlieko plnotučné 1l", quantity: 2, price: 2.58, vatRate: 0.19 },
      { name: "Chlieb čierny 500g", quantity: 1, price: 1.89, vatRate: 0.19 },
      { name: "Maslo 250g", quantity: 1, price: 3.49, vatRate: 0.19 },
    ],
  };

  const d = mapujFsDoklad(odpoved);

  it("hlavička dokladu", () => {
    expect(d).toMatchObject({
      dodavatel: "BILLA s.r.o.",
      ico: "31347037",
      ic_dph: "SK2020312503",
      suma: 7.96,
      dph: 1.27,
      datum: "2026-08-09",
      cisloDokladu: "0042",
      kodPokladnice: "88812345678900001",
      uid: "O-97CFC3A0F4F14D0DA0F4F14D0DA0F4F1",
    });
  });

  it("adresa ako jeden riadok, súpisné/orientačné číslo", () => {
    expect(
      mapujFsDoklad({
        organization: {
          streetName: "Bajkalská",
          propertyRegistrationNumber: "9834",
          buildingNumber: "19/A",
          postalCode: "82102",
          municipality: "Bratislava",
          country: "SK",
        },
      }).adresa,
    ).toBe("Bajkalská 9834/19/A, 82102 Bratislava, SK");
    expect(d.adresa).toBe("Bajkalská 19/A, 82102 Bratislava");
  });

  /*
   * Sadzba chodí ako zlomok. Bez prepočtu by sa do dokladu uložilo „0,19 %"
   * a DPH by z toho vyšla nezmyselná.
   */
  it("sadzba zo zlomku na percentá", () => {
    expect(d.polozky[0].vat_rate).toBe(19);
    expect(
      mapujFsDoklad({ items: [{ vatRate: 0.23, quantity: 1, price: 1 }] }).polozky[0].vat_rate,
    ).toBe(23);
    expect(
      mapujFsDoklad({ items: [{ vatRate: 0.05, quantity: 1, price: 1 }] }).polozky[0].vat_rate,
    ).toBe(5);
    expect(
      mapujFsDoklad({ items: [{ vatRate: 0, quantity: 1, price: 1 }] }).polozky[0].vat_rate,
    ).toBe(0);
    // Keby raz začali posielať percentá, nesmie sa to znásobiť druhýkrát.
    expect(
      mapujFsDoklad({ items: [{ vatRate: 19, quantity: 1, price: 1 }] }).polozky[0].vat_rate,
    ).toBe(19);
  });

  /* Doklad nesie cenu za celý riadok; jednotková sa musí dopočítať. */
  it("položky vrátane jednotkovej ceny", () => {
    expect(d.polozky).toHaveLength(3);
    expect(d.polozky[0]).toEqual({
      name: "Mlieko plnotučné 1l",
      quantity: 2,
      unit_price: 1.29,
      vat_rate: 19,
      total: 2.58,
    });
  });

  it("DPH sa spočíta cez všetky sadzby", () => {
    const viac = mapujFsDoklad({
      ...odpoved,
      vatAmountBasic: 1.27,
      vatAmountReduced: 0.4,
      items: [],
    });
    expect(viac.dph).toBe(1.67);
  });

  it("chýbajúce polia doklad nezrušia", () => {
    const chudobny = mapujFsDoklad({ receiptNumber: "1" });
    expect(chudobny.cisloDokladu).toBe("1");
    expect(chudobny.polozky).toEqual([]);
    expect(chudobny.suma).toBeUndefined();
  });
});

/*
 * Skutočná odpoveď z Finančnej správy (bloček z 9. 8. 2026, 48,55 €).
 * Skrátená o položky, ale polia sú presne také, aké prišli — práve na nich sa
 * ukázalo, že `vatAmountBasic` je nula a `vatRateBasic` ostalo na dávno
 * neplatných 20 %, kým skutočný rozpis je vo `vatSummary`.
 */
describe("skutočný bloček z eKasy", () => {
  const odpoved = {
    receiptId: "O-E2B1BC957FA443C8B1BC957FA463C814",
    ico: "54527571",
    cashRegisterCode: "88821217136050090",
    issueDate: "09.08.2026 18:43:20",
    createDate: "09.08.2026 18:43:20",
    dic: "2121713605",
    icDph: "SK2121713605",
    okp: "9F15B272-9D27B6A5-8B02B6A5-7D074910-6D7C27E2",
    receiptNumber: 8305,
    type: "PD",
    taxBaseBasic: 0,
    taxBaseReduced: 0,
    totalPrice: 48.55,
    freeTaxAmount: 0,
    vatAmountBasic: 0,
    vatAmountReduced: 0,
    vatRateBasic: 20,
    vatRateReduced: 10,
    organization: {
      buildingNumber: null,
      country: "Slovensko",
      municipality: "Bratislava - mestská časť Staré Mesto",
      name: "Action Slovakia s.r.o.",
      postalCode: "81108",
      propertyRegistrationNumber: "2",
      streetName: "Karadžičova",
    },
    vatSummary: [
      { vatBase: 1.42, vatAmount: 0.07, vat: { vatRate: 5 } },
      { vatBase: 38.26, vatAmount: 8.8, vat: { vatRate: 23 } },
    ],
    items: [
      { name: "slamky 100ks papier", quantity: 1, vatRate: 23, price: 1.28 },
      { name: "detské náplasti 30ks", quantity: 1, vatRate: 5, price: 1.49 },
    ],
  };

  const d = mapujFsDoklad(odpoved);

  it("DPH sa berie z rozpisu, nie z nulových súhrnných polí", () => {
    expect(d.dph).toBe(8.87);
    expect(d.zaklad).toBe(39.68);
    // Doklad musí sedieť: základ + daň = celková suma.
    expect(Math.round((d.zaklad! + d.dph!) * 100) / 100).toBe(d.suma);
  });

  it("rozpis po sadzbách ostane celý", () => {
    expect(d.sadzby).toEqual([
      { sadzba: 5, zaklad: 1.42, dph: 0.07 },
      { sadzba: 23, zaklad: 38.26, dph: 8.8 },
    ]);
  });

  it("slovenský dátum s časom", () => {
    expect(d.datum).toBe("2026-08-09");
  });

  it("číslo dokladu chodí ako číslo", () => {
    expect(d.cisloDokladu).toBe("8305");
  });

  it("spôsob úhrady doklad nenesie", () => {
    expect(d.uhrada).toBeUndefined();
  });
});

describe("spôsob úhrady z dokladu", () => {
  it("hotovosť aj karta podľa kódu alebo popisu", () => {
    expect(
      sposobUhrady([{ sum: 10, paymentType: { code: "CASH", paymentType: "Hotovosť" } }]),
    ).toBe("hotovost");
    expect(sposobUhrady([{ sum: 10, paymentType: { code: "CARD", paymentType: "Karta" } }])).toBe(
      "karta",
    );
    expect(
      sposobUhrady([{ sum: 10, paymentType: { code: "X", paymentType: "Platobná karta" } }]),
    ).toBe("karta");
  });

  it("pri delenej platbe rozhoduje vyššia suma", () => {
    expect(
      sposobUhrady([
        { sum: 5, paymentType: { code: "CASH", paymentType: "Hotovosť" } },
        { sum: 40, paymentType: { code: "CARD", paymentType: "Karta" } },
      ]),
    ).toBe("karta");
  });

  it("keď doklad úhradu nenesie, nič sa nehádá", () => {
    expect(sposobUhrady(undefined)).toBeUndefined();
    expect(sposobUhrady([])).toBeUndefined();
    expect(sposobUhrady([{ sum: 1, paymentType: { code: "UNKNOWN" } }])).toBeUndefined();
  });
});

describe("čítanie odpovede modelu", () => {
  /*
   * Model rád zabalí JSON do bloku so spätnými apostrofmi aj vtedy, keď sa v
   * zadaní píše, že to robiť nemá. `JSON.parse` na tom spadol, chyba sa
   * spolkla a stránka ukázala samé pomlčky.
   */
  it("JSON v bloku so spätnými apostrofmi", () => {
    expect(odpovedNaJson('```json\n{"total": 7.96}\n```')).toEqual({ total: 7.96 });
    expect(odpovedNaJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("JSON s vetou navyše", () => {
    expect(odpovedNaJson('Tu sú údaje z dokladu: {"total": 3} Dúfam, že pomohlo.')).toEqual({
      total: 3,
    });
  });

  it("čistý JSON aj pole", () => {
    expect(odpovedNaJson('{"a":1}')).toEqual({ a: 1 });
    expect(odpovedNaJson("[1,2]")).toEqual([1, 2]);
  });

  it("nezmysel vráti null, nie prázdny objekt", () => {
    expect(odpovedNaJson("prepáčte, nerozumiem")).toBeNull();
    expect(odpovedNaJson("")).toBeNull();
    expect(odpovedNaJson(null)).toBeNull();
    // Číslo nie je doklad.
    expect(odpovedNaJson("42")).toBeNull();
  });
});
