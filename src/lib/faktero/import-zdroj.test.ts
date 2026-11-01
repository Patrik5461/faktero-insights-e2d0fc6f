import { describe, expect, it } from "vitest";
import {
  KLUCE_ZDROJOV,
  hodnotyZdrojaPreFilter,
  nazovDruhuLogu,
  nazovStavuImportu,
  nazovZdrojaImportu,
  zdrojImportu,
} from "./import-zdroj";
import { IMPORT_ZDROJE } from "@/components/faktero/import-zdroje";

describe("zdrojImportu", () => {
  it("rozumie novým kľúčom", () => {
    for (const k of KLUCE_ZDROJOV) expect(zdrojImportu(k)).toBe(k);
  });
  it("rozumie starým textom z import_jobs.source", () => {
    expect(zdrojImportu("Pohoda")).toBe("pohoda");
    expect(zdrojImportu("superfaktura")).toBe("superfaktura");
    expect(zdrojImportu("Money S3")).toBe("money-s3");
    expect(zdrojImportu("Omega")).toBe("omega");
    expect(zdrojImportu("KROS")).toBe("kros");
    expect(zdrojImportu("iDoklad")).toBe("idoklad");
    expect(zdrojImportu("Prijaté doklady (Doklado)")).toBe("doklady");
    expect(zdrojImportu("Prijaté doklady (Iná appka)")).toBe("doklady");
  });
  it("neznámy alebo prázdny zdroj → null", () => {
    expect(zdrojImportu("csv")).toBeNull();
    expect(zdrojImportu(null)).toBeNull();
    expect(zdrojImportu("")).toBeNull();
  });
  it("kľúče a názvy sú tie isté ako v IMPORT_ZDROJE", () => {
    for (const z of IMPORT_ZDROJE) expect(nazovZdrojaImportu(z.id)).toBe(z.label);
    expect([...KLUCE_ZDROJOV].sort()).toEqual(IMPORT_ZDROJE.map((z) => z.id).sort());
  });
});

describe("hodnotyZdrojaPreFilter", () => {
  it("filter Pohody nájde nový kľúč aj starý text", () => {
    expect(hodnotyZdrojaPreFilter("pohoda")).toEqual(["pohoda", "Pohoda"]);
    expect(hodnotyZdrojaPreFilter("money-s3")).toContain("Money S3");
  });
  it("každá hodnota filtra sa spätne rozpozná ako ten istý zdroj", () => {
    for (const k of KLUCE_ZDROJOV)
      for (const h of hodnotyZdrojaPreFilter(k)) expect(zdrojImportu(h)).toBe(k);
  });
});

describe("zobrazenie", () => {
  it("zdroj ukáže názvom, neznámy surovo", () => {
    expect(nazovZdrojaImportu("superfaktura")).toBe("SuperFaktúra");
    expect(nazovZdrojaImportu("Pohoda")).toBe("Pohoda a mPohoda");
    expect(nazovZdrojaImportu("niečo")).toBe("niečo");
    expect(nazovZdrojaImportu(null)).toBe("—");
  });
  it("stav a druh logu ako slovenský kľúč", () => {
    expect(nazovStavuImportu("completed")).toBe("Dokončené");
    expect(nazovStavuImportu("failed")).toBe("Zlyhané");
    expect(nazovStavuImportu("success")).toBe("OK");
    expect(nazovStavuImportu("iny")).toBe("iny");
    expect(nazovDruhuLogu("invoice")).toBe("Faktúra");
  });
});
