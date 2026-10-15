import { describe, expect, it } from "vitest";
import { prazdneUdaje, type UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { PREDPONA_DUPLICITY } from "@/lib/faktero/prijate-duplicity";
import {
  MAX_SUCASNE,
  dalsiNaOtvorenie,
  MAX_VELKOST_B,
  naCitanie,
  naHromadneUlozenie,
  naNahratie,
  novyDoklad,
  poChybeUlozenia,
  poStrope,
  poTuknuti,
  suhrn,
  velkostDataUrl,
  vyhodnotDetail,
  zmen,
  type DokladVDavke,
} from "./davka-dokladov";
import { STROP_CITANIA_MS } from "./sken-rozpoznanie";

const FOTKA = "data:image/jpeg;base64,AAAAAAAA";
const PDF = "data:application/pdf;base64,JVBERi0=";

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

function davka(stavy: DokladVDavke["stav"][]): DokladVDavke[] {
  return stavy.map((stav, i) => ({ ...novyDoklad({ subor: FOTKA }, `k${i}`, 0), stav }));
}

describe("nový doklad v dávke", () => {
  it("súbor čaká na nahratie a má typ aj názov", () => {
    const d = novyDoklad({ subor: PDF, nazov: "faktura-123.pdf" }, "a", 1000);
    expect(d.stav).toBe("caka");
    expect(d.mime).toBe("application/pdf");
    expect(d.nazov).toBe("faktura-123.pdf");
    expect(d.id).toBeNull();
  });

  it("fotka z kamery bez názvu dostane náhradný", () => {
    expect(novyDoklad({ subor: FOTKA }, "a", 0).nazov).toBe("doklad-z-appky.jpg");
  });

  it("už nahratý doklad (z obrazovky jedného dokladu) sa rovno číta", () => {
    const d = novyDoklad({ subor: FOTKA, id: "u-1" }, "a", 5000);
    expect(d.stav).toBe("citam");
    expect(d.zaciatokCitania).toBe(5000);
  });

  it("priveľký súbor sa ani nepokúsi nahrať a opakovať sa nedá", () => {
    const velky = "data:image/jpeg;base64," + "A".repeat(Math.ceil((MAX_VELKOST_B * 4) / 3) + 8);
    const d = novyDoklad({ subor: velky }, "a", 0);
    expect(d.stav).toBe("chyba");
    expect(d.prilisVelky).toBe(true);
    expect(poTuknuti(d)).toBeNull();
  });

  it("veľkosť data URL sa počíta bez dekódovania", () => {
    expect(velkostDataUrl("data:x;base64,AAAA")).toBe(3);
    expect(velkostDataUrl("data:x;base64,AAA=")).toBe(2);
    expect(velkostDataUrl("data:x;base64,AA==")).toBe(1);
  });
});

describe("súbežné nahrávanie", () => {
  it(`naraz sa nahrávajú najviac ${MAX_SUCASNE}`, () => {
    expect(naNahratie(davka(["caka", "caka", "caka", "caka"]))).toEqual(["k0", "k1"]);
  });

  it("rozbehnuté sa započítajú", () => {
    expect(naNahratie(davka(["nahravam", "caka", "caka"]))).toEqual(["k1"]);
    expect(naNahratie(davka(["nahravam", "nahravam", "caka"]))).toEqual([]);
  });

  it("hotové miesto neberú, ide sa v poradí", () => {
    expect(naNahratie(davka(["citam", "ulozene", "chyba", "caka", "caka", "caka"]))).toEqual([
      "k3",
      "k4",
    ]);
  });

  it("doptáva sa len na nahraté, ktoré sa čítajú", () => {
    const d = davka(["citam", "caka", "rozpoznane"]);
    expect(naCitanie(d)).toHaveLength(0); // bez id sa nemá na čo pýtať
    const s = zmen(d, "k0", { id: "u-1" });
    expect(naCitanie(s).map((x) => x.kluc)).toEqual(["k0"]);
  });

  it("strop čítania", () => {
    const d = novyDoklad({ subor: FOTKA, id: "u-1" }, "a", 0);
    expect(poStrope(d, STROP_CITANIA_MS - 1)).toBe(false);
    expect(poStrope(d, STROP_CITANIA_MS + 1)).toBe(true);
    expect(poStrope({ ...d, stav: "rozpoznane" }, STROP_CITANIA_MS + 1)).toBe(false);
  });

  it("zmena jedného dokladu nechá ostatné tak", () => {
    const d = davka(["caka", "caka"]);
    const s = zmen(d, "k1", { stav: "nahravam" });
    expect(s[0]).toBe(d[0]);
    expect(s[1].stav).toBe("nahravam");
  });

  it("neskorá odpoveď neprepíše uložený doklad", () => {
    const d = davka(["ulozene"]);
    expect(zmen(d, "k0", { stav: "rozpoznane" }, "citam")[0].stav).toBe("ulozene");
    expect(zmen(davka(["citam"]), "k0", { stav: "rozpoznane" }, "citam")[0].stav).toBe(
      "rozpoznane",
    );
  });
});

describe("vyhodnotenie prečítaného dokladu", () => {
  it("kým server číta, nič sa nemení", () => {
    expect(vyhodnotDetail({ stav: "cita", druh: null, udaje: {} })).toBeNull();
  });

  it("úplná faktúra je rozpoznaná", () => {
    const v = vyhodnotDetail({ stav: "vytazene", druh: "faktura", udaje: faktura() });
    expect(v?.stav).toBe("rozpoznane");
    expect(v?.chybajuce).toEqual([]);
  });

  it("bez druhu treba doplniť", () => {
    const v = vyhodnotDetail({ stav: "vytazene", druh: null, udaje: faktura() });
    expect(v?.stav).toBe("doplnit");
    expect(v?.chybajuce).toEqual(["druh"]);
  });

  it("neznámy druh zo servera sa berie ako žiadny", () => {
    expect(vyhodnotDetail({ stav: "vytazene", druh: "nieco", udaje: faktura() })?.druh).toBeNull();
  });

  it("chýbajúce číslo a splatnosť faktúry", () => {
    const u = faktura();
    u.cislo = "";
    u.splatnost = "";
    const v = vyhodnotDetail({ stav: "vytazene", druh: "faktura", udaje: u });
    expect(v?.stav).toBe("doplnit");
    expect(v?.chybajuce).toEqual(expect.arrayContaining(["cislo", "splatnost"]));
  });

  it("úhradu bločku doplní nastavenie skenera", () => {
    const bez = vyhodnotDetail({ stav: "vytazene", druh: "blocek", udaje: faktura() });
    expect(bez?.chybajuce).toContain("platba");
    const s = vyhodnotDetail(
      { stav: "vytazene", druh: "blocek", udaje: faktura() },
      { uhrada: "karta", kategoria: "palivo" },
    );
    expect(s?.stav).toBe("rozpoznane");
    expect(s?.udaje?.platba).toBe("karta");
    expect(s?.udaje?.kategoria).toBe("palivo");
  });

  it("povinné polia firmy sa rátajú ako na serveri", () => {
    const v = vyhodnotDetail({
      stav: "vytazene",
      druh: "faktura",
      udaje: faktura(),
      povinne: ["stredisko"],
    });
    expect(v?.stav).toBe("doplnit");
    expect(v?.chybajuce).toEqual(["stredisko"]);
  });

  it("neúspešné čítanie nie je chyba dávky — doklad sa doplní ručne", () => {
    const v = vyhodnotDetail({ stav: "chyba", druh: null, udaje: {}, chyba: "AI nevie" });
    expect(v?.stav).toBe("doplnit");
    expect(v?.chyba).toBe("AI nevie");
  });
});

describe("hromadné uloženie", () => {
  const rozpoznany = (kluc: string, zmena: Partial<DokladVDavke> = {}): DokladVDavke => ({
    ...novyDoklad({ subor: FOTKA, id: `id-${kluc}` }, kluc, 0),
    stav: "rozpoznane",
    druh: "faktura",
    udaje: faktura(),
    ...zmena,
  });

  it("uloží len rozpoznané s druhom a bez chýbajúcich polí", () => {
    const d = [
      rozpoznany("a"),
      rozpoznany("b", { stav: "doplnit", chybajuce: ["cislo"] }),
      rozpoznany("c", { stav: "duplicita" }),
      rozpoznany("d", { druh: null }),
      rozpoznany("e", { stav: "ulozene" }),
      rozpoznany("f", { id: null }),
      rozpoznany("g"),
    ];
    expect(naHromadneUlozenie(d).map((x) => x.kluc)).toEqual(["a", "g"]);
    expect(suhrn(d).naHromadne).toBe(2);
  });

  it("duplicita sa nepotvrdí sama — ostane na človeka", () => {
    const s = poChybeUlozenia(`${PREDPONA_DUPLICITY} Faktúru 2026001 už máte.`);
    expect(s.stav).toBe("duplicita");
    expect(s.chyba).toBe("Faktúru 2026001 už máte.");
    expect(poTuknuti({ ...rozpoznany("a"), ...s })).toBe("detail");
  });

  it("iná chyba uloženia je chyba", () => {
    expect(poChybeUlozenia("Firma je zablokovaná.")).toEqual({
      stav: "chyba",
      chyba: "Firma je zablokovaná.",
    });
  });
});

describe("ťuknutie a súhrn", () => {
  it("nenahratý sa skúsi znova, nahratý sa otvorí, uložený nič", () => {
    const [chyba] = davka(["chyba"]);
    expect(poTuknuti(chyba)).toBe("znova");
    expect(poTuknuti({ ...chyba, id: "u" })).toBe("detail");
    for (const s of ["citam", "dlho", "rozpoznane", "doplnit", "duplicita"] as const)
      expect(poTuknuti({ ...chyba, stav: s, id: "u" })).toBe("detail");
    for (const s of ["caka", "nahravam", "ukladam", "ulozene"] as const)
      expect(poTuknuti({ ...chyba, stav: s, id: "u" })).toBeNull();
  });

  it("súhrn povie, čo ostane v Nespracovaných a čo by sa stratilo", () => {
    const d = davka(["caka", "nahravam", "chyba", "citam", "ulozene", "doplnit"]);
    const s = zmen(zmen(zmen(d, "k3", { id: "a" }), "k4", { id: "b" }), "k5", { id: "c" });
    const v = suhrn(s);
    expect(v.spolu).toBe(6);
    expect(v.ulozene).toBe(1);
    expect(v.vNespracovanych).toBe(2);
    expect(v.nenahrane).toBe(3);
    expect(v.pracuje).toBe(true);
  });
});

describe("„Uložiť a ďalší“ v dávke", () => {
  const sId = (stavy: DokladVDavke["stav"][]) =>
    davka(stavy).map((d, i) => ({ ...d, id: `u-${i}` }));

  it("ide dopredu a preskočí uložené aj rozpracované", () => {
    const d = sId(["rozpoznane", "ulozene", "nahravam", "doplnit", "duplicita"]);
    expect(dalsiNaOtvorenie(d, "k0")?.kluc).toBe("k3");
    expect(dalsiNaOtvorenie(d, "k3")?.kluc).toBe("k4");
  });

  it("za posledným pokračuje od začiatku, nie na ten istý", () => {
    const d = sId(["doplnit", "ulozene", "rozpoznane"]);
    expect(dalsiNaOtvorenie(d, "k2")?.kluc).toBe("k0");
    expect(dalsiNaOtvorenie(sId(["rozpoznane"]), "k0")).toBeNull();
  });

  it("nenahratý doklad sa otvoriť nedá", () => {
    const d = davka(["rozpoznane", "caka"]).map((x, i) => (i === 0 ? { ...x, id: "u-0" } : x));
    expect(dalsiNaOtvorenie(d, "k0")).toBeNull();
  });
});
