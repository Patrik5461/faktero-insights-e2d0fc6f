import { describe, expect, it } from "vitest";
import { kusy, stavBanky, stavZRiadku, ukazatEfakturu } from "./prehlad-firiem";

const plny = {
  company_id: "a",
  nespracovane: 3,
  neodovzdane_blocky: 2,
  efaktury_nezaevidovane: 1,
  po_splatnosti: 4,
  efaktura_pds_stav: "registrovana",
  efaktura_cudzi_poskytovatel: null,
  efaktura_odosielanie_stav: null,
  efaktura_prijem_poskytovatel: null,
  efaktura_profil: true,
  ucty_spolu: 2,
  ucty_napojene: 1,
  ucty_problem: 0,
  ucty_suhlas: 0,
};

describe("stav firmy z riadku", () => {
  it("prečíta čísla aj eFaktúru", () => {
    const s = stavZRiadku(plny);
    expect(s.nespracovane).toBe(3);
    expect(s.neodovzdaneBlocky).toBe(2);
    expect(s.efakturyNezaevidovane).toBe(1);
    expect(s.poSplatnosti).toBe(4);
    expect(s.efaktura).toEqual({ rozsah: "odosielanie_prijimanie", poskytovatel: null });
    expect(s.banka).toEqual({ spolu: 2, napojene: 1, problem: 0, suhlas: 0 });
  });

  it("NULL z databázy (bez práva) ostane NULL, nie nula", () => {
    const s = stavZRiadku({
      ...plny,
      nespracovane: null,
      neodovzdane_blocky: null,
      efaktury_nezaevidovane: null,
      po_splatnosti: null,
      ucty_spolu: null,
    });
    expect(s.nespracovane).toBeNull();
    expect(s.neodovzdaneBlocky).toBeNull();
    expect(s.poSplatnosti).toBeNull();
    expect(s.efaktura).toBeNull();
    expect(s.banka).toBeNull();
  });

  it("len odosielanie nesie poskytovateľa príjmu, cudzí poskytovateľ jeho meno", () => {
    expect(
      stavZRiadku({
        ...plny,
        efaktura_pds_stav: null,
        efaktura_odosielanie_stav: "active",
        efaktura_prijem_poskytovatel: "Iný s.r.o.",
      }).efaktura,
    ).toEqual({ rozsah: "len_odosielanie", poskytovatel: "Iný s.r.o." });
    expect(
      stavZRiadku({
        ...plny,
        efaktura_pds_stav: "cudzi_poskytovatel",
        efaktura_cudzi_poskytovatel: "Druhý a.s.",
      }).efaktura,
    ).toEqual({ rozsah: "cudzi_poskytovatel", poskytovatel: "Druhý a.s." });
  });

  it("bez žiadosti je firma neregistrovaná", () => {
    const s = stavZRiadku({ ...plny, efaktura_pds_stav: null, efaktura_profil: false });
    expect(s.efaktura?.rozsah).toBe("bez_portalu");
  });

  it("čísla v reťazci (bigint) sa prevedú", () => {
    expect(stavZRiadku({ ...plny, nespracovane: "7" }).nespracovane).toBe(7);
  });
});

describe("eFaktúra podľa krajiny", () => {
  const neregistrovana = stavZRiadku({ ...plny, efaktura_pds_stav: null, efaktura_profil: false });
  it("slovenská neregistrovaná sa ukáže", () => {
    expect(ukazatEfakturu("SK", neregistrovana)).toBe(true);
  });
  it("česká neregistrovaná nie, s registráciou áno", () => {
    expect(ukazatEfakturu("CZ", neregistrovana)).toBe(false);
    expect(ukazatEfakturu("CZ", stavZRiadku(plny))).toBe(true);
  });
  it("bez práva nikdy", () => {
    expect(ukazatEfakturu("SK", stavZRiadku({ ...plny, po_splatnosti: null }))).toBe(false);
  });
});

describe("stav banky", () => {
  it("vypršaný súhlas je horší než zlyhanie a nenapojený účet", () => {
    expect(stavBanky({ spolu: 2, napojene: 1, problem: 1, suhlas: 1 }).text).toBe(
      "Vypršal súhlas banky",
    );
    expect(stavBanky({ spolu: 2, napojene: 2, problem: 1, suhlas: 0 }).text).toBe(
      "Pripojenie zlyhalo",
    );
    expect(stavBanky({ spolu: 2, napojene: 1, problem: 0, suhlas: 0 }).ton).toBe("pozor");
  });
  it("bez účtu upozorní, všetko napojené je v poriadku", () => {
    expect(stavBanky({ spolu: 0, napojene: 0, problem: 0, suhlas: 0 }).text).toBe(
      "Bez bankového účtu",
    );
    expect(stavBanky({ spolu: 3, napojene: 3, problem: 0, suhlas: 0 })).toEqual({
      ton: "ok",
      text: null,
    });
  });
});

describe("kusy", () => {
  it("rozdelí po 500", () => {
    const ids = Array.from({ length: 1201 }, (_, i) => i);
    expect(kusy(ids).map((k) => k.length)).toEqual([500, 500, 201]);
    expect(kusy([])).toEqual([]);
  });
});
