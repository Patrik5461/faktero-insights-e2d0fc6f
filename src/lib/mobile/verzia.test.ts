import { describe, expect, it } from "vitest";
import { jeNovsia } from "./verzia";

const MOJA = "2026-08-15 15:30";
const ODKAZ = "https://apps.apple.com/sk/app/faktero/id1";

describe("ponúknuť aktualizáciu?", () => {
  it("novší zverejnený balíček sa ponúkne", () => {
    expect(
      jeNovsia(MOJA, { peciatka: "2026-08-16 09:00", zverejnene: true, odkaz: ODKAZ }),
    ).toEqual({ peciatka: "2026-08-16 09:00", odkaz: ODKAZ });
  });

  it("nezverejnený balíček sa neponúkne", () => {
    // Build vzniká skôr, než ho Apple schváli. Poslať človeka do obchodu pre
    // verziu, ktorá tam nie je, je horšie než nepovedať nič.
    expect(
      jeNovsia(MOJA, { peciatka: "2026-08-16 09:00", zverejnene: false, odkaz: ODKAZ }),
    ).toBeNull();
  });

  it("rovnaká ani staršia verzia sa neponúka", () => {
    expect(jeNovsia(MOJA, { peciatka: MOJA, zverejnene: true, odkaz: ODKAZ })).toBeNull();
    expect(
      jeNovsia(MOJA, { peciatka: "2026-08-01 08:00", zverejnene: true, odkaz: ODKAZ }),
    ).toBeNull();
  });

  it("neúplný alebo pokazený súbor neponúkne nič", () => {
    expect(jeNovsia(MOJA, { peciatka: "2026-08-16 09:00", zverejnene: true })).toBeNull();
    expect(jeNovsia(MOJA, { zverejnene: true, odkaz: ODKAZ })).toBeNull();
    expect(jeNovsia(MOJA, null)).toBeNull();
    expect(jeNovsia(MOJA, "nezmysel")).toBeNull();
  });
});
