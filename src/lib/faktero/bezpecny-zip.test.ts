import { describe, expect, it } from "vitest";
import { zipSync, strToU8, strFromU8 } from "fflate";
import { PrilisVelkyZip, jeZip, novyRozpocet, overZip, rozbalZip } from "./bezpecny-zip";

describe("rozbalZip", () => {
  it("rozbalí bežný archív a vynechá priečinky", () => {
    const zip = zipSync({
      "a.csv": strToU8("x;y\n1;2"),
      "dir/b.xml": strToU8("<a/>"),
      "prazdny/": new Uint8Array(0),
    });
    const r = rozbalZip(zip);
    expect(Object.keys(r).sort()).toEqual(["a.csv", "dir/b.xml"]);
    expect(strFromU8(r["a.csv"]!)).toBe("x;y\n1;2");
  });

  it("ZIP bomba (malý archív, veľký obsah) skončí chybou skôr, než zaplní pamäť", () => {
    // 64 MB núl sa zbalí na pár desiatok kB.
    const bomba = zipSync({ "nuly.csv": new Uint8Array(64 * 1024 * 1024) }, { level: 9 });
    expect(bomba.length).toBeLessThan(200_000);
    expect(() => rozbalZip(bomba, novyRozpocet({ maxBajtov: 8 * 1024 * 1024 }))).toThrow(
      PrilisVelkyZip,
    );
    expect(() => overZip(bomba, { maxBajtov: 8 * 1024 * 1024 })).toThrow(PrilisVelkyZip);
  });

  it("vnorené archívy čerpajú spoločný rozpočet", () => {
    const vnutorny = zipSync({ "x.bin": new Uint8Array(3 * 1024 * 1024) });
    const rozpocet = novyRozpocet({ maxBajtov: 5 * 1024 * 1024 });
    rozbalZip(vnutorny, rozpocet);
    expect(() => rozbalZip(vnutorny, rozpocet)).toThrow(PrilisVelkyZip);
  });

  it("priveľa súborov", () => {
    const subory: Record<string, Uint8Array> = {};
    for (let i = 0; i < 50; i++) subory[`f${i}.txt`] = strToU8("x");
    expect(() => rozbalZip(zipSync(subory), novyRozpocet({ maxSuborov: 10 }))).toThrow(/priveľa/);
  });

  it("poškodený archív nespadne nekontrolovane a ne-ZIP overZip pustí", () => {
    const zip = zipSync({ "a.txt": strToU8("ahoj".repeat(1000)) });
    expect(() => rozbalZip(zip.slice(0, 40))).not.toThrow(PrilisVelkyZip);
    expect(jeZip(strToU8("a;b"))).toBe(false);
    expect(() => overZip(strToU8("a;b\n1;2"))).not.toThrow();
  });
});

describe("import prijatých dokladov a ZIP bomba", () => {
  it("rozbal() pri bombe vo vnorenom ZIP-e skončí chybou, nie pádom servera", async () => {
    const { rozbal } = await import("./import-prijatych.server");
    const bomba = zipSync({
      "vnutri.zip": zipSync({ "nuly.csv": new Uint8Array(16 * 1024 * 1024) }),
    });
    await expect(
      rozbal(
        [{ meno: "doklady.zip", bajty: bomba }],
        0,
        novyRozpocet({ maxBajtov: 4 * 1024 * 1024 }),
      ),
    ).rejects.toThrow(/príliš veľký/);
  });
});
