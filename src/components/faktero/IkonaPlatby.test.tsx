import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IkonaPlatby, ObsahPlatby, TON_STAVU_PLATBY } from "./IkonaPlatby";
import { PasNavrhovPlatieb } from "./PasNavrhovPlatieb";
import { JazykProvider } from "@/lib/i18n/useT";
import type { Jazyk } from "@/lib/i18n/jazyk";
import type { ReactNode } from "react";

const html = (n: ReactNode, jazyk: Jazyk = "sk") =>
  renderToStaticMarkup(<JazykProvider jazyk={jazyk}>{n}</JazykProvider>);

const pohyb = { datum: "2026-10-28", suma: 123.4, mena: "EUR", ucet: "SK31 1200 0000 1987 4263 7541", vs: "2026001", protistrana: "ACME s.r.o.", odkaz: "/banka/pohyby/1" };

describe("IkonaPlatby", () => {
  it("bez stavu nič nekreslí", () => {
    expect(html(<IkonaPlatby stav={null} />)).toBe("");
  });

  it.each([
    ["sparovana", "stav-uspech", "Platba: Spárovaná s pohybom z účtu"],
    ["navrh", "stav-pozor", "Platba: Nájdená platba čaká na potvrdenie"],
    ["nenajdena", "stav-chyba", "Platba: Platba sa zatiaľ nenašla"],
  ] as const)("%s = tlačidlo s bodkou tónu redizajnu", (stav, trieda, popis) => {
    const h = html(<IkonaPlatby stav={stav} />);
    expect(h.match(/<button/g)).toHaveLength(1);
    expect(h).toContain(`aria-label="${popis}"`);
    expect(h).toContain("data-neotvarat");
    expect(h).toContain('aria-haspopup="dialog"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain(trieda);
    expect(h).not.toMatch(/#[0-9a-f]{6}/i);
    expect(TON_STAVU_PLATBY[stav]).toBe(trieda.replace("stav-", ""));
  });

  it("popis v nemčine a češtine", () => {
    expect(html(<IkonaPlatby stav="navrh" />, "de")).toContain('aria-label="Zahlung: Gefundene Zahlung wartet auf Bestätigung"');
    expect(html(<IkonaPlatby stav="nenajdena" />, "cs")).toContain("Platba zatím nebyla nalezena");
  });
});

describe("ObsahPlatby", () => {
  it("návrh: údaje pohybu, dôvody a Áno/Nie + odkaz na pohyb", () => {
    const h = html(
      <ObsahPlatby stav="navrh" pohyb={pohyb} dovody={["Suma sedí", "VS sedí"]} onSparuj={() => {}} onNie={() => {}} onZavri={() => {}} />,
    );
    expect(h).toContain("28. 10. 2026");
    expect(h).toContain("123,40");
    expect(h).toContain("2026001");
    expect(h).toContain("ACME s.r.o.");
    expect(h).toContain("Suma sedí");
    expect(h).toContain("Áno, patrí k sebe");
    expect(h).toContain(">Nie<");
    expect(h).toContain('href="/banka/pohyby/1"');
    expect(h).toContain('aria-label="Zavrieť"');
  });

  it("istý návrh má tlačidlo Spárovať", () => {
    const h = html(<ObsahPlatby stav="navrh" ista pohyb={pohyb} onSparuj={() => {}} onNie={() => {}} />);
    expect(h).toContain(">Spárovať<");
    expect(h).not.toContain("Áno, patrí k sebe");
  });

  it("zaneprázdnené zamkne tlačidlá", () => {
    const h = html(<ObsahPlatby stav="navrh" zaneprazdnene onSparuj={() => {}} onNie={() => {}} />);
    expect(h.match(/disabled=""/g)).toHaveLength(2);
  });

  it("spárovaná: pohyb a Zrušiť väzbu len s onZrus", () => {
    expect(html(<ObsahPlatby stav="sparovana" pohyb={pohyb} onZrus={() => {}} />)).toContain("Zrušiť väzbu");
    expect(html(<ObsahPlatby stav="sparovana" pohyb={pohyb} />)).not.toContain("Zrušiť väzbu");
  });

  it("nenájdená: text a odkaz na ručné spárovanie, bez údajov pohybu", () => {
    const h = html(<ObsahPlatby stav="nenajdena" pohyb={pohyb} odkazRucne="/banka?parovat=1" />);
    expect(h).toContain("Platba sa zatiaľ nenašla");
    expect(h).toContain("Spárovať ručne v Banke");
    expect(h).toContain('href="/banka?parovat=1"');
    expect(h).not.toContain("2026001");
  });
});

describe("PasNavrhovPlatieb", () => {
  const zaklad = { lenTieto: false, onLenTieto: () => {}, onSparujIste: async () => {} };

  it("pri nule návrhov a vypnutom filtri nič", () => {
    expect(html(<PasNavrhovPlatieb pocet={0} istych={0} {...zaklad} />)).toBe("");
  });

  it("pri nule so zapnutým filtrom ostane, aby sa dal vypnúť", () => {
    const h = html(<PasNavrhovPlatieb pocet={0} istych={0} {...zaklad} lenTieto />);
    expect(h).toContain("Zobraziť všetky");
    expect(h).toContain('aria-pressed="true"');
  });

  it("počet, filter a hromadné spárovanie istých", () => {
    const h = html(<PasNavrhovPlatieb pocet={5} istych={2} {...zaklad} nazovDokladov="faktúr" />);
    expect(h).toContain("5 faktúr s nájdenou platbou");
    expect(h).toContain("Zobraziť len tieto");
    expect(h).toContain("Spárovať všetky isté (2)");
    expect(h).toContain("fk-oznam-pozor");
  });

  it("bez istých nie je tlačidlo hromadného spárovania", () => {
    expect(html(<PasNavrhovPlatieb pocet={3} istych={0} {...zaklad} />)).not.toContain("Spárovať všetky");
  });

  it("nemčina", () => {
    const h = html(<PasNavrhovPlatieb pocet={3} istych={1} {...zaklad} />, "de");
    expect(h).toContain("3 Belege mit gefundener Zahlung");
    expect(h).toContain("Alle sicheren verknüpfen (1)");
  });
});
