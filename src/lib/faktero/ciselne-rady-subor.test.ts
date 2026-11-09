import { describe, expect, it } from "vitest";
import {
  anoNie,
  druhZTextu,
  exportRadov,
  klucPosledneho,
  naplanujImportRadov,
  najvyssiePoradie,
  poradieZBunky,
  potrebnePosledne,
  riadkyZTabulky,
  vzorCislaVObdobi,
  type ExistujuciRad,
  type RiadokSuboru,
} from "./ciselne-rady-subor";
import { citajTabulku, parsujCsv, vytvorCsv } from "./cennik-import";

const NOV_2026 = { rok: 2026, mesiac: 11 };

const FA: ExistujuciRad = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "invoice",
  name: "Faktúry",
  format: "FA{YYYY}{NNNN}",
  is_default: true,
  active: true,
  start_from: 1,
};
const POBOCKA: ExistujuciRad = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "invoice",
  name: "Pobočka",
  format: "PB{YYYY}{NNNN}",
  is_default: false,
  active: true,
  start_from: 1,
};
const PONUKY: ExistujuciRad = {
  id: "33333333-3333-3333-3333-333333333333",
  kind: "quote",
  name: "Cenové ponuky",
  format: "Q{YYYY}{NNNN}",
  is_default: true,
  active: true,
  start_from: 1,
};
const EXISTUJUCE = [FA, POBOCKA, PONUKY];

let cislo = 2;
const riadok = (r: Partial<RiadokSuboru>): RiadokSuboru => ({
  riadok: cislo++,
  id: "",
  druh: "invoice",
  nazov: "",
  sablona: "",
  start_from: "",
  predvoleny: "",
  aktivny: "",
  ...r,
});

describe("čítanie súboru", () => {
  it("export → CSV → späť dá tie isté rady bez zmeny", () => {
    const e = exportRadov(
      EXISTUJUCE.map((r) => ({ ...r, posledne: r.id === FA.id ? 41 : 0 })),
      undefined,
      new Date(2026, 10, 9),
    );
    expect(e.hlavicka).toContain("Šablóna čísla");
    const faRiadok = e.riadky.find((r) => r[0] === FA.id)!;
    expect(faRiadok[1]).toBe("Faktúry");
    expect(faRiadok[5]).toBe(41);
    expect(faRiadok[6]).toBe("FA20260042");
    expect(faRiadok[7]).toBe("áno");

    const tabulka = parsujCsv(vytvorCsv([e.hlavicka, ...e.riadky]));
    const { riadky, chyba } = riadkyZTabulky(tabulka);
    expect(chyba).toBeNull();
    expect(riadky).toHaveLength(3);
    expect(riadky[0].druh).toBe("invoice");
    const plan = naplanujImportRadov(riadky, EXISTUJUCE, { [klucPosledneho("invoice", FA.format)]: 41 });
    expect(plan.pocty).toEqual({ novy: 0, zmena: 0, bez_zmeny: 3, chyba: 0 });
  });

  it("XLSX z exportu sa prečíta rovnako", async () => {
    const XLSX = await import("xlsx");
    const e = exportRadov(EXISTUJUCE.map((r) => ({ ...r, posledne: 0 })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([e.hlavicka, ...e.riadky]), "Rady");
    const bajty = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const { riadky } = riadkyZTabulky(await citajTabulku(bajty, "rady.xlsx"));
    expect(riadky.map((r) => r.sablona)).toEqual(e.riadky.map((r) => r[3]));
    expect(riadky.find((r) => r.id === PONUKY.id)?.druh).toBe("quote");
  });

  it("spozná preložené hlavičky a druhy, hlavičku nájde aj pod nadpisom", () => {
    const tabulka = [
      ["Číselné řady firmy"],
      [],
      ["Druh dokladu", "Název řady", "Šablona čísla", "Začít od pořadí", "Výchozí"],
      ["Cenové nabídky", "Nabídky", "N{YYYY}{NNN}", "5", "ne"],
      ["", "", "", "", ""],
      ["invoice", "Export", "EX{YY}{NNNN}", "", "ano"],
    ];
    const { riadky, chyba } = riadkyZTabulky(
      tabulka,
      { "Název řady": "nazov", "Šablona čísla": "sablona", "Začít od pořadí": "start_from", Výchozí: "predvoleny" },
      { "Cenové nabídky": "quote" },
    );
    expect(chyba).toBeNull();
    expect(riadky).toHaveLength(2);
    expect(riadky[0]).toMatchObject({ riadok: 4, druh: "quote", nazov: "Nabídky", start_from: "5", predvoleny: "ne" });
    expect(riadky[1]).toMatchObject({ riadok: 6, druh: "invoice", sablona: "EX{YY}{NNNN}" });
  });

  it("bez stĺpca so šablónou vráti chybu", () => {
    expect(riadkyZTabulky([["Druh dokladu", "Názov"], ["Faktúry", "x"]]).chyba).toMatch(/Šablóna čísla/);
  });

  it("druh dokladu z kódu aj názvu, neznámy ostane textom", () => {
    expect(druhZTextu("Dobropisy")).toBe("credit_note");
    expect(druhZTextu("  pokladnicne doklady ")).toBe("cash");
    expect(druhZTextu("sales_order")).toBe("sales_order");
    expect(druhZTextu("Rechnungen", { Rechnungen: "invoice" })).toBe("invoice");
    expect(druhZTextu("Faktúrky")).toBeNull();
    const { riadky } = riadkyZTabulky([["Druh dokladu", "Šablóna čísla"], ["Faktúrky", "X{NNN}"]]);
    expect(riadky[0].druh).toBe("Faktúrky");
  });

  it("áno/nie a poradie z bunky", () => {
    expect(anoNie("Áno")).toBe(true);
    expect(anoNie("nein")).toBe(false);
    expect(anoNie("")).toBeUndefined();
    expect(anoNie("možno")).toBeNull();
    expect(poradieZBunky("1 250")).toBe(1250);
    expect(poradieZBunky("42.0")).toBe(42);
    expect(poradieZBunky("")).toBeUndefined();
    expect(poradieZBunky("0")).toBeNull();
    expect(poradieZBunky("12,5")).toBeNull();
    expect(poradieZBunky("1000000")).toBeNull();
  });
});

describe("posledné použité poradie", () => {
  it("ročný rad vidí len čísla tohto roka", () => {
    const cisla = ["FA20260041", "FA20250099", "FA20260007", "FA2026X001", null, "PB20260100"];
    expect(najvyssiePoradie(cisla, "FA{YYYY}{NNNN}", NOV_2026)).toBe(41);
    expect(vzorCislaVObdobi("FA{YYYY}{NNNN}", NOV_2026).like).toBe("FA2026%");
  });
  it("mesačný rad len tento mesiac, pretečenie šírky sa počíta", () => {
    const cisla = ["OBJ-2611-012", "OBJ-2610-099", "OBJ-2611-1005"];
    expect(najvyssiePoradie(cisla, "OBJ-{YY}{MM}-{NNN}", NOV_2026)).toBe(1005);
  });
  it("špeciálne znaky v predpone sa v LIKE aj regexe escapujú", () => {
    const v = vzorCislaVObdobi("A_1%.{NN}", NOV_2026);
    expect(v.like).toBe("A\\_1\\%.%");
    expect(najvyssiePoradie(["A_1%.07", "AX1%.99", "A_1%x50"], "A_1%.{NN}", NOV_2026)).toBe(7);
  });
  it("potrebné dvojice berú šablónu z riadku alebo z radu podľa ID", () => {
    const p = potrebnePosledne(
      [riadok({ id: FA.id, druh: "", sablona: "" }), riadok({ druh: "quote", sablona: "Q{YY}{NNNN}" }), riadok({ druh: "xxx", sablona: "Z{NN}" })],
      EXISTUJUCE,
    );
    expect(p).toEqual([
      { kind: "invoice", format: "FA{YYYY}{NNNN}" },
      { kind: "quote", format: "Q{YY}{NNNN}" },
    ]);
  });
});

describe("plán importu", () => {
  const posledne = { [klucPosledneho("invoice", "FA{YYYY}{NNNN}")]: 41 };

  it("páruje podľa ID, inak podľa druhu a šablóny; nespárovaný je nový", () => {
    const plan = naplanujImportRadov(
      [
        riadok({ id: POBOCKA.id, sablona: "PB-{YYYY}-{NNNN}" }),
        riadok({ sablona: "FA{YYYY}{NNNN}", nazov: "Faktúry hlavné" }),
        riadok({ sablona: "EX{YYYY}{NNNN}", nazov: "Export" }),
      ],
      EXISTUJUCE,
      posledne,
    );
    const [a, b, c] = plan.polozky;
    expect(a).toMatchObject({ stav: "zmena", id: POBOCKA.id });
    expect(a.zmeny).toEqual([{ pole: "sablona", stare: "PB{YYYY}{NNNN}", nove: "PB-{YYYY}-{NNNN}" }]);
    expect(b).toMatchObject({ stav: "zmena", id: FA.id, name: "Faktúry hlavné" });
    expect(c).toMatchObject({ stav: "novy", name: "Export", is_default: false, active: true, start_from: 1 });
  });

  it("ID z cudzej firmy sa ignoruje a páruje sa podľa šablóny", () => {
    const plan = naplanujImportRadov(
      [riadok({ id: "99999999-9999-9999-9999-999999999999", sablona: "FA{YYYY}{NNNN}" })],
      EXISTUJUCE,
      posledne,
    );
    expect(plan.polozky[0]).toMatchObject({ stav: "bez_zmeny", id: FA.id });
  });

  it("nikdy nezníži počítadlo pod posledné použité poradie", () => {
    const fa = { ...FA, start_from: 50 };
    const plan = naplanujImportRadov(
      [riadok({ id: fa.id, sablona: fa.format, start_from: "30" })],
      [fa, POBOCKA],
      { [klucPosledneho("invoice", fa.format)]: 41 },
    );
    expect(plan.polozky[0].stav).toBe("chyba");
    expect(plan.polozky[0].chyba?.text).toMatch(/^Číslo nižšie ako posledné použité/);
    expect(plan.polozky[0].chyba?.parametre).toMatchObject({ od: 30, posledne: 41, min: 42 });
  });

  it("rovné poslednému je tiež chyba, o jedno vyššie prejde", () => {
    const zle = naplanujImportRadov([riadok({ id: FA.id, start_from: "41" })], EXISTUJUCE, posledne);
    expect(zle.polozky[0].stav).toBe("chyba");
    const dobre = naplanujImportRadov([riadok({ id: FA.id, start_from: "42" })], EXISTUJUCE, posledne);
    expect(dobre.polozky[0]).toMatchObject({ stav: "zmena", start_from: 42 });
  });

  it("nezmenené počítadlo pod posledným nie je chyba (rad začína od 1, doklady sú ďalej)", () => {
    const plan = naplanujImportRadov([riadok({ id: FA.id, start_from: "1", nazov: "Nové meno" })], EXISTUJUCE, posledne);
    expect(plan.polozky[0]).toMatchObject({ stav: "zmena", start_from: 1 });
  });

  it("zníženie je v poriadku, keď v období ešte nie je žiadny doklad", () => {
    const fa = { ...FA, start_from: 200 };
    const plan = naplanujImportRadov([riadok({ id: fa.id, start_from: "1" })], [fa], {});
    expect(plan.polozky[0]).toMatchObject({ stav: "zmena", start_from: 1 });
  });

  it("nový rad s obsadenými číslami a prázdnym poradím nadviaže za posledným", () => {
    const plan = naplanujImportRadov(
      [riadok({ sablona: "FA{YYYY}{NNNN}", nazov: "Druhý FA", druh: "invoice" })],
      [],
      posledne,
    );
    expect(plan.polozky[0]).toMatchObject({ stav: "novy", start_from: 42 });
  });

  it("neplatná šablóna a neznámy druh sú chyby riadku, ostatné riadky ostanú", () => {
    const plan = naplanujImportRadov(
      [
        riadok({ druh: "Faktúrky", sablona: "X{NNN}", nazov: "x" }),
        riadok({ sablona: "A".repeat(41), nazov: "Dlhý" }),
        riadok({ sablona: "", nazov: "Bez šablóny" }),
        riadok({ sablona: "OK{NNNN}", nazov: "Dobrý" }),
        riadok({ sablona: "OK2{NNNN}", nazov: "Zlé áno", predvoleny: "možno" }),
        riadok({ sablona: "OK3{NNNN}", nazov: "Zlé číslo", start_from: "abc" }),
      ],
      EXISTUJUCE,
      {},
    );
    expect(plan.polozky.map((p) => p.stav)).toEqual(["chyba", "chyba", "chyba", "novy", "chyba", "chyba"]);
    expect(plan.polozky[0].chyba).toEqual({ text: "Neznámy druh dokladu „{druh}“.", parametre: { druh: "Faktúrky" } });
    expect(plan.polozky[1].chyba?.text).toMatch(/pridlhá/);
    expect(plan.polozky[2].chyba?.text).toBe("Chýba šablóna čísla.");
  });

  it("šablóna bez poradia dostane {NNNN} ako pri ručnom uložení", () => {
    const plan = naplanujImportRadov([riadok({ sablona: "PR-{YYYY}-", nazov: "Prevádzka" })], EXISTUJUCE, {});
    expect(plan.polozky[0]).toMatchObject({ stav: "novy", format: "PR-{YYYY}-{NNNN}" });
  });

  it("druh existujúceho radu sa meniť nedá", () => {
    const plan = naplanujImportRadov([riadok({ id: FA.id, druh: "quote" })], EXISTUJUCE, {});
    expect(plan.polozky[0].stav).toBe("chyba");
  });

  it("ten istý rad dvakrát v súbore je chyba", () => {
    const plan = naplanujImportRadov(
      [riadok({ id: FA.id }), riadok({ sablona: "FA{YYYY}{NNNN}" })],
      EXISTUJUCE,
      {},
    );
    expect(plan.polozky.map((p) => p.stav)).toEqual(["bez_zmeny", "chyba"]);
  });

  it("predvolený na druh len jeden: dva v súbore sú chyba", () => {
    const plan = naplanujImportRadov(
      [riadok({ id: FA.id, predvoleny: "áno" }), riadok({ id: POBOCKA.id, predvoleny: "áno" })],
      EXISTUJUCE,
      {},
    );
    expect(plan.polozky.map((p) => p.stav)).toEqual(["chyba", "chyba"]);
    expect(plan.polozky[0].chyba?.text).toMatch(/^Predvolený rad môže byť na druh dokladu len jeden/);
  });

  it("nový predvolený zoberie predvolenosť doterajšiemu", () => {
    const plan = naplanujImportRadov([riadok({ id: POBOCKA.id, predvoleny: "áno" })], EXISTUJUCE, {});
    expect(plan.polozky[0]).toMatchObject({ stav: "zmena", is_default: true, beriePredvoleny: "Faktúry" });
    const vymena = naplanujImportRadov(
      [riadok({ id: POBOCKA.id, predvoleny: "áno" }), riadok({ id: FA.id, predvoleny: "nie" })],
      EXISTUJUCE,
      {},
    );
    expect(vymena.polozky.map((p) => p.stav)).toEqual(["zmena", "zmena"]);
    expect(vymena.polozky[0].beriePredvoleny).toBe("Faktúry");
  });

  it("názov musí byť v rámci druhu jedinečný", () => {
    const plan = naplanujImportRadov(
      [riadok({ sablona: "NEW{NNNN}", nazov: "pobočka" }), riadok({ druh: "quote", sablona: "NQ{NNNN}", nazov: "Pobočka" })],
      EXISTUJUCE,
      {},
    );
    expect(plan.polozky[0].stav).toBe("chyba");
    expect(plan.polozky[1].stav).toBe("novy");
  });
});
