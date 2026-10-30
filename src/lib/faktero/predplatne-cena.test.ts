import { describe, it, expect } from "vitest";
import { sumaSDph, rozpadSDph, oMesiacNeskor, vetaObnovy } from "./predplatne-cena";

describe("cena predplatného", () => {
  it("Starter 9 € sa strhne ako 11,07 €", () => {
    expect(sumaSDph(900)).toBe(1107);
  });

  it("Premium 19 € sa strhne ako 23,37 €", () => {
    expect(sumaSDph(1900)).toBe(2337);
  });

  it("rozpad vráti presne to, čo sa strhlo", () => {
    const r = rozpadSDph(1107);
    expect(r.zaklad).toBe(900);
    expect(r.dan).toBe(207);
    expect(r.zaklad + r.dan).toBe(1107);
  });

  it("nula a nezmysly nespadnú", () => {
    expect(sumaSDph(0)).toBe(0);
    expect(sumaSDph(Number.NaN)).toBe(0);
  });
});

describe("dátum obnovy", () => {
  it("bežný mesiac posunie o jeden", () => {
    expect(oMesiacNeskor("2026-03-15T08:00:00Z").toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("31. januára padne na koniec februára, nie do marca", () => {
    expect(oMesiacNeskor("2026-01-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("v priestupnom roku na 29. februára", () => {
    expect(oMesiacNeskor("2028-01-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("december prejde do januára ďalšieho roka", () => {
    expect(oMesiacNeskor("2026-12-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2027-01-31");
  });

  it("čas dňa ostáva zachovaný", () => {
    expect(oMesiacNeskor("2026-03-15T08:30:00Z").toISOString()).toContain("T08:30:00");
  });
});

describe("predplatné pre platiteľa DPH z inej krajiny EÚ", () => {
  it("česká firma s IČ DPH môže ísť bez DPH, slovenská ani bez IČ DPH nie", async () => {
    const { mozePrenesenieDph } = await import("./predplatne-cena");
    expect(mozePrenesenieDph({ ic_dph: "CZ25097563" })).toBe(true);
    expect(mozePrenesenieDph({ ic_dph: "SK2122358579" })).toBe(false);
    expect(mozePrenesenieDph({ ic_dph: "" })).toBe(false);
    expect(mozePrenesenieDph({ ic_dph: null })).toBe(false);
    expect(mozePrenesenieDph({ ic_dph: "US123456" })).toBe(false);
  });

  it("pri prenesení sa strhne cena bez DPH", async () => {
    const { sumaNaUhradu } = await import("./predplatne-cena");
    expect(sumaNaUhradu(900, true)).toBe(900);
    expect(sumaNaUhradu(900, false)).toBe(1107);
  });
});

describe("veta o obnove predplatného", () => {
  it("skúšobná verzia bez karty nesľubuje mesačnú platbu", () => {
    expect(vetaObnovy({ is_trialing: true, ma_ulozenu_kartu: false })).toBe("skusobna");
  });
  it("skúšobná verzia s kartou a termínom ukáže najbližšiu platbu", () => {
    expect(
      vetaObnovy({ is_trialing: true, ma_ulozenu_kartu: true, next_billing_at: "2026-11-29" }),
    ).toBe("karta");
  });
  it("plán zadarmo a zrušené predplatné majú prednosť", () => {
    expect(vetaObnovy({ zdarma: true, is_trialing: true })).toBe("zdarma");
    expect(vetaObnovy({ cancel_at_period_end: true, ma_ulozenu_kartu: true })).toBe("zrusene");
  });
  it("aktívne predplatné bez termínu ostáva pri všeobecnej vete", () => {
    expect(vetaObnovy({ ma_ulozenu_kartu: false })).toBe("mesacne");
  });
});
