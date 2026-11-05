import { describe, expect, it } from "vitest";
import {
  chybyDoCsv,
  citajTabulku,
  exportCennika,
  exportDoCsv,
  exportDoXlsx,
  hladinaZHlavicky,
  naplanujImport,
  najdiHlavicku,
  navrhniMapovanie,
  parsujCislo,
  parsujCsv,
  type CenaHladiny,
  type ExistujuciProdukt,
  type Hladina,
  type MoznostiImportu,
} from "./cennik-import";
import { cenaZPodkladov, type Podklady } from "./ceny";

const HL: Hladina[] = [
  { id: "g-vo", name: "Veľkoobchod" },
  { id: "g-vip", name: "VIP" },
];
const PR: ExistujuciProdukt[] = [
  {
    id: "p1",
    code: "A-001",
    name: "Skrutka M6",
    unit: "ks",
    unit_price: 0.25,
    vat_rate: 23,
    external_id: null,
  },
  {
    id: "p2",
    code: "00042",
    name: 'Matica; veľká "M8"',
    unit: "ks",
    unit_price: "1.5",
    vat_rate: "23",
    external_id: "E-42",
  },
  {
    id: "p3",
    code: null,
    name: "Montáž",
    unit: "hod",
    unit_price: 30,
    vat_rate: 23,
    external_id: null,
  },
  {
    id: "p4",
    code: null,
    name: "Rovnaký",
    unit: "ks",
    unit_price: 1,
    vat_rate: 23,
    external_id: null,
  },
  {
    id: "p5",
    code: null,
    name: "Rovnaký",
    unit: "ks",
    unit_price: 2,
    vat_rate: 23,
    external_id: null,
  },
];
const CE: CenaHladiny[] = [
  { product_id: "p1", price_group_id: "g-vo", unit_price: "0.2", min_quantity: 0 },
  { product_id: "p1", price_group_id: "g-vo", unit_price: "0.15", min_quantity: 100 }, // množstevná — nie je v exporte
  { product_id: "p2", price_group_id: "g-vip", unit_price: 1.2, min_quantity: 1 },
  { product_id: "p3", price_group_id: null, customer_id: "c1", unit_price: 25, min_quantity: 0 }, // odberateľ — nie je v exporte
];
const M: MoznostiImportu = { vytvoritChybajuce: false, prazdnaZmaze: false, predvolenaSadzba: 23 };

const plan = (
  riadky: string[][],
  hlavicka = [
    "Kód",
    "Názov",
    "MJ",
    "Sadzba DPH",
    "Základná cena bez DPH",
    "Cena – Veľkoobchod",
    "Cena – VIP",
  ],
  m: Partial<MoznostiImportu> = {},
  produkty = PR,
) =>
  naplanujImport(hlavicka, riadky, navrhniMapovanie(hlavicka, HL), produkty, HL, CE, {
    ...M,
    ...m,
  });

describe("parsujCislo", () => {
  it("čiarka aj bodka, s medzerami aj bez", () => {
    expect(parsujCislo("12,5")).toBe(12.5);
    expect(parsujCislo("12.5")).toBe(12.5);
    expect(parsujCislo("1 234,56")).toBe(1234.56);
    expect(parsujCislo("1\u00a0234,56")).toBe(1234.56);
    expect(parsujCislo("1.234,56")).toBe(1234.56);
    expect(parsujCislo("1,234.56")).toBe(1234.56);
    expect(parsujCislo("1 234 567")).toBe(1234567);
    expect(parsujCislo("1.234.567")).toBe(1234567);
    expect(parsujCislo("0,00001")).toBe(0.00001);
    expect(parsujCislo(",5")).toBe(0.5);
    expect(parsujCislo("12,50 €")).toBe(12.5);
    expect(parsujCislo("23 %")).toBe(23);
    expect(parsujCislo(7)).toBe(7);
  });
  it("prázdne = null, nezmysel = NaN", () => {
    expect(parsujCislo("")).toBeNull();
    expect(parsujCislo("  ")).toBeNull();
    expect(parsujCislo(null)).toBeNull();
    expect(parsujCislo("abc")).toBeNaN();
    expect(parsujCislo("12,5,3x")).toBeNaN();
    expect(parsujCislo("1-2")).toBeNaN();
  });
});

describe("mapovanie hlavičiek", () => {
  it("export sa rozpozná celý", () => {
    const h = [
      "Kód",
      "Názov",
      "MJ",
      "Sadzba DPH",
      "Základná cena bez DPH",
      "Cena – Veľkoobchod",
      "Cena – VIP",
    ];
    expect(navrhniMapovanie(h, HL)).toEqual({
      0: "pole:code",
      1: "pole:name",
      2: "pole:unit",
      3: "pole:vat_rate",
      4: "pole:unit_price",
      5: "hladina:g-vo",
      6: "hladina:g-vip",
    });
  });
  it("iné názvy, diakritika, veľkosť písmen a neznáma hladina", () => {
    const h = [
      "SKU",
      "Názov produktu",
      "M.J.",
      "DPH %",
      "Cena bez DPH",
      "cena - velkoobchod",
      "Cena (E-shop)",
      "vip",
      "Poznámka",
      "ID",
    ];
    expect(navrhniMapovanie(h, HL)).toEqual({
      0: "pole:code",
      1: "pole:name",
      2: "pole:unit",
      3: "pole:vat_rate",
      4: "pole:unit_price",
      5: "hladina:g-vo",
      6: "nova:E-shop",
      7: "hladina:g-vip",
      9: "pole:external_id",
    });
  });
  it("to isté pole sa nepriradí dvom stĺpcom", () => {
    expect(navrhniMapovanie(["Cena", "Cena bez DPH"], HL)).toEqual({ 0: "pole:unit_price" });
  });
  it("názov hladiny z hlavičky", () => {
    expect(hladinaZHlavicky("Cena – Veľkoobchod")).toBe("Veľkoobchod");
    expect(hladinaZHlavicky("Cena - B2B - SK")).toBe("B2B - SK");
    expect(hladinaZHlavicky("Cena (VIP)")).toBe("VIP");
    expect(hladinaZHlavicky("Cena bez DPH")).toBeNull();
  });
  it("hlavička pod nadpisom", () => {
    const r = [["Cenník 2026"], [], ["Kód", "Názov", "Cena"], ["A", "B", "1"]];
    expect(najdiHlavicku(r, HL)).toBe(2);
  });
});

describe("CSV", () => {
  it("úvodzovky, bodkočiarka v bunke, BOM, CRLF a sep=", () => {
    expect(parsujCsv('\uFEFFa;b\r\n"x;y";"he said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x;y", 'he said "hi"'],
    ]);
    expect(parsujCsv("sep=,\na,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parsujCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("export", () => {
  const e = exportCennika(PR, HL, CE);
  it("stĺpce a iba ceny hladín od prvého kusu", () => {
    expect(e.hlavicka).toEqual([
      "Kód",
      "Názov",
      "MJ",
      "Sadzba DPH",
      "Základná cena bez DPH",
      "Cena – Veľkoobchod",
      "Cena – VIP",
    ]);
    const p1 = e.riadky.find((r) => r[0] === "A-001")!;
    expect(p1.slice(3)).toEqual([23, 0.25, 0.2, null]);
    const p2 = e.riadky.find((r) => r[0] === "00042")!;
    expect(p2.slice(5)).toEqual([null, 1.2]);
    const p3 = e.riadky.find((r) => r[1] === "Montáž")!;
    expect(p3.slice(5)).toEqual([null, null]); // cena odberateľa sa neexportuje
  });
  it("CSV: BOM, bodkočiarka, desatinná čiarka", () => {
    const csv = exportDoCsv(e);
    expect(
      csv.startsWith(
        "\uFEFFKód;Názov;MJ;Sadzba DPH;Základná cena bez DPH;Cena – Veľkoobchod;Cena – VIP\r\n",
      ),
    ).toBe(true);
    expect(csv).toContain("A-001;Skrutka M6;ks;23;0,25;0,20;\r\n");
    expect(csv).toContain('00042;"Matica; veľká ""M8""";ks;23;1,50;;1,20\r\n');
  });
});

describe("round-trip export → import bez zmien", () => {
  // Bez dvoch rovnakých názvov bez kódu — tie sa podľa názvu spárovať nedajú.
  const produkty = PR.slice(0, 3);
  const e = exportCennika(produkty, HL, CE);
  const over = (tab: string[][]) => {
    const i = najdiHlavicku(tab, HL);
    const h = tab[i];
    const p = naplanujImport(h, tab.slice(i + 1), navrhniMapovanie(h, HL), produkty, HL, CE, M);
    expect(p.chyby).toEqual([]);
    expect(p.noveProdukty).toEqual([]);
    expect(p.zmeneneCeny).toEqual([]);
    expect(p.zmeneneUdaje).toBe(0);
    expect(p.polozky).toEqual([]);
    expect(p.nezmenene).toBe(3);
  };
  it("CSV", async () => {
    const bajty = new TextEncoder().encode(exportDoCsv(e));
    over(await citajTabulku(bajty, "cennik.csv"));
  });
  it("XLSX (kód s úvodnými nulami ostane text)", async () => {
    const tab = await citajTabulku(await exportDoXlsx(e), "cennik.xlsx");
    expect(tab.some((r) => r[0] === "00042")).toBe(true);
    over(tab);
  });
});

describe("plán importu", () => {
  it("zmena cien a stará → nová", () => {
    const p = plan([["A-001", "", "", "", "0,30", "0,18", "0,22"]]);
    expect(p.zmeneneCeny).toEqual([
      { riadok: 2, produkt: "Skrutka M6", co: "Základná cena", stara: 0.25, nova: 0.3 },
      { riadok: 2, produkt: "Skrutka M6", co: "Veľkoobchod", stara: 0.2, nova: 0.18 },
      { riadok: 2, produkt: "Skrutka M6", co: "VIP", stara: null, nova: 0.22 },
    ]);
    expect(p.polozky).toEqual([
      {
        riadok: 2,
        product_id: "p1",
        unit_price: 0.3,
        ceny: [
          { hladina_id: "g-vo", cena: 0.18 },
          { hladina_id: "g-vip", cena: 0.22 },
        ],
      },
    ]);
  });
  it("prázdna bunka ceny hladiny cenu nemení", () => {
    const p = plan([["A-001", "", "", "", "", "", ""]]);
    expect(p.polozky).toEqual([]);
    expect(p.nezmenene).toBe(1);
  });
  it("s prepínačom prázdna bunka zmaže len existujúcu cenu hladiny", () => {
    const p = plan([["A-001", "", "", "", "", "", ""]], undefined, { prazdnaZmaze: true });
    expect(p.polozky).toEqual([
      { riadok: 2, product_id: "p1", ceny: [{ hladina_id: "g-vo", cena: null }] },
    ]);
    expect(p.zmeneneCeny).toEqual([
      { riadok: 2, produkt: "Skrutka M6", co: "Veľkoobchod", stara: 0.2, nova: null },
    ]);
  });
  it("párovanie: kód → externé ID → presný názov", () => {
    const h = ["Kód", "Externé ID", "Názov", "Cena – VIP"];
    const p = plan(
      [
        ["A-001", "", "", "1"], // kód
        ["", "E-42", "", "2"], // externé ID
        ["", "", "Montáž", "3"], // názov
        ["ZZZ", "", "Skrutka M6", "4"], // iný kód než má produkt s týmto názvom → nespáruje sa
        ["", "", "montáž", "5"], // názov musí sedieť presne
      ],
      h,
    );
    expect(p.polozky.map((x) => x.product_id)).toEqual(["p1", "p2", "p3"]);
    expect(p.chyby.map((c) => c.riadok)).toEqual([5, 6]);
    expect(p.chyby[0].chyba).toMatch(/nenašiel/);
  });
  it("kód sa páruje bez ohľadu na veľkosť písmen a medzery okolo", () => {
    expect(plan([[" a-001 ", "", "", "", "", "9", ""]]).polozky[0].product_id).toBe("p1");
  });
  it("dvojznačný názov je chyba, nie náhodný produkt", () => {
    const p = plan([["", "Rovnaký", "", "", "5", "", ""]]);
    expect(p.chyby[0].chyba).toMatch(/viac produktov/);
    expect(p.polozky).toEqual([]);
  });
  it("chyby: neplatné číslo, záporná cena, DPH mimo rozsahu, chýbajúci kód", () => {
    const p = plan(
      [
        ["A-001", "", "", "", "12x", "", ""],
        ["00042", "", "", "", "", "-1", ""],
        ["00042", "", "", "150", "", "", ""],
        ["", "Neznámy", "", "", "1", "", ""],
        ["", "", "", "", "", "", ""], // prázdny riadok sa preskočí potichu
      ],
      undefined,
      { vytvoritChybajuce: true },
    );
    expect(p.chyby.map((c) => [c.riadok, c.chyba])).toEqual([
      [2, "Neplatné číslo v stĺpci „Základná cena bez DPH“: 12x"],
      [3, "Záporné číslo v stĺpci „Cena – Veľkoobchod“: -1"],
      [4, "Hodnota v stĺpci „Sadzba DPH“ je mimo rozsahu: 150"],
      [5, "Chýba kód — nový produkt sa bez kódu nezaloží."],
    ]);
    expect(p.polozky).toEqual([]);
  });
  it("vytvoriť chýbajúce produkty s predvolenou MJ a DPH, ceny aj do novej hladiny", () => {
    const h = ["Kód", "Názov", "Cena", "Cena – VIP", "Cena – E-shop"];
    const p = plan([["N-1", "Nový", "10,5", "9", "9,5"]], h, {
      vytvoritChybajuce: true,
      predvolenaSadzba: 19,
    });
    expect(p.noveProdukty).toEqual([{ riadok: 2, code: "N-1", name: "Nový" }]);
    expect(p.noveHladiny).toEqual(["E-shop"]);
    expect(p.polozky).toEqual([
      {
        riadok: 2,
        product_id: null,
        code: "N-1",
        name: "Nový",
        unit: "ks",
        vat_rate: 19,
        unit_price: 10.5,
        ceny: [
          { hladina_id: "g-vip", cena: 9 },
          { hladina: "E-shop", cena: 9.5 },
        ],
      },
    ]);
  });
  it("bez prepínača sa chýbajúci produkt nezaloží", () => {
    const p = plan([["N-1", "Nový", "", "", "1", "", ""]]);
    expect(p.noveProdukty).toEqual([]);
    expect(p.chyby).toHaveLength(1);
  });
  it("ten istý produkt dvakrát v súbore", () => {
    const p = plan([
      ["A-001", "", "", "", "1", "", ""],
      ["a-001", "", "", "", "2", "", ""],
    ]);
    expect(p.polozky).toHaveLength(1);
    expect(p.chyby[0]).toMatchObject({ riadok: 3 });
    expect(p.chyby[0].chyba).toMatch(/viackrát/);
  });
  it("údaje produktu: mení sa len vyplnené, kód sa len doplní", () => {
    const h = ["Externé ID", "Kód", "Názov", "MJ", "Sadzba DPH"];
    const p = plan([["E-42", "", "Matica M8", "bal", "19"]], h);
    expect(p.zmeneneUdaje).toBe(1);
    expect(p.polozky[0]).toEqual({
      riadok: 2,
      product_id: "p2",
      name: "Matica M8",
      unit: "bal",
      vat_rate: 19,
      ceny: [],
    });
    // Produkt bez kódu dostane kód zo súboru.
    const p2 = plan([["", "M-1", "Montáž", "", ""]], h);
    expect(p2.polozky[0]).toMatchObject({ product_id: "p3", code: "M-1" });
  });
  it("chybové riadky na stiahnutie", () => {
    const h = ["Kód", "Cena"];
    const p = plan([["A-001", "x"]], h);
    expect(chybyDoCsv(h, p.chyby)).toBe(
      "\uFEFFRiadok;Kód;Cena;Chyba\r\n2;A-001;x;Neplatné číslo v stĺpci „Cena“: x\r\n",
    );
  });
  it("1000 produktov × 5 hladín sa naplánuje rýchlo", () => {
    const hl = Array.from({ length: 5 }, (_, i) => ({ id: `h${i}`, name: `H${i}` }));
    const pr = Array.from({ length: 1000 }, (_, i) => ({
      id: `p${i}`,
      code: `K${i}`,
      name: `P${i}`,
      unit: "ks",
      unit_price: 10,
      vat_rate: 23,
      external_id: null,
    }));
    const h = ["Kód", "Názov", "Cena", ...hl.map((x) => `Cena – ${x.name}`)];
    const r = pr.map((p) => [p.code, p.name, "11", "1", "2", "3", "4", "5"]);
    const t0 = performance.now();
    const p = naplanujImport(h, r, navrhniMapovanie(h, hl), pr, hl, [], M);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(p.polozky).toHaveLength(1000);
    expect(p.zmeneneCeny).toHaveLength(6000);
  });
});

describe("bod 4: cena na faktúre odberateľa s cenovou hladinou", () => {
  const podklady = (ceny: Podklady["ceny"], zlavaSkupiny = 10): Podklady => ({
    customer_id: "c1",
    price_group_id: "g-vo",
    zlavaOdberatela: null,
    zlavaSkupiny,
    datum: "2026-11-05",
    ceny,
    akcie: [],
  });
  it("cena z product_prices danej hladiny", () => {
    const r = cenaZPodkladov(
      podklady([{ product_id: "p1", price_group_id: "g-vo", unit_price: "8", min_quantity: 0 }]),
      { id: "p1", unit_price: 10 },
    );
    expect(r).toMatchObject({ cena: 8, zdroj: "skupina" });
  });
  it("bez ceny hladiny základná cena mínus zľava hladiny", () => {
    const r = cenaZPodkladov(podklady([]), { id: "p1", unit_price: 10 });
    expect(r).toMatchObject({ cena: 9, zdroj: "zlava-skupina" });
  });
  it("cena inej hladiny sa neuplatní", () => {
    const r = cenaZPodkladov(
      podklady([{ product_id: "p1", price_group_id: "g-vip", unit_price: "5", min_quantity: 0 }]),
      { id: "p1", unit_price: 10 },
    );
    expect(r).toMatchObject({ cena: 9, zdroj: "zlava-skupina" });
  });
  it("cena s prahom 1 (z importu) platí od prvého kusu", () => {
    const r = cenaZPodkladov(
      podklady([{ product_id: "p1", price_group_id: "g-vo", unit_price: "7", min_quantity: 1 }]),
      { id: "p1", unit_price: 10 },
      1,
    );
    expect(r).toMatchObject({ cena: 7, zdroj: "skupina" });
  });
  it("cena hladiny pre 1 500. produkt (nad strop 1 000 riadkov) sa nájde", () => {
    const ceny = Array.from({ length: 1500 }, (_, i) => ({
      product_id: `p${i}`,
      price_group_id: "g-vo",
      unit_price: 5,
      min_quantity: 0,
    }));
    expect(cenaZPodkladov(podklady(ceny), { id: "p1499", unit_price: 10 }).cena).toBe(5);
  });
});
