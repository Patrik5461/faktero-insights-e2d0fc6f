import { describe, expect, it } from "vitest";
import {
  knihaPokladni,
  kodPokladneDokladu,
  menaPokladneDokladu,
  nastaveniaPokladni,
  pokladnaDoFormulara,
  predvolenaPokladna,
  ukazatVyberPokladne,
  type Pokladna,
} from "./pokladne";

const EUR: Pokladna = { id: "p-eur", nazov: "Pokladňa", mena: "EUR", kod_pohoda: "HP", predvolena: true, aktivna: true, poradie: 0 };
const CZK: Pokladna = { id: "p-czk", nazov: "Pokladňa CZK", mena: "CZK", kod_pohoda: "HPCZ", predvolena: false, aktivna: true, poradie: 1 };
const STARA: Pokladna = { id: "p-old", nazov: "Stará", mena: "EUR", kod_pohoda: null, predvolena: false, aktivna: false, poradie: 2 };

describe("výber predvolenej pokladne", () => {
  it("predvolená je tá označená, inak prvá aktívna", () => {
    expect(predvolenaPokladna([CZK, EUR])?.id).toBe("p-eur");
    expect(predvolenaPokladna([{ ...EUR, predvolena: false }, STARA, CZK])?.id).toBe("p-eur");
    expect(predvolenaPokladna([])).toBeNull();
  });

  it("formulár sa vyplní predvolenou; doterajšia voľba ostáva", () => {
    expect(pokladnaDoFormulara([CZK, EUR])).toBe("p-eur");
    expect(pokladnaDoFormulara([CZK, EUR], "p-czk")).toBe("p-czk");
    // Archivovaná pokladňa uloženého dokladu sa potichu nezmení.
    expect(pokladnaDoFormulara([CZK, EUR, STARA], "p-old")).toBe("p-old");
    expect(pokladnaDoFormulara([CZK, EUR], "neznama")).toBe("p-eur");
    // Firma bez pokladne — databáza ju založí pri prvom doklade.
    expect(pokladnaDoFormulara([])).toBe("");
  });

  it("výber sa ukáže len pri viac ako jednej aktívnej pokladni", () => {
    expect(ukazatVyberPokladne([EUR])).toBe(false);
    expect(ukazatVyberPokladne([EUR, STARA])).toBe(false);
    expect(ukazatVyberPokladne([EUR, CZK])).toBe(true);
  });
});

describe("zostatky po pokladniach", () => {
  const doklady = [
    { id: "1", entry_number: "PD1", entry_date: "2026-10-01", type: "prijem", amount: "500", description: "Vklad", pokladna_id: "p-eur" },
    { id: "2", entry_number: "PD2", entry_date: "2026-10-02", type: "prijem", amount: "4000", description: "Vklad Kč", pokladna_id: "p-czk" },
    { id: "3", entry_number: "PD3", entry_date: "2026-11-03", type: "vydaj", amount: "250", description: "Poštovné Kč", pokladna_id: "p-czk" },
    // Starý pohyb bez pokladne patrí predvolenej.
    { id: "4", entry_number: "PD4", entry_date: "2026-11-02", type: "prijem", amount: "20", description: "Tržba" },
  ];
  const vydavky = [
    { id: "d1", issue_date: "2026-11-01", total_amount: "45.20", payment_method: "hotovost", supplier_name: "Benzínka", pokladna_id: "p-eur" },
    { id: "d2", issue_date: "2026-11-01", total_amount: "300", payment_method: "karta", supplier_name: "Kartou", pokladna_id: "p-eur" },
  ];

  it("každá pokladňa má vlastný zostatok v svojej mene", () => {
    const k = knihaPokladni({ pokladne: [EUR, CZK], doklady, vydavky, domaca: "EUR" });
    const eur = k.pokladne.find((p) => p.id === "p-eur")!;
    const czk = k.pokladne.find((p) => p.id === "p-czk")!;
    expect(eur.stav).toMatchObject({ prijmy: 520, vydavky: 45.2, zostatok: 474.8, mena: "EUR" });
    expect(czk.stav).toMatchObject({ prijmy: 4000, vydavky: 250, zostatok: 3750, mena: "CZK" });
  });

  it("„Všetky“ — meny sa nesčítavajú, súčty po menách, domáca prvá", () => {
    const k = knihaPokladni({ pokladne: [CZK, EUR], doklady, vydavky, domaca: "EUR" });
    expect(k.vybrana).toBeNull();
    expect(k.sucty.map((s) => [s.mena, s.zostatok])).toEqual([
      ["EUR", 474.8],
      ["CZK", 3750],
    ]);
    // Riadky oboch pokladní, najnovšie navrchu, zostatok v rámci svojej pokladne.
    expect(k.riadky[0]).toMatchObject({ id: "3", pokladna: "Pokladňa CZK", mena: "CZK", zostatok: 3750 });
    expect(k.riadky).toHaveLength(5);
  });

  it("vybraná pokladňa — len jej riadky a súčet, počiatočný stav mesiaca", () => {
    const k = knihaPokladni({ pokladne: [EUR, CZK], doklady, vydavky, vybrana: "p-czk", mesiac: "2026-11", domaca: "EUR" });
    expect(k.riadky.map((r) => r.id)).toEqual(["3"]);
    expect(k.sucty).toHaveLength(1);
    expect(k.sucty[0]).toMatchObject({ mena: "CZK", pociatocny: 4000, zostatok: 3750 });
  });

  it("dve pokladne v tej istej mene sa v „Všetky“ sčítajú", () => {
    const druha: Pokladna = { ...CZK, id: "p-2", nazov: "Predajňa", mena: "EUR" };
    const k = knihaPokladni({
      pokladne: [EUR, druha],
      doklady: [{ id: "x", entry_number: "PD9", entry_date: "2026-10-01", type: "prijem", amount: 100, description: "x", pokladna_id: "p-2" }],
      vydavky: [],
      domaca: "EUR",
    });
    expect(k.sucty).toEqual([expect.objectContaining({ mena: "EUR", zostatok: 100 })]);
  });

  it("firma bez pokladne — kniha ako doteraz v domácej mene", () => {
    const k = knihaPokladni({ pokladne: [], doklady, vydavky, domaca: "CZK" });
    expect(k.pokladne).toHaveLength(1);
    expect(k.sucty).toHaveLength(1);
    expect(k.sucty[0]).toMatchObject({ mena: "CZK", zostatok: centy(500 + 4000 - 250 + 20 - 45.2) });
  });

  it("neznáma vybraná pokladňa = všetky", () => {
    expect(knihaPokladni({ pokladne: [EUR, CZK], doklady, vydavky, vybrana: "cudzia" }).vybrana).toBeNull();
  });
});

function centy(n: number) {
  return Math.round(n * 100) / 100;
}

describe("skratka pokladne pre export", () => {
  const nast = nastaveniaPokladni([EUR, CZK, STARA], "FIRMA");

  it("predvolená pokladňa so skratkou prebíja nastavenie firmy", () => {
    expect(nast.pokladna).toBe("HP");
    expect(nastaveniaPokladni([{ ...EUR, kod_pohoda: null }], "FIRMA").pokladna).toBe("FIRMA");
    expect(nastaveniaPokladni([], " HP ").pokladna).toBe("HP");
    expect(nastaveniaPokladni(null, "").pokladna).toBeNull();
  });

  it("poradie: ručne na doklade → pokladňa dokladu → predvolená", () => {
    expect(kodPokladneDokladu({ pohoda_pokladna: "RUC", pokladna_id: "p-czk" }, nast)).toBe("RUC");
    expect(kodPokladneDokladu({ pokladna_id: "p-czk" }, nast)).toBe("HPCZ");
    expect(kodPokladneDokladu({ pokladna_id: "p-old" }, nast)).toBe("HP");
    expect(kodPokladneDokladu({}, nast)).toBe("HP");
    expect(kodPokladneDokladu({}, {})).toBe("");
  });

  it("mena pokladne dokladu", () => {
    expect(menaPokladneDokladu({ pokladna_id: "p-czk" }, nast)).toBe("CZK");
    expect(menaPokladneDokladu({}, nast)).toBeNull();
  });
});
