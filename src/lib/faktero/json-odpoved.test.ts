import { describe, it, expect } from "vitest";
import { odpovedNaJson } from "./json-odpoved";

/**
 * Odpoveď modelu je text, nie dátová štruktúra. Tieto testy držia hranicu
 * medzi „prečítalo sa menej“ a „prečítalo sa nesprávne“ — druhé je horšie.
 */

describe("odpovedNaJson", () => {
  it("prečíta čistý JSON", () => {
    expect(odpovedNaJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("prečíta JSON zabalený v bloku so spätnými apostrofmi", () => {
    expect(odpovedNaJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("prečíta JSON obalený vetou", () => {
    expect(odpovedNaJson('Tu je výsledok: {"a":1} — dúfam, že pomôže.')).toEqual({ a: 1 });
  });

  it("dopíše chýbajúcu zátvorku na konci", () => {
    // Skutočná odpoveď Gemini na zmluvu z ČSOB (2026-08-16): finishReason STOP,
    // a napriek tomu bez poslednej zátvorky.
    const odrezana =
      '{\n  "kind": "uver",\n  "provider_name": "ČSOB Leasing, a.s.",\n' +
      '  "principal": 23500.00,\n  "interest_rate": 6.95,\n  "term_months": 72,\n' +
      '  "down_payment": 7000.00,\n  "splatky": []';
    const v = odpovedNaJson<any>(odrezana);
    expect(v?.principal).toBe(23500);
    expect(v?.interest_rate).toBe(6.95);
    expect(v?.splatky).toEqual([]);
  });

  it("z nedopísaného objektu nikdy nevyrobí prázdne pole", () => {
    // Predtým sa z odrezanej zmluvy vylúplo `[]` zo `"splatky": []` a čítanie
    // skončilo hláškou, že v dokumente nič nie je — hoci tam bolo všetko.
    const v = odpovedNaJson<any>('{"principal": 23500, "splatky": []');
    expect(Array.isArray(v)).toBe(false);
    expect(v?.principal).toBe(23500);
  });

  it("odreže rozpísanú poslednú položku a zvyšok zachráni", () => {
    const v = odpovedNaJson<any>(
      '{"splatky":[{"number":1,"amount":100},{"number":2,"amount":10',
    );
    expect(v?.splatky?.[0]).toEqual({ number: 1, amount: 100 });
    expect(v?.splatky?.length).toBeGreaterThanOrEqual(1);
  });

  it("odreže nedopísaný reťazec", () => {
    const v = odpovedNaJson<any>('{"a":1,"provider_name":"ČSOB Leas');
    expect(v?.a).toBe(1);
  });

  it("pole na najvyššej úrovni prejde, keď odpoveď poľom aj začína", () => {
    expect(odpovedNaJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("z nezmyslu vráti null, nie prázdny objekt", () => {
    expect(odpovedNaJson("nič také tu nie je")).toBeNull();
    expect(odpovedNaJson("")).toBeNull();
    expect(odpovedNaJson(null)).toBeNull();
  });
});
