import { describe, expect, it } from "vitest";
import { adresaVJazyku, jazykZAdresy, odkazyJazykov, upravZnackyHlavicky } from "./jazyk-adresa";

describe("jazyk v adrese a hreflang", () => {
  it("?lang= prečíta len platný jazyk", () => {
    expect(jazykZAdresy("?lang=de")).toBe("de");
    expect(jazykZAdresy("https://www.faktero.sk/cennik?x=1&lang=cs#a")).toBe("cs");
    expect(jazykZAdresy("?lang=en")).toBeNull();
    expect(jazykZAdresy("")).toBeNull();
    expect(jazykZAdresy(undefined)).toBeNull();
  });

  it("slovenská adresa je bez parametra, ostatné ho majú", () => {
    expect(adresaVJazyku("https://www.faktero.sk/cennik", "sk")).toBe(
      "https://www.faktero.sk/cennik",
    );
    expect(adresaVJazyku("https://www.faktero.sk/cennik?lang=de", "sk")).toBe(
      "https://www.faktero.sk/cennik",
    );
    expect(adresaVJazyku("https://www.faktero.sk/", "de")).toBe("https://www.faktero.sk/?lang=de");
  });

  it("odkazy pre sk, cs, de a x-default", () => {
    expect(odkazyJazykov("https://www.faktero.sk/cennik")).toEqual([
      { hrefLang: "sk", href: "https://www.faktero.sk/cennik" },
      { hrefLang: "cs", href: "https://www.faktero.sk/cennik?lang=cs" },
      { hrefLang: "de", href: "https://www.faktero.sk/cennik?lang=de" },
      { hrefLang: "x-default", href: "https://www.faktero.sk/cennik" },
    ]);
  });

  it("kanonická adresa ukazuje na jazykovú verziu a za ňou idú hreflang", () => {
    const znacky = [
      { tag: "title", children: "Cenník" },
      { tag: "link", attrs: { rel: "canonical", href: "https://www.faktero.sk/cennik" } },
      { tag: "link", attrs: { rel: "icon", href: "/favicon.png" } },
    ];
    const de = upravZnackyHlavicky(znacky, "de");
    expect(de[1].attrs).toEqual({
      rel: "canonical",
      href: "https://www.faktero.sk/cennik?lang=de",
    });
    expect(de.filter((z) => z.attrs?.rel === "alternate")).toHaveLength(4);
    expect(de.at(-1)?.attrs).toEqual({ rel: "icon", href: "/favicon.png" });
    const sk = upravZnackyHlavicky(znacky, "sk");
    expect(sk[1].attrs?.href).toBe("https://www.faktero.sk/cennik");
  });

  it("stránka bez kanonickej adresy (aplikácia) hreflang nedostane", () => {
    const znacky = [{ tag: "title", children: "Faktúry" }];
    expect(upravZnackyHlavicky(znacky, "de")).toEqual(znacky);
  });
});
