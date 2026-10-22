import { describe, expect, it } from "vitest";
import { prazdneUdaje } from "./nespracovane";
import {
  poliaZPravidla,
  porovnanieNespracovaneho,
  uplatniPravidlo,
  zhodnePravidla,
} from "./nespracovane-pravidlo";
import type { Pravidlo } from "./pravidla-uctovania";

const pravidlo = (z: Partial<Pravidlo> & { id: string }): Pravidlo & { id: string } => ({
  nazov: z.id,
  poradie: 1,
  aktivne: true,
  dodavatel_ico: null,
  dodavatel_text: null,
  sposob_uhrady: null,
  druh: null,
  kategoria: null,
  predkontacia: null,
  clenenie_dph: null,
  odpocet: null,
  poznamka: null,
  ...z,
});

const udaje = () => {
  const u = prazdneUdaje();
  u.dodavatel.nazov = "Orange Slovensko";
  u.dodavatel.ico = "35697270";
  return u;
};

describe("porovnanieNespracovaneho", () => {
  it("faktúra sa porovnáva ako prijatá, bloček ako bloček, iný doklad vôbec", () => {
    expect(porovnanieNespracovaneho(udaje(), "faktura")?.druh).toBe("prijata");
    expect(porovnanieNespracovaneho(udaje(), "dobropis")?.typ).toBe("credit_note");
    expect(porovnanieNespracovaneho(udaje(), "blocek")?.druh).toBe("blocek");
    expect(porovnanieNespracovaneho(udaje(), "ostatny")).toBeNull();
  });
});

describe("zhodnePravidla", () => {
  it("prvé je to, ktoré by vybral spúšťač (pravidlo podľa dodávateľa pred ostatnými)", () => {
    const vsetky = [
      pravidlo({ id: "vsetky", poradie: 0, druh: "prijata" }),
      pravidlo({ id: "orange", poradie: 5, dodavatel_ico: "35697270" }),
      pravidlo({ id: "ine", dodavatel_ico: "12345678" }),
    ];
    const z = zhodnePravidla(vsetky, porovnanieNespracovaneho(udaje(), "faktura"));
    expect(z.map((p) => p.id)).toEqual(["orange", "vsetky"]);
  });
});

describe("uplatniPravidlo", () => {
  const orange = pravidlo({
    id: "orange",
    predkontacia: "518",
    clenenie_dph: "PD",
    kategoria: "telefon",
  });

  it("doplní prázdne polia a označí ich hviezdičkou", () => {
    const u = uplatniPravidlo(udaje(), orange);
    expect(u.kody.predkontacia).toBe("518");
    expect(u.kody.clenenie).toBe("PD");
    expect(u.kategoria).toBe("telefon");
    expect(u.pravidloId).toBe("orange");
    expect(poliaZPravidla(u).sort()).toEqual(["clenenie", "kategoria", "predkontacia"]);
  });

  it("ručne zadaný kód neprepíše, naučený a nepotvrdený návrh AI áno", () => {
    const u = udaje();
    u.kody.predkontacia = "501";
    u.kody.clenenie = "PN";
    u.naucene = { clenenie: "PN" };
    u.kategoria = "sluzby";
    u.navrhAi = { kategoria: "sluzby" };
    u.navrhAiDovod = "služby";
    const v = uplatniPravidlo(u, orange);
    expect(v.kody.predkontacia).toBe("501");
    expect(v.kody.clenenie).toBe("PD");
    expect(v.kategoria).toBe("telefon");
    expect(v.navrhAi).toBeUndefined();
    expect(poliaZPravidla(v).sort()).toEqual(["clenenie", "kategoria"]);
  });

  it("vybrané pravidlo prepíše aj vyplnené kódy", () => {
    const u = udaje();
    u.kody.predkontacia = "501";
    expect(uplatniPravidlo(u, orange, true).kody.predkontacia).toBe("518");
  });

  it("keď pravidlo prestane sedieť, jeho nezmenené hodnoty ustúpia, zmenené ostanú", () => {
    const u = uplatniPravidlo(udaje(), orange);
    u.kody.clenenie = "PN"; // človek zmenil
    const v = uplatniPravidlo(u, null);
    expect(v.kody.predkontacia).toBe("");
    expect(v.kategoria).toBe("");
    expect(v.kody.clenenie).toBe("PN");
    expect(v.pravidloId).toBeUndefined();
    expect(v.zPravidla).toBeUndefined();
  });

  it("výmena pravidla nahradí kódy starého", () => {
    const iny = pravidlo({ id: "iny", predkontacia: "504" });
    const v = uplatniPravidlo(uplatniPravidlo(udaje(), orange), iny);
    expect(v.kody.predkontacia).toBe("504");
    expect(v.kody.clenenie).toBe("");
    expect(v.pravidloId).toBe("iny");
  });
});
