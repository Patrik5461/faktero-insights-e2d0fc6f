import { describe, expect, it } from "vitest";
import {
  casVBratislave,
  klucTrvania,
  predvolenyText,
  stavOznamu,
  vyberOznam,
  type PlatformovyOznam,
} from "./oznam-aktualizacie";

const MIN = 60_000;
const ZACIATOK = Date.parse("2026-11-02T11:30:00Z"); // 12:30 v Bratislave (SEČ)

function oznam(z: Partial<PlatformovyOznam> = {}): PlatformovyOznam {
  return {
    id: "o1",
    typ: "aktualizacia",
    text: null,
    zaciatok: new Date(ZACIATOK).toISOString(),
    trvanie_min: 2,
    plati_do: null,
    aktivny: true,
    ...z,
  };
}

const RANO = ZACIATOK - 3 * 60 * MIN; // stránka načítaná dávno pred aktualizáciou

describe("stavOznamu", () => {
  it("nič, keď oznam chýba alebo je vypnutý", () => {
    expect(stavOznamu(null, ZACIATOK, RANO, false).faza).toBe("nic");
    expect(stavOznamu(oznam({ aktivny: false }), ZACIATOK, RANO, false).faza).toBe("nic");
  });

  it("viac než 30 min pred začiatkom nič", () => {
    expect(stavOznamu(oznam(), ZACIATOK - 31 * MIN, RANO, false).faza).toBe("nic");
  });

  it("do 30 min pred začiatkom okno, po zavretí len pás", () => {
    const s = stavOznamu(oznam(), ZACIATOK - 30 * MIN, RANO, false);
    expect(s.faza).toBe("pred");
    expect(s.faza !== "nic" && s.okno).toBe(true);
    const v = stavOznamu(oznam(), ZACIATOK - 5 * MIN, RANO, true);
    expect(v.faza).toBe("pred");
    expect(v.faza !== "nic" && v.okno).toBe(false);
  });

  it("počas aktualizácie bez okna", () => {
    const s = stavOznamu(oznam(), ZACIATOK, RANO, false);
    expect(s.faza).toBe("pocas");
    expect(s.faza !== "nic" && s.okno).toBe(false);
    expect(stavOznamu(oznam(), ZACIATOK + 2 * MIN - 1, RANO, false).faza).toBe("pocas");
  });

  it("po skončení „aktualizované“ do plati_do (predvolene koniec + 30 min)", () => {
    expect(stavOznamu(oznam(), ZACIATOK + 2 * MIN, RANO, false).faza).toBe("po");
    expect(stavOznamu(oznam(), ZACIATOK + 31 * MIN, RANO, false).faza).toBe("po");
    expect(stavOznamu(oznam(), ZACIATOK + 32 * MIN, RANO, false).faza).toBe("nic");
    const doDesat = oznam({ plati_do: new Date(ZACIATOK + 10 * MIN).toISOString() });
    expect(stavOznamu(doDesat, ZACIATOK + 9 * MIN, RANO, false).faza).toBe("po");
    expect(stavOznamu(doDesat, ZACIATOK + 10 * MIN, RANO, false).faza).toBe("nic");
  });

  it("stránka načítaná po skončení (po Obnoviť) už „aktualizované“ neukáže", () => {
    const koniec = ZACIATOK + 2 * MIN;
    expect(stavOznamu(oznam(), koniec + 5 * MIN, koniec + 1000, false).faza).toBe("nic");
    // načítaná počas aktualizácie → ešte staré vydanie
    expect(stavOznamu(oznam(), koniec + 5 * MIN, koniec - 1000, false).faza).toBe("po");
  });

  it("plati_do pred koncom ukončí aj prebiehajúcu fázu", () => {
    const o = oznam({ plati_do: new Date(ZACIATOK + MIN).toISOString() });
    expect(stavOznamu(o, ZACIATOK + MIN, RANO, false).faza).toBe("nic");
  });

  it("info pás od začiatku po plati_do, bez textu nič", () => {
    const o = oznam({
      typ: "info",
      text: "Dnes večer údržba banky.",
      plati_do: new Date(ZACIATOK + 60 * MIN).toISOString(),
    });
    expect(stavOznamu(o, ZACIATOK - MIN, RANO, false).faza).toBe("nic");
    expect(stavOznamu(o, ZACIATOK + MIN, RANO, false).faza).toBe("info");
    expect(stavOznamu(o, ZACIATOK + 60 * MIN, RANO, false).faza).toBe("nic");
    expect(stavOznamu({ ...o, text: " " }, ZACIATOK + MIN, RANO, false).faza).toBe("nic");
  });

  it("neznámy typ a nezmyselný dátum nič", () => {
    expect(stavOznamu(oznam({ typ: "iny" }), ZACIATOK, RANO, false).faza).toBe("nic");
    expect(stavOznamu(oznam({ zaciatok: "x" }), ZACIATOK, RANO, false).faza).toBe("nic");
  });
});

describe("vyberOznam", () => {
  it("prebiehajúca má prednosť pred blížiacou sa a info", () => {
    const pred = oznam({ id: "a", zaciatok: new Date(ZACIATOK + 10 * MIN).toISOString() });
    const pocas = oznam({ id: "b" });
    const info = oznam({ id: "c", typ: "info", text: "x" });
    const s = vyberOznam([info, pred, pocas], ZACIATOK + MIN, RANO, () => false);
    expect(s.faza === "pocas" && s.oznam.id).toBe("b");
  });

  it("v rovnakej fáze vyhrá skorší začiatok; prázdny zoznam nič", () => {
    const a = oznam({ id: "a", zaciatok: new Date(ZACIATOK + 20 * MIN).toISOString() });
    const b = oznam({ id: "b", zaciatok: new Date(ZACIATOK + 10 * MIN).toISOString() });
    const s = vyberOznam([a, b], ZACIATOK, RANO, (id) => id === "b");
    expect(s.faza === "pred" && s.oznam.id).toBe("b");
    expect(s.faza !== "nic" && s.okno).toBe(false);
    expect(vyberOznam([], ZACIATOK, RANO, () => false).faza).toBe("nic");
  });
});

describe("texty", () => {
  it("čas v Bratislave (zima aj leto)", () => {
    expect(casVBratislave(ZACIATOK)).toBe("12:30");
    expect(casVBratislave(Date.parse("2026-07-01T10:05:00Z"))).toBe("12:05");
  });

  it("skloňovanie minút", () => {
    expect(klucTrvania(1)).toBe("asi 1 minútu");
    expect(klucTrvania(3)).toBe("asi {n} minúty");
    expect(klucTrvania(5)).toBe("asi {n} minút");
  });

  it("predvolený text", () => {
    expect(predvolenyText(ZACIATOK, 1)).toBe(
      "Aktualizácia o 12:30 – Faktero bude asi 1 minútu nedostupné. Rozpísanú prácu si uložte.",
    );
  });
});
