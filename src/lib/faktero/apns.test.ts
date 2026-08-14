import { describe, expect, it } from "vitest";
import { jeApnsToken, apnsPayload, tokenJeMrtvy } from "./apns";

const APNS = "a".repeat(64);
const FCM =
  "fzT9x2QpS0m:APA91bF-3kQwRnT7lYzV2pQ8dJ0xY9mN4cB6vK1sA5hG8tR2wE7uI3oP9lZ6xC4nM";

describe("rozpoznanie tokenu", () => {
  it("APNs token je 64 znakov hexa", () => {
    expect(jeApnsToken(APNS)).toBe(true);
    expect(jeApnsToken(APNS.toUpperCase())).toBe(true);
    expect(jeApnsToken(` ${APNS} `)).toBe(true);
  });

  it("FCM token sa za APNs nepovažuje", () => {
    expect(jeApnsToken(FCM)).toBe(false);
    expect(jeApnsToken("a".repeat(63))).toBe(false);
    expect(jeApnsToken("z".repeat(64))).toBe(false);
    expect(jeApnsToken(null)).toBe(false);
    expect(jeApnsToken(undefined)).toBe(false);
  });
});

describe("telo notifikácie pre APNs", () => {
  it("nadpis a text idú do aps, vlastné údaje vedľa neho", () => {
    const p = apnsPayload({
      title: "Faktúra po splatnosti",
      body: "FA2026001 je po splatnosti.",
      data: { path: "/faktury/1", invoice_id: "1" },
    });
    expect((p as any).aps.alert).toEqual({
      title: "Faktúra po splatnosti",
      body: "FA2026001 je po splatnosti.",
    });
    expect((p as any).path).toBe("/faktury/1");
    // Vlastné údaje nesmú skončiť v aps — Apple by správu odmietol.
    expect((p as any).aps.path).toBeUndefined();
  });

  it("bez vlastných údajov je payload len aps", () => {
    const p = apnsPayload({ title: "A", body: "B" });
    expect(Object.keys(p)).toEqual(["aps"]);
  });
});

describe("mŕtvy token", () => {
  it("410 a BadDeviceToken znamenajú zahodiť", () => {
    expect(tokenJeMrtvy(410)).toBe(true);
    expect(tokenJeMrtvy(400, "BadDeviceToken")).toBe(true);
    expect(tokenJeMrtvy(400, "DeviceTokenNotForTopic")).toBe(true);
  });

  it("dočasné chyby token nezahadzujú", () => {
    expect(tokenJeMrtvy(429, "TooManyRequests")).toBe(false);
    expect(tokenJeMrtvy(500, "InternalServerError")).toBe(false);
    expect(tokenJeMrtvy(403, "ExpiredProviderToken")).toBe(false);
    expect(tokenJeMrtvy(400, "PayloadTooLarge")).toBe(false);
  });
});

describe("autorizačný token pre APNs", () => {
  it("je podpísaný ES256 a podpis má tvar r||s, nie DER", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const p8 = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

    const { vyrobJwt } = await import("./apns.server");
    const jwt = vyrobJwt({ keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: p8, teraz: 1786694400000 });

    const casti = jwt.split(".");
    expect(casti).toHaveLength(3);
    const hlavicka = JSON.parse(Buffer.from(casti[0]!, "base64url").toString());
    expect(hlavicka).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    const telo = JSON.parse(Buffer.from(casti[1]!, "base64url").toString());
    expect(telo).toEqual({ iss: "TEAM123456", iat: 1786694400 });
    // DER podpis by mal premenlivú dĺžku okolo 70 bajtov; P1363 má presne 64.
    expect(Buffer.from(casti[2]!, "base64url")).toHaveLength(64);
  });

  it("znesie kľúč, ktorý má v premennej zalomenia ako \\n", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const p8 = (privateKey.export({ type: "pkcs8", format: "pem" }) as string).replace(/\n/g, "\\n");

    const { vyrobJwt } = await import("./apns.server");
    expect(() =>
      vyrobJwt({ keyId: "K", teamId: "T", privateKey: p8, teraz: 1786694400000 }),
    ).not.toThrow();
  });
});
