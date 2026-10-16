import { describe, expect, it } from "vitest";
import {
  rozpoznajPoplatokKontokorentu,
  sparujPoplatkyKontokorentu,
  stavRamca,
  suctyPoplatkov,
  uctPodlaIban,
  type KontokorentNaSparovanie,
  type PohybNaUcte,
} from "./kontokorent";

/**
 * Kontokorent nemá splátky — páruje sa k nemu to, čo banka sama strhne. Testy
 * strážia hlavne to, aby sa k nemu nedostala splátka úveru ani obyčajný
 * poplatok za vedenie účtu.
 */

const pohyb = (o: Partial<PohybNaUcte> = {}): PohybNaUcte => ({
  id: "t1",
  bank_account_id: "ucet-1",
  booking_date: "2026-09-30",
  amount: -42.17,
  currency: "EUR",
  variable_symbol: null,
  counterparty: null,
  description: "Úrok z kontokorentu 09/2026",
  ...o,
});

const kk = (o: Partial<KontokorentNaSparovanie> = {}): KontokorentNaSparovanie => ({
  id: "kk-1",
  name: "Kontokorent SLSP",
  bank_account_id: "ucet-1",
  currency: "EUR",
  status: "active",
  ...o,
});

describe("rozpoznajPoplatokKontokorentu", () => {
  it.each([
    "Úrok z kontokorentu",
    "UROKY DEBETNE",
    "Debetný úrok za 09/2026",
    "Úrok z povoleného prečerpania",
    "úrok z debetu",
    "Kontokorentní úvěr - úrok",
    "Debetní úrok",
    "Úroky z kontokorentního úvěru",
  ])("„%s“ je istý úrok z kontokorentu", (popis) => {
    expect(rozpoznajPoplatokKontokorentu({ description: popis })).toEqual({
      druh: "urok",
      isty: true,
    });
  });

  it.each([
    "Poplatok za úverový rámec",
    "Poplatok za poskytnutie rámca",
    "Záväzková provízia z nevyčerpaného úveru",
    "Poplatek za úvěrový rámec",
  ])("„%s“ je istý poplatok z kontokorentu", (popis) => {
    expect(rozpoznajPoplatokKontokorentu({ description: popis })).toEqual({
      druh: "poplatok",
      isty: true,
    });
  });

  it.each([
    "Poplatok za vedenie účtu",
    "Mesačný poplatok v rámci balíka",
    "Splátka úveru 08/2026",
    "UZF 2481047",
    "Daň z úroku",
    "Poplatok za debetnú kartu",
    "Úrok z úveru",
    "Splátka leasingu",
  ])("„%s“ s kontokorentom nemá nič", (popis) => {
    expect(rozpoznajPoplatokKontokorentu({ description: popis })).toBeNull();
  });

  it("holý úrok je len návrh — môže byť aj z iného úveru", () => {
    expect(rozpoznajPoplatokKontokorentu({ description: "ÚROKY" })).toEqual({
      druh: "urok",
      isty: false,
    });
  });
});

describe("sparujPoplatkyKontokorentu", () => {
  it("úrok z kontokorentu na účte s rámcom spáruje automaticky", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu([pohyb()], [kk()]);
    expect(navrhy).toEqual([]);
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({
      transactionId: "t1",
      contractId: "kk-1",
      druh: "urok",
      suma: 42.17,
      datum: "2026-09-30",
      istota: "auto",
    });
  });

  it("poplatok za rámec spáruje ako poplatok", () => {
    const { auto } = sparujPoplatkyKontokorentu(
      [pohyb({ description: "Poplatok za úverový rámec", amount: -15 })],
      [kk()],
    );
    expect(auto[0]?.druh).toBe("poplatok");
  });

  it("splátku úveru nespáruje, ani keď v nej je slovo úrok", () => {
    const pohyby = [
      pohyb({ id: "a", description: "Splátka úveru", variable_symbol: "2481047", amount: -399.99 }),
      // Úrok zo splátkového úveru s jeho symbolom — patrí do kalendára úveru.
      pohyb({ id: "b", description: "Debetný úrok", variable_symbol: "2481047", amount: -12 }),
    ];
    const { auto, navrhy } = sparujPoplatkyKontokorentu(pohyby, [kk()], ["2481047"]);
    expect(auto).toEqual([]);
    expect(navrhy).toEqual([]);
  });

  it("poplatok za vedenie účtu na účte s kontokorentom nespáruje", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu(
      [pohyb({ description: "Poplatok za vedenie účtu", amount: -9.9 })],
      [kk()],
    );
    expect(auto).toEqual([]);
    expect(navrhy).toEqual([]);
  });

  it("firma bez kontokorentu: ani debetný úrok sa nikam nepriradí", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu([pohyb()], []);
    expect(auto).toEqual([]);
    expect(navrhy).toEqual([]);
  });

  it("úrok z iného účtu, než na ktorom je rámec, nespáruje", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu(
      [pohyb({ bank_account_id: "ucet-2" })],
      [kk()],
    );
    expect(auto).toEqual([]);
    expect(navrhy).toEqual([]);
  });

  it("prichádzajúci úrok (kreditný) nie je náklad kontokorentu", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu([pohyb({ amount: 3.2 })], [kk()]);
    expect(auto).toEqual([]);
    expect(navrhy).toEqual([]);
  });

  it("holé „Úroky“ ponúkne len ako návrh", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu([pohyb({ description: "Úroky" })], [kk()]);
    expect(auto).toEqual([]);
    expect(navrhy).toHaveLength(1);
    expect(navrhy[0]?.istota).toBe("navrh");
  });

  it("dve zmluvy na tom istom účte nerozhoduje za človeka", () => {
    const { auto, navrhy } = sparujPoplatkyKontokorentu(
      [pohyb()],
      [kk(), kk({ id: "kk-2", name: "Druhý rámec" })],
    );
    expect(auto).toEqual([]);
    expect(navrhy.map((n) => n.contractId).sort()).toEqual(["kk-1", "kk-2"]);
  });

  it("ukončená zmluva sa nepáruje", () => {
    const { auto } = sparujPoplatkyKontokorentu([pohyb()], [kk({ status: "closed" })]);
    expect(auto).toEqual([]);
  });
});

describe("stavRamca", () => {
  it("čerpanie je mínus na účte, voľný rámec zvyšok limitu", () => {
    expect(stavRamca(10000, { balance: 6000, booked_balance: -4000 })).toEqual({
      znamy: true,
      zostatok: -4000,
      cerpanie: 4000,
      volny: 6000,
      zdroj: "zauctovany",
    });
  });

  it("kladný zostatok = nič sa nečerpá", () => {
    const s = stavRamca(10000, { balance: 1500, booked_balance: 1500 });
    expect(s).toMatchObject({ cerpanie: 0, volny: 10000 });
  });

  it("bez účtu alebo zostatku nevie nič", () => {
    expect(stavRamca(10000, null)).toEqual({ znamy: false });
    expect(stavRamca(10000, { balance: null, booked_balance: null })).toEqual({ znamy: false });
  });

  it("bez zaúčtovaného berie disponibilný a povie to", () => {
    expect(stavRamca(10000, { balance: -200, booked_balance: null })).toMatchObject({
      cerpanie: 200,
      zdroj: "disponibilny",
    });
  });
});

describe("uctPodlaIban", () => {
  const ucty = [
    { id: "a", iban: "SK31 1200 0000 1987 4263 7541" },
    { id: "b", iban: "SK2075000000004034449488" },
  ];
  it("nájde účet bez ohľadu na medzery a veľkosť písmen", () => {
    expect(uctPodlaIban("sk3112000000198742637541", ucty)?.id).toBe("a");
  });
  it("neznámy alebo neplatný IBAN nepriradí nič", () => {
    expect(uctPodlaIban("SK0000000000000000000000", ucty)).toBeNull();
    expect(uctPodlaIban("12345/0900", ucty)).toBeNull();
  });
});

describe("suctyPoplatkov", () => {
  it("úroky a poplatky drží oddelene", () => {
    expect(
      suctyPoplatkov([
        { kind: "urok", amount: 10.1 },
        { kind: "urok", amount: "5.2" },
        { kind: "poplatok", amount: 15 },
      ]),
    ).toEqual({ uroky: 15.3, poplatky: 15 });
  });
});
