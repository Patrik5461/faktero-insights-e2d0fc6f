import { describe, expect, it } from "vitest";
import { najdiPodozrenia, sadzbyPoloziek, sadzbyZTextu, textMa19 } from "./rozpis-dph-podozrive";

const kody = (p: { kod: string }[]) => p.map((x) => x.kod);

describe("najdiPodozrenia", () => {
  it("fixture RISS Plus: 19 % na doklade s 0 % a 23 % (text z PDF)", () => {
    const text = [
      "Rozpis DPH",
      "Základ DPH Sadzba DPH",
      "26,90 0 % 0,00",
      "116,87 23 % 26,88",
      "Spolu 170,65",
    ].join("\n");
    const p = najdiPodozrenia({
      rozpis: [{ rate: 19, base: 143.77, vat: 26.88 }],
      krajina: "SK",
      datumDodania: "2026-10-30",
      text,
    });
    expect(kody(p)).toContain("sadzba_19_nie_je_na_doklade");
    expect(kody(p)).toContain("jedna_sadzba_pri_viacerych");
    expect(kody(p)).toContain("efektivna_sadzba");
  });

  it("19 % bez textu je neoverené, s 19 % v texte v poriadku", () => {
    const r = [{ rate: 19, base: 100, vat: 19 }];
    expect(kody(najdiPodozrenia({ rozpis: r, krajina: "SK", datumDodania: "2026-03-01" }))).toEqual(
      ["sadzba_19_neoverena"],
    );
    expect(
      najdiPodozrenia({
        rozpis: r,
        krajina: "SK",
        datumDodania: "2026-03-01",
        text: "Reštaurácia U Lipy\nDPH 19 % 19,00\nSpolu 119,00 EUR",
      }),
    ).toEqual([]);
  });

  it("19 % pred rokom 2025: nie „19 % po 2025“, ale efektívna sadzba (vtedy platilo 20/10 %)", () => {
    expect(
      kody(
        najdiPodozrenia({
          rozpis: [{ rate: 19, base: 100, vat: 19 }],
          krajina: "SK",
          datumDodania: "2024-06-01",
        }),
      ),
    ).toEqual(["efektivna_sadzba"]);
  });

  it("fixture 2: zlúčené „nie je predmetom“ s 23 % → efektívna sadzba 1,46 %", () => {
    const p = najdiPodozrenia({
      rozpis: [{ rate: 23, base: 384.39, vat: 5.61 }],
      krajina: "SK",
      datumDodania: "2026-10-15",
      polozky: [
        { name: "registračný poplatok", vat_rate: 0, total: 360 },
        { name: "administratívny poplatok", vat_rate: 23, total: 24.39 },
      ],
    });
    expect(kody(p)).toContain("efektivna_sadzba");
    expect(p.find((x) => x.kod === "efektivna_sadzba")!.sprava).toContain("1,46 %");
    expect(kody(p)).toContain("jedna_sadzba_pri_viacerych");
  });

  it("správna jedna sadzba nie je podozrivá", () => {
    expect(
      najdiPodozrenia({
        rozpis: [{ rate: 23, base: 100, vat: 23 }],
        krajina: "SK",
        datumDodania: "2026-10-01",
      }),
    ).toEqual([]);
    // zaokrúhlenie na centy pri malej sume
    expect(
      najdiPodozrenia({
        rozpis: [{ rate: 23, base: 0.5, vat: 0.12 }],
        krajina: "SK",
        datumDodania: "2026-10-01",
      }),
    ).toEqual([]);
  });

  it("chýbajúca 5 % z položiek", () => {
    const p = najdiPodozrenia({
      rozpis: [
        { rate: 23, base: 100, vat: 23 },
        { rate: 19, base: 10, vat: 1.9 },
      ],
      krajina: "SK",
      datumDodania: "2026-10-01",
      text: "Faktúra\nDPH 19 % 1,90\nDPH 23 % 23,00",
      polozky: [
        { name: "a", vat_rate: 23, total: 123 },
        { name: "b", vat_rate: 19, total: 11.9 },
        { name: "kniha", vat_rate: 5, total: 10.5 },
      ],
    });
    expect(kody(p)).toEqual(["chyba_sadzba"]);
  });

  it("text o prenesení bez príznaku", () => {
    const p = najdiPodozrenia({
      rozpis: [{ rate: 0, base: 1000, vat: 0, vat_category: "exempt" }],
      krajina: "SK",
      datumDodania: "2026-10-01",
      text: "Faktúra za stavebné práce\nPrenesenie daňovej povinnosti podľa § 69 ods. 12 písm. j)",
    });
    expect(kody(p)).toContain("prenesenie_bez_priznaku");
    expect(
      kody(
        najdiPodozrenia({
          rozpis: [{ rate: 0, base: 1000, vat: 0 }],
          krajina: "SK",
          datumDodania: "2026-10-01",
          reverseCharge: true,
          text: "Prenesenie daňovej povinnosti podľa § 69 ods. 12",
        }),
      ),
    ).not.toContain("prenesenie_bez_priznaku");
  });
});

describe("pomocné", () => {
  it("sadzbyZTextu berie len percentá pri DPH a len platné sadzby", () => {
    expect(sadzbyZTextu("Zľava 5 %\nDPH 23 % 23,00\nZáklad 0 % 10,00", "SK")).toEqual([0, 23]);
    expect(sadzbyZTextu("DPH 21 % 21,00\nDPH 12 % 1,20", "CZ")).toEqual([12, 21]);
    expect(sadzbyZTextu("", "SK")).toEqual([]);
  });
  it("textMa19 nechytí 119 ani 2019", () => {
    expect(textMa19("Spolu 119 % zľava")).toBe(false);
    expect(textMa19("rok 2019")).toBe(false);
    expect(textMa19("DPH 19,00 %")).toBe(true);
  });
  it("sadzbyPoloziek vynechá zaokrúhlenie a nulové riadky", () => {
    expect(
      sadzbyPoloziek([
        { name: "Zaokrúhlenie", vat_rate: 0, total: -0.02 },
        { name: "x", vat_rate: 23, total: 10 },
        { name: "y", vat_rate: 5, total: 0 },
      ]),
    ).toEqual([23]);
  });
});

describe("zmiešané prenesenie", () => {
  it("prenesená položka v rozpise = text o prenesení nie je podozrivý", () => {
    const p = najdiPodozrenia({
      rozpis: [
        { rate: 0, base: 26.9, vat: 0, vat_category: "reverse_charge" },
        { rate: 23, base: 116.87, vat: 26.88 },
      ],
      krajina: "SK",
      datumDodania: "2026-10-29",
      text: "Faktúra\nBet. oceľ — prenesenie daňovej povinnosti § 69 ods. 12 písm. j)\nDPH 23 % 26,88",
    });
    expect(p.map((x) => x.kod)).not.toContain("prenesenie_bez_priznaku");
  });
});
