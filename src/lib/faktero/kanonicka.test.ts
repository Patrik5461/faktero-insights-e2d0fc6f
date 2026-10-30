/**
 * Verejné stránky z mapy stránok musia mať kanonickú adresu na www — web
 * odpovedá na `faktero.sk` aj `www.faktero.sk` a mapa stránok aj robots.txt
 * hovoria www. Kanonická adresa bez www alebo žiadna = každá stránka dvakrát.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kanonicka } from "./kanonicka";

const ROUTES = path.resolve(import.meta.dirname, "../../routes");
const VEREJNE =
  /^(index|cennik|kontakt|android|funkcie|efakturacia|uctovnici|vyvojari|blog|pravne|pomoc|objednavka|faktura-zadarmo|nastroje)[.]/;

describe("kanonická adresa", () => {
  it("skladá adresu na www", () => {
    expect(kanonicka("/cennik")).toEqual([
      { rel: "canonical", href: "https://www.faktero.sk/cennik" },
    ]);
    expect(kanonicka("/")[0].href).toBe("https://www.faktero.sk/");
  });

  const subory = readdirSync(ROUTES).filter((f) => VEREJNE.test(f) && f.endsWith(".tsx"));
  it.each(subory)("%s", (subor) => {
    const s = readFileSync(path.join(ROUTES, subor), "utf8");
    if (!s.includes("head:")) return;
    expect(/canonical|kanonicka\(/.test(s), "chýba kanonická adresa").toBe(true);
    expect(s).not.toMatch(/(canonical|og:url)[^\n]*https:\/\/faktero\.sk/);
  });
});
