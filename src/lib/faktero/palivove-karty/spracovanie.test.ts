import { describe, expect, it } from "vitest";
import {
  casVBratislave,
  duplicitneBlocky,
  existujuceTankovanie,
  maskaKarty,
  normalizujSpz,
  prijataZFaktury,
  rozdelSumy,
  sadzbaZoSum,
  tankovanieZTransakcie,
  vozidloTransakcie,
  type TransakciaNaFakturu,
} from "./spracovanie";
import type { KartaFaktura } from "./typy";

const t = (o: Partial<TransakciaNaFakturu> = {}): TransakciaNaFakturu => ({
  externeId: "T1",
  nakupId: "N1",
  cas: "2026-10-01T14:35:10+02:00",
  datum: "2026-10-01",
  karta: "…890123",
  spz: "BA123AB",
  vodic: null,
  produkt: "Diesel",
  produktKod: "23",
  jePalivo: true,
  mnozstvo: 45.2,
  jednotka: "L",
  zaklad: 60.62,
  dph: 13.94,
  sadzbaDph: 23,
  spolu: 74.56,
  mena: "EUR",
  krajina: "SK",
  krajinaDph: "SK",
  miesto: "Shell Bratislava",
  tachometerKm: 123456,
  fakturaCislo: "900001234",
  fakturaDatum: "2026-10-15",
  dobropis: false,
  vehicle_id: "auto-1",
  ...o,
});

const F: KartaFaktura = {
  externeId: "555",
  cislo: "900001234",
  datum: "2026-10-15",
  splatnost: "2026-10-30",
  dodavatel: { nazov: "Shell Slovakia, s.r.o.", krajina: "SK" },
  mena: "EUR",
  zaklad: 60.62,
  dph: 13.94,
  spolu: 74.56,
  typ: "Original",
  dobropis: false,
  zahranicna: false,
};

const K = {
  companyId: "firma",
  krajinaFirmy: "SK",
  poskytovatel: "shell",
  dodavatelIco: "31 336 868",
  vozidla: [
    { id: "auto-1", name: "Octavia", license_plate: "BA-123AB", odpocet_dph: "100" },
    { id: "auto-2", name: "Superb", license_plate: "BA-999ZZ", odpocet_dph: "50" },
  ],
  dnes: "2026-10-31",
};

describe("sumy a identifikátory", () => {
  it("rozdelSumy nezávisí od poradia ani od názvu Gross/Net", () => {
    expect(rozdelSumy(60.62, 74.56, 13.94)).toEqual({ zaklad: 60.62, dph: 13.94, spolu: 74.56 });
    expect(rozdelSumy(74.56, 60.62, 13.94)).toEqual({ zaklad: 60.62, dph: 13.94, spolu: 74.56 });
    expect(rozdelSumy(-74.56, -60.62, -13.94)).toEqual({ zaklad: 60.62, dph: 13.94, spolu: 74.56 });
    expect(rozdelSumy(74.56, null, 13.94)).toEqual({ zaklad: 60.62, dph: 13.94, spolu: 74.56 });
    expect(rozdelSumy(10, 10, 0)).toEqual({ zaklad: 10, dph: 0, spolu: 10 });
  });

  it("maska karty a ŠPZ", () => {
    expect(maskaKarty("7002 0512 3456 7890 123")).toBe("…890123");
    expect(maskaKarty("12")).toBeNull();
    expect(normalizujSpz(" ba-123 ab ")).toBe("BA123AB");
  });

  it("čas v Bratislave rešpektuje letný aj zimný čas", () => {
    expect(casVBratislave("2026-07-01", "10:00:00")).toBe("2026-07-01T10:00:00+02:00");
    expect(casVBratislave("2026-12-01", "10:00:00")).toBe("2026-12-01T10:00:00+01:00");
  });

  it("sadzba zo súm sa prichytí k bežnej", () => {
    expect(sadzbaZoSum(100, 23)).toBe(23);
    expect(sadzbaZoSum(100, 19.1)).toBe(19);
    expect(sadzbaZoSum(100, 3)).toBeNull();
    expect(sadzbaZoSum(0, 0)).toBe(0);
  });
});

describe("vozidlo transakcie", () => {
  const vozidla = K.vozidla;
  it("ručná väzba karty má prednosť pred ŠPZ", () => {
    const vazby = new Map([["…890123", { karta: "…890123", vehicle_id: "auto-2", rucne: true }]]);
    expect(vozidloTransakcie(t(), vazby, vozidla)).toBe("auto-2");
  });
  it("bez väzby podľa ŠPZ z karty", () => {
    expect(vozidloTransakcie(t({ spz: "ba 123 ab" }), new Map(), vozidla)).toBe("auto-1");
  });
  it("karta zámerne bez vozidla sa nepáruje podľa ŠPZ", () => {
    const vazby = new Map([["…890123", { karta: "…890123", vehicle_id: null, rucne: true }]]);
    expect(vozidloTransakcie(t(), vazby, vozidla)).toBeNull();
  });
  it("dve autá s rovnakou ŠPZ → nič", () => {
    expect(
      vozidloTransakcie(t(), new Map(), [...vozidla, { id: "auto-3", license_plate: "BA123AB" }]),
    ).toBeNull();
  });
});

describe("tankovanie", () => {
  it("palivo v litroch s vozidlom → fuel_records s tachometrom", () => {
    const r = tankovanieZTransakcie(t(), {
      companyId: "firma",
      vehicleId: "auto-1",
      zdroj: "karta-shell",
    })!;
    expect(r).toMatchObject({
      vehicle_id: "auto-1",
      fuel_date: "2026-10-01",
      liters: 45.2,
      price_per_liter: 1.65,
      total_amount: 74.56,
      odometer_km: 123456,
      external_source: "karta-shell",
      external_id: "T1",
    });
    expect(JSON.stringify(r)).not.toMatch(/7002/);
  });
  it("bez vozidla, poplatok, kWh, dobropis → nič", () => {
    const o = { companyId: "firma", vehicleId: "auto-1", zdroj: "karta-shell" };
    expect(tankovanieZTransakcie(t(), { ...o, vehicleId: null })).toBeNull();
    expect(tankovanieZTransakcie(t({ jePalivo: false }), o)).toBeNull();
    expect(tankovanieZTransakcie(t({ jednotka: "KWH" }), o)).toBeNull();
    expect(tankovanieZTransakcie(t({ dobropis: true }), o)).toBeNull();
  });
  it("to isté tankovanie z GPS sa nezdvojí", () => {
    const zoznam = [
      {
        id: "gps",
        vehicle_id: "auto-1",
        fuel_date: "2026-10-01",
        liters: 45,
        external_source: "webfleet",
      },
    ];
    expect(
      existujuceTankovanie(
        {
          vehicle_id: "auto-1",
          fuel_date: "2026-10-01",
          liters: 45.2,
          external_source: "karta-shell",
        },
        zoznam,
      ),
    ).toBe("gps");
    expect(
      existujuceTankovanie(
        {
          vehicle_id: "auto-1",
          fuel_date: "2026-10-01",
          liters: 30,
          external_source: "karta-shell",
        },
        zoznam,
      ),
    ).toBeNull();
  });
});

describe("duplicitné bločky", () => {
  it("nákup s dvoma riadkami sa porovná s jedným bločkom", () => {
    const tx = [
      t({ externeId: "a", nakupId: "N1", spolu: 74.56 }),
      t({ externeId: "b", nakupId: "N1", spolu: 12.0, produkt: "AdBlue" }),
      t({ externeId: "c", nakupId: "N2", spolu: 50 }),
    ];
    const m = duplicitneBlocky(tx, [
      { id: "blok-1", issue_date: "2026-10-01", total_amount: 86.56 },
      { id: "blok-2", issue_date: "2026-10-02", total_amount: 50 },
    ]);
    expect(m.get("a")).toBe("blok-1");
    expect(m.get("b")).toBe("blok-1");
    expect(m.has("c")).toBe(false); // iný deň
  });
  it("jeden bloček len k jednému nákupu", () => {
    const tx = [t({ externeId: "a", nakupId: "N1" }), t({ externeId: "b", nakupId: "N2" })];
    const m = duplicitneBlocky(tx, [{ id: "blok", issue_date: "2026-10-01", total_amount: 74.56 }]);
    expect(m.size).toBe(1);
  });
});

describe("prijatá faktúra z faktúry Shell", () => {
  it("jedno auto → riadok za nákup, vozidlo na doklade, súčty sedia", () => {
    const { riadok, naKontrolu } = prijataZFaktury(F, [t()], K);
    expect(naKontrolu).toBe(false);
    expect(riadok).toMatchObject({
      invoice_number: "900001234",
      supplier_name: "Shell Slovakia, s.r.o.",
      supplier_ico: "31336868",
      issue_date: "2026-10-15",
      delivery_date: "2026-10-01",
      due_date: "2026-10-30",
      amount_without_vat: 60.62,
      vat_amount: 13.94,
      amount_total: 74.56,
      vehicle_id: "auto-1",
      external_id: "shell:faktura:555",
      source: "import",
      status: "received",
    });
    const items = riadok.items as any[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 45.2, unit: "l", vat_rate: 23, total: 74.56 });
    expect(items[0].name).toContain("BA123AB");
  });

  it("poplatok navyše dorovná riadok so sadzbou", () => {
    const { riadok } = prijataZFaktury({ ...F, zaklad: 62.62, dph: 14.4, spolu: 77.02 }, [t()], K);
    const items = riadok.items as any[];
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ unit_price: 2, vat_rate: 23, total: 2.46 });
    expect(riadok.amount_total).toBe(77.02);
    expect(riadok.vat_amount).toBe(14.4);
  });

  it("zahraničná DPH ide do nákladu so sadzbou 0 % a do odpočtu nie", () => {
    const cz = t({
      externeId: "cz",
      krajina: "CZ",
      krajinaDph: "CZ",
      zaklad: 40,
      dph: 8.4,
      sadzbaDph: 21,
      spolu: 48.4,
    });
    const f = { ...F, zaklad: 100.62, dph: 22.34, spolu: 122.96 };
    const { riadok, poznamky } = prijataZFaktury(f, [t(), cz], K);
    expect(riadok.vat_amount).toBe(13.94);
    expect(riadok.amount_total).toBe(122.96);
    expect(riadok.amount_without_vat).toBe(109.02);
    const items = riadok.items as any[];
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ vat_rate: 0, total: 48.4 });
    expect(poznamky.join(" ")).toContain("Zahraničná DPH 8.40");
  });

  it("viac áut s 50 % odpočtom → bez vozidla na doklade, na kontrolu s rozpisom", () => {
    const f = { ...F, zaklad: 121.24, dph: 27.88, spolu: 149.12 };
    const { riadok, naKontrolu } = prijataZFaktury(
      f,
      [t(), t({ externeId: "x", vehicle_id: "auto-2" })],
      K,
    );
    expect(riadok.vehicle_id).toBeNull();
    expect(naKontrolu).toBe(true);
    expect(String(riadok.int_poznamka)).toContain("Superb (BA-999ZZ): 60.62");
    expect(String(riadok.int_poznamka)).toMatch(/^Skontrolovať: /);
  });

  it("bez nákupov → jeden riadok podľa hlavičky a na kontrolu", () => {
    const { riadok, naKontrolu } = prijataZFaktury(F, [], K);
    expect(naKontrolu).toBe(true);
    expect(riadok.items).toEqual([
      expect.objectContaining({ unit_price: 60.62, vat_rate: 23, total: 74.56 }),
    ]);
    expect(riadok.vat_amount).toBe(13.94);
  });

  it("nevysvetliteľný rozdiel DPH ide ako suma bez DPH a na kontrolu", () => {
    const { riadok, naKontrolu } = prijataZFaktury(
      { ...F, dph: 15.94, spolu: 77.56, zaklad: 61.62 },
      [t()],
      K,
    );
    expect(naKontrolu).toBe(true);
    expect(riadok.amount_total).toBe(77.56);
    expect((riadok.items as any[])[1]).toMatchObject({ vat_rate: 0, total: 3 });
  });

  it("opravný doklad (Reversal) ide na kontrolu", () => {
    const { naKontrolu } = prijataZFaktury({ ...F, typ: "Reversal" }, [t()], K);
    expect(naKontrolu).toBe(true);
  });
});
