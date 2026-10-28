import { describe, expect, it } from "vitest";
import { rozsahFirmy } from "./efaktura-rozsah-firiem";

describe("rozsah eFaktúry firmy", () => {
  it("výber Faktera na portáli FS = odosielanie aj prijímanie", () => {
    expect(
      rozsahFirmy({ pdsStav: "registrovana", sendOnlyStav: null, maProfil: true }).rozsah,
    ).toBe("odosielanie_prijimanie");
  });

  it("aktívne len odosielanie má prednosť a povie, kde je príjem", () => {
    expect(
      rozsahFirmy({
        pdsStav: "cudzi_poskytovatel",
        sendOnlyStav: "active",
        prijemPoskytovatel: "Iný s.r.o.",
        maProfil: true,
      }),
    ).toEqual({ rozsah: "len_odosielanie", poznamka: "príjem u: Iný s.r.o." });
  });

  it("rozbehnuté žiadosti sú v procese", () => {
    expect(
      rozsahFirmy({ pdsStav: "registruje_sa", sendOnlyStav: null, maProfil: false }).rozsah,
    ).toBe("v_procese");
    expect(rozsahFirmy({ pdsStav: null, sendOnlyStav: "caka_na_fs", maProfil: false }).rozsah).toBe(
      "v_procese",
    );
  });

  it("cudzí poskytovateľ, chyba a napojenie bez portálu", () => {
    expect(
      rozsahFirmy({ pdsStav: "cudzi_poskytovatel", sendOnlyStav: null, maProfil: false }).rozsah,
    ).toBe("cudzi_poskytovatel");
    expect(rozsahFirmy({ pdsStav: "zamietnuta", sendOnlyStav: null, maProfil: false }).rozsah).toBe(
      "nefunkcne",
    );
    expect(rozsahFirmy({ pdsStav: null, sendOnlyStav: null, maProfil: true }).rozsah).toBe(
      "bez_portalu",
    );
  });
});
