import { describe, expect, it } from "vitest";
import {
  pismenoZColnychKodov,
  textPreneseniaDokladu,
  vetaTuzemskehoPrenesenia,
} from "./veta-prenesenia";

describe("veta o tuzemskom prenesení s celým ustanovením", () => {
  it("SK stavebné práce — písm. j) a slová „Prenesenie daňovej povinnosti“", () => {
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "j", jazyk: "sk" })).toBe(
      "Prenesenie daňovej povinnosti – § 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. o DPH – stavebné práce. Daň je povinný priznať a odviesť odberateľ.",
    );
  });
  it("bez druhu ostáva všeobecná veta s § 69 ods. 12", () => {
    const v = vetaTuzemskehoPrenesenia({ krajina: "SK", druh: null, jazyk: "sk" });
    expect(v).toContain("Prenesenie daňovej povinnosti – § 69 ods. 12 zákona č. 222/2004");
    expect(v).not.toContain("písm.");
  });
  it("neznámy druh sa ignoruje, CZ druh na SK firme tiež", () => {
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "92e", jazyk: "sk" })).not.toContain("písm.");
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "z", jazyk: "sk" })).not.toContain("písm.");
  });
  it("odhad z colných kódov: kovy písm. g), mobil h), obvody i), obilie f)", () => {
    expect(pismenoZColnychKodov([{ colny_kod: "72142000" }, { colny_kod: "7308 90" }])).toBe("g");
    expect(pismenoZColnychKodov([{ colny_kod: "85171300" }])).toBe("h");
    expect(pismenoZColnychKodov([{ colny_kod: "85423190" }])).toBe("i");
    expect(pismenoZColnychKodov([{ colny_kod: "1001" }])).toBe("f");
    expect(pismenoZColnychKodov([{ colny_kod: "72142000" }, { colny_kod: "85171300" }])).toBeNull();
    expect(pismenoZColnychKodov([{ colny_kod: "94036010" }])).toBeNull();
    expect(pismenoZColnychKodov([{}])).toBeNull();
  });
  it("CZ firma — § 92e stavebné a montážne práce, bez druhu § 92a", () => {
    expect(vetaTuzemskehoPrenesenia({ krajina: "CZ", druh: "92e", jazyk: "cs" })).toBe(
      "Přenesení daňové povinnosti – § 92e zákona č. 235/2004 Sb., o DPH – poskytnutí stavebních nebo montážních prací. Daň odvede zákazník.",
    );
    expect(vetaTuzemskehoPrenesenia({ krajina: "CZ", druh: null, jazyk: "cs" })).toContain("§ 92a");
  });
  it("bez druhu nevznikne „..“ za skratkou zákona", () => {
    for (const jazyk of ["sk", "cs", "en", "de", "hu"])
      for (const krajina of ["SK", "CZ"])
        expect(vetaTuzemskehoPrenesenia({ krajina, druh: null, jazyk })).not.toMatch(/\.\./);
  });
  it("v jazyku dokladu", () => {
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "j", jazyk: "en" })).toContain(
      "Section 69(12)(j) of Slovak VAT Act No. 222/2004 Coll. – construction work",
    );
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "j", jazyk: "de" })).toContain(
      "§ 69 Abs. 12 Buchst. j)",
    );
    expect(vetaTuzemskehoPrenesenia({ krajina: "SK", druh: "a", jazyk: "cs" })).toContain(
      "§ 69 odst. 12 písm. a) slovenského zákona",
    );
  });
  it("doklad: EÚ služba a vývoz ostávajú, položkové PDP má úvod", () => {
    const firma = { country: "SK", vat_payer: true };
    expect(
      textPreneseniaDokladu({
        invoice: { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" },
        company: firma,
        items: [],
        jazyk: "sk",
      }),
    ).toContain("Prenesenie daňovej povinnosti");
    expect(
      textPreneseniaDokladu({
        invoice: { reverse_charge: false, pdp_druh: "j" },
        company: firma,
        items: [{ prenesenie: true }, { prenesenie: false }],
        jazyk: "sk",
      }),
    ).toBe(
      "Položky označené PDP: Prenesenie daňovej povinnosti – § 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. o DPH – stavebné práce. Daň je povinný priznať a odviesť odberateľ.",
    );
    expect(
      textPreneseniaDokladu({ invoice: { reverse_charge: false }, company: firma, items: [{}], jazyk: "sk" }),
    ).toBeNull();
  });
});
