import { describe, expect, it } from "vitest";
import { ChybaZapisu, TEXT_BEZ_OPRAVNENIA, overZapis, textChybyZapisu, zapisOverene } from "./over-zapis";

describe("overZapis", () => {
  it("vráti zapísané riadky", () => {
    expect(overZapis({ data: [{ id: "a" }], error: null, status: 200 })).toEqual([{ id: "a" }]);
    expect(overZapis({ data: { id: "a" }, error: null, status: 200 })).toEqual([{ id: "a" }]);
  });
  it("0 riadkov bez chyby (RLS odmietla) → ChybaZapisu bez-opravnenia", () => {
    try {
      overZapis({ data: [], error: null, status: 200 });
      throw new Error("nemalo prejsť");
    } catch (e) {
      expect(e).toBeInstanceOf(ChybaZapisu);
      expect((e as ChybaZapisu).druh).toBe("bez-opravnenia");
      expect((e as Error).message).toBe(TEXT_BEZ_OPRAVNENIA);
    }
  });
  it("chyba databázy prejde so správou", () => {
    expect(() => overZapis({ data: null, error: { message: "duplicate key" }, status: 409 })).toThrow("duplicate key");
  });
  it("dotaz bez .select() (204, data null) je chyba vývojára", () => {
    expect(() => overZapis({ data: null, error: null, status: 204 })).toThrow(/select/);
  });
  it("hromadný zápis: menej riadkov, než sa čakalo", () => {
    try {
      overZapis({ data: [{ id: 1 }], error: null }, { ocakavane: 3 });
      throw new Error("nemalo prejsť");
    } catch (e) {
      expect((e as ChybaZapisu).druh).toBe("ciastocne");
      expect((e as ChybaZapisu).zapisane).toBe(1);
      expect(textChybyZapisu(e)).toBe("Zmenilo sa len 1 z 3 záznamov — na ostatné nemáte oprávnenie.");
    }
  });
  it("zapisOverene čaká na dotaz (thenable ako PostgrestBuilder)", async () => {
    const dotaz = { then: (ok: any) => ok({ data: [], error: null, status: 200 }) };
    await expect(zapisOverene(dotaz as any)).rejects.toBeInstanceOf(ChybaZapisu);
    const ok = { then: (f: any) => f({ data: [{ id: 2 }], error: null, status: 200 }) };
    expect(await zapisOverene(ok as any)).toEqual([{ id: 2 }]);
  });
  it("textChybyZapisu prekladá cez t()", () => {
    const t = (s: string) => `[${s}]`;
    expect(textChybyZapisu(new ChybaZapisu("bez-opravnenia", "x"), t)).toBe(`[${TEXT_BEZ_OPRAVNENIA}]`);
    expect(textChybyZapisu(new Error("iné"), t)).toBe("iné");
  });
});
