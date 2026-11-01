/*
  Každá cesta z menu musí mať oblasť v mape CESTY (opravnenia.ts) — inak ju
  `filterNav` roli „Vlastný prístup“ neskryje (S-18: /dodavatelia).

  Stránky mimo oblastí (vidí ich každý člen) sú vymenované v BEZ_OBLASTI.
  Diery z 1. 11. 2026 (/dodavatelia, /schvalovanie, /kos) opravil balík B4;
  test stráži, aby nová položka menu bez oblasti neprešla.
*/
import { describe, expect, it } from "vitest";
import { NAV, QUICK_CREATE } from "./nav";
import { oblastPodlaCesty } from "@/lib/faktero/opravnenia";

/** Zámerne bez oblasti — nástroje a nastavenia, ktoré vidí každý člen. */
const BEZ_OBLASTI = new Set(["/podpora", "/ai-asistent", "/firmy", "/predplatne", "/diagnostika", "/dashboard", "/moje-ulohy"]);

/**
 * Kôš je zámerne bez oblasti: ukazuje zmazané doklady všetkých druhov a každý
 * druh filtruje RLS jeho oblasti — človek s vlastným prístupom v ňom vidí len
 * doklady oblastí, ku ktorým má právo (B4, 1. 11. 2026).
 */
BEZ_OBLASTI.add("/kos");

function cestyMenu(): string[] {
  const cesty = NAV.flatMap((g) => g.children.map((c) => String(c.to)));
  const rychle = (QUICK_CREATE as { to: string }[] | undefined)?.map((c) => String(c.to)) ?? [];
  return [...new Set([...cesty, ...rychle])];
}

const bezOblasti = () => cestyMenu().filter((c) => !oblastPodlaCesty(c) && !BEZ_OBLASTI.has(c));

describe("menu vs. mapa oblastí (CESTY)", () => {
  it("každá cesta z menu má oblasť alebo je zámerne bez nej", () => {
    const chyba = bezOblasti();
    expect(chyba, `Cesty z nav.ts bez oblasti v CESTY (opravnenia.ts): ${chyba.join(", ")}`).toEqual([]);
  });

  it("opravené diery majú správnu oblasť (S-18, B-10, E-26)", () => {
    expect(oblastPodlaCesty("/dodavatelia")).toBe("kontakty");
    expect(oblastPodlaCesty("/dodavatelia/123")).toBe("kontakty");
    expect(oblastPodlaCesty("/schvalovanie")).toBe("doklady");
    expect(oblastPodlaCesty("/faktury/parovanie")).toBe("banka");
    expect(oblastPodlaCesty("/faktury/upomienky")).toBe("faktury");
    expect(oblastPodlaCesty("/uctovnictvo/na-kontrolu")).toBe("doklady");
    expect(oblastPodlaCesty("/uctovnictvo/dph")).toBe("uctovnictvo");
    expect(oblastPodlaCesty("/kos")).toBeNull();
  });
});
