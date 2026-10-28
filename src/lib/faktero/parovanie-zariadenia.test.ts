import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { jeKodParovania, kodParovania, tokenZKodu, zostavaSekund } from "./parovanie-zariadenia";
import { hashTokenu } from "./parovanie-zariadenia.server";

describe("QR kód na prihlásenie appky", () => {
  const token = randomBytes(32).toString("base64url");

  it("token prejde tam a späť", () => {
    expect(token).toHaveLength(43);
    expect(tokenZKodu(kodParovania(token))).toBe(token);
    expect(tokenZKodu(`  ${kodParovania(token)}\n`)).toBe(token);
  });

  it("bloček, platobný QR ani skrátený kód nie sú prihlásenie", () => {
    expect(tokenZKodu("O-1234567890ABCDEF")).toBeNull();
    expect(tokenZKodu("SPD*1.0*ACC:SK31")).toBeNull();
    expect(tokenZKodu(kodParovania(token.slice(0, 20)))).toBeNull();
    expect(tokenZKodu(kodParovania(`${token.slice(0, 42)}+`))).toBeNull();
    expect(tokenZKodu(null)).toBeNull();
    // Poškodený kód Faktera appka spozná, aby povedala, čo je zle.
    expect(jeKodParovania("faktero-app:xyz")).toBe(true);
    expect(jeKodParovania("https://www.faktero.sk")).toBe(false);
  });

  it("v databáze je len hash, nie token", () => {
    const h = hashTokenu(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(token);
    expect(hashTokenu(token)).toBe(h);
  });

  it("odpočet nejde pod nulu", () => {
    const teraz = Date.parse("2026-10-28T10:00:00Z");
    expect(zostavaSekund("2026-10-28T10:02:00Z", teraz)).toBe(120);
    expect(zostavaSekund("2026-10-28T09:59:00Z", teraz)).toBe(0);
    expect(zostavaSekund("nezmysel", teraz)).toBe(0);
  });
});
