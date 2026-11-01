import { describe, expect, it } from "vitest";
import { nazovStavuPripojenia } from "./banka-ui";

describe("stav pripojenia banky (F-44)", () => {
  it("známe stavy ako text, nie surový kód", () => {
    expect(nazovStavuPripojenia("expired")).toBe("Súhlas vypršal");
    expect(nazovStavuPripojenia("pending")).toBe("Čaká na potvrdenie v banke");
    expect(nazovStavuPripojenia("error")).toBe("Chyba pripojenia");
  });
  it("neznámy stav nevypíše kód", () => {
    expect(nazovStavuPripojenia("xyz")).toBe("Neznámy stav");
    expect(nazovStavuPripojenia(null)).toBe("Neznámy stav");
  });
});

describe("účty na platbu cez TB (B-11)", () => {
  it("len TB pripojenie s platným súhlasom", async () => {
    const { uctyPrePlatbuTb } = await import("./banka-ui");
    const teraz = new Date("2026-11-01T10:00:00Z");
    const pripojenia = [
      {
        id: "tb",
        provider: "tatrabanka",
        status: "connected",
        token_expires_at: "2027-01-01T00:00:00Z",
      },
      {
        id: "tbStary",
        provider: "tatrabanka",
        status: "connected",
        token_expires_at: "2026-10-01T00:00:00Z",
      },
      { id: "tbCaka", provider: "tatrabanka", status: "pending", token_expires_at: null },
      { id: "fio", provider: "fio", status: "connected", token_expires_at: null },
    ];
    const ucty = [
      { id: "1", bank_connection_id: "tb" },
      { id: "2", bank_connection_id: "tbStary" },
      { id: "3", bank_connection_id: "tbCaka" },
      { id: "4", bank_connection_id: "fio" },
      { id: "5", bank_connection_id: null },
    ];
    expect(uctyPrePlatbuTb(ucty, pripojenia, teraz).map((u) => u.id)).toEqual(["1"]);
  });
});
