import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — skript je čisté .mjs bez typov
import { trasyZRouteTree } from "../../../scripts/hlas-trasy.mjs";
import { TRASY_ADMINA, TRASY_APLIKACIE } from "./hlas-trasy.gen";
import {
  katalogPreModel,
  katalogStranok,
  navigaciaPreStranku,
  strankyPreHlas,
} from "./hlas-stranky";

const routeTree = readFileSync(join(__dirname, "../../routeTree.gen.ts"), "utf8");

describe("hlas — zoznam trás z routeTree", () => {
  it("hlas-trasy.gen.ts sedí s routeTree.gen.ts (inak spusti node scripts/hlas-trasy.mjs)", () => {
    const { aplikacia, admin } = trasyZRouteTree(routeTree);
    expect([...TRASY_APLIKACIE]).toEqual(aplikacia);
    expect([...TRASY_ADMINA]).toEqual(admin);
  });

  it("len prihlásená časť a admin, parameter len $id", () => {
    const vsetky = [...TRASY_APLIKACIE, ...TRASY_ADMINA];
    expect(vsetky).toContain("/pokladna");
    expect(vsetky).toContain("/faktury/$id");
    expect(vsetky).toContain("/admin/users");
    for (const c of vsetky) {
      expect(c.startsWith("/api/")).toBe(false);
      expect(c).not.toMatch(/\$(?!id\b)/);
      expect(c.length === 1 || !c.endsWith("/")).toBe(true);
    }
    // Verejné stránky (prihlásenie, blog, platba) hlas neotvára.
    for (const c of ["/prihlasenie", "/blog", "/pay/$token", "/faktura/$token"])
      expect(vsetky).not.toContain(c);
    for (const c of TRASY_ADMINA) expect(c.startsWith("/admin")).toBe(true);
  });
});

describe("hlas — katalóg stránok", () => {
  const k = katalogStranok();
  const podla = (kluc: string) => k.find((s) => s.kluc === kluc);

  it("pokrýva každú trasu a má ľudské názvy z menu", () => {
    const kluce = new Set(k.map((s) => s.to));
    for (const c of [...TRASY_APLIKACIE, ...TRASY_ADMINA]) expect(kluce.has(c)).toBe(true);
    expect(podla("/pokladna")?.nazov).toBe("Pokladňa");
    expect(podla("/bankove-ucty")?.sekcia).toBe("Banka");
    expect(podla("/jazdy")?.nazov).toBe("Jazdy");
    expect(podla("/sklad")?.sekcia).toBe("Sklad");
    expect(podla("/zakazky")?.nazov).toBe("Prehľad zákaziek");
    expect(podla("/ponuky")?.nazov).toBe("Cenové ponuky");
    expect(podla("/firma")?.nazov).toBe("Firma");
    expect(podla("/uctovnictvo/predkontacie")?.nazov).toContain("Predkontácie");
    expect(podla("/exporty")?.nazov).toBe("Účtovné exporty");
    expect(podla("/faktury?type=credit")?.nazov).toBe("Dobropisy");
    expect(podla("/faktury/$id")).toMatchObject({
      detail: true,
      nazov: "Detail vystavenej faktúry",
    });
    // Kľúče sú jedinečné.
    expect(new Set(k.map((s) => s.kluc)).size).toBe(k.length);
  });

  it("každá položka menu vedie na existujúcu trasu", () => {
    const trasy = new Set<string>([...TRASY_APLIKACIE, ...TRASY_ADMINA]);
    for (const s of k) expect(trasy.has(s.to)).toBe(true);
  });

  it("admin stránky len administrátorovi platformy", () => {
    expect(strankyPreHlas(false).some((s) => s.admin)).toBe(false);
    expect(strankyPreHlas(true).some((s) => s.kluc === "/admin/ai")).toBe(true);
    expect(navigaciaPreStranku(strankyPreHlas(false), "/admin/ai")).toBeNull();
  });

  it("katalóg pre model: riadok na stránku, detail označený", () => {
    const t = katalogPreModel(strankyPreHlas(false));
    expect(t).toContain("/pokladna — Pokladňa (Účtovníctvo)");
    expect(t).toContain("/faktury/$id — Detail vystavenej faktúry [potrebuje id]");
    expect(t.split("\n").length).toBe(strankyPreHlas(false).length);
  });
});
