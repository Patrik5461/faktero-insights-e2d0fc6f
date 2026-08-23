/**
 * Podpisovanie výzvy SCA.
 *
 * Wise pri nesprávnom podpise odpovie len „403" bez vysvetlenia, takže sa
 * omyl v algoritme alebo v kódovaní hľadá veľmi ťažko. Tu sa overí, že podpis
 * naozaj sedí k verejnému kľúču, ktorý človek nahráva do Wise.
 */
import { describe, it, expect } from "vitest";
import { createVerify } from "crypto";
import { podpis, vyrobKluce } from "./wise.server";

describe("podpis pre Wise", () => {
  it("verejný kľúč overí podpis súkromného", () => {
    const { verejny, sukromny } = vyrobKluce();
    const token = "otp-abc-123";
    const s = podpis(token, sukromny);

    const v = createVerify("RSA-SHA256");
    v.update(token, "ascii");
    v.end();
    expect(v.verify(verejny, s, "base64")).toBe(true);
  });

  it("podpis iného kľúča neprejde", () => {
    const a = vyrobKluce();
    const b = vyrobKluce();
    const token = "otp-abc-123";
    const v = createVerify("RSA-SHA256");
    v.update(token, "ascii");
    v.end();
    expect(v.verify(a.verejny, podpis(token, b.sukromny), "base64")).toBe(false);
  });

  it("verejný kľúč je v tvare, ktorý sa dá skopírovať do Wise", () => {
    const { verejny } = vyrobKluce();
    expect(verejny.startsWith("-----BEGIN PUBLIC KEY-----")).toBe(true);
    expect(verejny.trimEnd().endsWith("-----END PUBLIC KEY-----")).toBe(true);
  });
});
