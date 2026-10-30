import { describe, expect, it } from "vitest";
import { chybajuce, prazdneUdaje, type UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import {
  citajSumu,
  doplnZNastavenia,
  hodnotaPola,
  jeBlockovyQr,
  polaNaDoplnenie,
  uplatniUpravy,
} from "./sken-rozpoznanie";

/** Faktúra, ako ju prečíta AI — všetko potrebné tam je. */
function faktura(): UdajeNespracovaneho {
  const u = prazdneUdaje();
  u.dodavatel.nazov = "Dodávateľ s.r.o.";
  u.cislo = "2026001";
  u.datumVystavenia = "2026-10-01";
  u.splatnost = "2026-10-15";
  u.rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
  u.celkom = 123;
  return u;
}

const nastavenie = {
  uhrada: "hotovost",
  kategoria: "palivo",
  zakazka: "z-1",
  predkontacia: "1Np",
  poznamka: "Cesta do Košíc",
};

describe("nastavenie zo skenera v rozpoznanom doklade", () => {
  it("bloček dostane úhradu, kategóriu, zákazku, predkontáciu aj komentár", () => {
    const u = doplnZNastavenia(faktura(), "blocek", nastavenie);
    expect(u.platba).toBe("hotovost");
    expect(u.kategoria).toBe("palivo");
    expect(u.jobId).toBe("z-1");
    expect(u.kody.predkontacia).toBe("1Np");
    expect(u.poznamka).toBe("Cesta do Košíc");
  });

  it("prijatá faktúra nedostane úhradu kartou zo skenera", () => {
    const u = doplnZNastavenia(faktura(), "faktura", { ...nastavenie, uhrada: "karta" });
    expect(u.platba).toBe("");
    expect(u.kategoria).toBe("palivo");
  });

  it("prečítané z dokladu sa neprepisuje, komentár človeka áno", () => {
    const z = faktura();
    z.kategoria = "sluzby";
    z.kody.predkontacia = "2Nd";
    z.poznamka = "Zhrnutie od AI";
    const u = doplnZNastavenia(z, "blocek", nastavenie);
    expect(u.kategoria).toBe("sluzby");
    expect(u.kody.predkontacia).toBe("2Nd");
    expect(u.poznamka).toBe("Cesta do Košíc");
    // Pôvodné údaje ostali nedotknuté.
    expect(z.platba).toBe("");
  });

  it("iný doklad dostane len komentár", () => {
    const u = doplnZNastavenia(faktura(), "ostatny", nastavenie);
    expect(u.kategoria).toBe("");
    expect(u.jobId).toBe("");
    expect(u.poznamka).toBe("Cesta do Košíc");
  });

  it("bez nastavenia sa nemení nič", () => {
    const z = faktura();
    expect(doplnZNastavenia(z, "blocek", undefined)).toBe(z);
  });
});

describe("polia na doplnenie", () => {
  it("úplná faktúra nepýta nič", () => {
    expect(polaNaDoplnenie("faktura", faktura())).toEqual({
      upravitelne: [],
      vyrovnat: false,
      mimoAppky: [],
    });
  });

  it("chýbajúce číslo a splatnosť sa dajú doplniť v appke", () => {
    const u = { ...faktura(), cislo: "", splatnost: "" };
    expect(polaNaDoplnenie("faktura", u).upravitelne).toEqual(["cislo", "splatnost"]);
  });

  it("bloček číslo ani splatnosť nepotrebuje a úhradu ukazuje obrazovka sama", () => {
    const u = { ...faktura(), cislo: "", splatnost: "" };
    expect(polaNaDoplnenie("blocek", u).upravitelne).toEqual([]);
  });

  it("splatnosť pred vystavením ukáže oba dátumy", () => {
    const u = { ...faktura(), splatnost: "2025-10-15" };
    expect(polaNaDoplnenie("faktura", u).upravitelne).toEqual(["datumVystavenia", "splatnost"]);
  });

  it("dobropis chce číslo opravovanej faktúry", () => {
    expect(polaNaDoplnenie("dobropis", faktura()).upravitelne).toEqual(["opravuje"]);
  });

  it("povinné stredisko firmy appka doplniť nevie — pošle na web", () => {
    const p = polaNaDoplnenie("faktura", faktura(), ["stredisko"]);
    expect(p.upravitelne).toEqual([]);
    expect(p.mimoAppky).toEqual(["stredisko"]);
  });

  it("nesediace položky ponúknu vyrovnanie", () => {
    const u = faktura();
    u.polozky = [
      { name: "Tovar", quantity: 1, unit: null, unit_price: 50, vat_rate: 23, total: 50 },
    ];
    expect(polaNaDoplnenie("faktura", u).vyrovnat).toBe(true);
  });

  it("doplnené údaje sa dajú uložiť", () => {
    const z = {
      ...faktura(),
      dodavatel: { ...faktura().dodavatel, nazov: "" },
      celkom: null,
      rozpis: [],
    };
    const polia = polaNaDoplnenie("faktura", z).upravitelne;
    expect(polia).toEqual(["dodavatel", "celkom"]);
    const u = uplatniUpravy(z, { dodavatel: "Nový dodávateľ", celkom: "12,50" });
    expect(u.dodavatel.nazov).toBe("Nový dodávateľ");
    expect(u.celkom).toBe(12.5);
    expect(chybajuce("faktura", u)).toEqual([]);
    // Pôvodné údaje sa nezmenili — zoznam polí sa počíta z nich.
    expect(z.dodavatel.nazov).toBe("");
  });

  it("políčko sa predvyplní tým, čo už v údajoch je", () => {
    expect(hodnotaPola(faktura(), "splatnost")).toBe("2026-10-15");
    expect(hodnotaPola(faktura(), "celkom")).toBe("123");
    expect(hodnotaPola(faktura(), "dodavatel")).toBe("Dodávateľ s.r.o.");
  });

  it("suma prijme čiarku aj medzery", () => {
    expect(citajSumu("1 234,56")).toBe(1234.56);
    expect(citajSumu("")).toBeNull();
    expect(citajSumu("abc")).toBeNull();
  });
});

describe("QR kód bločku", () => {
  it("eKasa a český EET idú po starom", () => {
    expect(jeBlockovyQr("https://monitoring.financnasprava.sk/?chl=O-123")).toBe(true);
    expect(jeBlockovyQr("EET*1.0*BKP:01234567-89abcdef*DIC:CZ12345678")).toBe(true);
  });

  it("holý UID z eKasy a offline doklad (OKP + kód pokladnice) sú bloček", () => {
    // Takto vyzerá QR na bežnom bločku — predtým išla jeho fotka na AI.
    expect(jeBlockovyQr("O-9D031B68CBFD4C76831B68CBFD2C765E")).toBe(true);
    expect(
      jeBlockovyQr(
        "1a2b3c4d-5e6f7081-92a3b4c5-d6e7f809-0a1b2c3d|88812345678900001|2026-08-09T14:32|42|17,90",
      ),
    ).toBe(true);
  });

  it("platobný QR z faktúry bloček nerobí", () => {
    expect(
      jeBlockovyQr(
        "0004A000B6KJ7J2HR5I1VQ2QDRDRLHU8FAU5RBF3EQGPE4G7Q3UO7AAM6PEU1V03NDPGJ4E7VQ9O80",
      ),
    ).toBe(false);
    expect(jeBlockovyQr("SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK")).toBe(false);
    expect(jeBlockovyQr("")).toBe(false);
    expect(jeBlockovyQr(null)).toBe(false);
  });
});
