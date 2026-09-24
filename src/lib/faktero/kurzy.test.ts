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
    expect(t).toContain("1 EUR = 25.4 CZK");
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
