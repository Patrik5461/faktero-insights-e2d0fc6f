import { describe, expect, it } from "vitest";
import {
  kurzyZBmfCsv,
  mesiacBmf,
  nastavenieKurzuDe,
  textPrepoctu,
  vyberKurz,
  type KurzBmf,
} from "./kurzy";

const ecb = [
  { den: "2026-09-08", mena: "USD", kurz: 1.15 },
  { den: "2026-09-09", mena: "USD", kurz: 1.16 },
  { den: "2026-09-10", mena: "USD", kurz: 1.17 },
];
const cnb = [
  { den: "2026-09-09", mena: "USD", kurz: 21.1 },
  { den: "2026-09-10", mena: "USD", kurz: 21.2 },
];
const bmf: KurzBmf[] = [{ mesiac: "2026-09-01", mena: "USD", kurz: 1.1513 }];

describe("výber kurzu — Nemecko (§ 16 Abs. 6 UStG)", () => {
  it("DE s BMF: mesačný kurz BMF za mesiac dodania", () => {
    expect(vyberKurz({ krajina: "DE", mena: "usd", datumDodania: "2026-09-10", ecb, bmf })).toEqual(
      { kurz: 1.1513, den: "2026-09-01", zdroj: "bmf" },
    );
  });

  it("DE s BMF, mesiac ešte nezverejnený: ECB z dňa dodania, predbežne", () => {
    expect(vyberKurz({ krajina: "DE", mena: "USD", datumDodania: "2026-10-01", ecb, bmf })).toEqual(
      { kurz: 1.17, den: "2026-09-10", zdroj: "ecb_predbezne" },
    );
  });

  it("DE s denným kurzom (povolenie Finanzamtu): ECB z dňa dodania, nie deň predtým", () => {
    expect(
      vyberKurz({
        krajina: "DE",
        mena: "USD",
        datumDodania: "2026-09-10",
        nastavenieDe: "ecb_tageskurs",
        ecb,
        bmf,
      }),
    ).toEqual({ kurz: 1.17, den: "2026-09-10", zdroj: "ecb_tageskurs" });
  });

  it("SK a CZ ostávajú bez zmeny — ECB deň pred dodaním, ČNB v deň plnenia", () => {
    expect(vyberKurz({ krajina: "SK", mena: "USD", datumDodania: "2026-09-10", ecb, bmf })).toEqual(
      { kurz: 1.16, den: "2026-09-09", zdroj: "ecb" },
    );
    expect(vyberKurz({ krajina: "CZ", mena: "USD", datumDodania: "2026-09-10", cnb, bmf })).toEqual(
      { kurz: 21.2, den: "2026-09-10", zdroj: "cnb" },
    );
  });

  it("domáca mena sa neprepočítava", () => {
    expect(
      vyberKurz({ krajina: "DE", mena: "EUR", datumDodania: "2026-09-10", ecb, bmf }),
    ).toBeNull();
    expect(vyberKurz({ krajina: "CZ", mena: "CZK", datumDodania: "2026-09-10", cnb })).toBeNull();
  });

  it("nastavenie firmy: neznáma hodnota = BMF", () => {
    expect(nastavenieKurzuDe(null)).toBe("bmf");
    expect(nastavenieKurzuDe("ecb_tageskurs")).toBe("ecb_tageskurs");
    expect(mesiacBmf("2026-12-31")).toBe("2026-12-01");
  });
});

describe("CSV z dátového portálu BMF", () => {
  // Výňatok zo skutočného súboru uu-kurse-2026-csv.csv (stav 1. 10. 2026).
  const csv = [
    "Monatlich fortgeschriebene Übersicht der Umsatzsteuer-Umrechnungskurse 2026 (Euro-Referenzkurse);;;;;;;;;;;;;",
    "Land;Währung;Januar[1];Februar [2];März [3];April [4];Mai [5];Juni [6];Juli [7];August [8];September [9];Oktober [10];November [11];Dezember [12]",
    "Indonesien;1 Euro;19.757,02 IDR;19.896,39 IDR;19.561,24 IDR;20.083,87 IDR;20.538,00 IDR;20.614,71 IDR;20.564,00 IDR;20.641,11 IDR;20.426,18 IDR;;;",
    "Russland[1];1 Euro;;;;;;;;;;;;",
    "USA;1 Euro;1,1738 USD;1,1824 USD;1,1558 USD;1,1706 USD;1,1673 USD;1,1518 USD;1,1417 USD;1,1593 USD;1,1513 USD;;;",
    ";;;;;;;;;;;;;",
    "[1] Die EZB hat die Veröffentlichung des Euro-Referenzkurses zum Rubel mit Wirkung vom 2. März 2022 bis auf Weiteres ausgesetzt.;;;;;;;;;;;;;",
  ].join("\r\n");

  it("rozparsuje mesiace, tisícky aj prázdne bunky", () => {
    const k = kurzyZBmfCsv(csv, 2026);
    expect(k).toHaveLength(18);
    expect(k).toContainEqual({ mesiac: "2026-01-01", mena: "IDR", kurz: 19757.02 });
    expect(k).toContainEqual({ mesiac: "2026-09-01", mena: "USD", kurz: 1.1513 });
    expect(k.some((x) => x.mesiac === "2026-10-01")).toBe(false);
  });
});

describe("veta o prepočte na nemeckej faktúre", () => {
  it("BMF uvedie mesiac a paragraf", () => {
    expect(textPrepoctu("USD", 1.1513, "2026-09-01", 190, "de", "SK", "bmf")).toBe(
      "USt. umgerechnet: 190,00 EUR (Umsatzsteuer-Umrechnungskurs des BMF für September 2026: 1 EUR = 1,1513 USD, § 16 Abs. 6 UStG)",
    );
  });
  it("predbežný ECB a denný kurz s povolením to povedia", () => {
    expect(textPrepoctu("USD", 1.17, "2026-10-01", 10, "de", "SK", "ecb_predbezne")).toContain(
      "vorläufig zum EZB-Referenzkurs vom 01.10.2026",
    );
    expect(textPrepoctu("USD", 1.17, "2026-10-01", 10, "de", "SK", "ecb_tageskurs")).toContain(
      "Genehmigung des Finanzamts",
    );
  });
  it("bez zdroja ostáva pôvodná veta", () => {
    expect(textPrepoctu("USD", 1.0845, "2026-10-16", 190, "de", "SK")).toBe(
      "USt. umgerechnet: 190,00 EUR (EZB-Referenzkurs vom 16.10.2026: 1 EUR = 1,0845 USD)",
    );
  });
});
