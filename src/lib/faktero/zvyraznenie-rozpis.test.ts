/*
  Zvýraznenie všetkých vyťažených údajov — rozpis DPH podľa hlavičky stĺpca
  (nie podľa poradia), súčty, položky, odberateľ, dátumy. Rozloženia strán
  napodobňujú oba chybné doklady z `__fixtures__/rozpis-dph`.
*/
import { describe, expect, it } from "vitest";
import riss from "./__fixtures__/rozpis-dph/riss-0-a-23.json";
import registracia from "./__fixtures__/rozpis-dph/registracny-poplatok-mimo-dph.json";
import { OCAKAVANY_REGISTRACIA, OCAKAVANY_RISS } from "./__fixtures__/rozpis-dph/vystupy";
import { prazdneUdaje, type UdajeNespracovaneho } from "./nespracovane";
import { doplnokZAi, polohyZAi, POKYN_POLOH } from "./polohy-ai";
import { slovaZUseku, type SlovoNahladu } from "./vyber-z-dokladu";
import {
  jeAktivne,
  udajeNaZvyraznenie,
  zvyrazneniaUdajov,
  type Zvyraznenie,
} from "./zvyraznenie-vytazenych";

/** Bunka textu na mieste (x, y) — šírka podľa dĺžky ako pri bežnom písme. */
function bunka(str: string, x: number, y: number): SlovoNahladu[] {
  return slovaZUseku({ str, x, y, w: 0.008 * str.length, h: 0.02 }, (s) => s.length);
}

function udajeZFixture(f: Record<string, any>, rozpis: readonly any[]): UdajeNespracovaneho {
  const u = prazdneUdaje();
  u.dodavatel.nazov = f.supplier_name;
  u.cislo = f.invoice_number;
  u.datumVystavenia = f.issue_date;
  u.datumDodania = f.delivery_date;
  u.mena = f.currency;
  u.celkom = f.amount_total;
  u.rozpis = rozpis.map((r) => ({ ...r }));
  u.polozky = f.items.map((p: any) => ({
    name: p.name,
    quantity: p.quantity,
    unit: p.unit ?? null,
    unit_price: p.unit_price,
    vat_rate: p.vat_rate,
    total: p.total,
  }));
  return u;
}

const kde = (z: Zvyraznenie[], kluc: string) =>
  z
    .filter((x) => x.kluc === kluc)
    .map((x) => ({ x: +x.r[0].x.toFixed(2), y: +x.r[0].y.toFixed(2) }));

describe("RISS — rozpis po riadkoch (0 % prenesenie a 23 %)", () => {
  const strana = [
    ...bunka("Dátum vystavenia:", 0.6, 0.1),
    ...bunka("29.10.2026", 0.76, 0.1),
    ...bunka("Dátum dodania:", 0.6, 0.13),
    ...bunka("29.10.2026", 0.76, 0.13),
    ...bunka("Názov", 0.05, 0.3),
    ...bunka("Množ.", 0.45, 0.3),
    ...bunka("Cena/MJ", 0.55, 0.3),
    ...bunka("DPH %", 0.68, 0.3),
    ...bunka("Spolu", 0.8, 0.3),
    ...bunka("Debniaca tvárnica P+D 300x250x500 48ks/pal", 0.05, 0.33),
    ...bunka("60", 0.45, 0.33),
    ...bunka("1,5235", 0.55, 0.33),
    ...bunka("23", 0.68, 0.33),
    ...bunka("91,41", 0.8, 0.33),
    ...bunka("Bet.oceľ hrebienková 6mm 6m", 0.05, 0.36),
    ...bunka("20", 0.45, 0.36),
    ...bunka("1,3452", 0.55, 0.36),
    ...bunka("0", 0.68, 0.36),
    ...bunka("26,90", 0.8, 0.36),
    ...bunka("Doprava", 0.05, 0.39),
    ...bunka("16", 0.45, 0.39),
    ...bunka("1,20", 0.55, 0.39),
    ...bunka("23", 0.68, 0.39),
    ...bunka("19,20", 0.8, 0.39),
    // Rekapitulácia po riadkoch: Základ | Sadzba | DPH
    ...bunka("Základ", 0.5, 0.55),
    ...bunka("Sadzba", 0.65, 0.55),
    ...bunka("DPH", 0.78, 0.55),
    ...bunka("26,90", 0.5, 0.58),
    ...bunka("0 %", 0.65, 0.58),
    ...bunka("0,00", 0.78, 0.58),
    ...bunka("116,87", 0.5, 0.61),
    ...bunka("23 %", 0.65, 0.61),
    ...bunka("26,88", 0.78, 0.61),
    ...bunka("Spolu bez DPH", 0.5, 0.66),
    ...bunka("143,77", 0.78, 0.66),
    ...bunka("DPH", 0.5, 0.69),
    ...bunka("26,88", 0.78, 0.69),
    ...bunka("Celkom k úhrade", 0.5, 0.72),
    ...bunka("170,65 EUR", 0.78, 0.72),
    ...bunka("Prenesenie daňovej povinnosti podľa § 69 ods. 12 písm. f) zákona o DPH", 0.05, 0.8),
  ];
  const u = udajeZFixture(riss, OCAKAVANY_RISS);
  const doplnok = doplnokZAi(riss);
  const z = zvyrazneniaUdajov([strana], u, undefined, [], doplnok);

  it("riadky rozpisu ukazujú do rekapitulácie, nie na položky", () => {
    expect(kde(z, "rozpis.0.zaklad")).toEqual([{ x: 0.5, y: 0.58 }]);
    expect(kde(z, "rozpis.1.zaklad")).toEqual([{ x: 0.5, y: 0.61 }]);
    expect(kde(z, "rozpis.1.dph")).toEqual([{ x: 0.78, y: 0.61 }]);
    // DPH 0 sa nehľadá (0,00 je na doklade všade).
    expect(kde(z, "rozpis.0.dph")).toEqual([]);
  });

  it("DPH spolu a DPH riadku 23 % majú rovnakú hodnotu, ale iné miesto", () => {
    expect(kde(z, "dph")).toEqual([{ x: 0.78, y: 0.69 }]);
    expect(kde(z, "bezDph")).toEqual([{ x: 0.78, y: 0.66 }]);
    expect(kde(z, "celkom")).toEqual([{ x: 0.78, y: 0.72 }]);
  });

  it("položky — suma riadku v riadku položky, nie v rekapitulácii", () => {
    expect(kde(z, "polozky.1.spolu")).toEqual([{ x: 0.8, y: 0.36 }]);
    expect(kde(z, "polozky.0.mnozstvo")).toEqual([{ x: 0.45, y: 0.33 }]);
    expect(kde(z, "polozky.0.nazov")).toHaveLength(1);
    expect(kde(z, "polozky.3.sadzba")).toEqual([{ x: 0.68, y: 0.39 }]);
  });

  it("dátum vystavenia a dodania s rovnakou hodnotou podľa popisu v riadku", () => {
    expect(kde(z, "datumVystavenia")).toEqual([{ x: 0.76, y: 0.1 }]);
    expect(kde(z, "datumDodania")).toEqual([{ x: 0.76, y: 0.13 }]);
  });

  it("text o prenesení daňovej povinnosti a popisy so sadzbou a kategóriou", () => {
    expect(kde(z, "prenesenie")).toHaveLength(1);
    const r0 = z.find((x) => x.kluc === "rozpis.0.zaklad")!;
    expect(r0.skupina).toBe("dph");
    expect(r0.popis).toBe("Prenesenie daňovej povinnosti — základ");
    const r1 = z.find((x) => x.kluc === "rozpis.1.dph")!;
    expect(r1.popis).toBe("DPH {sadzba} %");
    expect(r1.popisParam).toEqual({ sadzba: "23" });
    expect(r1.text).toBe("26,88");
  });
});

describe("Registračný poplatok — stĺpcová rekapitulácia podľa hlavičky", () => {
  const strana = [
    ...bunka("Registračný poplatok", 0.05, 0.3),
    ...bunka("1", 0.45, 0.3),
    ...bunka("360,00", 0.55, 0.3),
    ...bunka("0 %", 0.68, 0.3),
    ...bunka("360,00", 0.8, 0.3),
    ...bunka("Administratívny poplatok", 0.05, 0.33),
    ...bunka("1", 0.45, 0.33),
    ...bunka("24,39", 0.55, 0.33),
    ...bunka("23 %", 0.68, 0.33),
    ...bunka("24,39", 0.8, 0.33),
    // Nie je predmetom DPH | Oslobodené | 1. Znížená | Základná | Celkom
    ...bunka("Nie je predmetom DPH", 0.25, 0.5),
    ...bunka("Oslobodené", 0.42, 0.5),
    ...bunka("1. Znížená", 0.55, 0.5),
    ...bunka("Základná", 0.68, 0.5),
    ...bunka("Celkom", 0.82, 0.5),
    ...bunka("Základ dane:", 0.05, 0.53),
    ...bunka("360,00", 0.27, 0.53),
    ...bunka("0,00", 0.43, 0.53),
    ...bunka("0,00", 0.56, 0.53),
    ...bunka("24,39", 0.69, 0.53),
    ...bunka("384,39", 0.83, 0.53),
    ...bunka("Daň:", 0.05, 0.56),
    ...bunka("–", 0.27, 0.56),
    ...bunka("–", 0.43, 0.56),
    ...bunka("0,00", 0.56, 0.56),
    ...bunka("5,61", 0.69, 0.56),
    ...bunka("5,61", 0.83, 0.56),
    ...bunka("K úhrade", 0.55, 0.62),
    ...bunka("390,00 €", 0.8, 0.62),
  ];
  const u = udajeZFixture(registracia, OCAKAVANY_REGISTRACIA);
  const z = zvyrazneniaUdajov([strana], u);

  it("„Nie je predmetom DPH“ ukazuje do svojho stĺpca, nie na položku", () => {
    expect(kde(z, "rozpis.0.zaklad")).toEqual([{ x: 0.27, y: 0.53 }]);
    const r = z.find((x) => x.kluc === "rozpis.0.zaklad")!;
    expect(r.popis).toBe("Nie je predmetom DPH — suma");
  });

  it("23 % je v stĺpci „Základná“, nie v stĺpci „Celkom“", () => {
    expect(kde(z, "rozpis.1.zaklad")).toEqual([{ x: 0.69, y: 0.53 }]);
    expect(kde(z, "rozpis.1.dph")).toEqual([{ x: 0.69, y: 0.56 }]);
  });

  it("stĺpec „Celkom“ patrí súčtom", () => {
    expect(kde(z, "bezDph")).toEqual([{ x: 0.83, y: 0.53 }]);
    expect(kde(z, "dph")).toEqual([{ x: 0.83, y: 0.56 }]);
    expect(kde(z, "celkom")).toEqual([{ x: 0.8, y: 0.62 }]);
    // Žiadny riadok rozpisu nesmie ukazovať do stĺpca „Celkom“.
    for (const x of z.filter((x) => x.kluc.startsWith("rozpis.")))
      expect(x.r[0].x).toBeLessThan(0.8);
  });

  it("položky v riadkoch položiek", () => {
    expect(kde(z, "polozky.0.spolu")).toEqual([{ x: 0.55, y: 0.3 }]);
    expect(kde(z, "polozky.1.sadzba")).toEqual([{ x: 0.68, y: 0.33 }]);
  });
});

describe("údaje zvýraznenia", () => {
  it("odberateľ, SWIFT, forma úhrady a záloha z doplnku AI", () => {
    const u = prazdneUdaje();
    u.celkom = 100;
    u.dodavatel.ico = "12345678";
    const d = doplnokZAi({
      buyer_name: "Moja firma s.r.o.",
      buyer_ico: "87654321",
      buyer_street: "Hlavná 1",
      supplier_swift: "tatr skbx",
      payment_method_text: "Prevodným príkazom",
      prepaid_amount: 40,
    });
    const ids = udajeNaZvyraznenie(u, undefined, d).map((x) => x.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "odberatel.nazov",
        "odberatel.ico",
        "odberatel.ulica",
        "swift",
        "platba",
        "zaloha",
        "kUhrade",
      ]),
    );
    const z = zvyrazneniaUdajov(
      [
        [
          ...bunka("Odberateľ: Moja firma s.r.o.", 0.5, 0.1),
          ...bunka("IČO: 87654321", 0.5, 0.13),
          ...bunka("IČO: 12345678", 0.05, 0.13),
          ...bunka("SWIFT: TATRSKBX", 0.05, 0.2),
          ...bunka("Forma úhrady: Prevodným príkazom", 0.05, 0.23),
          ...bunka("Spolu 100,00", 0.6, 0.6),
          ...bunka("Záloha 40,00", 0.6, 0.63),
          ...bunka("K úhrade 60,00", 0.6, 0.66),
        ],
      ],
      u,
      undefined,
      [],
      d,
    );
    expect(z.find((x) => x.kluc === "odberatel.ico")?.skupina).toBe("odberatel");
    expect(kde(z, "odberatel.ico")[0].x).toBeGreaterThan(0.5);
    expect(kde(z, "dodavatel.ico")[0].x).toBeLessThan(0.3);
    for (const k of ["swift", "platba", "zaloha", "kUhrade", "celkom", "odberatel.nazov"])
      expect(kde(z, k), k).toHaveLength(1);
  });

  it("dokument „ostatný“ — bez súm, rozpisu a položiek", () => {
    const u = udajeZFixture(registracia, OCAKAVANY_REGISTRACIA);
    const ids = udajeNaZvyraznenie(u, ["dodavatel.nazov", "ostatny.predmet"]).map((x) => x.id);
    expect(ids).toEqual(["dodavatel.nazov"]);
  });

  it("aktívne pole: kľúč formulára aj id údaja", () => {
    expect(jeAktivne({ kluc: "celkom", pole: "celkom" }, "celkom")).toBe(true);
    expect(jeAktivne({ kluc: "rozpis.1.dph", pole: null }, "rozpis.1.dph")).toBe(true);
    expect(jeAktivne({ kluc: "rozpis.1.dph", pole: null }, "dph")).toBe(false);
    expect(jeAktivne({ kluc: "dph", pole: null }, null)).toBe(false);
  });
});

describe("polohy od AI pre rozpis a položky (sken)", () => {
  const ai = {
    ...registracia,
    field_locations: {
      "vat_breakdown[3].base": { page: 1, box_2d: [530, 690, 550, 740] },
      "vat_breakdown[3].vat": { page: 1, box_2d: [560, 690, 580, 740] },
      // vnorený tvar
      items: [{ name: { page: 1, box_2d: [300, 50, 320, 300] } }],
      amount_without_vat: { page: 1, box_2d: [530, 830, 550, 880] },
      buyer_ico: { page: 1, box_2d: [100, 500, 120, 600] },
    },
    buyer_ico: "87654321",
  };
  const polohy = polohyZAi(ai);
  const u = udajeZFixture(registracia, OCAKAVANY_REGISTRACIA);

  it("riadok rozpisu od AI sa priradí podľa hodnoty, nie podľa indexu", () => {
    expect(polohy.map((p) => p.kluc).sort()).toEqual(
      ["bezDph", "odberatel.ico", "polozky.*.nazov", "rozpis.*.dph", "rozpis.*.zaklad"].sort(),
    );
    const z = zvyrazneniaUdajov([[]], u, undefined, polohy, doplnokZAi(ai));
    // AI index 3 (23 %) je v údajoch riadok 1.
    expect(kde(z, "rozpis.1.zaklad")).toEqual([{ x: 0.69, y: 0.53 }]);
    expect(kde(z, "rozpis.1.dph")).toEqual([{ x: 0.69, y: 0.56 }]);
    expect(kde(z, "polozky.0.nazov")).toHaveLength(1);
    expect(kde(z, "bezDph")).toHaveLength(1);
    expect(kde(z, "odberatel.ico")).toHaveLength(1);
    expect(z.every((x) => x.zdroj === "ai")).toBe(true);
  });

  it("prepísaná hodnota polohu stratí", () => {
    const zmenene = { ...u, rozpis: u.rozpis.map((r, i) => (i === 1 ? { ...r, zaklad: 25 } : r)) };
    const z = zvyrazneniaUdajov([[]], zmenene, undefined, polohy, doplnokZAi(ai));
    expect(kde(z, "rozpis.1.zaklad")).toEqual([]);
    expect(kde(z, "rozpis.1.dph")).toHaveLength(1);
  });

  it("pokyn pýta polohy riadkov rozpisu podľa hlavičky stĺpca aj položiek", () => {
    expect(POKYN_POLOH).toContain("vat_breakdown[i].base");
    expect(POKYN_POLOH).toContain("HLAVIČKA");
    expect(POKYN_POLOH).toContain("items[i].name");
    expect(POKYN_POLOH).toContain('"buyer_ico"');
  });
});
