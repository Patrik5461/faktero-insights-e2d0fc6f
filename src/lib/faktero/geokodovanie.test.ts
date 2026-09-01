import { describe, expect, it } from "vitest";
import { geoKluc, zlozAdresu } from "./geokodovanie";

describe("zlozAdresu", () => {
  it("ulicu s číslom spojí s mestom", () => {
    expect(
      zlozAdresu({
        street: "Halenárska",
        housenumber: "14B",
        locality: "Trnava",
        name: "Halenárska 14B",
      }),
    ).toBe("Halenárska 14B, Trnava");
  });

  it("bez čísla stačí ulica", () => {
    expect(zlozAdresu({ street: "Hlavná", locality: "Trnava" })).toBe("Hlavná, Trnava");
  });

  // Toto je presne prípad „Fontána Zem, Bratislava" z ostrej skúšky.
  it("keď ulica chýba, použije názov miesta", () => {
    expect(zlozAdresu({ name: "Fontána Zem", locality: "Bratislava" })).toBe(
      "Fontána Zem, Bratislava",
    );
  });

  it("mesto samo o sebe stačí", () => {
    expect(zlozAdresu({ locality: "Trnava" })).toBe("Trnava");
  });

  it("názov zhodný s mestom sa neopakuje dvakrát", () => {
    expect(zlozAdresu({ name: "Trnava", locality: "Trnava" })).toBe("Trnava");
  });

  it("keď mesto chýba, siahne po okrese", () => {
    expect(zlozAdresu({ street: "Diaľnica D1", county: "Trnavský kraj" })).toBe(
      "Diaľnica D1, Trnavský kraj",
    );
  });

  it("z prázdnej odpovede nerobí adresu", () => {
    expect(zlozAdresu({})).toBeNull();
    expect(zlozAdresu(null)).toBeNull();
  });
});

describe("geoKluc", () => {
  it("body do jedenástich metrov sú ten istý kľúč", () => {
    expect(geoKluc(48.37626, 17.59104)).toBe(geoKluc(48.376262, 17.591048));
  });

  it("vzdialené body majú rôzny kľúč", () => {
    expect(geoKluc(48.3762, 17.591)).not.toBe(geoKluc(48.1485, 17.1077));
  });
});

describe("zlozAdresu — čo Pelias vracia v teréne", () => {
  // Presne prípad „1279, Trnava" z prvého behu nad ostrými jazdami.
  it("holé parcelné číslo namiesto ulice zahodí", () => {
    expect(zlozAdresu({ street: "1279", locality: "Trnava" })).toBe("Trnava");
    expect(zlozAdresu({ name: "1279", locality: "Trnava" })).toBe("Trnava");
  });

  it("ulicu pomenovanú podľa obce nezopakuje dvakrát", () => {
    expect(zlozAdresu({ street: "Zavar", housenumber: "122", locality: "Zavar" })).toBe(
      "Zavar 122",
    );
  });

  it("obec s veľkým písmenom v názve ulice tiež spozná", () => {
    expect(zlozAdresu({ street: "Trnava 9733", locality: "Trnava" })).toBe("Trnava 9733");
  });
});
