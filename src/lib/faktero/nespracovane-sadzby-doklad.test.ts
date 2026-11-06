import { describe, expect, it } from "vitest";
import { kontrolaSadziebUdajov, upravCelkomDokladu, type UdajeNespracovaneho } from "./nespracovane";

const zaklad = {
  rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
  datumDodania: "2026-10-29",
  datumVystavenia: "2026-10-29",
  celkom: 123,
  celkomDokladu: 123,
  zaokruhlenie: null,
  mena: "EUR",
} as unknown as UdajeNespracovaneho;

describe("Nespracované — súčet podľa sadzieb voči sume dokladu", () => {
  it("správna sadzba prejde", () => {
    expect(kontrolaSadziebUdajov(zaklad, "SK").ok).toBe(true);
  });

  it("zmena sadzby (DPH prepočítaná) hlási nesúlad so sumou dokladu, aj keď celkom je null", () => {
    const po = upravCelkomDokladu(zaklad, { ...zaklad, rozpis: [{ sadzba: 19, zaklad: 100, dph: 19 }], celkom: null });
    expect(po.celkomDokladu).toBe(123);
    const k = kontrolaSadziebUdajov(po, "SK");
    expect(k.ok).toBe(false);
    expect(k.chyby[0]!.sprava).toContain("doklad: 123,00 €, vypočítané: 119,00 €");
  });

  it("potvrdený rozpis sa nehlási, ručne prepísaná suma potvrdenie zruší", () => {
    const zla = { ...zaklad, rozpis: [{ sadzba: 19, zaklad: 100, dph: 19 }], celkom: null, rozpisPotvrdeny: true };
    expect(kontrolaSadziebUdajov(zla as UdajeNespracovaneho, "SK").ok).toBe(true);
    const prepisana = upravCelkomDokladu(zla as UdajeNespracovaneho, { ...zla, celkom: 120 } as UdajeNespracovaneho);
    expect(prepisana.celkomDokladu).toBe(120);
    expect(prepisana.rozpisPotvrdeny).toBe(false);
  });

  it("stará suma bez celkomDokladu sa pri prvej zmene zachová", () => {
    const stary = { ...zaklad, celkomDokladu: undefined } as UdajeNespracovaneho;
    const po = upravCelkomDokladu(stary, { ...stary, rozpis: [{ sadzba: 5, zaklad: 100, dph: 5 }], celkom: null });
    expect(po.celkomDokladu).toBe(123);
  });
});
