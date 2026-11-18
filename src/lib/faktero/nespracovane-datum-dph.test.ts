import { describe, expect, it } from "vitest";
import {
  datumDphUdajov,
  maDatumDph,
  prazdneUdaje,
  prijataZUdajov,
  udajeZAi,
  udajeZPrijatej,
  zhrnutieNespracovaneho,
  zmenaDatumovUdajov,
} from "./nespracovane";

const DNES = "2026-11-18";

function udaje(z: Partial<ReturnType<typeof prazdneUdaje>> = {}) {
  return {
    ...prazdneUdaje(),
    datumVystavenia: "2026-11-02",
    datumDodania: "2026-10-31",
    datumPrijatia: "2026-11-03",
    ...z,
  };
}

describe("dátum daňovej povinnosti v Nespracovaných", () => {
  it("len pri faktúre, daňovom doklade a dobropise (aj bez určeného druhu)", () => {
    expect(["faktura", "danovy", "dobropis", "", null].map(maDatumDph)).toEqual([true, true, true, true, true]);
    expect(["zalohova", "blocek", "ostatny", "vydana", "uhrada"].map(maDatumDph)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("predvolený je DUZP, bez neho vystavenie; dobropis prijatie", () => {
    expect(datumDphUdajov(udaje(), "faktura")).toBe("2026-10-31");
    expect(datumDphUdajov(udaje({ datumDodania: "" }), "faktura")).toBe("2026-11-02");
    expect(datumDphUdajov(udaje(), "dobropis")).toBe("2026-11-03");
    expect(datumDphUdajov(udaje(), "blocek")).toBe("");
    expect(datumDphUdajov(udaje(), "zalohova")).toBe("");
    expect(datumDphUdajov(udaje({ datumDph: "2026-11-05" }), "faktura")).toBe("2026-11-05");
  });

  it("AI: len výslovný dátum z dokladu, bloček nikdy", () => {
    const ai = { issue_date: "2026-11-02", delivery_date: "2026-10-31", amount_total: 10 };
    expect(udajeZAi(ai, DNES).datumDph).toBeUndefined();
    expect(udajeZAi({ ...ai, tax_point_date: "31.10.2026" }, DNES).datumDph).toBe("2026-10-31");
    expect(udajeZAi({ ...ai, tax_point_date: "2026-10-31", document_subtype: "blocek" }, DNES).datumDph).toBeUndefined();
  });

  it("ide s DUZP, kým ho človek nezmení", () => {
    // Prázdny nasleduje sám.
    expect(zmenaDatumovUdajov(udaje(), { datumDodania: "2026-10-15" }, "faktura")).toEqual({
      datumDodania: "2026-10-15",
    });
    // Výslovný rovný doterajšiemu DUZP — ďalej nasleduje.
    expect(
      zmenaDatumovUdajov(udaje({ datumDph: "2026-10-31" }), { datumDodania: "2026-10-15" }, "faktura"),
    ).toEqual({ datumDodania: "2026-10-15", datumDph: "" });
    // Ručne zadaný iný ostane.
    expect(
      zmenaDatumovUdajov(udaje({ datumDph: "2026-11-05" }), { datumDodania: "2026-10-15" }, "faktura"),
    ).toEqual({ datumDodania: "2026-10-15", datumDph: "2026-11-05" });
  });

  it("Vytvoriť zapíše datum_dph; zálohová bez neho", () => {
    expect(prijataZUdajov("faktura", udaje(), DNES).datum_dph).toBe("2026-10-31");
    expect(prijataZUdajov("faktura", udaje({ datumDph: "2026-11-05" }), DNES).datum_dph).toBe("2026-11-05");
    expect(prijataZUdajov("dobropis", udaje(), DNES).datum_dph).toBe("2026-11-03");
    expect(prijataZUdajov("dobropis", udaje({ datumPrijatia: "" }), DNES).datum_dph).toBe(DNES);
    expect(prijataZUdajov("danovy", udaje(), DNES).datum_dph).toBe("2026-10-31");
    expect(prijataZUdajov("zalohova", udaje({ datumDph: "2026-11-05" }), DNES).datum_dph).toBeNull();
  });

  it("vrátenie prijatej späť prenesie vyplnený datum_dph", () => {
    expect(udajeZPrijatej({ issue_date: "2026-11-02", datum_dph: "2026-10-31" }).udaje.datumDph).toBe("2026-10-31");
    expect(udajeZPrijatej({ issue_date: "2026-11-02", datum_dph: null }).udaje.datumDph).toBeUndefined();
  });

  it("riadok zoznamu", () => {
    const r = { id: "x", druh: "faktura", udaje: udaje(), created_at: DNES };
    expect(zhrnutieNespracovaneho(r).datumDph).toBe("2026-10-31");
    expect(zhrnutieNespracovaneho({ ...r, druh: "blocek" }).datumDph).toBeNull();
  });
});
