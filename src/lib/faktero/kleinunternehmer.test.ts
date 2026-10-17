import { describe, it, expect } from "vitest";
import { obratZaRok, stavKleinunternehmer } from "./kleinunternehmer";

const f = (datum: string, suma: number, extra: Record<string, unknown> = {}) => ({
  type: "regular",
  status: "issued",
  issue_date: datum,
  subtotal: suma,
  total: suma,
  currency: "EUR",
  ...extra,
});

describe("obrat Kleinunternehmer", () => {
  it("počíta podľa dátumu dodania, odpočíta dobropis, vynechá zálohovú, koncept a storno", () => {
    const d = [
      f("2026-01-10", 1000),
      f("2025-12-30", 500, { delivery_date: "2026-01-02" }),
      f("2026-02-01", -200, { type: "credit_note" }),
      f("2026-03-01", 300, { type: "credit_note" }), // starý import s kladným dobropisom
      f("2026-03-01", 9999, { type: "proforma" }),
      f("2026-03-01", 9999, { status: "draft" }),
      f("2026-03-01", 9999, { status: "cancelled" }),
      f("2026-03-01", 9999, { deleted_at: "2026-03-02" }),
      f("2026-04-01", 100, { currency: "CHF", subtotal_eur: 105 }),
      f("2025-06-01", 7000),
    ];
    expect(obratZaRok(d, 2026)).toBe(1000 + 500 - 200 - 300 + 105);
    expect(obratZaRok(d, 2025)).toBe(7000);
  });
});

describe("hranice § 19 UStG", () => {
  const kody = (d: any[], dnes = "2026-10-17") =>
    stavKleinunternehmer(d, dnes).upozornenia.map((u) => [u.zavaznost, u.sprava.slice(0, 40)]);

  it("pod 80 % oboch hraníc bez upozornenia", () => {
    expect(kody([f("2025-05-01", 24_000), f("2026-05-01", 19_999)])).toEqual([]);
  });

  it("minulý rok nad 25 000 € — režim už neplatí", () => {
    const s = stavKleinunternehmer([f("2025-05-01", 25_000.01)], "2026-10-17");
    expect(s.upozornenia).toHaveLength(1);
    expect(s.upozornenia[0].zavaznost).toBe("koniec");
    expect(s.upozornenia[0].parametre).toMatchObject({ minuly: 2025, rok: 2026 });
  });

  it("bežný rok: 80 % z 25 000 € upozorní vopred, nad 25 000 € platí do konca roka", () => {
    const blizko = stavKleinunternehmer([f("2026-05-01", 20_000)], "2026-10-17").upozornenia;
    expect(blizko.map((u) => u.zavaznost)).toEqual(["vystraha"]);
    expect(blizko[0].sprava).toContain("blíži sa k 25 000 €");
    const nad = stavKleinunternehmer([f("2026-05-01", 30_000)], "2026-10-17").upozornenia;
    expect(nad[0].sprava).toContain("od 1. 1. {buduci}");
    expect(nad[0].parametre.buduci).toBe(2027);
  });

  it("bežný rok: nad 80 000 € upozorní na 100 000 €, nad 100 000 € treba DPH hneď", () => {
    const blizko = stavKleinunternehmer([f("2026-05-01", 85_000)], "2026-10-17").upozornenia;
    expect(blizko.map((u) => u.sprava.includes("100 000"))).toEqual([true, false]);
    const nad = stavKleinunternehmer([f("2026-05-01", 100_000.01)], "2026-10-17").upozornenia;
    expect(nad).toHaveLength(1);
    expect(nad[0].zavaznost).toBe("koniec");
    expect(nad[0].sprava).toContain("prekročil 100 000 €");
  });

  it("presne na hranici ešte nie je prekročená", () => {
    expect(
      stavKleinunternehmer([f("2025-05-01", 25_000)], "2026-01-05").upozornenia.filter(
        (u) => u.zavaznost === "koniec",
      ),
    ).toEqual([]);
  });
});
