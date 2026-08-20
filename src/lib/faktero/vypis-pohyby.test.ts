import { describe, it, expect } from "vitest";
import {
  rozdelVypis,
  zlejVypisy,
  normalizujDatum,
  normalizujPohyb,
  normalizujSmer,
  normalizujSumu,
  normalizujVypis,
  protistranaZPopisu,
  rozlepStlpce,
  skontrolujZostatky,
  zostatkyVypisu,
  poradieVypisu,
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

  it("rok bez roka doplní hlavička výpisu", () => {
    // Veľa bánk píše rok len raz hore a pri pohyboch nechá deň s mesiacom.
    expect(normalizujDatum("15.08.", "2026-08-31")).toBe("2026-08-15");
    expect(normalizujDatum("15.8", "2026-08-31")).toBe("2026-08-15");
    expect(normalizujDatum("15/08/", "2026-08-31")).toBe("2026-08-15");
  });

  it("december na januárovom výpise patrí do minulého roka", () => {
    // Rok z hlavičky by pohyb posunul o dvanásť mesiacov do budúcnosti.
    expect(normalizujDatum("28.12.", "2026-01-05")).toBe("2025-12-28");
    expect(normalizujDatum("03.01.", "2026-01-05")).toBe("2026-01-03");
  });

  it("bez hlavičky sa dátum bez roka zahodí", () => {
    // Rok si nemá odkiaľ domyslieť — hádať ho je horšie než riadok vynechať.
    expect(normalizujDatum("15.08.")).toBeNull();
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

  it("pohyby bez roka doplní dátum výpisu", () => {
    /*
      Toto zhodilo celý výpis: banka písala rok len v hlavičke a pri riadkoch
      nechala „15.08.“ — každý pohyb sa zahodil a človek dostal hlášku, že to
      asi nie je bankový výpis.
    */
    const v = normalizujVypis({
      datumVypisu: "31.08.2026",
      pohyby: [
        { datum: "15.08.", suma: "12,50", smer: "vydaj" },
        { datum: "20.08.", suma: "100,00", smer: "prijem" },
      ],
    });
    expect(v.pohyby.map((p) => p.datum)).toEqual(["2026-08-15", "2026-08-20"]);
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

describe("protistrana z popisu", () => {
  it("kartu podľa Miesta na ČSOB výpise", () => {
    expect(protistranaZPopisu("Platba kartou, Miesto: BOLT.EU")).toBe("BOLT.EU");
    expect(protistranaZPopisu("Platba kartou\nMiesto: BOLT.EU BUDAPEST HU")).toBe(
      "BOLT.EU BUDAPEST HU",
    );
    expect(protistranaZPopisu("Obchodník: Kaufland SK  Suma: 12,30 EUR")).toBe("Kaufland SK");
  });

  it("bez štítku sa nič nedomýšľa", () => {
    expect(protistranaZPopisu("Prevod na účet")).toBeNull();
    expect(protistranaZPopisu(null)).toBeNull();
    expect(protistranaZPopisu("Miesto:   ")).toBeNull();
  });

  it("do pohybu sa doplní, len keď pole chýba", () => {
    const zPopisu = normalizujPohyb({
      datum: "2026-08-15",
      suma: "-12,30",
      popis: "Platba kartou, Miesto: BOLT.EU",
    });
    expect(zPopisu?.protistrana).toBe("BOLT.EU");

    const zPola = normalizujPohyb({
      datum: "2026-08-15",
      suma: "-12,30",
      popis: "Platba kartou, Miesto: BOLT.EU",
      protistrana: "Bolt Operations OÜ",
    });
    expect(zPola?.protistrana).toBe("Bolt Operations OÜ");
  });
});

describe("delenie dlhého výpisu", () => {
  const hlavicka = ["Banka a.s. VYPIS c. 3", "Ucet: SK89 0900 0000 0051 2345 6789", "Mena: EUR"];
  const pohyby = Array.from(
    { length: 60 },
    (_, i) => `0${(i % 9) + 1}.02.2026  ${i}0,00  Platba ${i}`,
  );
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

describe("zlepené stĺpce", () => {
  it("rozdelí zostatok, sumu a valutu z jedného slova", () => {
    expect(rozlepStlpce("31.07 Bonus 45,548,5331.07")).toBe(
      "31.07 Bonus | suma 8,53 | zostatok po transakcii 45,54",
    );
    expect(rozlepStlpce("01.07 Odoslaná okamžitá platba 20 831,98-1 000,0001.07")).toBe(
      "01.07 Odoslaná okamžitá platba | suma -1 000,00 | zostatok po transakcii 20 831,98",
    );
  });

  it("riadok iného tvaru ostáva nedotknutý", () => {
    const inak = "24.07.2026  28.07.2026  SEPA platba  14,00 EUR";
    expect(rozlepStlpce(inak)).toBe(inak);
    expect(rozlepStlpce("Karta: *8399 Miesto: BOLT.EU")).toBe("Karta: *8399 Miesto: BOLT.EU");
  });

  it("štítky sa do popisu pohybu nedostanú", () => {
    const p = normalizujPohyb({
      datum: "2026-07-31",
      suma: "8,53",
      popis: "Bonus | suma 8,53 | zostatok po transakcii 45,54",
    });
    expect(p?.popis).toBe("Bonus");
  });
});

describe("platba, ktorá neprešla", () => {
  it("z nezrealizovanej platby doklad nie je", () => {
    const r = { datum: "2026-07-24", suma: "-14,00", popis: "SEPA platba trvalým príkazom" };
    expect(normalizujPohyb(r)).not.toBeNull();
    expect(normalizujPohyb({ ...r, nezrealizovany: true })).toBeNull();
  });
});

describe("kontrola zostatkov", () => {
  const pohyb = (suma: number, zostatok: number) => ({
    datum: "2026-07-02",
    suma: Math.abs(suma),
    smer: suma < 0 ? ("vydaj" as const) : ("prijem" as const),
    zostatok,
  });

  it("súvislá reťaz je bez medzery", () => {
    expect(skontrolujZostatky([pohyb(-1000, 20831.98), pohyb(-4000, 16831.98)])).toEqual({
      medzier: 0,
      spolu: 0,
    });
  });

  it("vynechaný pohyb sa prezradí aj so sumou", () => {
    // Medzi nimi chýba výber 2 000.
    expect(skontrolujZostatky([pohyb(-4000, 14831.98), pohyb(-4000, 8831.98)])).toEqual({
      medzier: 1,
      spolu: 2000,
    });
  });

  it("riadky bez zostatku kontrolu nespustia", () => {
    expect(skontrolujZostatky([pohyb(-1000, 20831.98), { ...pohyb(-4000, 0), zostatok: null }])).toEqual(
      { medzier: 0, spolu: 0 },
    );
  });
});

describe("zostatky výpisu", () => {
  const p = (suma: number, zostatok: number | null) => ({
    datum: "2026-07-02",
    suma: Math.abs(suma),
    smer: suma < 0 ? ("vydaj" as const) : ("prijem" as const),
    zostatok,
  });

  it("počiatočný sa dopočíta z prvého pohybu, konečný je posledný", () => {
    expect(zostatkyVypisu([p(-1000, 20831.98), p(-4000, 16831.98)])).toEqual({
      pociatocny: 21831.98,
      konecny: 16831.98,
    });
  });

  it("bez zostatkov sa nič nevymýšľa", () => {
    expect(zostatkyVypisu([p(-1000, null), p(-4000, null)])).toBeNull();
    expect(zostatkyVypisu([])).toBeNull();
  });

  it("preskočí riadky, pri ktorých zostatok chýba", () => {
    expect(zostatkyVypisu([p(-1000, null), p(-1000, 100), p(500, null)])).toEqual({
      pociatocny: 1100,
      konecny: 100,
    });
  });
});

describe("poradové číslo výpisu", () => {
  it("rok z čísla vyhodí, nech ho v obidvoch poradiach píšu akokoľvek", () => {
    expect(poradieVypisu("2026/7")).toBe(7); // ČSOB
    expect(poradieVypisu("7/2026")).toBe(7); // SLSP
    expect(poradieVypisu("č. 7/2026")).toBe(7);
    expect(poradieVypisu("8")).toBe(8);
  });

  it("bez čísla nič nevymýšľa", () => {
    expect(poradieVypisu(null)).toBeNull();
    expect(poradieVypisu("výpis")).toBeNull();
    expect(poradieVypisu("0")).toBeNull();
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

  it("tri rovnaké výbery v jeden deň ostanú tri", () => {
    const vyber = { datum: "2026-07-02", suma: 4000, smer: "vydaj" as const, popis: "Výber" };
    const kus = { cisloVypisu: null, ucet: null, mena: null, datumVypisu: null };
    // Ten istý kus prečítaný dvakrát nesmie počet zdvojiť ani znížiť.
    expect(
      zlejVypisy([
        { ...kus, pohyby: [vyber, vyber, vyber] },
        { ...kus, pohyby: [vyber, vyber, vyber] },
      ]).pohyby.length,
    ).toBe(3);
  });

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
