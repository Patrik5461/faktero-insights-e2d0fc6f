import { describe, expect, it } from "vitest";
import {
  denVBratislave,
  firmySUlohami,
  hodinaVBratislave,
  jeCasNaSuhrn,
  maSaPoslat,
  odkazNaOdhlasenie,
  overTokenOdhlasenia,
  poctyClena,
  polozkyFirmy,
  predmetSuhrnu,
  tokenOdhlasenia,
  vetaFirmy,
  zostavEmail,
  type DataFirmy,
  type PoctyFirmy,
} from "./denny-suhrn";

const JA = "11111111-1111-4111-8111-111111111111";
const KOLEGA = "22222222-2222-4222-8222-222222222222";
const KLUC = "tajny-kluc-na-skusku";

const firma = (p: Partial<PoctyFirmy>): PoctyFirmy => ({
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nazov: "Tobify s.r.o.",
  schvalenie: 0,
  komentare: 0,
  nespracovane: 0,
  poSplatnosti: 0,
  ...p,
});

describe("text súhrnu", () => {
  it("veta firmy so správnymi tvarmi", () => {
    expect(
      vetaFirmy(firma({ schvalenie: 3, komentare: 2, nespracovane: 5, poSplatnosti: 2 })),
    ).toBe(
      "Čaká na vás vo firme Tobify s.r.o.: 3 doklady na schválenie, 2 komentáre, kde vás označili, 5 nespracovaných dokladov, 2 faktúry po splatnosti",
    );
  });

  it("jednotné číslo a vynechané nuly", () => {
    expect(polozkyFirmy(firma({ schvalenie: 1, poSplatnosti: 1 }))).toEqual([
      "1 doklad na schválenie",
      "1 faktúra po splatnosti",
    ]);
    expect(polozkyFirmy(firma({ komentare: 1, nespracovane: 1 }))).toEqual([
      "1 komentár, kde vás označili",
      "1 nespracovaný doklad",
    ]);
    expect(polozkyFirmy(firma({ komentare: 7, poSplatnosti: 5 }))).toEqual([
      "7 komentárov, kde vás označili",
      "5 faktúr po splatnosti",
    ]);
  });

  it("predmet pre jednu a pre viac firiem", () => {
    expect(predmetSuhrnu([firma({ schvalenie: 2, komentare: 1 })])).toBe(
      "Faktero: 3 úlohy vo firme Tobify s.r.o.",
    );
    expect(
      predmetSuhrnu([
        firma({ schvalenie: 1 }),
        firma({ companyId: "b", nazov: "Druhá", nespracovane: 4 }),
        firma({ companyId: "c", nazov: "Prázdna" }),
      ]),
    ).toBe("Faktero: 5 úloh v 2 firmách");
  });
});

describe("posielať, či nie", () => {
  it("nič nečaká → neposiela sa", () => {
    expect(maSaPoslat({ zapnute: true, email: "a@b.sk", firmy: [firma({})] })).toBe(false);
    expect(maSaPoslat({ zapnute: true, email: "a@b.sk", firmy: [] })).toBe(false);
  });
  it("vypnutý súhrn alebo bez e-mailu → neposiela sa", () => {
    const f = [firma({ schvalenie: 1 })];
    expect(maSaPoslat({ zapnute: false, email: "a@b.sk", firmy: f })).toBe(false);
    expect(maSaPoslat({ zapnute: true, email: null, firmy: f })).toBe(false);
    expect(maSaPoslat({ zapnute: true, email: "nie-je-adresa", firmy: f })).toBe(false);
  });
  it("niečo čaká → posiela sa (aj keď stĺpec ešte nie je, null = predvolene zapnuté)", () => {
    expect(maSaPoslat({ zapnute: null, email: "a@b.sk", firmy: [firma({ komentare: 1 })] })).toBe(
      true,
    );
  });
  it("záporné a chybné počty sa neberú", () => {
    expect(firmySUlohami([firma({ schvalenie: -3, komentare: NaN as any })])).toEqual([]);
  });
});

describe("e-mail", () => {
  const e = zostavEmail({
    meno: "Patrik <b>",
    firmy: [
      firma({ nazov: "Zeta & syn", schvalenie: 3, poSplatnosti: 2 }),
      firma({ companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nazov: "Alfa", komentare: 1 }),
      firma({ companyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nazov: "Nič nečaká" }),
    ],
    web: "https://www.faktero.sk/",
    odhlasenie: "https://www.faktero.sk/denny-suhrn/odhlasenie?t=abc.def",
  });

  it("sekcia za každú firmu s úlohami, abecedne, prázdna vynechaná", () => {
    expect(e.html).toContain("Čaká na vás vo firme Alfa");
    expect(e.html).toContain("Čaká na vás vo firme Zeta &amp; syn");
    expect(e.html).not.toContain("Nič nečaká");
    expect(e.html.indexOf("Alfa")).toBeLessThan(e.html.indexOf("Zeta"));
    expect(e.text).not.toContain("Nič nečaká");
  });

  it("odkazy na Moje úlohy konkrétnej firmy, po splatnosti a odhlásenie", () => {
    expect(e.html).toContain(
      'href="https://www.faktero.sk/moje-ulohy?firma=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
    expect(e.html).toContain(
      "moje-ulohy?firma=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&amp;dalej=po-splatnosti",
    );
    expect(e.html).toContain("Odhlásiť sa z denného súhrnu");
    expect(e.html).toContain('href="https://www.faktero.sk/denny-suhrn/odhlasenie?t=abc.def"');
    expect(e.text).toContain("https://www.faktero.sk/denny-suhrn/odhlasenie?t=abc.def");
    expect(e.text).toContain("Otvoriť Moje úlohy: https://www.faktero.sk/moje-ulohy?firma=");
  });

  it("meno a názvy firiem sú escapované", () => {
    expect(e.html).toContain("Dobré ráno, Patrik &lt;b&gt;.");
    expect(e.html).not.toContain("<b>.");
  });

  it("text verzia nesie vety firiem", () => {
    expect(e.text).toContain(
      "Čaká na vás vo firme Zeta & syn: 3 doklady na schválenie, 2 faktúry po splatnosti.",
    );
    expect(e.predmet).toBe("Faktero: 6 úloh v 2 firmách");
  });
});

describe("počty pre člena firmy", () => {
  const data: DataFirmy = {
    schvalovanie: [
      // jednoduché schvaľovanie — schvaľuje majiteľ, admin, účtovník
      { agenda: "prijata", urovne: [], schvalena_uroven: 0, stav: "caka" },
      // cesta: ja v 1. úrovni, kolega v 2.
      { agenda: "vystavena", urovne: [[JA], [KOLEGA]], schvalena_uroven: 0, stav: "caka" },
      { agenda: "doklad", urovne: [[JA], [KOLEGA]], schvalena_uroven: 1, stav: "vrateny" },
    ],
    komentare: [
      { agenda: "prijata", user_id: KOLEGA, upozornit: [JA], vyriesili: [] },
      { agenda: "vystavena", user_id: KOLEGA, upozornit: [JA], vyriesili: [JA] },
      { agenda: "vystavena", user_id: JA, upozornit: [KOLEGA], vyriesili: [] },
    ],
    nespracovane: 5,
    poSplatnosti: 2,
  };
  const f = { id: "f1", nazov: "Firma" };

  it("majiteľ", () => {
    expect(poctyClena({ user_id: JA, role: "owner", permissions: {} }, f, data)).toEqual({
      companyId: "f1",
      nazov: "Firma",
      schvalenie: 2,
      komentare: 1,
      nespracovane: 5,
      poSplatnosti: 2,
    });
  });

  it("bežný používateľ nedostane pohľadávky a jednoduché schvaľovanie", () => {
    const p = poctyClena({ user_id: KOLEGA, role: "employee", permissions: {} }, f, data);
    expect(p.schvalenie).toBe(2); // vystavená aj vrátený doklad — je v 2. úrovni
    expect(p.komentare).toBe(1);
    expect(p.nespracovane).toBe(5);
    expect(p.poSplatnosti).toBe(0);
  });

  it("vlastný prístup len s faktúrami nevidí doklady ani ich komentáre", () => {
    const p = poctyClena(
      { user_id: JA, role: "custom", permissions: { faktury: "read" } },
      f,
      data,
    );
    expect(p).toMatchObject({ schvalenie: 1, komentare: 0, nespracovane: 0, poSplatnosti: 2 });
  });

  it("vlastný prístup bez faktúr nedostane faktúry po splatnosti", () => {
    const p = poctyClena(
      { user_id: JA, role: "custom", permissions: { doklady: "edit" } },
      f,
      data,
    );
    expect(p).toMatchObject({ schvalenie: 0, komentare: 1, nespracovane: 5, poSplatnosti: 0 });
  });
});

describe("čas v Bratislave", () => {
  it("leto: 5:00 UTC je 7:00", () => {
    const d = new Date("2026-07-01T05:00:00Z");
    expect(hodinaVBratislave(d)).toBe(7);
    expect(jeCasNaSuhrn(d)).toBe(true);
    expect(jeCasNaSuhrn(new Date("2026-07-01T06:00:00Z"))).toBe(false);
  });
  it("zima: 6:00 UTC je 7:00", () => {
    expect(jeCasNaSuhrn(new Date("2026-12-01T06:00:00Z"))).toBe(true);
    expect(jeCasNaSuhrn(new Date("2026-12-01T05:00:00Z"))).toBe(false);
  });
  it("deň sa ráta v Bratislave, nie v UTC", () => {
    expect(denVBratislave(new Date("2026-10-15T22:30:00Z"))).toBe("2026-10-16");
    expect(denVBratislave(new Date("2026-10-15T21:30:00Z"))).toBe("2026-10-15");
  });
});

describe("token na odhlásenie", () => {
  it("platný token vráti id používateľa", async () => {
    const t = await tokenOdhlasenia(JA, KLUC);
    expect(t.startsWith(`${JA}.`)).toBe(true);
    expect(await overTokenOdhlasenia(t, KLUC)).toBe(JA);
    expect(odkazNaOdhlasenie("https://x.sk/", t)).toBe(
      `https://x.sk/denny-suhrn/odhlasenie?t=${encodeURIComponent(t)}`,
    );
  });

  it("holé id, cudzí podpis, iný kľúč ani prázdny token neprejdú", async () => {
    const t = await tokenOdhlasenia(JA, KLUC);
    const podpis = t.split(".")[1];
    expect(await overTokenOdhlasenia(JA, KLUC)).toBeNull();
    expect(await overTokenOdhlasenia(`${KOLEGA}.${podpis}`, KLUC)).toBeNull();
    expect(await overTokenOdhlasenia(t, "iny-kluc")).toBeNull();
    expect(await overTokenOdhlasenia("", KLUC)).toBeNull();
    expect(await overTokenOdhlasenia(null, KLUC)).toBeNull();
    expect(await overTokenOdhlasenia(t, "")).toBeNull();
  });

  it("bez kľúča alebo s neplatným id sa token nevyrobí", async () => {
    await expect(tokenOdhlasenia(JA, "")).rejects.toThrow();
    await expect(tokenOdhlasenia("nie-uuid", KLUC)).rejects.toThrow();
  });
});

describe("postupné zapínanie (DENNY_SUHRN_LEN)", () => {
  it("prázdny zoznam = všetkým, inak len vymenovaným", async () => {
    const { jeVZozname } = await import("./denny-suhrn.server");
    expect(jeVZozname("a@b.sk", "")).toBe(true);
    expect(jeVZozname("Info@Paliera.sk", " info@paliera.sk , info@tobify.sk")).toBe(true);
    expect(jeVZozname("zakaznik@firma.sk", "info@paliera.sk,info@tobify.sk")).toBe(false);
    expect(jeVZozname(null, "info@paliera.sk")).toBe(false);
  });
});
