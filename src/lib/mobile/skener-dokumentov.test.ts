import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Systémový skener dokumentov bez telefónu.
 *
 * VisionKit ani ML Kit sa v testoch spustiť nedajú — plugin je podstrčený a
 * testuje sa naše rozhodovanie okolo neho: čo sa stane pri zrušení, kedy sa
 * padá späť na fotoaparát a s akým nastavením sa skener na ktorej platforme
 * otvára.
 */

const platforma = { nativna: true, nazov: "android", plugin: true };
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platforma.nativna,
    getPlatform: () => platforma.nazov,
    isPluginAvailable: () => platforma.plugin,
  },
}));

const skenuj = vi.fn();
vi.mock("@capgo/capacitor-document-scanner", () => ({
  DocumentScanner: { scanDocument: (...a: unknown[]) => skenuj(...a) },
}));

const fotak = vi.fn();
vi.mock("./receipt-scanner", () => ({ captureReceipt: () => fotak() }));

import {
  cielovaStrana,
  moznostiSkenera,
  naDataUrl,
  trebaZmensit,
  zachytStrany,
  ROZPOCET_DOKLADU_B,
} from "./skener-dokumentov";

beforeEach(() => {
  platforma.nativna = true;
  platforma.nazov = "android";
  platforma.plugin = true;
  skenuj.mockReset();
  fotak.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("nastavenie skenera", () => {
  it("Android dostane filtre, orezanie a strop strán", () => {
    const m = moznostiSkenera("android", false);
    expect(m.scannerMode).toBe("full");
    expect(m.croppedImageQuality).toBe(80);
    expect(m.responseType).toBe("base64");
    expect(m.maxNumDocuments).toBe(20);
    expect(moznostiSkenera("android", true).maxNumDocuments).toBe(1);
  });

  it("iOS nedostane nič, čo by zaplo neverejné časti VisionKitu", () => {
    const m = moznostiSkenera("ios", true);
    expect(m.letUserAdjustCrop).toBe(false);
    expect(m.maxNumDocuments).toBeUndefined();
    expect(m.scannerMode).toBeUndefined();
  });
});

describe("výsledok skenera", () => {
  it("čisté base64 dostane hlavičku, data URL ostane", () => {
    expect(naDataUrl("AAAA")).toBe("data:image/jpeg;base64,AAAA");
    expect(naDataUrl("data:image/png;base64,BBBB")).toBe("data:image/png;base64,BBBB");
  });

  it("viac strán vráti všetky, jedna strana len prvú", async () => {
    skenuj.mockResolvedValue({ status: "success", scannedImages: ["AAAA", "BBBB"] });
    expect(await zachytStrany()).toEqual([
      "data:image/jpeg;base64,AAAA",
      "data:image/jpeg;base64,BBBB",
    ]);
    expect(await zachytStrany({ jednaStrana: true })).toEqual(["data:image/jpeg;base64,AAAA"]);
    expect(fotak).not.toHaveBeenCalled();
  });

  it("zrušenie je návrat bez fotoaparátu", async () => {
    skenuj.mockResolvedValue({ status: "cancel" });
    expect(await zachytStrany()).toBeNull();
    expect(fotak).not.toHaveBeenCalled();
  });

  it("chyba pluginu (Android bez Play služieb) padne na fotoaparát", async () => {
    skenuj.mockRejectedValue(new Error("Google Play Services not available"));
    fotak.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,CCCC", mimeType: "image/jpeg" });
    expect(await zachytStrany()).toEqual(["data:image/jpeg;base64,CCCC"]);
  });

  it("na webe sa plugin vôbec nevolá", async () => {
    platforma.nativna = false;
    fotak.mockResolvedValue(null);
    expect(await zachytStrany()).toBeNull();
    expect(skenuj).not.toHaveBeenCalled();
    expect(fotak).toHaveBeenCalledOnce();
  });

  it("starý balík bez pluginu ide po starom", async () => {
    platforma.plugin = false;
    fotak.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,DDDD", mimeType: "image/jpeg" });
    expect(await zachytStrany()).toEqual(["data:image/jpeg;base64,DDDD"]);
    expect(skenuj).not.toHaveBeenCalled();
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
