import { describe, expect, it } from "vitest";
import {
  coZobrazitOznam,
  dicPrePortal,
  jeCestaBezOkna,
  jeEfakturaAktivovana,
  jePlatnyEmail,
  jePozvankaPlatna,
  type VstupOznamu,
} from "./efaktura-oznam";

const TERAZ = new Date("2026-10-21T12:00:00Z");
const zaklad: VstupOznamu = {
  rola: "owner",
  krajina: "SK",
  aktivovana: false,
  uctovnikPozvany: false,
  cesta: "/dashboard",
  teraz: TERAZ,
};
const dniSpat = (n: number) => new Date(TERAZ.getTime() - n * 86_400_000).toISOString();

describe("oznam o e-fakturácii 2027", () => {
  it("majiteľ aj admin neaktivovanej slovenskej firmy dostanú okno", () => {
    expect(coZobrazitOznam(zaklad)).toBe("okno");
    expect(coZobrazitOznam({ ...zaklad, rola: "admin" })).toBe("okno");
  });

  it("ostatné roly nič", () => {
    for (const rola of ["accountant", "employee", "custom", null, undefined]) {
      expect(coZobrazitOznam({ ...zaklad, rola })).toBe("nic");
    }
  });

  it("česká a nemecká firma nič, chýbajúca krajina je SK", () => {
    expect(coZobrazitOznam({ ...zaklad, krajina: "CZ" })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, krajina: "DE" })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, krajina: null })).toBe("okno");
  });

  it("po aktivácii už nikdy — ani pás pri pozvanom účtovníkovi", () => {
    expect(coZobrazitOznam({ ...zaklad, aktivovana: true })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, aktivovana: true, uctovnikPozvany: true })).toBe("nic");
  });

  it("zatvorené krížikom sa vráti najskôr o 7 dní", () => {
    expect(coZobrazitOznam({ ...zaklad, dismissedAt: dniSpat(1) })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, dismissedAt: dniSpat(6.9) })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, dismissedAt: dniSpat(7) })).toBe("okno");
    expect(coZobrazitOznam({ ...zaklad, dismissedAt: dniSpat(30) })).toBe("okno");
  });

  it("kliknutie na Pokračovať odloží okno rovnako ako krížik", () => {
    expect(coZobrazitOznam({ ...zaklad, ctaClickedAt: dniSpat(2) })).toBe("nic");
    expect(coZobrazitOznam({ ...zaklad, ctaClickedAt: dniSpat(8), dismissedAt: dniSpat(3) })).toBe(
      "nic",
    );
  });

  it("pozvaný účtovník → pás namiesto okna, aj keď bolo okno zatvorené", () => {
    expect(coZobrazitOznam({ ...zaklad, uctovnikPozvany: true })).toBe("pas");
    expect(coZobrazitOznam({ ...zaklad, uctovnikPozvany: true, dismissedAt: dniSpat(1) })).toBe(
      "pas",
    );
    // Pás nie je pre účtovníka ani v českej firme.
    expect(coZobrazitOznam({ ...zaklad, uctovnikPozvany: true, rola: "accountant" })).toBe("nic");
  });

  it("na eFaktúre, v Pomoci a v onboardingu sa okno neukáže", () => {
    for (const cesta of [
      "/efaktura",
      "/efaktura/prijate",
      "/pomoc/efaktura",
      "/onboarding",
      "/podpora",
    ]) {
      expect(coZobrazitOznam({ ...zaklad, cesta })).toBe("nic");
    }
    expect(jeCestaBezOkna("/efakturacia")).toBe(false);
    expect(jeCestaBezOkna("/faktury")).toBe(false);
  });

  it("aktivovaný profil = zapnutý a spárovaný", () => {
    expect(jeEfakturaAktivovana(null)).toBe(false);
    expect(jeEfakturaAktivovana({ enabled: true, epostak_firm_id: null })).toBe(false);
    expect(jeEfakturaAktivovana({ enabled: false, epostak_firm_id: "x" })).toBe(false);
    expect(jeEfakturaAktivovana({ enabled: true, epostak_firm_id: "x" })).toBe(true);
  });

  it("pozvánka platí do vypršania a kým nie je zrušená", () => {
    const zajtra = new Date(TERAZ.getTime() + 86_400_000).toISOString();
    expect(jePozvankaPlatna({ expires_at: zajtra }, TERAZ)).toBe(true);
    expect(jePozvankaPlatna({ expires_at: dniSpat(1) }, TERAZ)).toBe(false);
    expect(jePozvankaPlatna({ expires_at: zajtra, zrusena_at: dniSpat(0) }, TERAZ)).toBe(false);
    expect(jePozvankaPlatna(null, TERAZ)).toBe(false);
  });

  it("e-mail a DIČ", () => {
    expect(jePlatnyEmail("uctovnicka@firma.sk")).toBe(true);
    expect(jePlatnyEmail("a@b")).toBe(false);
    expect(jePlatnyEmail("a@b.sk, c@d.sk")).toBe(false);
    expect(dicPrePortal("SK 2021234567")).toBe("2021234567");
    expect(dicPrePortal("123")).toBe(null);
  });
});
