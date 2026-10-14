import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Zachytenie strán bez telefónu.
 *
 * Kamera v stránke sa v testoch spustiť nedá — obrazovka s ňou je
 * podstrčená a testuje sa rozhodovanie okolo nej: čo sa stane pri zrušení,
 * a kedy sa padá späť na fotoaparát. Systémový skener dokumentov
 * (capgo) je z appky preč — druhá kamera po stlačení spúšte miatla.
 */

const fotak = vi.fn();
vi.mock("./receipt-scanner", () => ({ captureReceipt: () => fotak() }));

import { cielovaStrana, trebaZmensit, zachytStrany, ROZPOCET_DOKLADU_B } from "./skener-dokumentov";
import { oznacStavKamery, registrujKameruDokladu, type VysledokKamery } from "./kamera-dokladu";

const kamera = vi.fn<(z: { jednaStrana: boolean; davka: boolean }) => Promise<VysledokKamery>>();

beforeEach(() => {
  fotak.mockReset();
  kamera.mockReset();
  registrujKameruDokladu(kamera);
  oznacStavKamery(true);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => {} } });
});

describe("zachytenie strán", () => {
  it("strany z kamery v stránke; jedna strana len prvú", async () => {
    kamera.mockResolvedValue({
      stav: "ok",
      strany: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
    });
    expect(await zachytStrany()).toEqual([
      "data:image/jpeg;base64,AAAA",
      "data:image/jpeg;base64,BBBB",
    ]);
    expect(await zachytStrany({ jednaStrana: true })).toEqual(["data:image/jpeg;base64,AAAA"]);
    expect(kamera).toHaveBeenLastCalledWith({ jednaStrana: true, davka: false });
    expect(fotak).not.toHaveBeenCalled();
  });

  it("dávka sa kamere povie", async () => {
    kamera.mockResolvedValue({ stav: "ok", strany: ["data:image/jpeg;base64,AAAA"] });
    await zachytStrany({ davka: true });
    expect(kamera).toHaveBeenCalledWith({ jednaStrana: false, davka: true });
  });

  it("zrušenie je návrat bez fotoaparátu", async () => {
    kamera.mockResolvedValue({ stav: "zrusene" });
    expect(await zachytStrany()).toBeNull();
    expect(fotak).not.toHaveBeenCalled();
  });

  it("kamera v stránke nejde — fotoaparát", async () => {
    kamera.mockResolvedValue({ stav: "nedostupna" });
    fotak.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,CCCC", mimeType: "image/jpeg" });
    expect(await zachytStrany()).toEqual(["data:image/jpeg;base64,CCCC"]);
  });

  it("keď kamera raz zlyhala, ide sa rovno na výber súboru", async () => {
    oznacStavKamery(false);
    fotak.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,DDDD", mimeType: "image/jpeg" });
    expect(await zachytStrany()).toEqual(["data:image/jpeg;base64,DDDD"]);
    expect(kamera).not.toHaveBeenCalled();
  });

  it("bez obrazovky s kamerou (napr. iná appka) ide po starom", async () => {
    registrujKameruDokladu(null);
    fotak.mockResolvedValue(null);
    expect(await zachytStrany()).toBeNull();
    expect(fotak).toHaveBeenCalledOnce();
  });
});

describe("limit nahrávania", () => {
  it("bežný sken sa nezmenšuje", () => {
    expect(trebaZmensit([1_200_000, 900_000])).toBe(false);
    expect(trebaZmensit([ROZPOCET_DOKLADU_B + 1])).toBe(true);
    expect(trebaZmensit(Array(20).fill(1_000_000))).toBe(true);
  });

  it("cieľová strana sa zmenší so štvorcom plochy, nie pod 1000 px", () => {
    expect(cielovaStrana(5, 10, 3000)).toBe(3000);
    const s = cielovaStrana(4 * ROZPOCET_DOKLADU_B, ROZPOCET_DOKLADU_B, 3000);
    expect(s).toBeLessThanOrEqual(1500);
    expect(s).toBeGreaterThanOrEqual(1000);
    expect(cielovaStrana(1000 * ROZPOCET_DOKLADU_B, ROZPOCET_DOKLADU_B, 3000)).toBe(1000);
  });
});
