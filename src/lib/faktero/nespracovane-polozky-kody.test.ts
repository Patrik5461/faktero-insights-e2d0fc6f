import { describe, expect, it } from "vitest";
import {
  blocekZUdajov,
  polozkyNaZapis,
  polozkyZauctovane,
  prazdneUdaje,
  prijataZUdajov,
  udajeZPrijatej,
  type UdajeNespracovaneho,
} from "./nespracovane";
import { riadkyDokladu, rozuctovaniePolozkami, type PolozkaSKodom } from "./rozuctovanie";

// Faktúra za materiál a réžiu, obe 23 %: materiál má vlastný kód, réžia nie.
function udaje(): UdajeNespracovaneho {
  const u = prazdneUdaje();
  u.dodavatel.nazov = "Dodávateľ s.r.o.";
  u.cislo = "2026001";
  u.datumVystavenia = "2026-10-20";
  u.splatnost = "2026-11-03";
  u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
  u.celkom = 123;
  u.kody.predkontacia = "1Pr";
  u.kody.clenenie = "PD";
  u.polozky = [
    {
      name: "Materiál",
      quantity: 1,
      unit: null,
      unit_price: 61.5,
      vat_rate: 23,
      total: 61.5,
      predkontacia: " 1Mat ",
      clenenie: "",
      kv: "B2",
    },
    {
      name: "Réžia",
      quantity: 1,
      unit: null,
      unit_price: 61.5,
      vat_rate: 23,
      total: 61.5,
      predkontacia: "",
      clenenie: null,
    },
  ];
  return u;
}

describe("kódy na položkách nespracovaného dokladu", () => {
  it("pri Vytvoriť sa kódy položiek prenesú do prijatej faktúry, prázdne sa vynechajú", () => {
    const r = prijataZUdajov("faktura", udaje(), "2026-10-29");
    const items = r.items as PolozkaSKodom[];
    expect(items[0]).toMatchObject({ name: "Materiál", predkontacia: "1Mat", kv: "B2" });
    expect(items[0]).not.toHaveProperty("clenenie");
    expect(items[1]).not.toHaveProperty("predkontacia");
    expect(items[1]).not.toHaveProperty("clenenie");
    expect(items[1]).not.toHaveProperty("kv");
    expect(r.pohoda_predkontacia).toBe("1Pr");
  });

  it("aj bloček dostane kódy položiek", () => {
    const b = blocekZUdajov(udaje());
    expect((b.items as PolozkaSKodom[])[0]).toMatchObject({ predkontacia: "1Mat", kv: "B2" });
  });

  it("vypnuté položky si kódy nechajú bokom", () => {
    const u = { ...udaje(), polozkyVypnute: true };
    const r = prijataZUdajov("faktura", u, "2026-10-29");
    expect(r.items).toBeNull();
    expect((r.polozky_vypnute as PolozkaSKodom[])[0].predkontacia).toBe("1Mat");
  });

  it("položka bez kódu dedí kód hlavičky, KV položky ide do riadku", () => {
    const r = prijataZUdajov("faktura", udaje(), "2026-10-29");
    const riadky = riadkyDokladu(
      { items: r.items },
      [{ sadzba: 23, zaklad: 100, dph: 23 }],
      r.pohoda_predkontacia,
      r.pohoda_clenenie_dph,
      null,
    );
    expect(riadky.map((x) => [x.predkontacia, x.clenenie, x.kv ?? null, x.zaklad, x.dph])).toEqual([
      ["1Mat", "PD", "B2", 50, 11.5],
      ["1Pr", "PD", null, 50, 11.5],
    ]);
  });

  it("samotné členenie DPH na položke tiež rozúčtuje, predkontácia ostane z hlavičky", () => {
    const riadky = rozuctovaniePolozkami(
      [
        { name: "A", vat_rate: 23, total: 100, clenenie: "PN" },
        { name: "B", vat_rate: 23, total: 23 },
      ],
      [{ sadzba: 23, zaklad: 100, dph: 23 }],
      "1Pr",
      "PD",
    );
    expect(riadky.map((x) => [x.predkontacia, x.clenenie])).toEqual([
      ["1Pr", "PN"],
      ["1Pr", "PD"],
    ]);
  });

  it("bez kódov na položkách platí hlavička jedným riadkom", () => {
    const u = udaje();
    u.polozky = polozkyNaZapis(
      u.polozky.map((p) => ({ ...p, predkontacia: null, clenenie: null, kv: null })),
    );
    expect(rozuctovaniePolozkami(u.polozky, u.rozpis, "1Pr", "PD")).toEqual([]);
  });

  it("doklad je zaúčtovaný, keď má predkontáciu každá položka", () => {
    const u = udaje();
    expect(polozkyZauctovane(u)).toBe(false);
    u.polozky[1].predkontacia = "1Rez";
    expect(polozkyZauctovane(u)).toBe(true);
    expect(polozkyZauctovane({ ...u, polozkyVypnute: true })).toBe(false);
  });

  it("vrátenie z prijatej faktúry zachová kódy položiek, interné číslo a dátum prijatia", () => {
    const r = prijataZUdajov(
      "faktura",
      { ...udaje(), interneCislo: "PF-15", datumPrijatia: "2026-10-22" },
      "2026-10-29",
    );
    expect(r.pohoda_cislo).toBe("PF-15");
    expect(r.received_date).toBe("2026-10-22");
    const { udaje: spat } = udajeZPrijatej(r);
    expect(spat.polozky[0].predkontacia).toBe("1Mat");
    expect(spat.interneCislo).toBe("PF-15");
    expect(spat.datumPrijatia).toBe("2026-10-22");
  });
});
