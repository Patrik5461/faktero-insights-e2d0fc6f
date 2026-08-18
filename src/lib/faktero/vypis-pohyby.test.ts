import { describe, it, expect } from "vitest";
import {
  rozdelVypis,
  zlejVypisy,
  normalizujDatum,
  normalizujPohyb,
  normalizujSmer,
  normalizujSumu,
  normalizujVypis,
} from "./vypis-pohyby";

describe("suma z výpisu", () => {
  it("rozumie obom spôsobom písania tisícov", () => {
    // `1.234,56` prečítané ako anglické číslo by bolo 1,23 — tichá chyba
    // o tri rády, ktorú na doklade nikto nevidí.
    expect(normalizujSumu("1.234,56")).toBe(1234.56);
    expect(normalizujSumu("1,234.56")).toBe(1234.56);
    expect(normalizujSumu("1 234,56")).toBe(1234.56);
    expect(normalizujSumu("1 234,56")).toBe(1234.56);
  });

  it("osamotený oddeľovač je desatinný len pri dvoch čísliciach", () => {
    expect(normalizujSumu("58,90")).toBe(58.9);
    expect(normalizujSumu("58.9")).toBe(58.9);
    expect(normalizujSumu("1.234")).toBe(1234);
    expect(normalizujSumu("12,345")).toBe(12345);
  });

  it("mínus môže byť aj za sumou alebo v zátvorke", () => {
    expect(normalizujSumu("-58,90")).toBe(-58.9);
    expect(normalizujSumu("58,90-")).toBe(-58.9);
    expect(normalizujSumu("(58,90)")).toBe(-58.9);
    expect(normalizujSumu("+58,90")).toBe(58.9);
  });

  it("mena a nezmysly neprekážajú", () => {
    expect(normalizujSumu("1 234,56 EUR")).toBe(1234.56);
    expect(normalizujSumu("123.45 €")).toBe(123.45);
    expect(normalizujSumu("neznáme")).toBeNull();
    expect(normalizujSumu("")).toBeNull();
    expect(normalizujSumu(42)).toBe(42);
  });
});

describe("dátum z výpisu", () => {
  it("prijme tvary, ktoré banky používajú", () => {
    expect(normalizujDatum("15.1.2026")).toBe("2026-01-15");
    expect(normalizujDatum("15. 01. 2026")).toBe("2026-01-15");
    expect(normalizujDatum("15/01/2026")).toBe("2026-01-15");
    expect(normalizujDatum("2026-01-15")).toBe("2026-01-15");
    expect(normalizujDatum("15.01.26")).toBe("2026-01-15");
  });

  it("neexistujúci deň neprejde", () => {
    // 31. februára by inak Pohoda dostala ako 3. marca.
    expect(normalizujDatum("31.2.2026")).toBeNull();
    expect(normalizujDatum("15.13.2026")).toBeNull();
    expect(normalizujDatum("hocičo")).toBeNull();
  });
});

describe("smer pohybu", () => {
  it("slovo má prednosť pred znamienkom", () => {
    expect(normalizujSmer("výdaj", 58.9)).toBe("vydaj");
    expect(normalizujSmer("credit", 58.9)).toBe("prijem");
  });

  it("jednopísmenový kód rozhodnúť nesmie", () => {
    // `D` je v slovenskom výpise „Dal" (príjem), v anglickom „debit" (výdaj).
    // Keď je po ruke znamienko, je spoľahlivejšie.
    expect(normalizujSmer("D", -58.9)).toBe("vydaj");
    expect(normalizujSmer("D", 58.9)).toBe("prijem");
  });

  it("bez slova rozhoduje znamienko", () => {
    expect(normalizujSmer(null, -1)).toBe("vydaj");
    expect(normalizujSmer("", 1)).toBe("prijem");
  });
});

describe("celý výpis", () => {
  const surove = {
    cisloVypisu: "8",
    ucet: "SK3111000000002612345678",
    mena: "eur",
    pohyby: [
      {
        datum: "20.1.2026",
        suma: "58,90-",
        popis: "Poplatok za vedenie účtu",
        protiucet: "1234567890/1100",
      },
      {
        datum: "15.1.2026",
        suma: "1 234,56",
        smer: "credit",
        popis: "Úhrada faktúry",
        protistrana: "ACME s.r.o.",
        vs: "VS 2026001",
        ks: "0308",
      },
      // Súčtový riadok — do účtovníctva nepatrí.
      { popis: "Obraty spolu", suma: "1 293,46" },
      { datum: "22.1.2026", suma: "0,00", popis: "Nulový pohyb" },
    ],
  };

  it("nechá len riadky, z ktorých je doklad, a zoradí ich podľa dňa", () => {
    const v = normalizujVypis(surove);
    expect(v.pohyby.map((p) => p.datum)).toEqual(["2026-01-15", "2026-01-20"]);
    expect(v.pohyby.map((p) => p.smer)).toEqual(["prijem", "vydaj"]);
    expect(v.pohyby[0].suma).toBe(1234.56);
    // Suma je vždy kladná, o smere hovorí `smer`.
    expect(v.pohyby[1].suma).toBe(58.9);
  });

  it("zo symbolov ostanú len číslice", () => {
    const v = normalizujVypis(surove);
    expect(v.pohyby[0].vs).toBe("2026001");
    expect(v.pohyby[0].ks).toBe("0308");
  });

  it("dátum výpisu dopĺňa posledný pohyb", () => {
    // Bez neho by účtovník dopisoval obdobie ku každému riadku ručne.
    expect(normalizujVypis(surove).datumVypisu).toBe("2026-01-20");
    expect(normalizujVypis({ ...surove, datumVypisu: "31.1.2026" }).datumVypisu).toBe("2026-01-31");
  });

  it("mena ide veľkými a prázdny výpis nespadne", () => {
    expect(normalizujVypis(surove).mena).toBe("EUR");
    expect(normalizujVypis(null).pohyby).toEqual([]);
    expect(normalizujVypis({}).datumVypisu).toBeNull();
  });
});

describe("jeden riadok", () => {
  it("bez dátumu alebo sumy doklad nie je", () => {
    expect(normalizujPohyb({ suma: "10" })).toBeNull();
    expect(normalizujPohyb({ datum: "1.1.2026" })).toBeNull();
    expect(normalizujPohyb({ datum: "1.1.2026", suma: "0" })).toBeNull();
  });
});


describe("delenie dlhého výpisu", () => {
  const hlavicka = ["Banka a.s. VYPIS c. 3", "Ucet: SK89 0900 0000 0051 2345 6789", "Mena: EUR"];
  const pohyby = Array.from({ length: 60 }, (_, i) => `0${(i % 9) + 1}.02.2026  ${i}0,00  Platba ${i}`);
  const text = [...hlavicka, ...pohyby].join("\n");

  it("krátky výpis sa nedelí", () => {
    expect(rozdelVypis("krátky text")).toEqual(["krátky text"]);
  });

  it("hlavička je v každom kuse, riadky sa nekrájajú", () => {
    const kusy = rozdelVypis(text, 400, 3);
    expect(kusy.length).toBeGreaterThan(1);
    // Bez hlavičky by druhý kus nevedel, čí výpis to je.
    expect(kusy.every((k) => k.startsWith("Banka a.s. VYPIS c. 3"))).toBe(true);
    // Žiadny riadok sa nesmie stratiť ani rozpoliť.
    const vsetky = kusy.flatMap((k) => k.split("\n").slice(3));
    expect(vsetky.filter((r) => r.startsWith("0"))).toEqual(pohyby);
  });
});

describe("zlievanie kusov", () => {
  const kus = (cislo: string | null, pohyby: any[]) => ({
    cisloVypisu: cislo,
    ucet: cislo ? "SK89" : null,
    mena: "EUR",
    datumVypisu: null,
    pohyby,
  });
  const a = { datum: "2026-02-01", suma: 10, smer: "prijem" as const, popis: "A", vs: null };
  const b = { datum: "2026-02-05", suma: 20, smer: "vydaj" as const, popis: "B", vs: null };

  it("zhodné pohyby sa nezdvojujú a zvyšok sa zoradí", () => {
    // Hlavička sa kusom opakuje a model z nej občas vyrobí pohyb druhýkrát.
    const v = zlejVypisy([kus("3", [b, a]), kus(null, [a])] as any);
    expect(v.pohyby.map((p) => p.popis)).toEqual(["A", "B"]);
    expect(v.cisloVypisu).toBe("3");
    expect(v.ucet).toBe("SK89");
  });

  it("dátum výpisu dopĺňa posledný pohyb zo všetkých kusov", () => {
    expect(zlejVypisy([kus("3", [a]), kus(null, [b])] as any).datumVypisu).toBe("2026-02-05");
  });
});
