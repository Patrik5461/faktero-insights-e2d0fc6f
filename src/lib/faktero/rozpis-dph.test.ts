import { describe, expect, it } from "vitest";
import { rozpisPodlaSadzieb } from "./rozpis-dph";

describe("rozpisPodlaSadzieb", () => {
  it("zoskupí riadky podľa sadzby, najvyššia prvá", () => {
    const r = rozpisPodlaSadzieb([
      { vat_rate: 23, subtotal: 800, vat_amount: 184 },
      { vat_rate: 19, subtotal: 54, vat_amount: 10.26 },
      { vat_rate: 23, subtotal: 100, vat_amount: 23 },
    ]);
    expect(r).toEqual([
      { sadzba: 23, prenesenie: false, zaklad: 900, dan: 207 },
      { sadzba: 19, prenesenie: false, zaklad: 54, dan: 10.26 },
    ]);
  });

  it("dorovná halier zo zaokrúhlenia po doklade na súčty dokladu", () => {
    const r = rozpisPodlaSadzieb(
      [
        { vat_rate: 23, subtotal: 33.333, vat_amount: 7.66659 },
        { vat_rate: 23, subtotal: 33.333, vat_amount: 7.66659 },
        { vat_rate: 23, subtotal: 33.333, vat_amount: 7.66659 },
      ],
      { subtotal: 100, vat_total: 23 },
    );
    expect(r[0]).toMatchObject({ zaklad: 100, dan: 23 });
  });

  it("prenesenie daňovej povinnosti ide zvlášť a bez dane", () => {
    const r = rozpisPodlaSadzieb([
      { vat_rate: 23, subtotal: 100, vat_amount: 23 },
      { vat_rate: 23, subtotal: 50, vat_amount: 11.5, prenesenie: true },
    ]);
    expect(r[1]).toEqual({ sadzba: 23, prenesenie: true, zaklad: 50, dan: 0 });
  });
});
