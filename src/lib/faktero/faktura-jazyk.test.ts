import { describe, it, expect } from "vitest";
import {
  JAZYKY_DOKLADU,
  jazykDokladu,
  popisky,
  localeDokladu,
  type JazykDokladu,
} from "./faktura-jazyk";

describe("jazyk dokladu", () => {
  it("neznámy jazyk padne na slovenčinu", () => {
    expect(jazykDokladu("fr")).toBe("sk");
    expect(jazykDokladu(null)).toBe("sk");
    expect(jazykDokladu(undefined)).toBe("sk");
  });

  it("každý jazyk má vyplnené všetky popisky", () => {
    const kluce = Object.keys(popisky("sk"));
    for (const j of JAZYKY_DOKLADU) {
      const p = popisky(j.kod) as Record<string, string>;
      for (const k of kluce) {
        expect(p[k], `${j.kod}.${k}`).toBeTruthy();
      }
    }
  });

  it("nadpis dokladu je preložený", () => {
    expect(popisky("en").faktura).toBe("INVOICE");
    expect(popisky("de").faktura).toBe("RECHNUNG");
    expect(popisky("cs").faktura).toBe("FAKTURA");
    expect(popisky("hu").faktura).toBe("SZÁMLA");
  });

  it("veta o prenose dane si drží odkaz na slovenský zákon", () => {
    for (const j of JAZYKY_DOKLADU) {
      expect(popisky(j.kod).prenosTuzemsko).toContain("222/2004");
    }
  });

  it("čísla sa formátujú podľa jazyka", () => {
    const suma = 1234.56;
    const f = (j: JazykDokladu) =>
      new Intl.NumberFormat(localeDokladu(j), { minimumFractionDigits: 2 })
        .format(suma)
        .replace(/ | /g, " ");
    expect(f("en")).toBe("1,234.56");
    expect(f("de")).toBe("1.234,56");
    expect(f("sk")).toBe("1 234,56");
  });
});

describe("vety k preneseniu pre českú firmu", () => {
  it("citujú český zákon 235/2004, nie slovenský", async () => {
    const { vetyPreneseniaCz } = await import("./faktura-jazyk");
    for (const j of ["cs", "sk", "en", "de", "hu"]) {
      const v = vetyPreneseniaCz(j);
      for (const t of Object.values(v)) {
        expect(t).toContain("235/2004");
        expect(t).not.toContain("222/2004");
      }
    }
    expect(vetyPreneseniaCz("cs").tuzemsko).toContain("§ 92a");
    expect(vetyPreneseniaCz("cs").tuzemsko).toContain("Daň odvede zákazník");
    expect(vetyPreneseniaCz("cs").euTovar).toContain("§ 64");
    expect(vetyPreneseniaCz("cs").vyvoz).toContain("§ 66");
  });

  it("služba mimo EÚ nie je „v jiném členském státě“, trojstranný obchod cituje § 17", async () => {
    const { vetaPreneseniaCz } = await import("./faktura-jazyk");
    const mimo = vetaPreneseniaCz("export", "sluzba", "cs");
    expect(mimo).toContain("mimo Evropskou unii");
    expect(mimo).not.toContain("členském státě");
    expect(mimo).not.toContain("Daň odvede zákazník");
    expect(vetaPreneseniaCz("export", "tovar", "cs")).toContain("§ 66");
    expect(vetaPreneseniaCz("eu_b2b", "sluzba", "cs")).toContain("v jiném členském státě");
    expect(vetaPreneseniaCz("eu_b2b", "tovar", "cs")).toContain("§ 64");
    const troj = vetaPreneseniaCz("eu_b2b", "trojstranny", "cs");
    expect(troj).toContain("§ 17");
    expect(troj).toContain("třístranného obchodu");
    expect(vetaPreneseniaCz("domestic_69", null, "cs")).toContain("§ 92a");
    expect(vetaPreneseniaCz("export", "sluzba", "en")).toContain("outside the European Union");
  });
});

describe("úvod opravného dokladu českej firmy", () => {
  it("český dobropis nemá slovenský úvod", async () => {
    const { uvodOpravnehoDokladu } = await import("./faktura-jazyk");
    expect(uvodOpravnehoDokladu("credit_note", "20260007", "cs", "CZ")).toBe(
      "Dobropis k faktuře č. 20260007",
    );
    expect(uvodOpravnehoDokladu("debit_note", "20260007", "cs", "CZ")).toBe(
      "Vrubopis k faktuře č. 20260007",
    );
  });
});
