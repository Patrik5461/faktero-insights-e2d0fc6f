import { describe, expect, it } from "vitest";
import {
  chybaCudzej,
  cieleNaPresun,
  jeSpolocnost,
  nesediZChyby,
  odberatelZAi,
  overOdberatela,
  prekazkaPresunu,
  textNesedi,
} from "./cudzia-faktura";

const firma = { nazov: "Alfa s.r.o.", ico: "12345678", dic: "2020123456", icDph: "SK2020123456" };

describe("overOdberatela — rozpoznanie cudzej faktúry", () => {
  it("bez údajov odberateľa nevieme nič a neblokuje sa", () => {
    expect(overOdberatela({ odberatel: null, firma })).toBeNull();
    expect(overOdberatela({ odberatel: odberatelZAi({ supplier_ico: "1" }), firma })).toBeNull();
  });

  it("zhodné IČO aj zapísané inak (medzery, vedúce nuly) patrí firme", () => {
    expect(overOdberatela({ odberatel: { ico: "12 345 678" }, firma })).toBeNull();
    expect(
      overOdberatela({ odberatel: { ico: "345678" }, firma: { ...firma, ico: "00345678" } }),
    ).toBeNull();
  });

  it("iné IČO je cudzia faktúra", () => {
    const n = overOdberatela({ odberatel: { nazov: "Beta a.s.", ico: "87654321" }, firma });
    expect(n?.dovod).toBe("ico");
    expect(n?.odberatel).toMatchObject({ nazov: "Beta a.s.", ico: "87654321" });
    expect(n?.firma.nazov).toBe("Alfa s.r.o.");
  });

  it("stačí jedna zhoda čísla — zle prečítané druhé číslo neblokuje", () => {
    expect(
      overOdberatela({ odberatel: { ico: "12345678", icDph: "SK9999999999" }, firma }),
    ).toBeNull();
  });

  it("IČ DPH a DIČ sa porovnávajú normalizované", () => {
    expect(overOdberatela({ odberatel: { icDph: "sk 2020 123 456" }, firma })).toBeNull();
    expect(overOdberatela({ odberatel: { dic: "SK2020123456" }, firma })).toBeNull();
    // DIČ vyčítané z IČ DPH dokladu sedí na DIČ firmy bez IČ DPH.
    expect(
      overOdberatela({ odberatel: { icDph: "SK2020123456" }, firma: { ...firma, icDph: null } }),
    ).toBeNull();
    expect(overOdberatela({ odberatel: { icDph: "DE123456789" }, firma })?.dovod).toBe("ic_dph");
  });

  it("česká firma: DIČ CZ + IČO", () => {
    const cz = { nazov: "Gama s.r.o.", ico: "27082440", dic: "CZ27082440", icDph: "CZ27082440" };
    expect(overOdberatela({ odberatel: { dic: "CZ27082440" }, firma: cz })).toBeNull();
    expect(
      overOdberatela({
        odberatel: { dic: "CZ27082440" },
        firma: { ...cz, dic: null, icDph: null },
      }),
    ).toBeNull();
    expect(overOdberatela({ odberatel: { ico: "11111111" }, firma: cz })?.dovod).toBe("ico");
  });

  it("číslo, ktoré firma nemá vyplnené, sa neporovnáva", () => {
    expect(
      overOdberatela({
        odberatel: { nazov: "Alfa s.r.o.", icDph: "SK2020999999" },
        firma: { nazov: "Alfa s.r.o.", ico: "12345678" },
      }),
    ).toBeNull();
  });

  it("názov len ako slabší doplnok, keď čísla chýbajú", () => {
    expect(overOdberatela({ odberatel: { nazov: "ALFA, spol. s r.o." }, firma })).toBeNull();
    expect(overOdberatela({ odberatel: { nazov: "Alfa Trade s.r.o." }, firma })).toBeNull();
    expect(overOdberatela({ odberatel: { nazov: "Omega Invest a.s." }, firma })?.dovod).toBe(
      "nazov",
    );
    // Meno živnostníka bez právnej formy neblokuje.
    expect(overOdberatela({ odberatel: { nazov: "Ján Novák" }, firma })).toBeNull();
    // Keď sa dá porovnať číslo, názov nerozhoduje.
    expect(
      overOdberatela({ odberatel: { nazov: "Omega Invest a.s.", ico: "12345678" }, firma }),
    ).toBeNull();
  });

  it("firma ako dodávateľ = jej vystavená faktúra, táto kontrola mlčí", () => {
    expect(
      overOdberatela({ odberatel: { ico: "87654321" }, dodavatel: { ico: "12345678" }, firma }),
    ).toBeNull();
  });

  it("jeSpolocnost pozná bežné právne formy", () => {
    expect(jeSpolocnost("Beta, s. r. o.")).toBe(true);
    expect(jeSpolocnost("Beta a.s.")).toBe(true);
    expect(jeSpolocnost("Müller GmbH")).toBe(true);
    expect(jeSpolocnost("Peter Malý")).toBe(false);
  });

  it("text upozornenia a chyba pre rozhranie", () => {
    const n = overOdberatela({ odberatel: { nazov: "Beta a.s.", ico: "87654321" }, firma })!;
    expect(textNesedi(n)).toBe(
      "Faktúra nepatrí firme Alfa s.r.o., odberateľ je Beta a.s. (IČO 87654321).",
    );
    expect(nesediZChyby(new Error(chybaCudzej(n)).message)).toEqual(n);
    expect(nesediZChyby("iná chyba")).toBeNull();
  });
});

describe("cieleNaPresun — kontrola práv", () => {
  const n = overOdberatela({ odberatel: { nazov: "Beta a.s.", ico: "87654321" }, firma })!;
  const firmy = [
    { id: "zdroj", name: "Alfa s.r.o.", ico: "12345678" },
    { id: "beta", name: "Beta a.s.", ico: "87654321" },
    { id: "beta2", name: "Beta duplicitne", ico: "87654321" },
    { id: "ina", name: "Iná", ico: "55555555" },
  ];

  it("ponúkne len firmu so zhodným číslom, kde smie človek zapisovať doklady", () => {
    expect(cieleNaPresun(n, firmy, ["zdroj", "beta"], "zdroj")).toEqual([
      { id: "beta", nazov: "Beta a.s." },
    ]);
  });

  it("firmu bez prístupu neponúkne ani neprezradí", () => {
    expect(cieleNaPresun(n, firmy, ["zdroj", "ina"], "zdroj")).toEqual([]);
  });

  it("zdrojová firma nie je cieľ a podľa názvu sa nepresúva", () => {
    expect(cieleNaPresun(n, firmy, ["beta"], "beta")).toEqual([
      // „beta2“ nemá právo; zdroj sa vynechá
    ]);
    const lenNazov = overOdberatela({ odberatel: { nazov: "Beta a.s." }, firma })!;
    expect(cieleNaPresun(lenNazov, firmy, ["beta"], "zdroj")).toEqual([]);
  });

  it("odovzdaná či zmazaná faktúra sa nepresúva", () => {
    expect(prekazkaPresunu({ exported_at: "2026-10-01" })).toMatch(/odovzdaná/);
    expect(prekazkaPresunu({ deleted_at: "2026-10-01" })).toMatch(/koši/);
    expect(prekazkaPresunu({ samofakturacia: true })).toMatch(/Samofaktúra/);
    expect(prekazkaPresunu({})).toBeNull();
  });
});

describe("blokovanie zaúčtovania, exportu a príkazu", () => {
  const nesedi = overOdberatela({ odberatel: { nazov: "Beta a.s.", ico: "87654321" }, firma })!;
  const prijata = {
    id: "p1",
    company_id: "zdroj",
    invoice_number: "FA-1",
    supplier_name: "Dodávateľ s.r.o.",
    amount_total: 123,
    amount_without_vat: 100,
    vat_amount: 23,
    currency: "EUR",
    status: "received",
    supplier_iban: "SK3112000000198742637541",
    due_date: "2026-11-13",
    odberatel_nesedi: nesedi,
  };

  it("export a odovzdanie do Pohody faktúru vynechá s dôvodom", async () => {
    const { prekazkaDokladu } = await import("./pohoda-kontrola");
    const { prijataAkoDoklad } = await import("./prijate-do-pohody");
    const dovod = prekazkaDokladu(prijataAkoDoklad(prijata), { country: "SK" });
    expect(dovod).toMatch(/^FA-1 — faktúra nepatrí tejto firme/);
    // Bez príznaku tento dôvod nie je.
    const bez = prekazkaDokladu(prijataAkoDoklad({ ...prijata, odberatel_nesedi: null }), {
      country: "SK",
    });
    expect(String(bez ?? "")).not.toMatch(/nepatrí tejto firme/);
  });

  it("export do iných programov (Omega, Money, CSV…) ju vynechá", async () => {
    const { prekazkaUctovania } = await import("./uctovanie-agenda");
    const d = { cislo: "FA-1", agenda: "prijata", odberatelNesedi: true, riadky: [], polozky: [] };
    expect(prekazkaUctovania(d as any, null)).toMatch(/^FA-1 — faktúra nepatrí tejto firme/);
    expect(prekazkaUctovania({ ...d, odberatelNesedi: false } as any, null)).toBeNull();
  });

  it("hromadný príkaz na úhradu ju preskočí", async () => {
    const { pripravPlatby, DOVOD_CUDZIA_PRIKAZ } = await import("./hromadny-prikaz");
    const { DOVOD_CUDZIA } = await import("./cudzia-faktura");
    expect(DOVOD_CUDZIA_PRIKAZ).toBe(DOVOD_CUDZIA);
    const r = pripravPlatby([
      prijata,
      { ...prijata, id: "p2", invoice_number: "FA-2", odberatel_nesedi: null },
    ]);
    expect(r.preskocene).toEqual([{ id: "p1", cisloFaktury: "FA-1", dovod: DOVOD_CUDZIA }]);
    expect(r.platby.map((p) => p.id)).toEqual(["p2"]);
  });

  it("autopilot má blokátor a návrh nepotvrdí", async () => {
    const { blokatory, smieAutopilot } = await import("./auto-uctovanie");
    const bl = blokatory({ cudziOdberatel: true, predkontacia: "PD", clenenieDph: "PD" });
    expect(bl).toEqual(["cudzi_odberatel"]);
    expect(
      smieAutopilot("plny", {
        predkontacia: "PD",
        clenenieDph: "PD",
        zdroj: "pravidlo",
        istota: 100,
        blokatory: bl,
      } as any),
    ).toBe(false);
  });
});
