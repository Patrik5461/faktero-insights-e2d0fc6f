import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  chybaObsahuPrilohy,
  DRUHY_S_PRILOHAMI,
  MAX_PRILOH,
  nazvyDoZipu,
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
    expect(velkost(3 * 1024 * 1024)).toBe("3,0 MB");
  });

  it("nezmysel nič nezobrazí", () => {
    expect(velkost(null)).toBe("");
    expect(velkost(0)).toBe("");
    expect(velkost("nieco")).toBe("");
  });
});

describe("druhy dokladov s prílohami", () => {
  /*
   * Každý druh má v tabuľke príloh vlastný stĺpec s cudzím kľúčom a databáza
   * pustí len riadok s práve jedným z nich. Keby kód poznal druh, ktorý
   * databáza nie, nahratie by spadlo až u zákazníka.
   */
  it("každý stĺpec dokladu je v podmienke „práve jeden doklad“", () => {
    const migracie = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`supabase/migrations/${f}`, "utf-8"))
      .join("\n");
    // Každá tabuľka príloh má vlastnú podmienku; druhy sa delia podľa `prilohy`.
    const PODMIENKY: Record<string, RegExp> = {
      invoice_attachments: /invoice_attachments_prave_jeden_doklad\s+check\s*\(num_nonnulls\(([^)]+)\)/,
      prilohy_dokladov: /prilohy_dokladov_prave_jeden\s+check\s*\(num_nonnulls\(([^)]+)\)/,
    };
    for (const [tabulka, vzor] of Object.entries(PODMIENKY)) {
      const podmienka = migracie.match(vzor)?.[1] ?? "";
      const druhy = Object.values(DRUHY_S_PRILOHAMI).filter((d) => d.prilohy === tabulka);
      for (const { stlpec } of druhy) expect(podmienka, stlpec).toContain(stlpec);
      expect(podmienka.split(",").length, tabulka).toBe(druhy.length);
    }
  });

  it("názvy druhov sa neopakujú", () => {
    const nazvy = Object.values(DRUHY_S_PRILOHAMI).map((d) => d.nazov);
    expect(new Set(nazvy).size).toBe(nazvy.length);
  });
});

describe("nazvyDoZipu", () => {
  it("dvojice dostanú poradové číslo, bez ohľadu na veľkosť písmen", () => {
    expect(nazvyDoZipu(["sken.pdf", "Sken.pdf", "sken.pdf", "vykaz.xlsx"])).toEqual([
      "sken.pdf",
      "Sken (2).pdf",
      "sken (3).pdf",
      "vykaz.xlsx",
    ]);
  });
  it("lomky a cesty sa z názvu odstránia", () => {
    expect(nazvyDoZipu(["../../etc/passwd", "a/b\\c.pdf", "", ".skryty"])).toEqual([
      "_.._etc_passwd",
      "a_b_c.pdf",
      "priloha",
      "skryty",
    ]);
  });
});

describe("chybaObsahuPrilohy — obsah musí sedieť s typom", () => {
  const b = (s: string | number[]) =>
    typeof s === "string" ? new TextEncoder().encode(s) : new Uint8Array(s);
  it("pustí skutočné PDF, obrázky, xlsx a text", () => {
    expect(chybaObsahuPrilohy("application/pdf", b("%PDF-1.7\n..."))).toBeNull();
    expect(chybaObsahuPrilohy("application/pdf", b("\r\n%PDF-1.4"))).toBeNull();
    expect(chybaObsahuPrilohy("image/png", b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull();
    expect(chybaObsahuPrilohy("image/jpeg", b([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(
      chybaObsahuPrilohy(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        b([0x50, 0x4b, 0x03, 0x04, 1, 2]),
      ),
    ).toBeNull();
    expect(chybaObsahuPrilohy("text/csv", b("=1+1;a\n"))).toBeNull();
    expect(chybaObsahuPrilohy("text/plain", b([0xff, 0xfe, 0x41, 0x00]))).toBeNull();
  });
  it("odmietne EXE premenované na PDF, HTML vydávané za PDF či obrázok a binárny „text“", () => {
    expect(chybaObsahuPrilohy("application/pdf", b("MZ\x90\x00\x03"))).toMatch(/Spustiteľný/);
    expect(chybaObsahuPrilohy("text/plain", b([0x7f, 0x45, 0x4c, 0x46, 2]))).toMatch(/Spustiteľný/);
    expect(chybaObsahuPrilohy("application/pdf", b("<html><script>alert(1)</script>"))).toMatch(/nezodpovedá/);
    expect(chybaObsahuPrilohy("image/png", b('<svg onload="alert(1)">'))).toMatch(/nezodpovedá/);
    expect(chybaObsahuPrilohy("text/plain", b([0x41, 0x00, 0x42]))).toMatch(/nezodpovedá/);
  });
});
