import { describe, expect, it } from "vitest";
import { denKurzu, kurzKDatumu, naEur, textPrepoctu, trebaPrepocet } from "./kurzy";
import { kurzyZXml } from "./kurzy.server";

const kurzy = [
  { den: "2026-09-08", mena: "CZK", kurz: 25.1 },
  { den: "2026-09-09", mena: "CZK", kurz: 25.4 },
  { den: "2026-09-10", mena: "CZK", kurz: 25.9 },
  { den: "2026-09-09", mena: "USD", kurz: 1.1 },
];

describe("kurz pre doklad", () => {
  it("berie sa deň pred dňom dodania, nie deň dodania", () => {
    expect(denKurzu("2026-09-10")).toBe("2026-09-09");
    // Aj cez prelom mesiaca a roka.
    expect(denKurzu("2026-01-01")).toBe("2025-12-31");
  });

  it("cez víkend sa použije posledný zverejnený kurz", () => {
    // Sobota a nedeľa kurz nemajú — hľadá sa posledný starší.
    expect(kurzKDatumu(kurzy, "CZK", "2026-09-13")?.den).toBe("2026-09-10");
  });

  it("kurz z budúcnosti sa nepoužije", () => {
    expect(kurzKDatumu(kurzy, "CZK", "2026-09-09")?.kurz).toBe(25.4);
  });

  it("neznáma mena vráti nič", () => {
    expect(kurzKDatumu(kurzy, "HUF", "2026-09-10")).toBeNull();
  });
});

describe("prepočet", () => {
  it("delí sa kurzom — 254 CZK pri 25,4 je 10 eur", () => {
    expect(naEur(254, 25.4)).toBe(10);
  });

  it("zaokrúhľuje na centy a nespadne na nezmyselnom kurze", () => {
    expect(naEur(100, 3)).toBe(33.33);
    expect(naEur(100, 0)).toBe(0);
  });

  it("euro sa neprepočítava", () => {
    expect(trebaPrepocet("EUR")).toBe(false);
    expect(trebaPrepocet("CZK")).toBe(true);
    expect(trebaPrepocet(null)).toBe(false);
  });

  it("veta na doklade povie sumu, kurz aj deň", () => {
    const t = textPrepoctu("CZK", 25.4, "2026-09-09", 40.16);
    expect(t).toContain("40,16 EUR");
    expect(t).toContain("9. 9. 2026");
    expect(t).toContain("1 EUR = 25,4 CZK");
  });
});

describe("čítanie kurzov z ECB", () => {
  it("rozparsuje denný aj viacdňový súbor", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-09-10">
      <Cube currency="USD" rate="1.0987"/>
      <Cube currency="CZK" rate="25.900"/>
    </Cube>
    <Cube time="2026-09-09">
      <Cube currency="CZK" rate="25.400"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;
    const k = kurzyZXml(xml);
    expect(k).toHaveLength(3);
    expect(k).toContainEqual({ den: "2026-09-10", mena: "CZK", kurz: 25.9 });
    expect(kurzKDatumu(k, "USD", "2026-09-10")?.kurz).toBe(1.0987);
  });

  it("prázdny alebo pokazený súbor nezhodí nič", () => {
    expect(kurzyZXml("<html>chyba</html>")).toEqual([]);
  });
});

describe("domáca mena podľa krajiny firmy", () => {
  it("slovenská firma eurá, česká koruny", async () => {
    const { domacaMena, krajinaKurzu } = await import("./kurzy");
    expect(domacaMena("SK")).toBe("EUR");
    expect(domacaMena("CZ")).toBe("CZK");
    expect(domacaMena("Česká republika")).toBe("CZK");
    expect(domacaMena(null)).toBe("EUR");
    expect(krajinaKurzu("cz")).toBe("CZ");
  });

  it("česká firma berie kurz ČNB z dňa plnenia, nie z dňa pred ním", () => {
    expect(denKurzu("2026-09-10", "CZ")).toBe("2026-09-10");
    expect(denKurzu("2026-09-10", "SK")).toBe("2026-09-09");
  });

  it("prepočet do korún násobí kurzom ČNB (CZK za 1 jednotku)", async () => {
    const { naDomacu } = await import("./kurzy");
    expect(naDomacu(100, 24.365, "CZ")).toBe(2436.5);
    expect(naDomacu(254, 25.4, "SK")).toBe(10);
  });

  it("kurz do účtovného programu — domácej meny za množstvo", async () => {
    const { domacejZaJednotku, kurzZaMnozstvo } = await import("./kurzy");
    // SK firma, faktúra v CZK: 25,4 CZK za euro → 3,937008 € za 100 Kč.
    expect(kurzZaMnozstvo(25.4, "SK")).toEqual({ kurz: 3.937008, mnozstvo: 100 });
    // CZ firma, faktúra v EUR: 24,365 Kč za 1 €.
    expect(kurzZaMnozstvo(24.365, "CZ")).toEqual({ kurz: 24.365, mnozstvo: 1 });
    // CZ firma, forinty: ČNB 6,304 Kč za 100 HUF → uložené 0,06304 za 1.
    expect(kurzZaMnozstvo(0.06304, "CZ")).toEqual({ kurz: 6.304, mnozstvo: 100 });
    expect(domacejZaJednotku(0, "CZ")).toBe(0);
  });

  it("text pod súčty pre českú firmu hovorí o ČNB a korunách", () => {
    const t = textPrepoctu("EUR", 24.365, "2026-10-09", 5116.65, "cz", "CZ");
    expect(t).toContain("CZK");
    expect(t).toContain("ČNB");
    expect(t).toContain("1 EUR = 24,365 CZK");
  });

  it("v domácej mene sa neprepočítava", () => {
    expect(trebaPrepocet("CZK", "CZK")).toBe(false);
    expect(trebaPrepocet("EUR", "CZK")).toBe(true);
    expect(trebaPrepocet("EUR")).toBe(false);
  });
});

describe("ročný súbor ČNB", () => {
  it("prepočíta kurz na 1 jednotku a prečíta dátum", async () => {
    const { kurzyZCnbRoka } = await import("./kurzy.server");
    const text = [
      "Datum|1 EUR|100 HUF|1 USD",
      "02.01.2026|24,170|6,304|20,611",
      "05.01.2026|24,195|6,291|20,742",
    ].join("\n");
    const k = kurzyZCnbRoka(text);
    expect(k).toContainEqual({ den: "2026-01-02", mena: "EUR", kurz: 24.17 });
    expect(k).toContainEqual({ den: "2026-01-02", mena: "HUF", kurz: 0.06304 });
    expect(k.filter((x) => x.den === "2026-01-05")).toHaveLength(3);
  });
});
