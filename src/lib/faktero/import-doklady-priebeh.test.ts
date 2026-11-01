import { describe, expect, it } from "vitest";
import { MAX_SUBOROV_IMPORTU, pridajSuborySoStropom, sledujImport } from "./import-doklady-priebeh";

describe("pridajSuborySoStropom (H-14)", () => {
  it("pod stropom pridá všetko", () => {
    expect(pridajSuborySoStropom([1, 2], [3])).toEqual({ subory: [1, 2, 3], nepridane: 0 });
  });
  it("25 súborov → 20 vybraných, 5 nepridaných", () => {
    const nove = Array.from({ length: 25 }, (_, i) => i);
    const r = pridajSuborySoStropom([], nove);
    expect(r.subory).toHaveLength(MAX_SUBOROV_IMPORTU);
    expect(r.nepridane).toBe(5);
  });
  it("počíta aj s už vybranými", () => {
    const r = pridajSuborySoStropom(Array(18).fill("a"), ["b", "c", "d"]);
    expect(r.subory).toHaveLength(20);
    expect(r.nepridane).toBe(1);
  });
});

const bezCakania = async () => {};

describe("sledujImport (H-15, E-18)", () => {
  it("skončí, keď úloha nebeží", async () => {
    const stavy = ["running", "running", "completed"];
    const videne: string[] = [];
    const r = await sledujImport({
      zisti: async () => ({ status: stavy.shift()! }),
      cakaj: bezCakania,
      zrusene: () => false,
      priebeh: (j) => videne.push(j.status),
    });
    expect(r.druh).toBe("hotovo");
    expect(videne).toEqual(["running", "running", "completed"]);
  });

  it("prechodnú chybu zopakuje", async () => {
    let n = 0;
    const r = await sledujImport({
      zisti: async () => {
        n++;
        if (n === 1) throw new Error("sieť");
        return { status: "completed" };
      },
      cakaj: bezCakania,
      zrusene: () => false,
    });
    expect(r.druh).toBe("hotovo");
  });

  it("po opakovaných chybách vráti nezistený stav, nie večné Importujem", async () => {
    let n = 0;
    const r = await sledujImport({
      zisti: async () => {
        n++;
        throw new Error("500");
      },
      cakaj: bezCakania,
      zrusene: () => false,
      pokusy: 3,
    });
    expect(r).toMatchObject({ druh: "nezistene", chyba: "500" });
    expect(n).toBe(3);
  });

  it("po odchode zo stránky sa prestane pýtať", async () => {
    let zrusene = false;
    let n = 0;
    const r = await sledujImport({
      zisti: async () => {
        n++;
        zrusene = true;
        return { status: "running" };
      },
      cakaj: bezCakania,
      zrusene: () => zrusene,
    });
    expect(r.druh).toBe("zrusene");
    expect(n).toBe(1);
  });

  it("úloha visiaca v running narazí na strop", async () => {
    let n = 0;
    const r = await sledujImport({
      zisti: async () => {
        n++;
        return { status: "running" };
      },
      cakaj: bezCakania,
      zrusene: () => false,
      intervalMs: 1000,
      stropMs: 10_000,
    });
    expect(r.druh).toBe("strop");
    expect(n).toBe(10);
  });
});
