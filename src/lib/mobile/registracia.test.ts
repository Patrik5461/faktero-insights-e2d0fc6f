import { describe, it, expect } from "vitest";
import { adresaPotvrdenia, overRegistraciu, overFirmu, firmaNaZapis } from "./registracia";

const R = (o: Partial<Parameters<typeof overRegistraciu>[0]> = {}) => ({
  meno: "Jana Nováková",
  email: "jana@firma.sk",
  heslo: "Tajne123",
  podmienky: true,
  gdpr: true,
  ...o,
});

describe("registrácia účtu v telefóne", () => {
  it("prepustí vyplnený formulár", () => {
    expect(overRegistraciu(R())).toBeNull();
  });

  it("zastaví prázdne meno, preklep v e-maile aj krátke heslo", () => {
    expect(overRegistraciu(R({ meno: "  " }))).toBe("reg.chyba.meno");
    expect(overRegistraciu(R({ email: "jana@firma" }))).toBe("reg.chyba.email");
    expect(overRegistraciu(R({ heslo: "kratke" }))).toBe("reg.chyba.heslo");
  });

  it("bez oboch súhlasov účet nevznikne", () => {
    expect(overRegistraciu(R({ podmienky: false }))).toBe("reg.chyba.suhlasy");
    expect(overRegistraciu(R({ gdpr: false }))).toBe("reg.chyba.suhlasy");
  });

  it("potvrdzovací odkaz z appky mieri na web, nie na capacitor://", () => {
    expect(adresaPotvrdenia(true, "capacitor://localhost", "https://www.faktero.sk")).toBe(
      "https://www.faktero.sk/dashboard",
    );
    expect(adresaPotvrdenia(false, "https://www.faktero.sk", "https://www.faktero.sk")).toBe(
      "https://www.faktero.sk/dashboard",
    );
    // Aj keď sa appka spustí v prehliadači na neznámom pôvode, radšej web.
    expect(adresaPotvrdenia(false, null, "https://www.faktero.sk")).toBe(
      "https://www.faktero.sk/dashboard",
    );
  });
});

describe("založenie firmy v telefóne", () => {
  it("pýta si len názov", () => {
    expect(overFirmu({ name: "Tobify s. r. o." })).toBeNull();
    expect(overFirmu({ name: " " })).toBe("vf.chyba.nazov");
  });

  it("vypýtané údaje kontroluje, prázdne pustí", () => {
    expect(overFirmu({ name: "A", ico: "56607016" })).toBeNull();
    expect(overFirmu({ name: "A", ico: "123" })).toBe("vf.chyba.ico");
    expect(overFirmu({ name: "A", ico: "" })).toBeNull();
    expect(overFirmu({ name: "A", iban: "SK31 1200 0000 1987 4263 7541" })).toBeNull();
    expect(overFirmu({ name: "A", iban: "SK31-nieco" })).toBe("vf.chyba.iban");
    expect(overFirmu({ name: "A", email: "firma@" })).toBe("vf.chyba.email");
  });

  it("prázdne polia posiela ako nevyplnené, nie ako prázdny reťazec", () => {
    const v = firmaNaZapis({ name: "  Tobify s. r. o. ", ico: "5660 7016", dic: "", street: " " });
    expect(v._name).toBe("Tobify s. r. o.");
    expect(v._ico).toBe("56607016");
    expect(v._dic).toBeUndefined();
    expect(v._street).toBeUndefined();
    expect(v._country).toBe("SK");
    expect(v._default_currency).toBe("EUR");
  });

  it("IBAN zapisuje bez medzier a veľkými písmenami", () => {
    expect(firmaNaZapis({ name: "A", iban: "sk31 1200 0000 1987 4263 7541" })._iban).toBe(
      "SK3112000000198742637541",
    );
  });
});
