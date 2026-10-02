import { describe, it, expect } from "vitest";
import {
  MAX_PRILOH,
  POVOLENE_TYPY,
  PRIPONY_PRE_VYBER,
  cestaPrilohy,
  chybaPrilohy,
  typSuboru,
  velkost,
} from "./faktura-prilohy";

const subor = (name: string, size: number, type: string) => ({ name, size, type });

describe("aký súbor sa dá priložiť k dokladu", () => {
  it("PDF, fotka, tabuľka aj dokument prejdú", () => {
    for (const [mime, pripona] of Object.entries(POVOLENE_TYPY)) {
      expect(typSuboru(mime, `subor.${pripona}`), mime).toBe(mime);
    }
  });

  /*
   * Prehliadač pri .heic pošle `application/octet-stream` a pri .csv často
   * nič. Odmietnuť bežný súbor kvôli tomu by bola tichá pasca.
   */
  it("typ sa dopočíta z prípony, keď prehliadač pošle nezmysel", () => {
    expect(typSuboru("application/octet-stream", "dodaci-list.pdf")).toBe("application/pdf");
    expect(typSuboru("", "vykaz.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(typSuboru("", "fotka.HEIC")).toBe("image/heic");
  });

  it("MIME s doplnkom za bodkočiarkou je stále ten istý typ", () => {
    expect(typSuboru("text/plain; charset=utf-8", "poznamka.txt")).toBe("text/plain");
  });

  it("spustiteľný súbor ani nič neznáme neprejde", () => {
    expect(typSuboru("application/x-msdownload", "virus.exe")).toBeNull();
    expect(typSuboru("", "zaloha.sql")).toBeNull();
  });

  it("ponuka prípon v dialógu nemá duplicity a začína bodkou", () => {
    const pripony = PRIPONY_PRE_VYBER.split(",");
    expect(new Set(pripony).size).toBe(pripony.length);
    expect(pripony.every((p) => p.startsWith("."))).toBe(true);
    expect(pripony).toContain(".pdf");
  });
});

describe("hláška, prečo sa súbor priložiť nedá", () => {
  it("v poriadku je bez hlášky", () => {
    expect(chybaPrilohy(subor("dodaci-list.pdf", 1024, "application/pdf"), 0)).toBeNull();
  });

  it("prázdny súbor a súbor nad 15 MB sa odmietnu menovite", () => {
    expect(chybaPrilohy(subor("prazdny.pdf", 0, "application/pdf"), 0)).toContain("prázdny");
    const velky = chybaPrilohy(subor("velky.pdf", 16 * 1024 * 1024, "application/pdf"), 0);
    expect(velky).toContain("velky.pdf");
    expect(velky).toContain("15 MB");
  });

  it("nad desať príloh sa už nepridáva", () => {
    expect(chybaPrilohy(subor("a.pdf", 10, "application/pdf"), MAX_PRILOH)).toContain(
      String(MAX_PRILOH),
    );
    expect(chybaPrilohy(subor("a.pdf", 10, "application/pdf"), MAX_PRILOH - 1)).toBeNull();
  });

  /* Počet sa kontroluje skôr než typ — inak by človek pri plnom doklade
     dostal hlášku o type a nevedel by, že problém je inde. */
  it("pri plnom doklade sa ozve počet, nie typ", () => {
    expect(chybaPrilohy(subor("a.exe", 10, "application/x-msdownload"), MAX_PRILOH)).toContain(
      "najviac",
    );
  });
});

describe("cesta v úložisku", () => {
  const firma = "11111111-1111-1111-1111-111111111111";
  const faktura = "22222222-2222-2222-2222-222222222222";

  /* Politika úložiska aj tabuľky pustí len cestu, ktorá začína firmou. */
  it("začína firmou a pokračuje dokladom", () => {
    const cesta = cestaPrilohy(firma, faktura, "application/pdf");
    expect(cesta.startsWith(`${firma}/${faktura}/`)).toBe(true);
    expect(cesta.endsWith(".pdf")).toBe(true);
  });

  /* Diakritika, medzery a lomky v názve rozbíjajú kľúč v úložisku, tak sa
     súbor ukladá pod náhodným menom a pôvodné drží databáza. */
  it("pôvodný názov sa do cesty nedostane a dva súbory sa neprebijú", () => {
    const a = cestaPrilohy(firma, faktura, "image/jpeg");
    const b = cestaPrilohy(firma, faktura, "image/jpeg");
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[ áäčďéíĺľňóôŕšťúýž]/i);
  });
});

describe("veľkosť pre človeka", () => {
  it("bajty, kilobajty a megabajty", () => {
    expect(velkost(512)).toBe("512 B");
    expect(velkost(2048)).toBe("2 kB");
    expect(velkost(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("nezmysel nič nezobrazí", () => {
    expect(velkost(null)).toBe("");
    expect(velkost(0)).toBe("");
    expect(velkost("nieco")).toBe("");
  });
});
