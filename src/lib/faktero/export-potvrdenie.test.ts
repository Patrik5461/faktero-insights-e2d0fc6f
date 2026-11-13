/*
  Ručný export do Pohody so závažnými chybami — okno ich ukáže a export
  dovolí („Exportovať aj tak“), Patrik 13. 11. 2026.
*/
import { afterEach, describe, expect, it } from "vitest";
import { _vycistiFrontu, prihlasOkno, vybavZiadost, type Ziadost } from "@/lib/potvrdenie";
import { exportSPotvrdenim, textPotvrdeniaExportu } from "./export-potvrdenie";
import { obsahovaPrekazkaDokladu, prekazkaDokladu, prekazkaStavuDokladu } from "./pohoda-kontrola";

const t = (s: string, p?: Record<string, string | number>) =>
  Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, String(v)), s);

describe("okno pred exportom do Pohody", () => {
  afterEach(() => _vycistiFrontu());

  it("rozlíši Závažné a Upozornenia", () => {
    const text = textPotvrdeniaExportu(["A1 — bez kurzu"], ["B1 — bez predkontácie"], t);
    expect(text.split("\n")[0]).toBe("Pred exportom do Pohody skontrolujte:");
    expect(text).toContain("Závažné (1) — Pohoda tieto doklady môže zaúčtovať zle:\n• A1 — bez kurzu");
    expect(text).toContain("Upozornenia (1):\n• B1 — bez predkontácie");
    expect(text.indexOf("Závažné")).toBeLessThan(text.indexOf("Upozornenia"));
    expect(textPotvrdeniaExportu(["A1"], [], t)).not.toContain("Upozornenia");
  });

  it("bez závažných aj upozornení vráti prvé volanie bez okna", async () => {
    const volania: boolean[] = [];
    const r = await exportSPotvrdenim(async (p) => (volania.push(p), { xml: "x", zavazne: [], varovania: [] }), t);
    expect(r?.xml).toBe("x");
    expect(volania).toEqual([false]);
  });

  it("závažné: „Exportovať aj tak“ zavolá znova s potvrdením", async () => {
    let okno: Ziadost | null = null;
    const odhlas = prihlasOkno((z) => (okno = z));
    const volania: boolean[] = [];
    const sluz = async (p: boolean) => (volania.push(p), p ? { xml: "ok" } : { xml: "", zavazne: ["A1 — zlé DPH"] });
    const beh = exportSPotvrdenim(sluz, t);
    await new Promise((r) => setTimeout(r, 0));
    expect(okno!.potvrdit).toBe("Exportovať aj tak");
    expect(okno!.zrusit).toBe("Opravím to");
    vybavZiadost(true);
    expect((await beh)?.xml).toBe("ok");
    expect(volania).toEqual([false, true]);
    odhlas();
  });

  it("„Opravím to“ nevyvezie nič", async () => {
    const odhlas = prihlasOkno(() => {});
    const volania: boolean[] = [];
    const beh = exportSPotvrdenim(async (p) => (volania.push(p), { zavazne: ["A1"] }), t);
    await new Promise((r) => setTimeout(r, 0));
    vybavZiadost(false);
    expect(await beh).toBeNull();
    expect(volania).toEqual([false]);
    odhlas();
  });
});

describe("prekážka stavu vs. obsahu", () => {
  const firma = { country: "SK" };
  it("duplicita a cudzia firma sú prekážky stavu — potvrdenie ich neprebije", () => {
    const d = { document_number: "D1", _duplicita: "dvakrát v evidencii" };
    expect(prekazkaStavuDokladu(d)).toBe("D1 — dvakrát v evidencii");
    expect(prekazkaDokladu(d, firma)).toBe("D1 — dvakrát v evidencii");
    expect(obsahovaPrekazkaDokladu(d, firma)).toBeNull();
    expect(prekazkaStavuDokladu({ document_number: "C1", _odberatelNesedi: true })).toMatch(/^C1 — /);
  });

  it("bloček bez kurzu je obsahová prekážka a povie, čo sa stane", () => {
    const d = { document_number: "X1", currency: "CZK", total_amount: 10 };
    expect(prekazkaStavuDokladu(d)).toBeNull();
    expect(obsahovaPrekazkaDokladu(d, firma)).toMatch(/nemá kurz.*kurzom 0/);
  });
});
