import { describe, expect, it } from "vitest";
import { normalizujPreukaz, podliehaDmv, terminyNaRiesenie, terminyVozidla } from "./vozovy-park";

describe("terminyVozidla", () => {
  const dnes = "2026-10-24";
  it("zoradí od najbližšieho a určí stav", () => {
    const t = terminyVozidla(
      {
        stk_do: "2027-03-01",
        pzp_do: "2026-11-10",
        dialnicna_znamka_do: "2026-10-01",
        ek_do: null,
      },
      dnes,
    );
    expect(t.map((x) => x.kluc)).toEqual(["dialnicna_znamka_do", "pzp_do", "stk_do"]);
    expect(t.map((x) => x.stav)).toEqual(["prepadnute", "coskoro", "ok"]);
    expect(t[1].dni).toBe(17);
  });
  it("na riešenie len prepadnuté a do 30 dní, dnešok je ešte platný", () => {
    const t = terminyNaRiesenie(
      { stk_do: dnes, pzp_do: "2026-11-24", havarijne_do: "2026-11-23" },
      dnes,
    );
    expect(t.map((x) => [x.kluc, x.stav])).toEqual([
      ["stk_do", "coskoro"],
      ["havarijne_do", "coskoro"],
    ]);
  });
});

describe("podliehaDmv", () => {
  it("osobné a dodávky nie, nákladné nad 3,5 t áno", () => {
    expect(podliehaDmv("M1")).toBe(false);
    expect(podliehaDmv("N1")).toBe(false);
    expect(podliehaDmv("N2")).toBe(true);
    expect(podliehaDmv(null)).toBe(false);
  });
});

describe("normalizujPreukaz", () => {
  it("uprace formát a zahodí nezmysly", () => {
    const p = normalizujPreukaz({
      license_plate: "ba 123 xy",
      vin: "wvw zzz 1jz yw000001",
      kategoria: "M1G",
      rok_vyroby: "2021",
      objem_cm3: "1 968",
      vykon_kw: "110,5",
      fuel_type: "Nafta",
      vlastnik_ico: "12 345 678",
      datum_prvej_evidencie: "15.03.2021",
      znacka: "null",
    });
    expect(p.license_plate).toBe("BA123XY");
    expect(p.vin).toBe("WVWZZZ1JZYW000001");
    expect(p.kategoria).toBe("M1");
    expect(p.rok_vyroby).toBe(2021);
    expect(p.objem_cm3).toBe(1968);
    expect(p.vykon_kw).toBe(110.5);
    expect(p.fuel_type).toBe("diesel");
    expect(p.vlastnik_ico).toBe("12345678");
    expect(p.datum_prvej_evidencie).toBeNull();
    expect(p.znacka).toBeNull();
  });
  it("VIN s písmenom O alebo I neprejde", () => {
    expect(normalizujPreukaz({ vin: "WVWZZZ1JZYO000001" }).vin).toBeNull();
  });
});
