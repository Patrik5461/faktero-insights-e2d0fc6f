import { describe, expect, it, vi } from "vitest";
import { adminDvojfaktorPovinny, adminSmie, dniDoPovinnosti } from "./admin-dvojfaktor";

vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => aktualna }));
let aktualna: { headers: Headers } | undefined;

const token = (telo: object) =>
  `Bearer x.${Buffer.from(JSON.stringify(telo)).toString("base64url")}.podpis`;

describe("povinné 2FA pre adminov", () => {
  const pred = new Date("2026-11-07T22:59:00Z");
  const po = new Date("2026-11-07T23:00:00Z"); // 8. 11. 00:00 SEČ

  it("do termínu smie aal1, po termíne len aal2", () => {
    expect(adminDvojfaktorPovinny(pred)).toBe(false);
    expect(adminDvojfaktorPovinny(po)).toBe(true);
    expect(adminSmie("aal1", pred)).toBe(true);
    expect(adminSmie(null, pred)).toBe(true);
    expect(adminSmie("aal1", po)).toBe(false);
    expect(adminSmie(null, po)).toBe(false);
    expect(adminSmie("aal2", po)).toBe(true);
  });

  it("počíta dni do povinnosti", () => {
    expect(dniDoPovinnosti(new Date("2026-10-31T23:00:00Z"))).toBe(7);
    expect(dniDoPovinnosti(po)).toBe(0);
  });

  it("server číta aal z tokenu požiadavky", async () => {
    const { aalZTokenu, vyzadujAal2Admina } = await import("./admin-dvojfaktor.server");
    expect(aalZTokenu(token({ aal: "aal2" }))).toBe("aal2");
    expect(aalZTokenu("nič")).toBeNull();
    aktualna = { headers: new Headers({ authorization: token({ aal: "aal1" }) }) };
    expect(() => vyzadujAal2Admina(pred)).not.toThrow();
    expect(() => vyzadujAal2Admina(po)).toThrow(/Forbidden/);
    aktualna = { headers: new Headers({ authorization: token({ aal: "aal2" }) }) };
    expect(() => vyzadujAal2Admina(po)).not.toThrow();
  });
});
