import { describe, expect, it } from "vitest";
import {
  dovodNevytvorenia,
  dovodZChybyServera,
  jeVyberatelny,
  popisRiadku,
  rozdelVyber,
  textSpracovania,
  zmenaPreBlocky,
} from "./nespracovane-hromadne";
import { udajeZAi } from "./nespracovane";
import { PREDPONA_DUPLICITY } from "./prijate-duplicity";
import { chybaCudzej } from "./cudzia-faktura";
import { PREDPONA_ULOZENEJ_PRIJATEJ } from "./duplicita-zauctovania";

const riadky = [
  { kluc: "n-1", id: "1", typ: "nespracovany", stav: "vytazene" },
  { kluc: "n-2", id: "2", typ: "nespracovany", stav: "cita" },
  { kluc: "b-3", id: "3", typ: "blocek", stav: "vytazene" },
  { kluc: "n-4", id: "4", typ: "nespracovany", stav: "chyba" },
];

describe("hromadné akcie v Nespracovaných", () => {
  it("označiť sa dá nespracovaný aj bloček, nie čítaný", () => {
    expect(riadky.filter(jeVyberatelny).map((r) => r.kluc)).toEqual(["n-1", "b-3", "n-4"]);
  });

  it("výber sa delí podľa typu a berie len zobrazené a označiteľné", () => {
    const v = rozdelVyber(riadky, new Set(["n-1", "n-2", "b-3", "n-9"]));
    expect(v.nespracovane.map((r) => r.id)).toEqual(["1"]);
    expect(v.blocky.map((r) => r.id)).toEqual(["3"]);
    // Kľúč, ktorý filter skryl, sa nezapočíta.
    expect(rozdelVyber(riadky.slice(0, 1), new Set(["b-3"])).blocky).toEqual([]);
  });

  it("bez druhu, s chýbajúcimi údajmi či čítaný sa nevytvorí", () => {
    const u = udajeZAi({ supplier_name: "X", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3 }, "2026-10-07");
    expect(dovodNevytvorenia({ druh: null, udaje: u })?.text).toBe("Nie je určený druh dokladu");
    expect(dovodNevytvorenia({ druh: "faktura", stav: "cita", udaje: u })?.text).toBe("Doklad sa ešte číta");
    const d = dovodNevytvorenia({ druh: "faktura", udaje: u });
    expect(d?.text).toBe("Doplňte: {polia}");
    expect(d?.params?.polia).toContain("splatnosť");
    // Číslo faktúry nie je povinné (Patrik 18. 11.).
    expect(d?.params?.polia).not.toContain("číslo dokladu");
  });

  it("kompletný bloček prejde, bloček s nesedeným súčtom nie", () => {
    const u = udajeZAi(
      { supplier_name: "BILLA", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3, payment_method: "karta", issue_date: "2026-10-07" },
      "2026-10-07",
    );
    expect(dovodNevytvorenia({ druh: "blocek", udaje: u })).toBeNull();
    const zle = { ...u, celkom: 20, celkomDokladu: 20 };
    expect(dovodNevytvorenia({ druh: "blocek", udaje: zle })).not.toBeNull();
  });

  it("vlastný IBAN pri zapnutom smere podľa IBAN-u sa preskočí", () => {
    const u = udajeZAi(
      {
        supplier_name: "X",
        invoice_number: "F1",
        amount_without_vat: 10,
        vat_amount: 2.3,
        amount_total: 12.3,
        issue_date: "2026-10-07",
        due_date: "2026-10-21",
        supplier_iban: "SK3112000000198742637541",
      },
      "2026-10-07",
    );
    u.dodavatel.iban = "SK3112000000198742637541";
    const bez = dovodNevytvorenia({ druh: "faktura", udaje: u });
    expect(bez).toBeNull();
    const s = dovodNevytvorenia({
      druh: "faktura",
      udaje: u,
      nastavenia: { typPodlaIban: true },
      vlastneUcty: [{ iban: "SK3112000000198742637541" }],
    });
    expect(s?.text).toContain("IBAN");
  });

  it("chyby servera ako dôvod preskočenia", () => {
    expect(dovodZChybyServera(`${PREDPONA_DUPLICITY}Rovnaké číslo, iná suma`).text).toContain("Možná duplicita");
    expect(dovodZChybyServera(chybaCudzej({ odberatel: { nazov: "Iná s.r.o." } } as any)).text).toContain("iná firma");
    expect(dovodZChybyServera(`${PREDPONA_ULOZENEJ_PRIJATEJ}F1 · X`)).toEqual({
      text: "Táto faktúra už je v evidencii: {popis}",
      params: { popis: "F1 · X" },
    });
    expect(dovodZChybyServera("Doklad čaká na schválenie").text).toBe("Doklad čaká na schválenie");
    expect(dovodZChybyServera(undefined).text).toBe("Doklad sa nepodarilo vytvoriť");
  });

  it("bločky preberú len zaúčtovanie", () => {
    expect(zmenaPreBlocky({ druh: "faktura", predkontacia: " 501 ", stredisko: "" })).toEqual({
      zmena: { predkontacia: "501" },
      nemenia: ["druh"],
    });
    expect(zmenaPreBlocky({ jobId: "x" })).toEqual({ zmena: {}, nemenia: ["jobId"] });
  });

  it("popis a text tlačidla", () => {
    expect(popisRiadku({ dodavatel: "X", cislo: "F1" })).toBe("X · F1");
    expect(popisRiadku({ subor: "a.pdf" })).toBe("a.pdf");
    expect(textSpracovania({ nespracovane: 2, blocky: 0 })).toBe("Vytvoriť doklady ({n})");
    expect(textSpracovania({ nespracovane: 0, blocky: 1 })).toBe("Spracovať bločky ({n})");
    expect(textSpracovania({ nespracovane: 1, blocky: 1 })).toBe("Vytvoriť a spracovať ({n})");
  });
});
