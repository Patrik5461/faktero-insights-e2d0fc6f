/**
 * Tvrdenie, ktorým sa Faktero prihlasuje do Revolutu.
 *
 * Revolut pri zlom tvrdení odpovie len „invalid_client" a nepovie, čo mu vadí.
 * Najčastejšie sú to dve veci: `iss` nie je hostiteľ návratovej adresy (a nie
 * celá adresa), a `sub` nie je client ID. Oboje je tu overené.
 */
import { describe, it, expect } from "vitest";
import { createVerify } from "crypto";
import { generateKeyPairSync } from "crypto";
import { adresaPotvrdenia, adresy, issZAdresy, vyrobTvrdenie } from "./revolut.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const spojenie = {
  clientId: "abc-client-id",
  privateKeyPem: privateKey,
  redirectUri: "https://www.faktero.sk/bankove-ucty/revolut",
  prostredie: "produkcia" as const,
};

function rozober(token: string) {
  const [h, o, p] = token.split(".");
  const json = (b: string) => JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  return { hlavicka: json(h), obsah: json(o), podpis: p, zaklad: `${h}.${o}` };
}

describe("tvrdenie pre Revolut", () => {
  it("iss je hostiteľ návratovej adresy, nie celá adresa", () => {
    expect(issZAdresy("https://www.faktero.sk/bankove-ucty/revolut")).toBe("www.faktero.sk");
    expect(rozober(vyrobTvrdenie(spojenie)).obsah.iss).toBe("www.faktero.sk");
  });

  it("sub je client ID a aud je Revolut", () => {
    const { obsah, hlavicka } = rozober(vyrobTvrdenie(spojenie));
    expect(hlavicka).toEqual({ alg: "RS256", typ: "JWT" });
    expect(obsah.sub).toBe("abc-client-id");
    expect(obsah.aud).toBe("https://revolut.com");
    expect(obsah.exp).toBeGreaterThan(obsah.iat);
  });

  it("podpis sedí k certifikátu, ktorý ide do portálu", () => {
    const { zaklad, podpis } = rozober(vyrobTvrdenie(spojenie));
    const v = createVerify("RSA-SHA256");
    v.update(zaklad);
    v.end();
    expect(v.verify(publicKey, Buffer.from(podpis, "base64url"))).toBe(true);
  });

  it("adresa potvrdenia mieri do správneho prostredia", () => {
    expect(adresaPotvrdenia(spojenie)).toContain("https://business.revolut.com/app-confirm");
    expect(adresaPotvrdenia({ ...spojenie, prostredie: "sandbox" })).toContain(
      "https://sandbox-business.revolut.com/app-confirm",
    );
    // Návratová adresa musí ísť v parametri zakódovaná, inak sa dotaz rozsype.
    expect(adresaPotvrdenia(spojenie)).toContain(
      encodeURIComponent("https://www.faktero.sk/bankove-ucty/revolut"),
    );
  });

  it("skúšobné a ostré prostredie majú iné adresy", () => {
    expect(adresy("sandbox").api).toBe("https://sandbox-b2b.revolut.com/api/1.0");
    expect(adresy("produkcia").api).toBe("https://b2b.revolut.com/api/1.0");
  });
});
