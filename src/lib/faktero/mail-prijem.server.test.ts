import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { overPodpisWebhooku } from "./mail-prijem.server";

const SECRET = "whsec_" + Buffer.from("tajomstvo-na-podpis-webhooku").toString("base64");
const TELO = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });
const ID = "msg_2Xyz";
const TERAZ = 1786632000000; // pevný čas, nech test nezávisí od hodín

function podpis(telo: string, id: string, timestamp: string, secret = SECRET): string {
  const kluc = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", kluc).update(`${id}.${timestamp}.${telo}`).digest("base64");
}

describe("overenie podpisu webhooku od Resendu", () => {
  const ts = String(Math.floor(TERAZ / 1000));

  it("správny podpis prejde", () => {
    expect(
      overPodpisWebhooku({
        telo: TELO,
        id: ID,
        timestamp: ts,
        signature: `v1,${podpis(TELO, ID, ts)}`,
        secret: SECRET,
        teraz: TERAZ,
      }),
    ).toBe(true);
  });

  it("prejde aj keď hlavička nesie viac podpisov", () => {
    expect(
      overPodpisWebhooku({
        telo: TELO,
        id: ID,
        timestamp: ts,
        signature: `v1a,inyPodpis v1,${podpis(TELO, ID, ts)}`,
        secret: SECRET,
        teraz: TERAZ,
      }),
    ).toBe(true);
  });

  it("zmenené telo neprejde", () => {
    const s = podpis(TELO, ID, ts);
    expect(
      overPodpisWebhooku({
        telo: TELO.replace("abc", "xyz"),
        id: ID,
        timestamp: ts,
        signature: `v1,${s}`,
        secret: SECRET,
        teraz: TERAZ,
      }),
    ).toBe(false);
  });

  it("cudzie tajomstvo neprejde", () => {
    const ineTajomstvo = "whsec_" + Buffer.from("uplne-ine-tajomstvo").toString("base64");
    expect(
      overPodpisWebhooku({
        telo: TELO,
        id: ID,
        timestamp: ts,
        signature: `v1,${podpis(TELO, ID, ts, ineTajomstvo)}`,
        secret: SECRET,
        teraz: TERAZ,
      }),
    ).toBe(false);
  });

  it("starý podpis neprejde — chráni pred prehratím zachytenej požiadavky", () => {
    const stary = String(Math.floor(TERAZ / 1000) - 3600);
    expect(
      overPodpisWebhooku({
        telo: TELO,
        id: ID,
        timestamp: stary,
        signature: `v1,${podpis(TELO, ID, stary)}`,
        secret: SECRET,
        teraz: TERAZ,
      }),
    ).toBe(false);
  });

  it("chýbajúce hlavičky neprejdú", () => {
    const s = podpis(TELO, ID, ts);
    for (const chybajuce of [
      { id: null },
      { timestamp: null },
      { signature: null },
      { telo: "" },
    ] as const) {
      expect(
        overPodpisWebhooku({
          telo: TELO,
          id: ID,
          timestamp: ts,
          signature: `v1,${s}`,
          secret: SECRET,
          teraz: TERAZ,
          ...chybajuce,
        } as any),
      ).toBe(false);
    }
  });
});
