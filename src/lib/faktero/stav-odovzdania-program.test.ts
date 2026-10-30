import { describe, expect, it } from "vitest";
import {
  popisPoslatOpravu,
  textOdovzdanyDoklad,
  textPoslatOpravu,
  textPoVrateni,
  textVarovaniaVratenia,
} from "./stav-odovzdania";
import { nazovProgramuExportu } from "./odovzdanie-exportu";
import { preloz, slovnikJazyka } from "@/lib/i18n/jazyk";

describe("vrátenie dokladu podľa programu", () => {
  const money = nazovProgramuExportu("money_s3_xml");

  it("Pohoda ostáva Pohodou, iný program sa povie menom", () => {
    expect(textPoVrateni("faktura", null)).toBe(
      "Vrátené z Pohody — opravte doklad a odovzdajte ho znova",
    );
    expect(preloz("sk", textPoVrateni("prijata", money), { program: money! })).toBe(
      "Vrátené z účtovníctva (Money S3) — opravte doklad a odovzdajte ho znova",
    );
    expect(textPoVrateni("doklad", money)).toBe(
      "Vrátené medzi nespracované — opravte a spracujte znova",
    );
    expect(textPoslatOpravu(null)).toBe("Poslať opravu do Pohody");
    expect(preloz("sk", textPoslatOpravu(money), { program: money! })).toBe(
      "Poslať opravu do účtovníctva (Money S3)",
    );
    for (const text of [
      textPoVrateni("faktura", money),
      textPoslatOpravu(money),
      popisPoslatOpravu(money),
      textOdovzdanyDoklad(money),
      textVarovaniaVratenia("faktura", "subor", money),
      textVarovaniaVratenia("doklad", "subor", money),
    ])
      expect(text).not.toMatch(/Pohod/);
  });

  it("každý text má preklad v CZ aj DE a {program} sa dosadí", () => {
    const texty = [null, "KROS Omega"].flatMap((p) => [
      textPoVrateni("faktura", p),
      textPoVrateni("doklad", p),
      textPoslatOpravu(p),
      popisPoslatOpravu(p),
      textOdovzdanyDoklad(p),
    ]);
    for (const j of ["cs", "de"] as const)
      for (const text of texty) {
        expect(slovnikJazyka(j)[text], `${text} ${j}`).toBeDefined();
        expect(preloz(j, text, { program: "KROS Omega" })).not.toMatch(/\{program\}/);
      }
  });
});
