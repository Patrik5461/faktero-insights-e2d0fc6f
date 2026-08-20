import { describe, it, expect } from "vitest";
import { odhadniOznacenie, ucelCamt, nazovOznacenia, kodOznacenia } from "./vypis-oznacenie";
import { normalizujPohyb } from "./vypis-pohyby";

describe("označenie platby", () => {
  it("pozná bežné riadky z výpisu aj bez diakritiky", () => {
    const p = (popis: string, zvysok: Record<string, unknown> = {}) =>
      odhadniOznacenie({ popis, ...zvysok });

    expect(p("Poplatok za vedenie uctu")).toBe("poplatok");
    expect(p("Mesačný poplatok za balík služieb")).toBe("poplatok");
    expect(p("Kreditny urok")).toBe("urok");
    expect(p("Odvod DPH za 07/2026")).toBe("dan");
    expect(p("Socialna poistovna - odvody")).toBe("dan");
    expect(p("Mzda 07/2026")).toBe("mzda");
    expect(p("Splatka leasingu 12/48")).toBe("splatka");
    expect(p("Najomne za kancelariu")).toBe("najom");
    expect(p("Vlastny prevod na sporiaci ucet")).toBe("prevod");
    expect(p("Platba kartou, Miesto: BOLT.EU")).toBe("karta");
    expect(p("Vyber hotovosti z bankomatu")).toBe("hotovost");
    expect(p("Uhrada faktury 2026041")).toBe("faktura");
  });

  it("daň z úroku je daň, nie úrok", () => {
    // Poradie pravidiel je jediné, čo o tomto rozhoduje.
    expect(odhadniOznacenie({ popis: "Dan z uroku" })).toBe("dan");
  });

  it("popis začínajúci UZF je splátka úveru alebo leasingu", () => {
    expect(odhadniOznacenie({ popis: "UZF 12345678 splatka" })).toBe("splatka");
    expect(odhadniOznacenie({ popis: "uzf0012345 /VS123", vs: "123" })).toBe("splatka");
    // Aj keď kód banky hovorí niečo iné — `UZF` je istota, nie odhad.
    expect(odhadniOznacenie({ popis: "UZF 998877" }, "PMNT/CCRD/POSD")).toBe("splatka");
    // Uprostred textu to značka banky nie je.
    expect(odhadniOznacenie({ popis: "Platba za UZF materiál" })).toBeNull();
  });

  it("keď v texte nie je nič, rozhodne variabilný symbol", () => {
    expect(odhadniOznacenie({ popis: "Prevodny prikaz", vs: "2026041" })).toBe("faktura");
    expect(odhadniOznacenie({ popis: "Prevodny prikaz" })).toBeNull();
  });

  it("kód banky z XML prebíja text", () => {
    // `PMNT/CCRD/POSD` je platba kartou, aj keď je popis o faktúre.
    expect(odhadniOznacenie({ popis: "Uhrada faktury" }, "PMNT/CCRD/POSD")).toBe("karta");
    expect(odhadniOznacenie({ popis: "Vyber" }, "PMNT/CCRD/CWDL")).toBe("hotovost");
    // Rodina, ktorá hovorí len o smere, odhad z textu nepokazí.
    expect(odhadniOznacenie({ popis: "Poplatok za prevod" }, "PMNT/ICDT/ESCT")).toBe("poplatok");
  });

  it("voľba človeka prebíja odhad", () => {
    const p = normalizujPohyb({
      datum: "2026-07-05",
      suma: "100",
      smer: "vydaj",
      popis: "Platba kartou",
      oznacenie: "najom",
    });
    expect(p?.oznacenie).toBe("najom");
  });

  it("vymyslené označenie z požiadavky sa zahodí", () => {
    expect(kodOznacenia("hlúposť")).toBeNull();
    expect(nazovOznacenia("dan")).toBe("Daň a odvody");
    const p = normalizujPohyb({
      datum: "2026-07-05",
      suma: "100",
      smer: "vydaj",
      popis: "Poplatok",
      oznacenie: "<script>",
    });
    expect(p?.oznacenie).toBe("poplatok");
  });

  it("účel do camt.053 pozná smer a nevymýšľa si kódy", () => {
    expect(ucelCamt("faktura", "vydaj")).toEqual({ cd: "SUPP" });
    expect(ucelCamt("faktura", "prijem")).toEqual({ cd: "TRAD" });
    expect(ucelCamt("dan", "vydaj")).toEqual({ cd: "TAXS" });
    // Pre bankový poplatok kód v číselníku ISO nie je — ide vlastné označenie.
    expect(ucelCamt("poplatok", "vydaj")).toEqual({ prtry: "POPLATOK" });
    expect(ucelCamt("ine", "vydaj")).toBeNull();
    expect(ucelCamt(null, "vydaj")).toBeNull();
  });
});
