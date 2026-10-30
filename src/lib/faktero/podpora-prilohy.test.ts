import { describe, expect, it } from "vitest";
import {
  ACCEPT_PODPORY,
  MAX_PRILOHA_PODPORY,
  chybaPrilohyPodpory,
  cestaPrilohyPodpory,
  jeNahladovyObrazok,
  menoVlozenejSnimky,
  obsahZodpovedaTypu,
  roztriedPrilohy,
  typPrilohyPodpory,
} from "./podpora-prilohy";

const subor = (name: string, size = 1000, type = "") => ({ name, size, type });

describe("typPrilohyPodpory", () => {
  it("berie MIME, keď ho prehliadač pošle", () => {
    expect(typPrilohyPodpory("image/png", "x")).toBe("image/png");
    expect(typPrilohyPodpory("image/jpeg; charset=binary", "x")).toBe("image/jpeg");
  });

  it("HEIC z iPhonu chodí bez MIME alebo ako octet-stream — rozhodne prípona", () => {
    expect(typPrilohyPodpory("", "IMG_0042.HEIC")).toBe("image/heic");
    expect(typPrilohyPodpory("application/octet-stream", "fotka.heic")).toBe("image/heic");
    expect(typPrilohyPodpory("", "scan.jpeg")).toBe("image/jpeg");
    expect(typPrilohyPodpory("", "vypis.pdf")).toBe("application/pdf");
  });

  it("iné súbory neprejdú", () => {
    expect(typPrilohyPodpory("application/zip", "a.zip")).toBeNull();
    expect(typPrilohyPodpory("", "skript.exe")).toBeNull();
    expect(typPrilohyPodpory("text/html", "stranka.html")).toBeNull();
  });
});

describe("chybaPrilohyPodpory", () => {
  it("bežná snímka je v poriadku", () => {
    expect(chybaPrilohyPodpory(subor("snimka.png", 200_000, "image/png"), 0)).toBeNull();
  });

  it("prázdny, priveľký a nepodporovaný súbor", () => {
    expect(chybaPrilohyPodpory(subor("a.png", 0), 0)).toEqual({ kod: "prazdny", nazov: "a.png" });
    expect(chybaPrilohyPodpory(subor("a.png", MAX_PRILOHA_PODPORY + 1), 0)).toEqual({
      kod: "velky",
      nazov: "a.png",
    });
    expect(chybaPrilohyPodpory(subor("a.png", MAX_PRILOHA_PODPORY), 0)).toBeNull();
    expect(chybaPrilohyPodpory(subor("a.docx"), 0)).toEqual({ kod: "typ", nazov: "a.docx" });
  });

  it("šiesty súbor sa neprijme", () => {
    expect(chybaPrilohyPodpory(subor("a.png"), 5)).toEqual({ kod: "vela", max: 5 });
  });
});

describe("roztriedPrilohy", () => {
  it("prijme do limitu a o prekročení povie raz", () => {
    const nove = Array.from({ length: 4 }, (_, i) => subor(`s${i}.png`));
    const { prijate, chyby } = roztriedPrilohy(nove, 3);
    expect(prijate.map((s) => s.name)).toEqual(["s0.png", "s1.png"]);
    expect(chyby).toEqual([{ kod: "vela", max: 5 }]);
  });

  it("zlý súbor nezaberie miesto dobrému", () => {
    const { prijate, chyby } = roztriedPrilohy([subor("x.zip"), subor("ok.jpg")], 4);
    expect(prijate.map((s) => s.name)).toEqual(["ok.jpg"]);
    expect(chyby).toEqual([{ kod: "typ", nazov: "x.zip" }]);
  });
});

describe("drobnosti", () => {
  it("accept pustí fotky aj PDF", () => {
    for (const p of [".heic", ".pdf", ".jpg", ".jpeg", "image/webp"]) {
      expect(ACCEPT_PODPORY).toContain(p);
    }
  });

  it("náhľad len pre obrázky, ktoré prehliadač ukáže", () => {
    expect(jeNahladovyObrazok("image/png")).toBe(true);
    expect(jeNahladovyObrazok("image/heic")).toBe(false);
    expect(jeNahladovyObrazok("application/pdf")).toBe(false);
  });

  it("vložená snímka dostane meno s časom", () => {
    expect(menoVlozenejSnimky("image/png", new Date(2026, 9, 28, 9, 5, 3))).toBe(
      "snimka-20261028-090503.png",
    );
  });

  it("cesta v koši je pod priečinkom požiadavky a bez pôvodného mena", () => {
    const c = cestaPrilohyPodpory("11111111-1111-1111-1111-111111111111", "image/heic");
    expect(c).toMatch(/^11111111-1111-1111-1111-111111111111\/[0-9a-f-]{36}\.heic$/);
  });
});

describe("obsahZodpovedaTypu", () => {
  const b = (...x: (number | string)[]) =>
    new Uint8Array(
      x.flatMap((v) => (typeof v === "string" ? [...v].map((z) => z.charCodeAt(0)) : [v])),
    );
  it("pozná skutočné obrázky a PDF", () => {
    expect(obsahZodpovedaTypu("image/png", b(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(obsahZodpovedaTypu("image/jpeg", b(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(obsahZodpovedaTypu("image/webp", b("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe(true);
    expect(obsahZodpovedaTypu("image/heic", b(0, 0, 0, 0x18, "ftypheic"))).toBe(true);
    expect(obsahZodpovedaTypu("application/pdf", b("%PDF-1.7\n"))).toBe(true);
    // Hlavička PDF smie mať pred sebou pár bajtov smetí.
    expect(obsahZodpovedaTypu("application/pdf", b(0xef, 0xbb, 0xbf, "%PDF-1.4"))).toBe(true);
  });
  it("odmietne HTML či text vydávaný za obrázok alebo PDF (skúška naostro 30. 10.)", () => {
    const html = b("<html><script>alert(1)</script></html>");
    expect(obsahZodpovedaTypu("image/png", html)).toBe(false);
    expect(obsahZodpovedaTypu("image/jpeg", html)).toBe(false);
    expect(obsahZodpovedaTypu("image/webp", html)).toBe(false);
    expect(obsahZodpovedaTypu("image/heic", html)).toBe(false);
    expect(obsahZodpovedaTypu("application/pdf", html)).toBe(false);
    expect(obsahZodpovedaTypu("text/html", html)).toBe(false);
    expect(obsahZodpovedaTypu("image/png", new Uint8Array())).toBe(false);
  });
});
