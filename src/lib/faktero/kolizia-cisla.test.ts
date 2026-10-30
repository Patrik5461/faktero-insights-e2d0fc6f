import { describe, expect, it } from "vitest";
import { jeKoliziaCislaFaktury, sOpakovanimPriKoliziiCisla } from "./kolizia-cisla";
import { friendlyError } from "./plan-error";

const kolizia = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "invoices_cislo_uniq"',
};

describe("kolízia čísla faktúry", () => {
  it("spozná len unikátny index čísla faktúry", () => {
    expect(jeKoliziaCislaFaktury(kolizia)).toBe(true);
    expect(jeKoliziaCislaFaktury(new Error(kolizia.message))).toBe(true);
    expect(jeKoliziaCislaFaktury({ code: "23505", message: "invoices_pdf_token_key" })).toBe(false);
    expect(jeKoliziaCislaFaktury({ code: "23503", message: "invoices_cislo_uniq" })).toBe(false);
    expect(jeKoliziaCislaFaktury(null)).toBe(false);
  });

  it("pri kolízii skúsi znova s novým číslom, inú chybu vráti hneď", async () => {
    // Prvú „kartu“ predbehla iná a číslo 2026001 už je obsadené.
    const obsadene = new Set(["2026001"]);
    const generator = () => {
      for (let n = 1; ; n++) if (!obsadene.has(`202600${n}`)) return `202600${n}`;
    };
    const volania: string[] = [];
    let prve = true;
    const r = await sOpakovanimPriKoliziiCisla(async () => {
      // Prvý pokus má číslo vypýtané ešte pred zápisom súpera.
      const c = prve ? "2026001" : generator();
      prve = false;
      volania.push(c);
      if (obsadene.has(c)) return { data: null, error: kolizia };
      obsadene.add(c);
      return { data: { cislo: c }, error: null };
    });
    expect(r.error).toBeNull();
    expect(r.data?.cislo).toBe("2026002");
    expect(volania).toEqual(["2026001", "2026002"]);

    let n = 0;
    const iba = await sOpakovanimPriKoliziiCisla(async () => {
      n++;
      return { data: null, error: { code: "42501", message: "permission denied" } };
    });
    expect(n).toBe(1);
    expect(iba.error).toBeTruthy();
  });

  it("vzdá sa po stanovenom počte pokusov", async () => {
    let n = 0;
    const r = await sOpakovanimPriKoliziiCisla(async () => {
      n++;
      return { data: null, error: kolizia };
    }, 3);
    expect(n).toBe(3);
    expect(jeKoliziaCislaFaktury(r.error)).toBe(true);
  });

  it("hláška pre človeka hovorí, čo sa stalo", () => {
    expect(friendlyError(kolizia)).toMatch(/medzitým dostala iná faktúra/);
  });
});
