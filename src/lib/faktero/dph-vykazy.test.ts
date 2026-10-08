import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import {
  centy,
  hraniceObdobia,
  kontrolnyVykaz,
  odpocitajZdanenuZalohu,
  priznanie,
  suhrnnyVykaz,
  type PrijataFaktura,
  type Vstup,
  type VystavenaFaktura,
} from "./dph-vykazy";
import { kvNaXml, priznanieNaXml, rozdelNaRiadky, svNaXml } from "./dph-vykazy-xml";

const firma = {
  icDph: "SK2020123456",
  dic: "2020123456",
  nazov: "Testovacia firma s. r. o.",
  ulica: "Hlavná",
  cislo: "12",
  psc: "81101",
  obec: "Bratislava",
  stat: "Slovensko",
  tel: "0900123456",
  email: "firma@test.sk",
  danovyUrad: "Bratislava",
  konatel: "Ján Novák",
};

const obdobie = { rok: 2026, mesiac: 9 };

function faktura(p: Partial<VystavenaFaktura> = {}): VystavenaFaktura {
  return {
    cislo: "2026001",
    typ: "regular",
    datumDodania: "2026-09-10",
    odberatelIcDph: "SK1234567890",
    riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }],
    ...p,
  };
}

function prijata(p: Partial<PrijataFaktura> = {}): PrijataFaktura {
  return {
    cislo: "D2026-5",
    dodavatelIcDph: "SK9876543210",
    datumDodania: "2026-09-05",
    rezim: "tuzemsko",
    odpocet: true,
    riadky: [{ sadzba: 23, zaklad: 500, dan: 115 }],
    ...p,
  };
}

function vstup(p: Partial<Vstup> = {}): Vstup {
  return { obdobie, vystavene: [], prijate: [], doklady: [], ...p };
}

const validator = (nazov: string) => {
  const xsd = XmlDocument.fromBuffer(readFileSync(new URL(`./schemy/${nazov}`, import.meta.url)));
  return XsdValidator.fromDoc(xsd);
};

describe("obdobie", () => {
  it("mesiac aj štvrťrok majú správne hranice", () => {
    expect(hraniceObdobia({ rok: 2026, mesiac: 2 })).toEqual({ od: "2026-02-01", do: "2026-02-28" });
    expect(hraniceObdobia({ rok: 2028, mesiac: 2 }).do).toBe("2028-02-29");
    expect(hraniceObdobia({ rok: 2026, stvrtrok: 4 })).toEqual({
      od: "2026-10-01",
      do: "2026-12-31",
    });
  });
});

describe("kontrolný výkaz", () => {
  it("bežná faktúra ide do A.1 po sadzbách", () => {
    const kv = kontrolnyVykaz(
      vstup({
        vystavene: [
          faktura({
            riadky: [
              { sadzba: 23, zaklad: 1000, dan: 230 },
              { sadzba: 19, zaklad: 200, dan: 38 },
            ],
          }),
        ],
      }),
    );
    expect(kv.a1).toHaveLength(2);
    expect(kv.a1[0]).toMatchObject({ f: "2026001", z: 1000, d: 230, s: 23 });
  });

  it("zálohová faktúra nie je daňový doklad a do výkazu nevstúpi", () => {
    const kv = kontrolnyVykaz(vstup({ vystavene: [faktura({ typ: "proforma" })] }));
    expect(kv.a1).toHaveLength(0);
  });

  it("tuzemský prenos daňovej povinnosti ide do A.2, nie do A.1", () => {
    const kv = kontrolnyVykaz(
      vstup({
        vystavene: [
          faktura({ prenosDane: true, prenosTyp: "domestic_69", riadky: [{ sadzba: 0, zaklad: 5000, dan: 0 }] }),
        ],
      }),
    );
    expect(kv.a1).toHaveLength(0);
    expect(kv.a2[0]).toMatchObject({ odb: "SK1234567890", z: 5000 });
  });

  it("dodanie do EÚ do kontrolného výkazu nepatrí", () => {
    const kv = kontrolnyVykaz(
      vstup({
        vystavene: [faktura({ prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "tovar", odberatelIcDph: "CZ12345678" })],
      }),
    );
    expect(kv.a1).toHaveLength(0);
    expect(kv.a2).toHaveLength(0);
  });

  it("dobropis ide do C.1 a bez čísla pôvodnej faktúry sa ozve", () => {
    const sCislom = kontrolnyVykaz(
      vstup({
        vystavene: [
          faktura({
            cislo: "2026090",
            typ: "credit_note",
            opravujeCislo: "2026001",
            riadky: [{ sadzba: 23, zaklad: -100, dan: -23 }],
          }),
        ],
      }),
    );
    expect(sCislom.c1[0]).toMatchObject({ fo: "2026090", fp: "2026001", zr: -100, dr: -23 });

    const bez = kontrolnyVykaz(vstup({ vystavene: [faktura({ typ: "credit_note" })] }));
    expect(bez.c1).toHaveLength(0);
    expect(bez.vytky[0].text).toMatch(/pôvodnej faktúry/);
  });

  it("prijatá faktúra od platiteľa ide do B.2, samozdanenie do B.1", () => {
    const kv = kontrolnyVykaz(
      vstup({
        prijate: [
          prijata(),
          prijata({ cislo: "Z-9", rezim: "samozdanenie", dodavatelIcDph: "DE123456789" }),
        ],
      }),
    );
    expect(kv.b2).toHaveLength(1);
    expect(kv.b1[0]).toMatchObject({ f: "Z-9", dod: "DE123456789", o: 115 });
  });

  it("prijatá faktúra bez odpočtu sa do B.2 neuvádza", () => {
    const kv = kontrolnyVykaz(vstup({ prijate: [prijata({ odpocet: false })] }));
    expect(kv.b2).toHaveLength(0);
  });

  it("bločky idú sumárne do B.3.1, nad 3 000 € dane po dodávateľoch do B.3.2", () => {
    const maleDoklady = kontrolnyVykaz(
      vstup({
        doklady: [
          { odpocet: true, dodavatelIcDph: "SK1111111111", riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] },
          { odpocet: true, dodavatelIcDph: "SK2222222222", riadky: [{ sadzba: 23, zaklad: 50, dan: 11.5 }] },
        ],
      }),
    );
    expect(maleDoklady.b31).toEqual({ z: 150, d: 34.5, o: 34.5 });
    expect(maleDoklady.b32).toHaveLength(0);

    const velke = kontrolnyVykaz(
      vstup({
        doklady: [
          { odpocet: true, dodavatelIcDph: "SK1111111111", riadky: [{ sadzba: 23, zaklad: 10000, dan: 2300 }] },
          { odpocet: true, dodavatelIcDph: "SK2222222222", riadky: [{ sadzba: 23, zaklad: 10000, dan: 2300 }] },
        ],
      }),
    );
    expect(velke.b31).toBeNull();
    expect(velke.b32).toHaveLength(2);
  });

  it("ručné členenie KV: doklad B2 ide po riadkoch, X do výkazu nejde", () => {
    const kv = kontrolnyVykaz(
      vstup({
        doklady: [
          { odpocet: true, dodavatelIcDph: "SK1111111111", riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] },
          {
            odpocet: true,
            dodavatelIcDph: "SK2222222222",
            kv: "B2",
            cislo: "F2026/7",
            datum: "2026-03-05",
            riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }],
          },
          { odpocet: true, kv: "X", riadky: [{ sadzba: 23, zaklad: 50, dan: 11.5 }] },
        ],
        prijate: [prijata({ kv: "X" })],
      }),
    );
    expect(kv.b31).toEqual({ z: 100, d: 23, o: 23 });
    expect(kv.b2).toEqual([
      { dod: "SK2222222222", f: "F2026/7", den: "2026-03-05", z: 1000, d: 230, s: 23, o: 230 },
    ]);
  });

  it("pomer 50/50 kráti odpočet v priznaní aj v B.3", () => {
    const v = vstup({
      doklady: [{ odpocet: true, podielOdpoctu: 0.5, riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] }],
    });
    expect(kontrolnyVykaz(v).b31).toEqual({ z: 100, d: 23, o: 11.5 });
    expect(priznanie(v).r21).toBe(11.5);
  });

  it("doklad B2 bez IČ DPH dodávateľa je výtka, nie tichý riadok", () => {
    const kv = kontrolnyVykaz(
      vstup({ doklady: [{ odpocet: true, kv: "B2", cislo: "1", riadky: [{ sadzba: 23, zaklad: 10, dan: 2.3 }] }] }),
    );
    expect(kv.b2).toHaveLength(0);
    expect(kv.vytky[0].text).toMatch(/B.2/);
  });

  it("nevymožiteľná pohľadávka (§ 25a) a oprava odpočtu (§ 53b) — r. 26, 27, 29, C.1/C.2 s ONP a schéma", () => {
    const v = vstup({
      vystavene: [
        faktura({
          cislo: "OD2026001",
          typ: "credit_note",
          opravujeCislo: "2026001",
          oprava25a: true,
          riadky: [{ sadzba: 23, zaklad: -100, dan: -23 }],
        }),
      ],
      opravy53b: [
        {
          cislo: "FA-77",
          dodavatelIcDph: "SK2020000000",
          druh: "vratenie",
          den: "2026-09-10",
          riadky: [{ sadzba: 23, zaklad: -200, dan: -46 }],
        },
      ],
    });
    const kv = kontrolnyVykaz(v);
    expect(kv.c1).toEqual([
      expect.objectContaining({ fo: "OD2026001", fp: "2026001", zr: -100, dr: -23, onp: true }),
    ]);
    expect(kv.c2).toEqual([
      expect.objectContaining({ fo: "0", fp: "FA-77", zr: -200, dr: -46, or: -46, onp: true }),
    ]);
    const dp = priznanie(v);
    expect(dp.r26).toBe(-100);
    expect(dp.r27).toBe(-23);
    expect(dp.r24 ?? 0).toBe(0);
    expect(dp.r29).toBe(46);
    const xml = kvNaXml(kv, firma, { rok: 2026, mesiac: 9 });
    expect(xml).toContain('ONP="x"');
    const doc = XmlDocument.fromString(xml);
    expect(() => validator("kv_dph_2025.xsd").validate(doc)).not.toThrow();
    doc.dispose();
  });

  it("prejde oficiálnou schémou KVDPH 2025", () => {
    const kv = kontrolnyVykaz(
      vstup({
        vystavene: [
          faktura(),
          faktura({ cislo: "2026002", prenosDane: true, prenosTyp: "domestic_69", riadky: [{ sadzba: 0, zaklad: 300, dan: 0 }] }),
          faktura({ cislo: "2026003", typ: "credit_note", opravujeCislo: "2026001", riadky: [{ sadzba: 23, zaklad: -50, dan: -11.5 }] }),
        ],
        prijate: [prijata(), prijata({ cislo: "Z-9", rezim: "samozdanenie", dodavatelIcDph: "DE123456789" })],
        doklady: [{ odpocet: true, riadky: [{ sadzba: 23, zaklad: 20, dan: 4.6 }] }],
      }),
    );
    const doc = XmlDocument.fromString(kvNaXml(kv, firma, { rok: 2026, mesiac: 9 }));
    expect(() => validator("kv_dph_2025.xsd").validate(doc)).not.toThrow();
    doc.dispose();
  });
});

describe("súhrnný výkaz", () => {
  it("tovar, služba a trojstranný obchod majú svoj kód a sčítajú sa po partneroch", () => {
    const sv = suhrnnyVykaz(
      vstup({
        vystavene: [
          faktura({ prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "tovar", odberatelIcDph: "CZ12345678", riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }] }),
          faktura({ cislo: "2026002", prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "tovar", odberatelIcDph: "CZ12345678", riadky: [{ sadzba: 0, zaklad: 500, dan: 0 }] }),
          faktura({ cislo: "2026003", prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "sluzba", odberatelIcDph: "ATU12345678", riadky: [{ sadzba: 0, zaklad: 200, dan: 0 }] }),
        ],
      }),
    );
    expect(sv.riadky).toEqual([
      { kodStatu: "CZ", idCislo: "12345678", hodnota: 1500, kod: "" },
      { kodStatu: "AT", idCislo: "U12345678", hodnota: 200, kod: "2" },
    ]);
    expect(sv.celkom).toBe(1700);
  });

  it("dodanie do EÚ bez IČ DPH alebo bez druhu plnenia sa ozve", () => {
    const sv = suhrnnyVykaz(
      vstup({
        vystavene: [
          faktura({ prenosDane: true, prenosTyp: "eu_b2b", odberatelIcDph: null, euPlnenie: "tovar" }),
          faktura({ cislo: "2026002", prenosDane: true, prenosTyp: "eu_b2b", odberatelIcDph: "CZ12345678" }),
        ],
      }),
    );
    expect(sv.riadky).toHaveLength(0);
    expect(sv.vytky).toHaveLength(2);
  });

  it("prejde oficiálnou schémou SVDPH 2020", () => {
    const sv = suhrnnyVykaz(
      vstup({
        vystavene: [
          faktura({ prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "tovar", odberatelIcDph: "CZ12345678", riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }] }),
        ],
      }),
    );
    const doc = XmlDocument.fromString(svNaXml(sv, firma, obdobie));
    expect(() => validator("svdph20.xsd").validate(doc)).not.toThrow();
    doc.dispose();
  });
});

describe("priznanie k DPH", () => {
  it("základná sadzba ide do r03/r04, znížená do r01/r02", () => {
    const p = priznanie(
      vstup({
        vystavene: [
          faktura({
            riadky: [
              { sadzba: 23, zaklad: 1000, dan: 230 },
              { sadzba: 19, zaklad: 200, dan: 38 },
            ],
          }),
        ],
      }),
    );
    expect(p.r03).toBe(1000);
    expect(p.r04).toBe(230);
    expect(p.r01).toBe(200);
    expect(p.r02).toBe(38);
    expect(p.r17).toBe(268);
  });

  it("dodanie tovaru do EÚ ide do r13 a r14, služba do priznania vôbec", () => {
    const p = priznanie(
      vstup({
        vystavene: [
          faktura({ prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "tovar", riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }] }),
          faktura({ cislo: "2026002", prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "sluzba", riadky: [{ sadzba: 0, zaklad: 500, dan: 0 }] }),
        ],
      }),
    );
    expect(p.r13).toBe(1000);
    expect(p.r14).toBe(1000);
    expect(p.r15).toBeUndefined();
  });

  it("samozdanenie sa prizná aj odpočíta, takže výsledok je nula", () => {
    const p = priznanie(
      vstup({ prijate: [prijata({ rezim: "samozdanenie", riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }] })] }),
    );
    // Tlačivo od 07/2025: § 69 v základnej sadzbe ide do r09b/r10b.
    expect(p.r09b).toBe(1000);
    expect(p.r10b).toBe(230);
    expect(p.r09).toBeUndefined();
    expect(p.r19).toBe(230);
    expect(p.r32).toBe(0);
  });

  it("staré tlačivo (do 06/2025) má pre § 69 aj znížené sadzby spoločné riadky", () => {
    const p = priznanie({
      ...vstup({
        vystavene: [
          faktura({ datumDodania: "2025-03-10", riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }, { sadzba: 5, zaklad: 100, dan: 5 }] }),
        ],
        prijate: [prijata({ datumDodania: "2025-03-10", rezim: "samozdanenie", riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }] })],
      }),
      obdobie: { rok: 2025, mesiac: 3 },
    });
    expect(p.r01).toBe(200);
    expect(p.r02).toBe(24);
    expect(p.r01a).toBeUndefined();
    expect(p.r09).toBe(1000);
    expect(p.r09b).toBeUndefined();
  });

  it("nové tlačivo delí znížené sadzby: 19 % do r01/r02, 5 % do r01a/r02a, aj pri odpočte", () => {
    const p = priznanie(
      vstup({
        vystavene: [faktura({ riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }, { sadzba: 5, zaklad: 200, dan: 10 }, { sadzba: 23, zaklad: 300, dan: 69 }] })],
        prijate: [prijata({ riadky: [{ sadzba: 19, zaklad: 10, dan: 1.9 }, { sadzba: 5, zaklad: 20, dan: 1 }] })],
        doklady: [{ odpocet: true, datum: "2026-09-05", riadky: [{ sadzba: 5, zaklad: 2, dan: 0.1 }] }],
      }),
    );
    expect([p.r01, p.r02, p.r01a, p.r02a, p.r03, p.r04]).toEqual([100, 19, 200, 10, 300, 69]);
    expect([p.r18, p.r18a, p.r20, p.r20a]).toEqual([1.9, 1.1, 1.9, 1.1]);
    expect(p.r17).toBe(98);
    expect(p.r32).toBe(centy(98 - 1.9 - 1.1));
  });

  it("odpočet znižuje daň a nadmerný odpočet ide do r33", () => {
    const p = priznanie(
      vstup({
        vystavene: [faktura({ riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] })],
        prijate: [prijata({ riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }] })],
      }),
    );
    expect(p.r19).toBe(230);
    expect(p.r21).toBe(230);
    expect(p.r33).toBe(-207);
    expect(p.r32).toBeUndefined();
  });

  it("vystavený dobropis znižuje základ aj daň cez r24 a r25", () => {
    const p = priznanie(
      vstup({
        vystavene: [
          faktura({ typ: "credit_note", opravujeCislo: "2026001", riadky: [{ sadzba: 23, zaklad: -100, dan: -23 }] }),
        ],
      }),
    );
    expect(p.r24).toBe(-100);
    expect(p.r25).toBe(-23);
    expect(p.r33).toBe(-23);
  });

  it("ručné riadky sa pripočítajú a premietnu do výsledku", () => {
    const p = priznanie(
      vstup({ vystavene: [faktura({ riadky: [{ sadzba: 23, zaklad: 1000, dan: 230 }] })] }),
      { r22: 30, r34: 50 },
    );
    expect(p.r22).toBe(30);
    expect(p.r32).toBe(230);
    expect(p.r35).toBe(180);
  });

  it("od 07/2025 prejde oficiálnou schémou DPH2025", () => {
    const p = priznanie(vstup({ vystavene: [faktura()], prijate: [prijata()] }));
    const xml = priznanieNaXml(p, firma, obdobie, { datum: "2026-10-20" });
    expect(xml).toContain("<splneniePodmienok>0</splneniePodmienok>");
    expect(xml).toContain("<rdp>1</rdp>");
    const doc = XmlDocument.fromString(xml);
    expect(() => validator("dph2025.xsd").validate(doc)).not.toThrow();
    doc.dispose();
  });

  it("za staršie obdobie prejde schémou DPHv21", () => {
    const stare = { rok: 2025, mesiac: 3 };
    const p = priznanie({ ...vstup({ vystavene: [faktura({ datumDodania: "2025-03-10" })] }), obdobie: stare });
    const doc = XmlDocument.fromString(priznanieNaXml(p, firma, stare, { datum: "2025-04-20" }));
    expect(() => validator("dph2021.xsd").validate(doc)).not.toThrow();
    doc.dispose();
  });
});

describe("názov firmy v tlačive", () => {
  it("rozdelí sa na štyri riadky a nič sa nestratí", () => {
    const r = rozdelNaRiadky("Veľmi dlhý názov spoločnosti s ručením obmedzeným a prívlastkom", 4, 20);
    expect(r).toHaveLength(4);
    expect(r.join(" ").trim().startsWith("Veľmi dlhý názov")).toBe(true);
  });
});

describe("daňový doklad k prijatej platbe", () => {
  const riadok = (sadzba: number, zaklad: number) => ({
    sadzba,
    zaklad,
    dan: Math.round(zaklad * (sadzba / 100) * 100) / 100,
  });

  it("vyúčtovanie priznáva len rozdiel oproti zdanenej zálohe", () => {
    const vysledok = odpocitajZdanenuZalohu([riadok(23, 1000)], [riadok(23, 400)]);
    expect(vysledok).toEqual([{ sadzba: 23, zaklad: 600, dan: 138 }]);
  });

  it("záloha na celé plnenie nechá vyúčtovanie bez dane", () => {
    expect(odpocitajZdanenuZalohu([riadok(23, 1000)], [riadok(23, 1000)])).toEqual([]);
  });

  it("odpočítava po sadzbách, nie dokopy", () => {
    const vysledok = odpocitajZdanenuZalohu(
      [riadok(23, 1000), riadok(19, 500)],
      [riadok(23, 300)],
    );
    expect(vysledok).toContainEqual({ sadzba: 23, zaklad: 700, dan: 161 });
    expect(vysledok).toContainEqual({ sadzba: 19, zaklad: 500, dan: 95 });
  });

  it("sadzba, ktorá na vyúčtovaní nie je, sa ozve záporným riadkom", () => {
    const vysledok = odpocitajZdanenuZalohu([riadok(23, 100)], [riadok(19, 50)]);
    expect(vysledok).toContainEqual({ sadzba: 19, zaklad: -50, dan: -9.5 });
  });

  it("bez zálohy sa nič nemení", () => {
    const riadky = [riadok(23, 100)];
    expect(odpocitajZdanenuZalohu(riadky, [])).toBe(riadky);
  });

  it("doklad k prijatej platbe do priznania vstupuje, zálohová faktúra nie", () => {
    const sDokladom = priznanie(
      vstup({
        vystavene: [
          faktura({ cislo: "DDP20260001", typ: "advance_payment", riadky: [riadok(23, 400)] }),
        ],
      }),
    );
    expect(sDokladom.r03).toBe(400);
    expect(sDokladom.r04).toBe(92);

    const soZalohou = priznanie(
      vstup({
        vystavene: [
          faktura({ cislo: "ZF20260001", typ: "proforma", riadky: [riadok(23, 400)] }),
        ],
      }),
    );
    expect(soZalohou.r03).toBeUndefined();
  });
});

describe("ťarchopis (zvýšenie ceny)", () => {
  const tarchopis = faktura({
    cislo: "2026095",
    typ: "debit_note",
    opravujeCislo: "2026001",
    riadky: [{ sadzba: 23, zaklad: 50, dan: 11.5 }],
  });
  it("priznanie: r24 a r25 so znamienkom plus", () => {
    const p = priznanie(vstup({ vystavene: [tarchopis] }));
    expect(p.r24).toBe(50);
    expect(p.r25).toBe(11.5);
  });
  it("kontrolný výkaz: C.1 s väzbou na pôvodnú faktúru, kladne", () => {
    const kv = kontrolnyVykaz(vstup({ vystavene: [tarchopis] }));
    expect(kv.c1[0]).toMatchObject({ fo: "2026095", fp: "2026001", zr: 50, dr: 11.5 });
  });
  it("súhrnný výkaz: hodnotu zvyšuje", () => {
    const sv = suhrnnyVykaz(
      vstup({
        vystavene: [
          faktura({ odberatelIcDph: "CZ12345678", prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "sluzba", riadky: [{ sadzba: 0, zaklad: 100, dan: 0 }] }),
          { ...tarchopis, odberatelIcDph: "CZ12345678", prenosDane: true, prenosTyp: "eu_b2b", euPlnenie: "sluzba", riadky: [{ sadzba: 0, zaklad: 20, dan: 0 }] },
        ],
      }),
    );
    expect(sv.celkom).toBe(120);
  });
});
