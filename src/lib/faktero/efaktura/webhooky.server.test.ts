import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  odtlacokTokenu,
  overEpostakPodpis,
  overPdsPodpis,
  podpisPds,
  rozparsujPds,
  rozparsujUdalost,
} from "./webhooky.server";

const priklad = JSON.stringify([
  {
    verification_token: "6B52819DEAA7A03C",
    dic: "1234567890",
    legalName: "abc",
    company_email: "priklad@priklad.sk",
    company_phone: "+42100000000",
    created: "2026-03-25T13:01:18.2397225Z",
  },
]);

describe("webhook Finančnej správy (PDS)", () => {
  it("podpis je SHA-512 z tela s tajomstvom, veľkosť písmen nehrá rolu", () => {
    const h = podpisPds(priklad, "tajne");
    expect(h).toMatch(/^[0-9a-f]{128}$/);
    expect(overPdsPodpis(priklad, h, "tajne")).toBe(true);
    expect(overPdsPodpis(priklad, h.toUpperCase(), "tajne")).toBe(true);
    expect(overPdsPodpis(priklad + " ", h, "tajne")).toBe(false);
    expect(overPdsPodpis(priklad, h, "ine")).toBe(false);
    expect(overPdsPodpis(priklad, h, "")).toBe(false);
    expect(overPdsPodpis(priklad, null, "tajne")).toBe(false);
  });

  it("číta príklad zo špecifikácie", () => {
    const r = rozparsujPds(priklad);
    expect(r).toEqual({
      ziadosti: [
        {
          vytvorene: "2026-03-25T13:01:18.2397225Z",
          dic: "1234567890",
          nazov: "abc",
          email: "priklad@priklad.sk",
          telefon: "+42100000000",
          token: "6B52819DEAA7A03C",
        },
      ],
    });
  });

  it("zlé DIČ, chýbajúci token alebo zlý JSON → chyba", () => {
    expect(rozparsujPds("{")).toHaveProperty("chyba");
    expect(rozparsujPds("[]")).toHaveProperty("chyba");
    expect(rozparsujPds(JSON.stringify([{ dic: "123", verification_token: "x" }]))).toHaveProperty(
      "chyba",
    );
    expect(rozparsujPds(JSON.stringify([{ dic: "1234567890" }]))).toHaveProperty("chyba");
    // Jeden objekt namiesto poľa sa prijme.
    expect(
      rozparsujPds(JSON.stringify({ dic: "1234567890", verification_token: "x" })),
    ).toHaveProperty("ziadosti");
  });

  it("odtlačok tokenu je stabilný a nevracia token", () => {
    expect(odtlacokTokenu("abc")).toBe(odtlacokTokenu("abc"));
    expect(odtlacokTokenu("abc")).not.toContain("abc");
  });
});

describe("webhook ePoštáka", () => {
  const telo = '{"event":"document.received","firm_id":"f-1","payload":{"documentId":"d-1"}}';
  const cas = "1791270000";
  const podpis = "sha256=" + createHmac("sha256", "s3cret").update(`${cas}.${telo}`).digest("hex");

  it("platný podpis v tolerancii", () => {
    expect(
      overEpostakPodpis({ podpis, pecatka: cas, telo, tajomstvo: "s3cret", terazSekundy: 1791270100 }),
    ).toEqual({ platny: true });
  });

  it("odmietne iný algoritmus, staré a podvrhnuté", () => {
    const z = (o: Partial<Parameters<typeof overEpostakPodpis>[0]>) =>
      overEpostakPodpis({ podpis, pecatka: cas, telo, tajomstvo: "s3cret", terazSekundy: 1791270100, ...o })
        .dovod;
    expect(z({ podpis: "sha1=abc" })).toBe("neznamy_algoritmus");
    expect(z({ terazSekundy: 1791270000 + 3600 })).toBe("stara_pecatka");
    expect(z({ telo: telo.replace("f-1", "f-2") })).toBe("nesedi_podpis");
    expect(z({ pecatka: "" })).toBe("chyba_hlavicka");
  });

  it("udalosť v rôznych tvaroch", () => {
    expect(rozparsujUdalost(telo)).toEqual({
      typ: "document.received",
      firmId: "f-1",
      dokumentId: "d-1",
      udalostId: null,
    });
    expect(
      rozparsujUdalost('{"id":"e1","type":"document.delivered","documentId":"d2","data":{"firmId":"f3"}}'),
    ).toEqual({ typ: "document.delivered", firmId: "f3", dokumentId: "d2", udalostId: "e1" });
    expect(rozparsujUdalost("nie json")).toBeNull();
  });
});
