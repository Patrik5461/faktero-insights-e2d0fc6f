import { describe, expect, it } from "vitest";
import { adresaVRiadku, danoveCisla, podpisHtml, podpisRiadky, podpisText } from "./email-podpis";

const firma = {
  name: "Tobify s. r. o.",
  street: "Športová 707/43",
  zip: "919 26",
  city: "Zavar",
  ico: "56607016",
  dic: "2122358579",
  ic_dph: "SK2122358579",
  email: "info@faktero.sk",
  phone: "+421 902 101 967",
  website: "https://www.faktero.sk",
};

describe("podpis firmy", () => {
  it("má názov, adresu, daňové čísla a kontakt", () => {
    const r = podpisRiadky(firma);
    expect(r[0]).toBe("Tobify s. r. o.");
    expect(r[1]).toBe("Športová 707/43, 919 26 Zavar");
    expect(r[2]).toContain("IČO 56607016");
    expect(r[3]).toContain("tel. +421 902 101 967");
    expect(r[3]).toContain("info@faktero.sk");
    expect(r[3]).toContain("www.faktero.sk");
  });

  it("prázdne údaje sa vynechajú, nie vypíšu naprázdno", () => {
    expect(adresaVRiadku({ city: "Trnava" })).toBe("Trnava");
    expect(danoveCisla({ ico: "12345678" })).toBe("IČO 12345678");
    expect(podpisRiadky({ name: "Firma" })).toEqual(["Firma"]);
    expect(podpisText({})).toBe("");
    expect(podpisHtml({})).toBe("");
  });

  it("neplatiteľ nemá v podpise IČ DPH", () => {
    expect(danoveCisla({ ico: "1", dic: "2" })).not.toContain("IČ DPH");
  });

  it("odpoveďová adresa má prednosť pred fakturačnou", () => {
    const r = podpisRiadky({ ...firma, email_reply_to: "obchod@firma.sk" });
    expect(r[3]).toContain("obchod@firma.sk");
    expect(r[3]).not.toContain("info@faktero.sk");
  });

  it("v HTML je e-mail klikací a text je ošetrený", () => {
    const h = podpisHtml({ name: 'Firma "&" spol.', email: "a@b.sk" });
    expect(h).toContain('href="mailto:a@b.sk"');
    expect(h).toContain("&amp;");
    expect(h).not.toContain('"&"');
  });
});
