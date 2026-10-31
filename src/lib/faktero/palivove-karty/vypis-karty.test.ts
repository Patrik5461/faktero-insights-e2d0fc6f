import { describe, expect, it } from "vitest";
import { citajCsv } from "../import-prijatych";
import { duplicitneBlocky, prijataZFaktury } from "./spracovanie";
import {
  cislo,
  datumACas,
  casZBunky,
  jeMapovanieIste,
  kodKrajiny,
  naTransakcie,
  normalizujRiadok,
  odtlacky,
  rozdielSuctu,
  rozpoznajStlpce,
  sucty,
  tabulkaNaRiadky,
  zAiOdpovede,
} from "./vypis-karty";

const K = { krajinaFirmy: "SK", mena: "EUR" };

const CSV_UP = [
  "Up Slovensko – výpis transakcií za október 2026",
  "",
  "Dátum;Čas;Číslo karty;EČV;Čerpacia stanica;Krajina;Produkt;Množstvo (l);Jedn. cena s DPH;Základ DPH;DPH;Sadzba DPH;Suma s DPH;Stav km;Číslo faktúry",
  "02.10.2026;07:41;7083 6100 1234 5678;BA-123AB;Shell Bratislava Galvaniho;SK;Premiová nafta;66,84;1,714;93,15;21,42;23 %;114,57;123 456;4226035034",
  "02.10.2026;07:41;7083 6100 1234 5678;BA-123AB;Shell Bratislava Galvaniho;SK;Zľava DIFP - 0.018 Eur / l;66,84;;-0,98;-0,22;23 %;-1,20;;4226035034",
  "15.10.2026;18:02;7083 6100 1234 5678;BA-123AB;Shell Wien Süd;Rakúsko;Diesel;50,00;1,800;75,00;15,00;20 %;90,00;124 010;4226035034",
  "Spolu;;;;;;;;;;;;203,37;;",
].join("\r\n");

describe("čísla a dátumy", () => {
  it("slovenské, české aj anglické zápisy čísel", () => {
    expect(cislo("1 234,56")).toBe(1234.56);
    expect(cislo("1 234,56 €")).toBe(1234.56);
    expect(cislo("1.234,56")).toBe(1234.56);
    expect(cislo("1,234.56")).toBe(1234.56);
    expect(cislo("1,714")).toBe(1.714);
    expect(cislo("1.714")).toBe(1.714);
    expect(cislo("-12,50")).toBe(-12.5);
    expect(cislo("12,50-")).toBe(-12.5);
    expect(cislo("(12,50)")).toBe(-12.5);
    expect(cislo("23 %")).toBe(23);
    expect(cislo("")).toBeNull();
    expect(cislo("abc")).toBeNull();
    expect(cislo(42)).toBe(42);
  });

  it("dátumy v rôznych tvaroch, aj s časom a z Excelu", () => {
    expect(datumACas("31.10.2026").datum).toBe("2026-10-31");
    expect(datumACas("31. 10. 2026 14:35")).toEqual({ datum: "2026-10-31", cas: "14:35" });
    expect(datumACas("2026-10-31T07:05:00").cas).toBe("07:05");
    expect(datumACas("1.2.26").datum).toBe("2026-02-01");
    expect(datumACas("10/31/2026").datum).toBe("2026-10-31");
    expect(datumACas("31.02.2026").datum).toBeNull();
    expect(datumACas(46326).datum).toBe("2026-10-31");
    expect(datumACas(46326.5)).toEqual({ datum: "2026-10-31", cas: "12:00" });
    expect(casZBunky(0.75)).toBe("18:00");
    expect(casZBunky("7:05:33")).toBe("07:05");
  });

  it("krajiny", () => {
    expect(kodKrajiny("Rakúsko")).toBe("AT");
    expect(kodKrajiny("SVK")).toBe("SK");
    expect(kodKrajiny("cz")).toBe("CZ");
    expect(kodKrajiny("Neznámo")).toBeNull();
  });
});

describe("rozpoznanie stĺpcov", () => {
  it("SK hlavička výpisu", () => {
    const m = rozpoznajStlpce([
      "Dátum",
      "Čas",
      "Číslo karty",
      "EČV",
      "Čerpacia stanica",
      "Produkt",
      "Množstvo (l)",
      "Suma bez DPH",
      "DPH",
      "Sadzba DPH (%)",
      "Suma s DPH (EUR)",
      "Stav tachometra",
      "Číslo faktúry",
    ]);
    expect(m).toMatchObject({
      datum: 0,
      cas: 1,
      karta: 2,
      spz: 3,
      stanica: 4,
      produkt: 5,
      mnozstvo: 6,
      zaklad: 7,
      dph: 8,
      sadzba: 9,
      spolu: 10,
      tachometer: 11,
      faktura: 12,
    });
    expect(jeMapovanieIste(m)).toBe(true);
  });

  it("CZ a EN názvy", () => {
    expect(
      rozpoznajStlpce([
        "Datum transakce",
        "Registrační značka",
        "Zboží",
        "Množství",
        "Částka s DPH",
        "Sazba",
      ]),
    ).toMatchObject({ datum: 0, spz: 1, produkt: 2, mnozstvo: 3, spolu: 4, sadzba: 5 });
    expect(
      rozpoznajStlpce([
        "Transaction date",
        "Card number",
        "Product",
        "Quantity",
        "Net amount",
        "VAT",
        "Gross amount",
        "Odometer",
        "Invoice number",
      ]),
    ).toMatchObject({
      datum: 0,
      karta: 1,
      produkt: 2,
      mnozstvo: 3,
      zaklad: 4,
      dph: 5,
      spolu: 6,
      tachometer: 7,
      faktura: 8,
    });
  });

  it("„Dátum a čas“ je dátum, nie čas", () => {
    const m = rozpoznajStlpce(["Dátum a čas transakcie", "Produkt", "Suma"]);
    expect(m.datum).toBe(0);
    expect(m.cas).toBeUndefined();
  });

  it("neisté mapovanie — chýba suma", () => {
    expect(jeMapovanieIste(rozpoznajStlpce(["Dátum", "Produkt", "Niečo"]))).toBe(false);
  });
});

describe("tabuľka výpisu", () => {
  const v = tabulkaNaRiadky(citajCsv(CSV_UP), K);

  it("nájde hlavičku pod nadpisom, načíta riadky a súčet výpisu", () => {
    expect(v.hlavickaIndex).toBe(1);
    expect(v.iste).toBe(true);
    expect(v.riadky).toHaveLength(3);
    expect(v.sucetVypisu).toBe(203.37);
    expect(v.preskocene).toEqual([]);
  });

  it("riadok s palivom, kartou, tachometrom a faktúrou", () => {
    const r = v.riadky[0];
    expect(r).toMatchObject({
      datum: "2026-10-02",
      karta: "…345678",
      spz: "BA-123AB",
      jePalivo: true,
      mnozstvo: 66.84,
      zaklad: 93.15,
      dph: 21.42,
      sadzbaDph: 23,
      spolu: 114.57,
      krajina: "SK",
      tachometerKm: 123456,
      fakturaCislo: "4226035034",
      dobropis: false,
    });
    expect(r.cas).toBe("2026-10-02T07:41:00+02:00");
  });

  it("zľava je záporný riadok, nie palivo a nie dobropis", () => {
    expect(v.riadky[1]).toMatchObject({ jePalivo: false, spolu: -1.2, dobropis: false });
  });

  it("súčty a rozdiel voči faktúre", () => {
    const s = sucty(v.riadky);
    expect(s.spolu).toBe(203.37);
    expect(s.litre).toBe(116.84);
    expect(s.podlaFaktur).toEqual([{ cislo: "4226035034", riadkov: 3, spolu: 203.37 }]);
    expect(rozdielSuctu(205.37, s.spolu)).toBe(2);
    expect(rozdielSuctu(null, s.spolu)).toBeNull();
  });

  it("ručné mapovanie prebije rozpoznané", () => {
    const t = [
      ["A", "B", "C"],
      ["01.10.2026", "Nafta", "50,00"],
    ];
    const auto = tabulkaNaRiadky(t, K);
    expect(auto.iste).toBe(false);
    const rucne = tabulkaNaRiadky(t, K, {
      hlavickaIndex: 0,
      mapovanie: { datum: 0, produkt: 1, spolu: 2 },
    });
    expect(rucne.riadky).toHaveLength(1);
    expect(rucne.riadky[0]).toMatchObject({
      spolu: 50,
      zaklad: 40.65,
      dph: 9.35,
      sadzbaDph: 23,
      odhadDph: true,
    });
  });
});

describe("dopočet súm", () => {
  it("zo základu a sadzby", () => {
    const n = normalizujRiadok(
      { datum: "2026-10-01", produkt: "Nafta", zaklad: "100", sadzba: "23" },
      K,
    );
    expect(n.ok && n.riadok).toMatchObject({ zaklad: 100, dph: 23, spolu: 123, odhadDph: false });
  });
  it("zahraničie bez sadzby — celá suma je náklad", () => {
    const n = normalizujRiadok(
      { datum: "2026-10-01", produkt: "Diesel", spolu: "90", krajina: "AT" },
      K,
    );
    expect(n.ok && n.riadok).toMatchObject({ zaklad: 90, dph: 0, krajinaDph: "AT" });
  });
  it("riadok bez dátumu alebo sumy sa preskočí", () => {
    expect(normalizujRiadok({ produkt: "Nafta", spolu: 10 }, K)).toEqual({
      ok: false,
      dovod: "bez dátumu",
    });
    expect(normalizujRiadok({ datum: "1.10.2026", produkt: "Nafta" }, K)).toEqual({
      ok: false,
      dovod: "bez sumy",
    });
  });
  it("vrátenie paliva je dobropis", () => {
    const n = normalizujRiadok({ datum: "1.10.2026", produkt: "Nafta", spolu: "-50" }, K);
    expect(n.ok && n.riadok.dobropis).toBe(true);
  });
  it("karta bez čísla — ŠPZ ako náhradný kľúč väzby", () => {
    const n = normalizujRiadok(
      { datum: "1.10.2026", produkt: "Nafta", spolu: "50", spz: "ba 123 ab" },
      K,
    );
    expect(n.ok && n.riadok.karta).toBe("EČV BA123AB");
  });
});

describe("odtlačky a duplicity", () => {
  const v = tabulkaNaRiadky(citajCsv(CSV_UP), K);

  it("opakované nahratie dá tie isté odtlačky", () => {
    const znova = tabulkaNaRiadky(citajCsv(CSV_UP), K);
    expect(odtlacky(znova.riadky)).toEqual(odtlacky(v.riadky));
    expect(new Set(odtlacky(v.riadky)).size).toBe(3);
  });

  it("dva rovnaké nákupy v jednom výpise sa nezlejú", () => {
    const id = odtlacky([v.riadky[0], v.riadky[0]]);
    expect(id[0]).not.toBe(id[1]);
    expect(id[1]).toBe(`${id[0]}-2`);
  });

  it("číslo transakcie spojí riadky jedného nákupu", () => {
    const a = { ...v.riadky[0], transakciaId: "T1" };
    const b = { ...v.riadky[1], transakciaId: "T1" };
    const tx = naTransakcie([a, b]);
    expect(tx[0].nakupId).toBe(tx[1].nakupId);
    expect(tx[0].externeId).not.toBe(tx[1].externeId);
  });

  it("bloček z pumpy s rovnakým dňom a sumou sa nájde", () => {
    const tx = naTransakcie(v.riadky);
    const z = duplicitneBlocky(tx, [{ id: "b1", issue_date: "2026-10-15", total_amount: 90 }]);
    expect(z.get(tx[2].externeId)).toBe("b1");
  });
});

describe("prijatá faktúra z výpisu", () => {
  it("zahraničná DPH ide do nákladu, rozdiel dorovná riadok", () => {
    const tx = naTransakcie(tabulkaNaRiadky(citajCsv(CSV_UP), K).riadky).map((t) => ({
      ...t,
      vehicle_id: "v1",
    }));
    const n = prijataZFaktury(
      {
        externeId: "4226035034",
        cislo: "4226035034",
        datum: "2026-10-16",
        splatnost: "2026-10-23",
        dodavatel: { nazov: "Up Déjeuner, s. r. o.", krajina: "SK" },
        mena: "EUR",
        zaklad: 0,
        dph: 21.2,
        spolu: 205.37,
        typ: null,
        dobropis: false,
        zahranicna: false,
      },
      tx,
      {
        companyId: "c1",
        krajinaFirmy: "SK",
        poskytovatel: "up",
        dodavatelIco: "53528654",
        vozidla: [{ id: "v1", license_plate: "BA123AB" }],
        dnes: "2026-10-31",
      },
    );
    expect(n.riadok.amount_total).toBe(205.37);
    expect(n.riadok.supplier_ico).toBe("53528654");
    expect(n.riadok.vehicle_id).toBe("v1");
    const items = n.riadok.items as any[];
    expect(items).toHaveLength(4);
    expect(items[2]).toMatchObject({ vat_rate: 0, total: 90 });
    expect(String(n.riadok.note)).toContain("Up");
  });
});

describe("odpoveď AI z PDF", () => {
  it("hlavička aj riadky", () => {
    const o = zAiOdpovede({
      faktura: { cislo: "4226035034", datum: "02.10.2026", spolu: "486,08", mena: "eur" },
      riadky: [{ datum: "2026-10-01", produkt: "Nafta", spolu: 50, nezname: 1 }, null],
    });
    expect(o.faktura).toMatchObject({
      cislo: "4226035034",
      datum: "2026-10-02",
      spolu: 486.08,
      mena: "EUR",
    });
    expect(o.riadky).toEqual([{ datum: "2026-10-01", produkt: "Nafta", spolu: 50 }]);
  });
});
