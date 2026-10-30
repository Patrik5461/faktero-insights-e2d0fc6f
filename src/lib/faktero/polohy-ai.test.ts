import { describe, expect, it } from "vitest";
import { prazdneUdaje } from "./nespracovane";
import { obdlznikZBox2d, POKYN_POLOH, polohyZAi, type PolohaAi } from "./polohy-ai";
import { slovaZUseku, type SlovoNahladu } from "./vyber-z-dokladu";
import { polohaPlati, zvyrazneniaUdajov } from "./zvyraznenie-vytazenych";

describe("obdlznikZBox2d", () => {
  it("prevedie [ymin, xmin, ymax, xmax] v mierke 0–1000 na zlomky strany", () => {
    expect(obdlznikZBox2d([100, 200, 150, 400])).toEqual({ x: 0.2, y: 0.1, w: 0.2, h: 0.05 });
    // Aj čísla ako text a prehodené rohy.
    expect(obdlznikZBox2d(["150", "400", "100", "200"])).toEqual({
      x: 0.2,
      y: 0.1,
      w: 0.2,
      h: 0.05,
    });
  });

  it("nezmysel zahodí", () => {
    expect(obdlznikZBox2d(null)).toBeNull();
    expect(obdlznikZBox2d([1, 2, 3])).toBeNull();
    expect(obdlznikZBox2d([0, 0, 0, 100])).toBeNull(); // nulová výška
    expect(obdlznikZBox2d([0, 0, 1200, 100])).toBeNull(); // mimo strany
    expect(obdlznikZBox2d([0, 0, 1000, 1000])).toBeNull(); // celá strana nie je hodnota
    expect(obdlznikZBox2d([10, "x", 20, 30])).toBeNull();
  });
});

describe("polohyZAi", () => {
  const ai = {
    invoice_number: "FA2026001",
    amount_total: 123.4,
    supplier_name: "Dodávateľ s.r.o.",
    field_locations: {
      invoice_number: { page: 1, box_2d: [100, 600, 130, 800] },
      amount_total: { page: 2, box_2d: [900, 700, 930, 900] },
      supplier_name: { box: [50, 50, 80, 300] }, // bez strany = prvá
      neznamy_kluc: { page: 1, box_2d: [1, 1, 2, 2] },
      due_date: { page: 1, box_2d: "zle" },
      issue_date: { page: 0, box_2d: [1, 1, 20, 20] },
    },
  };

  it("vráti polohy známych polí s hodnotou, ktorú AI prečítala", () => {
    const p = polohyZAi(ai);
    expect(p.map((x) => x.kluc).sort()).toEqual(["celkom", "cislo", "dodavatel.nazov"]);
    expect(p.find((x) => x.kluc === "celkom")).toMatchObject({ strana: 1, hodnota: 123.4 });
    expect(p.find((x) => x.kluc === "dodavatel.nazov")?.strana).toBe(0);
  });

  it("bez field_locations (starší doklad, ISDOC) nič", () => {
    expect(polohyZAi(null)).toEqual([]);
    expect(polohyZAi({ invoice_number: "1" })).toEqual([]);
    expect(polohyZAi({ field_locations: [] })).toEqual([]);
  });

  it("pokyn pýta box_2d pre všetky mapované polia", () => {
    expect(POKYN_POLOH).toContain('"field_locations"');
    expect(POKYN_POLOH).toContain("box_2d");
    expect(POKYN_POLOH).toContain('"supplier_iban"');
  });
});

describe("zvýraznenie podľa polôh od AI", () => {
  const u = prazdneUdaje();
  u.cislo = "FA2026001";
  u.celkom = -123.4; // dobropis — v údajoch záporný
  u.datumVystavenia = "2026-10-12";
  u.dodavatel.ico = "00123456";
  const polohy: PolohaAi[] = [
    { kluc: "cislo", strana: 0, r: { x: 0.6, y: 0.1, w: 0.2, h: 0.03 }, hodnota: "FA2026001" },
    { kluc: "celkom", strana: 1, r: { x: 0.7, y: 0.9, w: 0.2, h: 0.03 }, hodnota: 123.4 },
    {
      kluc: "datumVystavenia",
      strana: 0,
      r: { x: 0.6, y: 0.2, w: 0.2, h: 0.03 },
      hodnota: "2026-10-12",
    },
    {
      kluc: "dodavatel.ico",
      strana: 0,
      r: { x: 0.1, y: 0.2, w: 0.2, h: 0.03 },
      hodnota: "123456",
    },
  ];

  it("poloha platí, len kým hodnota poľa sedí s tou od AI", () => {
    expect(polohaPlati(polohy[0], u)).toBe(true);
    expect(polohaPlati(polohy[1], u)).toBe(true);
    expect(polohaPlati(polohy[3], u)).toBe(true); // IČO bez úvodných núl
    expect(polohaPlati(polohy[0], { ...u, cislo: "FA2026002" })).toBe(false);
    expect(polohaPlati(polohy[0], { ...u, cislo: "" })).toBe(false);
    expect(polohaPlati({ ...polohy[0], hodnota: null }, u)).toBe(false);
  });

  it("obrázok bez textovej vrstvy dostane rámčeky z polôh", () => {
    const z = zvyrazneniaUdajov([[]], u, undefined, polohy);
    expect(z.map((x) => x.kluc).sort()).toEqual([
      "celkom",
      "cislo",
      "datumVystavenia",
      "dodavatel.ico",
    ]);
    expect(z.find((x) => x.kluc === "celkom")).toMatchObject({ strana: 1, r: [polohy[1].r] });
  });

  it("bez polôh na obrázku nič — ako doteraz", () => {
    expect(zvyrazneniaUdajov([[]], u)).toEqual([]);
  });

  it("textová vrstva má prednosť, poloha od AI doplní len to, čo sa v texte nenašlo", () => {
    const slova: SlovoNahladu[] = slovaZUseku(
      { str: "Faktúra FA2026001", x: 0.1, y: 0.05, w: 0.17, h: 0.03 },
      (s) => s.length,
    );
    const z = zvyrazneniaUdajov([slova, []], u, undefined, polohy);
    const cislo = z.filter((x) => x.kluc === "cislo");
    expect(cislo).toHaveLength(1);
    expect(cislo[0].r[0]).not.toEqual(polohy[0].r); // z textu, nie od AI
    expect(z.some((x) => x.kluc === "celkom" && x.strana === 1)).toBe(true);
  });

  it("pole, ktoré formulár pri druhu neukazuje, sa nezvýrazní", () => {
    const z = zvyrazneniaUdajov([[]], u, ["cislo"], polohy);
    expect(z.map((x) => x.kluc)).toEqual(["cislo"]);
  });

  it("názov dodávateľa sa zvýrazní len podľa polohy od AI", () => {
    const s = { ...u, dodavatel: { ...u.dodavatel, nazov: "Dodávateľ s.r.o." } };
    const p: PolohaAi = {
      kluc: "dodavatel.nazov",
      strana: 0,
      r: { x: 0.05, y: 0.05, w: 0.25, h: 0.03 },
      hodnota: "Dodávateľ s.r.o.",
    };
    expect(zvyrazneniaUdajov([[]], s, ["dodavatel.nazov"], [p])).toHaveLength(1);
  });
});
