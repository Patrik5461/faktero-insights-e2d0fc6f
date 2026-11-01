/*
  Každá cesta z menu musí mať oblasť v mape CESTY (opravnenia.ts) — inak ju
  `filterNav` roli „Vlastný prístup“ neskryje (S-18: /dodavatelia).

  Stránky mimo oblastí (vidí ich každý člen) sú vymenované v BEZ_OBLASTI.
  DIERY sú známe chýbajúce cesty — opraví ich balík B4 (ten vlastní nav.ts aj
  opravnenia.ts). Po oprave ich odtiaľto zmaž; test potom stráži, aby nová
  položka menu bez oblasti neprešla.
*/
import { describe, expect, it } from "vitest";
import { NAV, QUICK_CREATE } from "./nav";
import { oblastPodlaCesty } from "@/lib/faktero/opravnenia";

/** Zámerne bez oblasti — nástroje a nastavenia, ktoré vidí každý člen. */
const BEZ_OBLASTI = new Set(["/podpora", "/ai-asistent", "/firmy", "/predplatne", "/diagnostika", "/dashboard", "/moje-ulohy"]);

/** Známe diery k 1. 11. 2026 — opraví B4 (S-18 a ďalšie). */
const DIERY = new Set([
  "/dodavatelia", // S-18: patrí do „kontakty“
  "/kos", // kôš miešá doklady viacerých oblastí — B4 rozhodne (filtrovať po oblastiach)
  "/schvalovanie", // schvaľovanie prijatých dokladov — pravdepodobne „doklady“
]);

function cestyMenu(): string[] {
  const cesty = NAV.flatMap((g) => g.children.map((c) => String(c.to)));
  const rychle = (QUICK_CREATE as { to: string }[] | undefined)?.map((c) => String(c.to)) ?? [];
  return [...new Set([...cesty, ...rychle])];
}

const bezOblasti = () => cestyMenu().filter((c) => !oblastPodlaCesty(c) && !BEZ_OBLASTI.has(c));

describe("menu vs. mapa oblastí (CESTY)", () => {
  it("žiadna NOVÁ cesta z menu bez oblasti", () => {
    const nove = bezOblasti().filter((c) => !DIERY.has(c));
    expect(nove, `Cesty z nav.ts bez oblasti v CESTY (opravnenia.ts): ${nove.join(", ")}`).toEqual([]);
  });

  it("zoznam DIER je aktuálny (opravenú dieru zmaž zo zoznamu)", () => {
    const opravene = [...DIERY].filter((c) => !bezOblasti().includes(c));
    expect(opravene, `Už majú oblasť, zmaž ich z DIERY: ${opravene.join(", ")}`).toEqual([]);
  });

  // Ostane žltý, kým B4 diery neopraví — vtedy z neho sprav it(...) a DIERY vyprázdni.
  it.todo(`každá cesta z menu má oblasť — dnes chýba: ${[...DIERY].join(", ")}`);
});
