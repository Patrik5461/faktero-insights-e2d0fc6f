import { describe, it, expect } from "vitest";
import {
  DRUHY_RADOV,
  chybaSablony,
  normalizujSablonu,
  predlohyRadu,
  upozornenieSablony,
  druhPodlaTypuFaktury,
  resetujeSaMesacne,
  sablonaZCisla,
  rozpoznajRad,
  ukazkaCisla,
} from "./ciselne-rady";

describe("kontrola šablóny", () => {
  it("prepustí bežné tvary", () => {
    expect(chybaSablony("{YYYY}{NNNN}")).toBeNull();
    expect(chybaSablony("ZF{YYYY}{NNNN}")).toBeNull();
    expect(chybaSablony("FA-{YY}{MM}-{NNN}")).toBeNull();
  });
  it("vlastný tvar prejde — medzery aj cudzie zátvorky sú vec vkusu", () => {
    expect(chybaSablony("FA {YYYY}{NNNN}")).toBeNull();
    expect(chybaSablony("{ROK}{NNNN}")).toBeNull();
    expect(chybaSablony("Faktúra č. {NNN}/{YYYY}")).toBeNull();
  });
  it("chýbajúce poradie sa doplní, nie je to chyba", () => {
    expect(chybaSablony("{YYYY}")).toBeNull();
    expect(normalizujSablonu("{YYYY}")).toBe("{YYYY}{NNNN}");
    expect(normalizujSablonu("Faktura-Tobify")).toBe("Faktura-Tobify{NNNN}");
    expect(upozornenieSablony("{YYYY}")).toMatch(/Poradie sme doplnili/);
  });
  it("jednomiestne poradie sa rozšíri na dve číslice", () => {
    expect(normalizujSablonu("FA{YYYY}-{N}")).toBe("FA{YYYY}-{NN}");
  });
  it("prázdnu a pridlhú nepustí", () => {
    expect(chybaSablony("")).toMatch(/prázdna/);
    expect(chybaSablony("A".repeat(41) + "{NNNN}")).toMatch(/pridlhá/);
  });
  it("cudzí token upozorní, že sa vytlačí doslovne", () => {
    expect(upozornenieSablony("{ROK}{NNNN}")).toMatch(/vytlačí tak, ako je/);
    expect(upozornenieSablony("{YYYY}{NNNN}")).toBeNull();
  });
});

describe("ukážka čísla", () => {
  const den = new Date(2026, 2, 5); // 5. marca 2026

  it("doplní rok, mesiac a poradie", () => {
    expect(ukazkaCisla("{YYYY}{NNNN}", 1, den)).toBe("20260001");
    expect(ukazkaCisla("ZF{YYYY}{NNNN}", 7, den)).toBe("ZF20260007");
    expect(ukazkaCisla("FA-{YY}{MM}-{NNN}", 12, den)).toBe("FA-2603-012");
  });
  it("počet N určuje počet číslic", () => {
    expect(ukazkaCisla("{YYYY}{NN}", 3, den)).toBe("202603");
    expect(ukazkaCisla("{YYYY}{NNNNN}", 3, den)).toBe("202600003");
  });
  it("poradie dlhšie než šablóna sa neoreže", () => {
    expect(ukazkaCisla("{YYYY}{NN}", 1234, den)).toBe("20261234");
  });
  it("prázdna šablóna vráti prázdno", () => {
    expect(ukazkaCisla("", 1, den)).toBe("");
  });
});

describe("reset poradia a druh radu", () => {
  it("mesiac v šablóne znamená mesačný reset", () => {
    expect(resetujeSaMesacne("{YYYY}{MM}{NNN}")).toBe(true);
    expect(resetujeSaMesacne("{YYYY}{NNNN}")).toBe(false);
  });
  it("typ faktúry vyberá svoj rad", () => {
    expect(druhPodlaTypuFaktury("regular")).toBe("invoice");
    expect(druhPodlaTypuFaktury("proforma")).toBe("proforma");
    expect(druhPodlaTypuFaktury("credit_note")).toBe("credit_note");
    expect(druhPodlaTypuFaktury("advance_payment")).toBe("advance_payment");
    expect(druhPodlaTypuFaktury(null)).toBe("invoice");
  });
});

describe("šablóna odvodená z ručne napísaného čísla", () => {
  const den = "2026-09-29";

  it("rozpozná rok, predponu aj poradie", () => {
    expect(sablonaZCisla("FA-2026-100", den)).toEqual({
      format: "FA-{YYYY}-{NNN}",
      poradie: 100,
    });
    expect(sablonaZCisla("20260007", den)).toEqual({ format: "{YYYY}{NNNN}", poradie: 7 });
    // Doklado/Pohoda „260800001": vodiaca nula poradia nesmie zmiznúť (ďalšie 260800002).
    expect(sablonaZCisla("260800001", "2026-04-01")).toEqual({
      format: "{YY}0{NNNNNN}",
      poradie: 800001,
    });
    expect(sablonaZCisla("2026/114", den)).toEqual({ format: "{YYYY}/{NNN}", poradie: 114 });
    expect(sablonaZCisla("ZF20260001", den)).toEqual({ format: "ZF{YYYY}{NNNN}", poradie: 1 });
  });

  it("mesiac berie len tesne za rokom", () => {
    expect(sablonaZCisla("FA-202609-012", den)).toEqual({
      format: "FA-{YYYY}{MM}-{NNN}",
      poradie: 12,
    });
    expect(sablonaZCisla("2609-0012", den)).toEqual({ format: "{YY}{MM}-{NNNN}", poradie: 12 });
  });

  it("číslo bez roka je len predpona a poradie", () => {
    expect(sablonaZCisla("FA-0042", den)).toEqual({ format: "FA-{NNNN}", poradie: 42 });
  });

  it("z čoho sa vzor odvodiť nedá, vráti null", () => {
    expect(sablonaZCisla("oprava-final2", den)).toBeNull(); // jedna číslica
    expect(sablonaZCisla("", den)).toBeNull();
    expect(sablonaZCisla("bez-cisla", den)).toBeNull();
    expect(sablonaZCisla("12/2026-ab", den)).toBeNull(); // číslo nie je na konci
    expect(sablonaZCisla("2024-2026-0001", den)).toBeNull(); // cudzí rok v predpone
  });

  it("odvodená šablóna prejde kontrolou", () => {
    const v = sablonaZCisla("FA-2026-100", den)!;
    expect(chybaSablony(v.format)).toBeNull();
    expect(ukazkaCisla(v.format, v.poradie + 1, new Date(2026, 8, 29))).toBe("FA-2026-101");
  });
});

describe("hotové vzory číslovania", () => {
  it("faktúry ponúkajú aj tvar s predponou FA", () => {
    const f = predlohyRadu("invoice").map((x) => x.format);
    expect(f).toContain("{YYYY}{NNNN}");
    expect(f).toContain("FA{YYYY}{NNNN}");
  });
  it("zálohové faktúry majú predponu ZF, pokladňa PD", () => {
    expect(predlohyRadu("proforma")[0].format).toBe("ZF{YYYY}{NNNN}");
    expect(predlohyRadu("cash")[0].format).toBe("PD{YYYY}{NNNN}");
  });
  it("každý vzor prejde kontrolou a dá zmysluplné číslo", () => {
    const den = new Date(2026, 8, 29);
    for (const kind of DRUHY_RADOV) {
      for (const v of predlohyRadu(kind)) {
        expect(chybaSablony(v.format), `${kind}: ${v.format}`).toBeNull();
        expect(ukazkaCisla(v.format, 1, den)).not.toBe("");
      }
    }
  });
  it("vzor s mesiacom sa resetuje mesačne", () => {
    const m = predlohyRadu("invoice").find((v) => v.format.includes("{MM}"))!;
    expect(resetujeSaMesacne(m.format)).toBe(true);
  });
});

describe("upozornenia pri vlastnej šablóne", () => {
  it("jednomiestne poradie nehlási ako chýbajúce", () => {
    expect(upozornenieSablony("PON {YYYY}/{N}")).toMatch(/rozšírili/);
    expect(normalizujSablonu("PON {YYYY}/{N}")).toBe("PON {YYYY}/{NN}");
  });
  it("chýbajúce poradie hlási správne", () => {
    expect(upozornenieSablony("Ponuka Tobify")).toMatch(/doplnili na koniec/);
  });
});

describe("rozpoznajRad — číslovanie z importovaných faktúr", () => {
  const dnes = new Date("2026-10-14T10:00:00");
  it("pokračuje za najvyšším číslom v tomto roku", () => {
    const r = rozpoznajRad(
      [
        { cislo: "FA2026-0043", datum: "2026-09-30" },
        { cislo: "FA2026-0045", datum: "2026-10-10" },
        { cislo: "FA2026-0044", datum: "2026-10-02" },
        { cislo: "FA2025-0310", datum: "2025-12-30" },
      ],
      dnes,
    );
    expect(r).toMatchObject({ format: "FA{YYYY}-{NNNN}", poradie: 45, startFrom: 46, pocet: 4 });
  });
  it("vyhrá šablóna s najviac dokladmi, ojedinelé iné číslo ju nezmení", () => {
    const r = rozpoznajRad(
      [
        { cislo: "20260007", datum: "2026-10-01" },
        { cislo: "20260008", datum: "2026-10-02" },
        { cislo: "OPRAVA-1", datum: "2026-10-03" },
      ],
      dnes,
    );
    expect(r).toMatchObject({ format: "{YYYY}{NNNN}", startFrom: 9 });
  });
  it("import z minulého roka — nový rok začína od 1", () => {
    const r = rozpoznajRad([{ cislo: "2025/114", datum: "2025-12-20" }], dnes);
    expect(r).toMatchObject({ format: "{YYYY}/{NNN}", startFrom: 1 });
  });
  it("bez roka v čísle sa pokračuje bez ohľadu na rok", () => {
    const r = rozpoznajRad([{ cislo: "FA-0042", datum: "2024-05-01" }], dnes);
    expect(r).toMatchObject({ format: "FA-{NNNN}", startFrom: 43 });
  });
  it("nerozpoznateľné čísla", () => {
    expect(rozpoznajRad([{ cislo: "A", datum: "2026-01-01" }], dnes)).toBeNull();
  });
});

describe("rozpoznajRad — skutočné číslovania", () => {
  const dnes = new Date("2026-10-14T10:00:00");
  it("PALIERA: rok dvojčíslím, pevná 8 a poradie (25800016)", () => {
    expect(sablonaZCisla("26800001", "2026-05-19")).toMatchObject({ format: "{YY}{NNNNNN}" });
    const r = rozpoznajRad(
      [
        { cislo: "26800001", datum: "2026-05-19" },
        { cislo: "25800016", datum: "2025-12-22" },
        { cislo: "25800015", datum: "2025-10-13" },
        { cislo: "24800019", datum: "2024-12-09" },
      ],
      dnes,
    );
    expect(r).toMatchObject({ format: "{YY}8{NNNNN}", poradie: 1, startFrom: 2 });
    expect(ukazkaCisla(r!.format, r!.startFrom, dnes)).toBe("26800002");
    expect(ukazkaCisla(r!.format, 1, new Date("2027-01-05"))).toBe("27800001");
  });
  it("Tobify: 2026041 → 2026043, ojedinelé 0012026 a ZAL12026004 nerozhodujú", () => {
    const r = rozpoznajRad(
      [
        { cislo: "2026041", datum: "2026-10-13" },
        { cislo: "2026042", datum: "2026-10-13" },
        { cislo: "2026040", datum: "2026-10-13" },
        { cislo: "0012026", datum: "2026-03-19" },
        { cislo: "ZAL12026004", datum: "2026-05-18" },
        { cislo: "2026001", datum: "2026-02-09" },
      ],
      dnes,
    );
    expect(r).toMatchObject({ format: "{YYYY}{NNN}", startFrom: 43 });
  });
  it("dvojčíslie roka uprostred poradia sa nepočíta ako rok", () => {
    expect(sablonaZCisla("FA-0126", "2026-01-10")).toMatchObject({
      format: "FA-{NNNN}",
      poradie: 126,
    });
  });
});
