/**
 * Podpisovanie požiadaviek pre Wallester.
 *
 * Wallester pri zlom tokene odpovie len „401" a nepovie prečo. Dve veci sa
 * pritom mýlia najčastejšie: odtlačok tela sa spočíta zo šestnástkového zápisu
 * namiesto binárneho, a token sa podpíše iným algoritmom. Oboje je tu overené.
 */
import { describe, it, expect } from "vitest";
import { createHash, createVerify } from "crypto";
import { odtlacokTela, vyrobKluce, vyrobToken } from "./wallester.server";

const spojenie = (sukromny: string) => ({
  issuerId: "7a4f2123-37ff-44b3-9028-3747f4e93b1c",
  audienceId: "E2C0AB55-DC39-413B-94CF-4C6FB2CEE6F0",
  privateKeyPem: sukromny,
  productCode: "PROD",
  maxPlatnostSekund: 60,
});

function rozober(token: string) {
  const [h, o, p] = token.split(".");
  const json = (b: string) => JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  return { hlavicka: json(h), obsah: json(o), podpis: p, zaklad: `${h}.${o}` };
}

describe("token pre Wallester", () => {
  it("má tvar JWT s poľami, ktoré Wallester čaká", () => {
    const { sukromny } = vyrobKluce();
    const { hlavicka, obsah } = rozober(vyrobToken(spojenie(sukromny)));
    expect(hlavicka).toEqual({ alg: "RS256", typ: "JWT" });
    expect(obsah.iss).toBe("7a4f2123-37ff-44b3-9028-3747f4e93b1c");
    expect(obsah.aud).toBe("E2C0AB55-DC39-413B-94CF-4C6FB2CEE6F0");
    expect(obsah.sub).toBe("api-request");
    expect(obsah.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("platnosť neprekročí povolené maximum", () => {
    const { sukromny } = vyrobKluce();
    const { obsah } = rozober(vyrobToken(spojenie(sukromny)));
    expect(obsah.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
  });

  it("odtlačok tela je base64 z binárneho SHA-256, nie zo šestnástkového zápisu", () => {
    const telo = '{"a":1}';
    const spravne = createHash("sha256").update(telo).digest("base64");
    const zleAleCaste = Buffer.from(createHash("sha256").update(telo).digest("hex")).toString(
      "base64",
    );
    expect(odtlacokTela(telo)).toBe(spravne);
    expect(odtlacokTela(telo)).not.toBe(zleAleCaste);
  });

  it("prázdne telo má odtlačok prázdneho reťazca", () => {
    const { sukromny } = vyrobKluce();
    const { obsah } = rozober(vyrobToken(spojenie(sukromny)));
    expect(obsah.rbh).toBe(createHash("sha256").update("").digest("base64"));
  });

  it("podpis sedí k verejnému kľúču, ktorý sa posiela Wallesteru", () => {
    const { verejny, sukromny } = vyrobKluce();
    const { zaklad, podpis } = rozober(vyrobToken(spojenie(sukromny), '{"x":1}'));
    const v = createVerify("RSA-SHA256");
    v.update(zaklad);
    v.end();
    expect(v.verify(verejny, Buffer.from(podpis, "base64url"))).toBe(true);
  });

  it("podpis cudzieho kľúča neprejde", () => {
    const a = vyrobKluce();
    const b = vyrobKluce();
    const { zaklad, podpis } = rozober(vyrobToken(spojenie(b.sukromny)));
    const v = createVerify("RSA-SHA256");
    v.update(zaklad);
    v.end();
    expect(v.verify(a.verejny, Buffer.from(podpis, "base64url"))).toBe(false);
  });
});
