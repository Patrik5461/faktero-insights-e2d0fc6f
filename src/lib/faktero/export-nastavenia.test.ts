import { describe, expect, it } from "vitest";
import {
  PREDVOLENE_BANKY,
  PREDVOLENE_EXPORTU,
  datumyPrijateho,
  internaPoznamka,
  jePlatbaKartou,
  lenOdDatumu,
  nastaveniaBanky,
  nastaveniaExportu,
  nazovPolozkyOdpoctu,
  platbaSedi,
  upozornenieOdpoctu,
} from "./export-nastavenia";
import { polozkyOdpoctu } from "./zalohy-odpocty";
import { pripravPlatby, textPrijemcu, zostavPain001 } from "./hromadny-prikaz";
import { sparujDoklady } from "./doklad-parovanie";

describe("nastavenia exportu — načítanie", () => {
  it("bez nastavení a s nezmyslami sú predvolené (dnešné správanie)", () => {
    expect(nastaveniaExportu(null)).toEqual(PREDVOLENE_EXPORTU);
    expect(nastaveniaExportu({})).toEqual(PREDVOLENE_EXPORTU);
    expect(nastaveniaExportu({ export: { datumZapisu: "vcera", polozkyZRozpisu: "ano" } })).toEqual(
      PREDVOLENE_EXPORTU,
    );
    expect(PREDVOLENE_EXPORTU).toMatchObject({
      datumZapisu: "vyhotovenie",
      datumOdpoctu: "dodanie",
      partneri: "nepridavat",
      dokladKPlatbe: "interne",
      polozkyZRozpisu: false,
    });
  });

  it("číta kľúč export z celého JSON-u aj priamo", () => {
    const n = nastaveniaExportu({ nespracovane: { x: 1 }, export: { datumZapisu: "dorucenie" } });
    expect(n.datumZapisu).toBe("dorucenie");
    expect(nastaveniaExportu({ datumOdpoctu: "neskorsi" }).datumOdpoctu).toBe("neskorsi");
  });

  it("nastavenia banky — predvolené a dátumy", () => {
    expect(nastaveniaBanky(undefined)).toEqual(PREDVOLENE_BANKY);
    const n = nastaveniaBanky({
      banka: {
        ignorovatTypPlatby: false,
        synchronizovatOd: "2026-01-01",
        autoParovanieOd: "zly",
        textPrijemcu: "vs",
      },
    });
    expect(n).toEqual({
      ignorovatTypPlatby: false,
      synchronizovatOd: "2026-01-01",
      autoParovanieOd: null,
      textPrijemcu: "vs",
    });
  });
});

describe("dátum zápisu a odpočtu", () => {
  const d = {
    vystavenie: "2026-09-28",
    dodanie: "2026-09-25",
    dorucenie: "2026-10-03",
    zauctovanie: "2026-10-01",
  };
  it("predvolené: zápis = vystavenie, odpočet = dodanie", () => {
    expect(datumyPrijateho(d, PREDVOLENE_EXPORTU)).toEqual({
      zapis: "2026-09-28",
      odpocet: "2026-09-25",
    });
  });
  it("bez dodania je odpočet vystavenie (ako doteraz)", () => {
    expect(datumyPrijateho({ ...d, dodanie: null }, PREDVOLENE_EXPORTU).odpocet).toBe("2026-09-28");
  });
  it("doručenie, zaúčtovanie a neskorší z dodania a doručenia", () => {
    expect(datumyPrijateho(d, { datumZapisu: "dorucenie", datumOdpoctu: "dorucenie" })).toEqual({
      zapis: "2026-10-03",
      odpocet: "2026-10-03",
    });
    expect(datumyPrijateho(d, { datumZapisu: "dodanie", datumOdpoctu: "zauctovanie" })).toEqual({
      zapis: "2026-09-25",
      odpocet: "2026-10-01",
    });
    expect(
      datumyPrijateho(d, { datumZapisu: "vyhotovenie", datumOdpoctu: "neskorsi" }).odpocet,
    ).toBe("2026-10-03");
    // Faktúra prišla skôr než dodanie (zálohová, predfaktúra) — rozhoduje dodanie.
    expect(
      datumyPrijateho(
        { ...d, dorucenie: "2026-09-20" },
        { datumZapisu: "vyhotovenie", datumOdpoctu: "neskorsi" },
      ).odpocet,
    ).toBe("2026-09-25");
    // Bez dátumu zaúčtovania sa odpočet zhoduje so zápisom.
    expect(
      datumyPrijateho(
        { ...d, zauctovanie: null },
        { datumZapisu: "dorucenie", datumOdpoctu: "zauctovanie" },
      ).odpocet,
    ).toBe("2026-10-03");
  });
  it("nápoveda k zákonu pri dodaní a zaúčtovaní, nie pri doručení", () => {
    expect(upozornenieOdpoctu({ datumOdpoctu: "dodanie", datumZapisu: "vyhotovenie" })).toMatch(
      /doručenia/,
    );
    expect(upozornenieOdpoctu({ datumOdpoctu: "zauctovanie", datumZapisu: "vyhotovenie" })).toMatch(
      /skorší/,
    );
    expect(
      upozornenieOdpoctu({ datumOdpoctu: "dorucenie", datumZapisu: "vyhotovenie" }),
    ).toBeNull();
    expect(upozornenieOdpoctu({ datumOdpoctu: "neskorsi", datumZapisu: "vyhotovenie" })).toBeNull();
  });
});

describe("texty a poznámky", () => {
  const d = {
    int_poznamka: " interná ",
    note: "poznámka",
    supplier_name: "Dodávateľ s.r.o.",
    document_number: "F12",
  };
  it("interná poznámka podľa formátu", () => {
    expect(internaPoznamka(d, "interna")).toBe("interná");
    expect(internaPoznamka(d, "poznamka")).toBe("poznámka");
    expect(internaPoznamka(d, "interna_poznamka")).toBe("interná · poznámka");
    expect(internaPoznamka(d, "dodavatel_cislo")).toBe("Dodávateľ s.r.o. č. F12");
  });
  it("názov položky odpočtu zálohy", () => {
    expect(nazovPolozkyOdpoctu("Odpočet zálohy DD1", 23, "doklad")).toBe("Odpočet zálohy DD1");
    expect(nazovPolozkyOdpoctu("Odpočet zálohy DD1", 23, "sadzba")).toBe("Odpočet zálohy 23 %");
    expect(nazovPolozkyOdpoctu("Odpočet zálohy DD1", 5, "doklad_sadzba")).toBe(
      "Odpočet zálohy DD1 5 %",
    );
  });
  it("položky odpočtu: predvolený názov sa nemení, zvolený sa použije", () => {
    const o = [
      { zaloha: "ZF1", doklad: "DD1", suma: 123, riadky: [{ sadzba: 23, zaklad: 100, dph: 23 }] },
    ] as any;
    expect(polozkyOdpoctu(o)[0].name).toBe("Odpočet zálohy DD1 (k ZF1)");
    expect(polozkyOdpoctu(o, (t, s) => nazovPolozkyOdpoctu(t, s, "sadzba"))[0].name).toBe(
      "Odpočet zálohy 23 %",
    );
  });
});

describe("banka — dátumy a typ platby", () => {
  it("pohyby od dátumu vrátane; bez dátumu všetky", () => {
    const r = [
      { booking_date: "2026-01-01" },
      { booking_date: "2025-12-31" },
      { booking_date: "2026-02-01" },
    ];
    expect(lenOdDatumu(r, null)).toHaveLength(3);
    expect(lenOdDatumu(r, "2026-01-01").map((x) => x.booking_date)).toEqual([
      "2026-01-01",
      "2026-02-01",
    ]);
  });
  it("platba kartou z textu pohybu", () => {
    expect(jePlatbaKartou({ description: "Platba kartou SHELL 0123" })).toBe(true);
    expect(jePlatbaKartou({ description: "POS Tesco" })).toBe(true);
    expect(jePlatbaKartou({ description: "Nakup **** 1234" })).toBe(true);
    expect(
      jePlatbaKartou({ description: "Úhrada faktúry 2026001", counterparty: "Dodávateľ s.r.o." }),
    ).toBe(false);
  });
  it("typ platby — predvolene ignorovaný, inak karta len s kartou", () => {
    const karta = { description: "Platba kartou OMV" };
    const prevod = { description: "SEPA prevod" };
    expect(platbaSedi("karta", prevod, true)).toBe(true);
    expect(platbaSedi("karta", prevod, false)).toBe(false);
    expect(platbaSedi("karta", karta, false)).toBe(true);
    expect(platbaSedi("prevod", karta, false)).toBe(false);
    expect(platbaSedi(null, karta, false)).toBe(true);
  });
  it("párovanie bločkov rešpektuje voľbu", () => {
    const pohyb = {
      id: "t1",
      booking_date: "2026-10-02",
      amount: -12.5,
      currency: "EUR",
      variable_symbol: null,
      counterparty: "OMV Slovensko",
      description: "SEPA prevod OMV",
    };
    const blocek = {
      id: "e1",
      supplier_name: "OMV Slovensko",
      document_number: null,
      issue_date: "2026-10-01",
      total_amount: 12.5,
      currency: "EUR",
      payment_method: "karta",
    };
    expect(sparujDoklady([pohyb], [blocek])).toHaveLength(1);
    expect(sparujDoklady([pohyb], [blocek], true)).toHaveLength(1);
    expect(sparujDoklady([pohyb], [blocek], false)).toHaveLength(0);
    expect(
      sparujDoklady([{ ...pohyb, description: "Platba kartou OMV" }], [blocek], false),
    ).toHaveLength(1);
  });
});

describe("hromadný príkaz — text pre príjemcu", () => {
  const f = {
    id: "p1",
    invoice_number: "FA-118",
    supplier_name: "Dodávateľ",
    supplier_iban: "SK3112000000198742637541",
    amount_total: 100,
    currency: "EUR",
    due_date: "2026-10-30",
    status: "received",
    variable_symbol: "2026118",
    note: "Nájom október",
  };
  const n = {
    platitel: { meno: "Firma", iban: "SK3112000000198742637541" },
    datum: "2026-10-28",
    podlaSplatnosti: false,
    vytvorene: new Date("2026-10-28T10:00:00Z"),
  };
  it("predvolene „Faktura <číslo>“ — ako doteraz", () => {
    const { platby } = pripravPlatby([f]);
    expect(zostavPain001(platby, n)).toContain("<Ustrd>Faktura FA-118</Ustrd>");
  });
  it("zvolený text: číslo, VS, poznámka (bez nej predvolený)", () => {
    const { platby } = pripravPlatby([f]);
    expect(zostavPain001(platby, { ...n, textPrijemcu: "len_cislo" })).toContain(
      "<Ustrd>FA-118</Ustrd>",
    );
    expect(zostavPain001(platby, { ...n, textPrijemcu: "vs" })).toContain(
      "<Ustrd>VS 2026118</Ustrd>",
    );
    expect(zostavPain001(platby, { ...n, textPrijemcu: "poznamka" })).toContain(
      "<Ustrd>Najom oktober</Ustrd>",
    );
    expect(textPrijemcu({ cisloFaktury: "X1", vs: "", poznamka: "" }, "poznamka")).toBe(
      "Faktura X1",
    );
    expect(textPrijemcu({ cisloFaktury: "X1", vs: "" }, "vs")).toBe("Faktura X1");
  });
});
