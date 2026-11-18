import { describe, expect, it } from "vitest";
import {
  VAD,
  krokTicha,
  navigaciaPolozky,
  novyStavTicha,
  poPrepise,
  vyberFormatNahravky,
} from "./hlas";

const ID = "11111111-1111-4111-8111-111111111111";

describe("hlas — formát nahrávky", () => {
  it("Chrome webm/opus, Safari mp4, nič → null", () => {
    expect(vyberFormatNahravky(() => true)).toBe("audio/webm;codecs=opus");
    expect(vyberFormatNahravky((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(vyberFormatNahravky(() => false)).toBeNull();
    expect(
      vyberFormatNahravky(() => {
        throw new Error("x");
      }),
    ).toBeNull();
  });
});

function prehraj(vzorky: [number, number][], drzi = false) {
  let s = novyStavTicha(0);
  for (const [t, rms] of vzorky) {
    const r = krokTicha(s, rms, t, drzi);
    s = r.stav;
    if (r.koniec) return { koniec: r.koniec, t, s };
  }
  return { koniec: null, t: null, s };
}
const usek = (od: number, po: number, rms: number): [number, number][] =>
  Array.from({ length: Math.floor((po - od) / 50) }, (_, i) => [od + i * 50, rms]);

describe("hlas — detekcia ticha", () => {
  it("reč a potom 1,2 s ticha → koniec", () => {
    const r = prehraj([
      ...usek(0, 300, 0.003),
      ...usek(300, 2000, 0.12),
      ...usek(2000, 5000, 0.004),
    ]);
    expect(r.koniec).toBe("ticho");
    expect(r.t! - 1950).toBeGreaterThanOrEqual(VAD.tichoMs);
    expect(r.t!).toBeLessThan(2000 + VAD.tichoMs + 100);
  });
  it("meria dĺžku reči", () => {
    const r = prehraj([
      ...usek(0, 300, 0.003),
      ...usek(300, 1300, 0.12),
      ...usek(1300, 1500, 0.003),
    ]);
    expect(r.s.reciMs).toBeGreaterThanOrEqual(950);
    expect(r.s.reciMs).toBeLessThanOrEqual(1000);
  });
  it("krátke pauzy medzi slovami nahrávanie neukončia", () => {
    const r = prehraj([
      ...usek(0, 300, 0.003),
      ...usek(300, 1000, 0.1),
      ...usek(1000, 1800, 0.004),
      ...usek(1800, 2600, 0.1),
    ]);
    expect(r.koniec).toBeNull();
  });
  it("hlučná miestnosť zdvihne prah, ale nie nad 0,05", () => {
    const r = prehraj(usek(0, 300, 0.04));
    expect(r.s.prah).toBe(VAD.maxPrah);
    expect(prehraj(usek(0, 300, 0.001)).s.prah).toBe(VAD.minPrah);
  });
  it("bez reči sa po 7 s skončí naprázdno, max 30 s", () => {
    expect(prehraj(usek(0, 8000, 0.002)).koniec).toBe("bez_reci");
    expect(prehraj(usek(0, 31000, 0.2)).koniec).toBe("max");
  });
  it("push-to-talk: ticho nekončí, len 30 s", () => {
    const r = prehraj([...usek(0, 1000, 0.1), ...usek(1000, 9000, 0.002)], true);
    expect(r.koniec).toBeNull();
    expect(prehraj(usek(0, 31000, 0.002), true).koniec).toBe("max");
  });
});

describe("hlas — záloha na rozpoznávanie prehliadača", () => {
  it("serverový prepis má prednosť", () => {
    expect(
      poPrepise({
        server: { text: "otvor banku", prazdny: false },
        prehliadac: "otvor banky",
        recDostupna: true,
      }),
    ).toEqual({
      akcia: "odoslat",
      text: "otvor banku",
      zdroj: "server",
    });
  });
  it("chyba servera → text z prehliadača, inak počúvať prehliadačom, inak chyba", () => {
    expect(
      poPrepise({
        server: { chyba: "OpenAI 500" },
        prehliadac: " otvor banku ",
        recDostupna: true,
      }),
    ).toEqual({
      akcia: "odoslat",
      text: "otvor banku",
      zdroj: "prehliadac",
    });
    expect(poPrepise({ server: { chyba: "x" }, prehliadac: "", recDostupna: true })).toEqual({
      akcia: "pocuvat_prehliadacom",
    });
    expect(poPrepise({ server: { chyba: "x" }, prehliadac: "", recDostupna: false })).toEqual({
      akcia: "chyba",
      text: "x",
    });
  });
  it("ozvena slovníka prejde len s potvrdenou rečou", () => {
    const ozvena = { text: "nespracované doklady", prazdny: false, ozvena: true };
    expect(poPrepise({ server: ozvena, prehliadac: "", recDostupna: true, reciMs: 200 })).toEqual({
      akcia: "nic",
    });
    expect(
      poPrepise({ server: ozvena, prehliadac: "", recDostupna: true, reciMs: 900 }).akcia,
    ).toBe("odoslat");
    expect(
      poPrepise({ server: ozvena, prehliadac: "nespracovane doklady", recDostupna: true }).akcia,
    ).toBe("odoslat");
  });
  it("prázdny prepis (ticho) nič nespustí", () => {
    expect(
      poPrepise({ server: { text: "", prazdny: true }, prehliadac: "", recDostupna: true }),
    ).toEqual({ akcia: "nic" });
  });
});

describe("hlas — klik na položku zoznamu", () => {
  it("detail, kde je; inak zoznam s hľadaním", () => {
    expect(navigaciaPolozky({ typ: "prijata", id: ID })).toEqual({
      to: "/prijate-faktury/$id",
      params: { id: ID },
    });
    expect(navigaciaPolozky({ typ: "ponuka", id: ID })).toEqual({
      to: "/ponuky/$id",
      params: { id: ID },
    });
    expect(navigaciaPolozky({ typ: "zakazka", id: ID })).toEqual({
      to: "/zakazky/$id",
      params: { id: ID },
    });
    expect(navigaciaPolozky({ typ: "blocek", id: ID, cislo: "B-7" })).toEqual({
      to: "/doklady",
      search: { q: "B-7" },
    });
    expect(navigaciaPolozky({ typ: "produkt", id: `cennik:${ID}`, partner: "Káva" })).toEqual({
      to: "/produkty",
      search: { q: "Káva" },
    });
    expect(navigaciaPolozky({ typ: "vystavena", id: "../x" })).toBeNull();
  });
});
