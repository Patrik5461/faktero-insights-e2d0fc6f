import { describe, expect, it } from "vitest";
import {
  PORADIE_SKUPIN,
  filterSkupiny,
  mapujRiadok,
  odkazVsetky,
  rozoberDotaz,
  skupinyPreClena,
  uvodzovky,
  zoskupVysledky,
  zoradVysledky,
  type VysledokHladania,
} from "./globalne-hladanie";
import { normalizuj, regexNazvu, regexSlova, sedyNazov, slovaNazvu } from "./hladanie-text";
import * as hlas from "./hlas-hladanie";

const DNES = "2026-11-20";

describe("hladanie-text — spoločná normalizácia", () => {
  it("normalizuj odstráni diakritiku a interpunkciu", () => {
    expect(normalizuj("Novák-Bau, s.r.o.")).toBe("novak bau s r o");
    expect(normalizuj("ŠKODA Žilina")).toBe("skoda zilina");
  });

  it("hlas-hladanie používa tú istú funkciu (refaktor bez kópie)", () => {
    expect(hlas.normalizuj).toBe(normalizuj);
    expect(hlas.slovaNazvu).toBe(slovaNazvu);
  });

  it("slovaNazvu vynechá právnu formu", () => {
    expect(slovaNazvu("Novák s.r.o.")).toEqual(["novak"]);
    expect(slovaNazvu("Orange Slovensko, a.s.")).toEqual(["orange", "slovensko"]);
  });

  it("regexSlova dá triedy s diakritikou", () => {
    expect(regexSlova("novak")).toBe("[nňń][oóôöő]v[aáäàâ]k");
    expect(new RegExp(regexSlova("zilina"), "i").test("Žilina")).toBe(true);
    expect(new RegExp(regexSlova("skoda"), "i").test("ŠKODA")).toBe(true);
  });

  it("regexNazvu spojí slová a ignoruje právnu formu", () => {
    const r = regexNazvu("novak bau sro")!;
    expect(new RegExp(r, "i").test("Novák-Bau s.r.o.")).toBe(true);
    expect(new RegExp(r, "i").test("Bau Novák")).toBe(false);
    // Len právna forma — ostanú jej slová.
    expect(regexNazvu("a.s.")).toBe("[aáäàâ].*[sšś]");
    expect(regexNazvu("  ")).toBeNull();
  });

  it("sedyNazov — rovnaké pravidlo ako regex v databáze", () => {
    expect(sedyNazov("novak", "Novák s.r.o.")).toBe(true);
    expect(sedyNazov("novak bau", "Novák-Bau")).toBe(true);
    expect(sedyNazov("bau novak", "Novák-Bau")).toBe(false);
  });
});

describe("rozoberDotaz", () => {
  it("suma s čiarkou aj bodkou", () => {
    expect(rozoberDotaz("123,45").suma).toBe(123.45);
    expect(rozoberDotaz("123.45").suma).toBe(123.45);
    expect(rozoberDotaz("1 234,50 €").suma).toBe(1234.5);
    // Suma s desatinami nie je číslo dokladu.
    expect(rozoberDotaz("123,45").cislo).toBeNull();
  });

  it("číslo dokladu, VS a IČO", () => {
    const r = rozoberDotaz("QA2-0001");
    expect(r.cislo).toBe("QA2-0001");
    expect(r.suma).toBeNull();
    expect(r.nazov).not.toBeNull();
    const ico = rozoberDotaz("36 123 456");
    expect(ico.cifry).toBe("36123456");
    expect(ico.nazov).toBeNull();
  });

  it("IČ DPH a IBAN", () => {
    expect(rozoberDotaz("SK2020123456").icDph).toBe("SK2020123456");
    expect(rozoberDotaz("sk31 1100 0000").iban).toBe("SK3111000000");
    expect(rozoberDotaz("orange").iban).toBeNull();
  });

  it("znaky, ktoré by rozbili filter, sa z čísla vyhodia", () => {
    expect(rozoberDotaz('ab,(c)"%_*').cislo).toBe("abc");
  });

  it("e-mail len s @", () => {
    expect(rozoberDotaz("info@firma.sk").email).toBe("info@firma.sk");
    expect(rozoberDotaz("firma").email).toBeNull();
  });
});

describe("filterSkupiny — tvar podmienok PostgREST", () => {
  it("vystavené: číslo, VS, meno, suma ± 0,01 kladná aj záporná", () => {
    const f = filterSkupiny("vystavene", rozoberDotaz("novak"))!;
    expect(f).toContain('invoice_number.ilike."%novak%"');
    expect(f).toContain('variable_symbol.ilike."%novak%"');
    expect(f).toContain('customer_name.imatch."[nňń][oóôöő]v[aáäàâ]k"');
    const s = filterSkupiny("vystavene", rozoberDotaz("123,45"))!;
    expect(s).toBe(
      "and(total.gte.123.44,total.lte.123.46),and(total.gte.-123.46,total.lte.-123.44)",
    );
  });

  it("banka: IBAN a protistrana", () => {
    const f = filterSkupiny("banka", rozoberDotaz("SK3111000000"))!;
    expect(f).toContain('counterparty_iban.ilike."%SK3111000000%"');
  });

  it("nespracované: JSON cesty a suma ako text", () => {
    const f = filterSkupiny("nespracovane", rozoberDotaz("12,5"))!;
    expect(f).toBe('udaje->>celkom.in.("12.5","12.50")');
    expect(filterSkupiny("nespracovane", rozoberDotaz("orange"))).toContain(
      "udaje->dodavatel->>nazov.imatch.",
    );
  });

  it("zákazky bez sumy — pri čistej sume sa nepýtajú", () => {
    expect(filterSkupiny("zakazky", rozoberDotaz("12,50"))).toBeNull();
  });

  it("úvodzovky escapujú úvodzovku a spätnú lomku", () => {
    expect(uvodzovky('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("oprávnenia — skupiny podľa vlastného prístupu", () => {
  it("bežné roly vidia všetko", () => {
    expect(skupinyPreClena("owner", {})).toEqual(PORADIE_SKUPIN);
    expect(skupinyPreClena("employee", null)).toEqual(PORADIE_SKUPIN);
  });

  it("custom len s faktúrami vidí faktúry, ponuky a kontakty", () => {
    expect(skupinyPreClena("custom", { faktury: "read" })).toEqual([
      "vystavene",
      "kontakty",
      "ponuky",
    ]);
  });

  it("custom s dokladmi a bankou", () => {
    expect(skupinyPreClena("custom", { doklady: "edit", banka: "read" })).toEqual([
      "prijate",
      "blocky",
      "nespracovane",
      "banka",
    ]);
  });

  it("custom bez oblastí nevidí nič", () => {
    expect(skupinyPreClena("custom", {})).toEqual([]);
  });
});

describe("mapovanie a zoskupenie", () => {
  it("vystavená faktúra po splatnosti → detail", () => {
    const v = mapujRiadok(
      "vystavene",
      {
        id: "a1",
        invoice_number: "QA2-0001",
        customer_name: "Novák",
        total: "120.5",
        currency: "EUR",
        issue_date: "2026-10-01",
        due_date: "2026-10-15",
        status: "issued",
        paid_at: null,
      },
      DNES,
    );
    expect(v.suma).toBe(120.5);
    expect(v.stav).toEqual({ text: "Po splatnosti", ton: "chyba" });
    expect(v.odkaz).toEqual({ to: "/faktury/$id", params: { id: "a1" } });
  });

  it("bloček otvorí doklady vyhľadané podľa čísla, kontakt adresár", () => {
    const b = mapujRiadok("blocky", { id: "b1", document_number: "B-7", status: "new" }, DNES);
    expect(b.odkaz).toEqual({ to: "/doklady", search: { stav: "vsetky", q: "B-7" } });
    const k = mapujRiadok(
      "kontakty",
      { id: "k1", name: "Dodo s.r.o.", ico: "123", dodavatel: true, odberatel: false },
      DNES,
    );
    expect(k.odkaz).toEqual({ to: "/dodavatelia", search: { q: "Dodo s.r.o." } });
    expect(k.stav?.text).toBe("Dodávateľ");
  });

  it("presné číslo dokladu ide hore pred novšie", () => {
    const r = (cislo: string, datum: string): VysledokHladania => ({
      skupina: "vystavene",
      id: cislo,
      cislo,
      partner: null,
      suma: null,
      mena: null,
      datum,
      stav: null,
      odkaz: { to: "/" },
    });
    const z = zoradVysledky([r("QA2-00012", "2026-11-01"), r("QA2-0001", "2026-01-01")], "QA2-0001");
    expect(z.map((x) => x.cislo)).toEqual(["QA2-0001", "QA2-00012"]);
  });

  it("zoskupenie: pevné poradie, max 5, prázdne vypadnú, Zobraziť všetky len so zoznamom", () => {
    const riadky = Array.from({ length: 8 }, (_, i) =>
      mapujRiadok("banka", { id: `t${i}`, amount: -5, booking_date: `2026-11-0${i + 1}` }, DNES),
    );
    const g = zoskupVysledky(
      [
        { skupina: "banka", pocet: 20, riadky },
        { skupina: "prijate", pocet: 0, riadky: [] },
        {
          skupina: "vystavene",
          pocet: 1,
          riadky: [mapujRiadok("vystavene", { id: "x", invoice_number: "1" }, DNES)],
        },
      ],
      "test",
    );
    expect(g.map((x) => x.skupina)).toEqual(["vystavene", "banka"]);
    expect(g[1].polozky).toHaveLength(5);
    expect(g[1].pocet).toBe(20);
    expect(g[1].vsetky).toBeNull();
    expect(g[0].vsetky).toEqual({ to: "/faktury", search: { q: "test" } });
  });

  it("odkazVsetky pre bločky drží záložku Všetky", () => {
    expect(odkazVsetky("blocky", " shell ")).toEqual({
      to: "/doklady",
      search: { stav: "vsetky", q: "shell" },
    });
  });
});
