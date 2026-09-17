import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Denný beh musí odpovedať skôr, než ho nginx po 30 sekundách preruší.
 * Stráži sa preto to, čo sa na tom dá pokaziť: že sa práca naozaj odpojí od
 * odpovede, že dva behy nepobežia naraz a že zlyhanie ostatných bánk nezahodí
 * už stiahnutú Tatra banku.
 */

const tatra = vi.fn();
const ostatne = vi.fn();
vi.mock("./bank-sync.server", () => ({ runDailyBankSync: (d: number) => tatra(d) }));
vi.mock("./bank-sync-ostatne.server", () => ({ runDailySyncOstatnych: () => ostatne() }));

/** Necháme dobehnúť prácu, ktorá beží mimo odpovede. */
async function dobehni() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  tatra.mockReset().mockResolvedValue({ connections: 5, inserted: 3, failed: 0, results: [] });
  ostatne.mockReset().mockResolvedValue({ connections: 1, inserted: 2, failed: 0, results: [] });
});

describe("denný beh mimo odpovede", () => {
  it("spustenie sa nečaká — stav hlási, že beží", async () => {
    const { spustiDennyBeh, stavBehu } = await import("./bank-sync-beh.server");

    let dokonci: (v: any) => void = () => {};
    tatra.mockReturnValue(new Promise((r) => (dokonci = r)));

    expect(spustiDennyBeh(14)).toBe(true);
    // Toto je celá pointa: sme tu skôr, než sťahovanie skončilo.
    expect(stavBehu().bezi).toBe(true);
    expect(stavBehu().vysledok).toBeNull();

    dokonci({ connections: 1, inserted: 0, failed: 0, results: [] });
    await dobehni();
    expect(stavBehu().bezi).toBe(false);
  });

  it("druhé spustenie počas behu sa odmietne", async () => {
    const { spustiDennyBeh } = await import("./bank-sync-beh.server");
    tatra.mockReturnValue(new Promise(() => {}));

    expect(spustiDennyBeh(14)).toBe(true);
    expect(spustiDennyBeh(14)).toBe(false);
    // Sťahovanie sa rozbehne až po prvých mikroúlohách — dovtedy by tu stála nula.
    await dobehni();
    expect(tatra).toHaveBeenCalledTimes(1);
  });

  it("po dobehnutí drží výsledok oboch častí", async () => {
    const { spustiDennyBeh, stavBehu } = await import("./bank-sync-beh.server");

    spustiDennyBeh(30);
    await dobehni();

    expect(tatra).toHaveBeenCalledWith(30);
    const v = stavBehu().vysledok as any;
    expect(v.inserted).toBe(3);
    expect(v.ostatne.inserted).toBe(2);
    expect(stavBehu().chyba).toBeNull();
    expect(stavBehu().skoncilo).not.toBeNull();
  });

  it("zlyhanie ostatných bánk nezahodí Tatra banku", async () => {
    const { spustiDennyBeh, stavBehu } = await import("./bank-sync-beh.server");
    ostatne.mockRejectedValue(new Error("Wise nedostupný"));

    spustiDennyBeh(14);
    await dobehni();

    const v = stavBehu().vysledok as any;
    expect(v.inserted).toBe(3);
    expect(v.chybaOstatnych).toBe("Wise nedostupný");
    // Celý beh sa kvôli tomu za zlyhaný nepovažuje.
    expect(stavBehu().chyba).toBeNull();
  });

  it("pád Tatra banky sa zapíše a beh sa uvoľní pre ďalší pokus", async () => {
    const { spustiDennyBeh, stavBehu } = await import("./bank-sync-beh.server");
    tatra.mockRejectedValue(new Error("databáza nedostupná"));

    spustiDennyBeh(14);
    await dobehni();

    expect(stavBehu().chyba).toBe("databáza nedostupná");
    expect(stavBehu().bezi).toBe(false);
    expect(spustiDennyBeh(14)).toBe(true);
  });
});
