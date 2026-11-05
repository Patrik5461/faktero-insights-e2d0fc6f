import { describe, expect, it } from "vitest";
import {
  jeKodKv,
  kvKodFirmy,
  moznostiKv,
  nahlad,
  normalizujRiadky,
  planUlozenia,
  ponukaKvFirmy,
  rozoberOdpovedAi,
  rozpoznajDruh,
  spojRiadky,
  stavRiadku,
  typDokladuKv,
  type ExistujuciZaznam,
} from "./ciselnik-obrazok";
import { kvPreVykaz, kvSekcia, kvVystavenehoDokladu, kvPrijatehoDokladu } from "./kv-urcenie";
import { kvVystavenehoPrePohodu, kvPrijatehoPrePohodu } from "./pohoda-kv";
import { kvVystavenej } from "./dph-vykazy";
import { resolveVatClassification } from "./clenenie-vystavenej";
import { KV_19 } from "./ciselnik-obrazok.testdata";



const COMPANY = "00000000-0000-0000-0000-000000000001";

const odpoved19 = JSON.stringify({ druh: "kv_clenenie", riadky: KV_19.map((r) => ({ ...r, ucet_md: null, ucet_d: null, typ_dokladu: null })) });

describe("validácia odpovede AI", () => {
  it("prečíta všetkých 19 riadkov KV presne", () => {
    const r = rozoberOdpovedAi(odpoved19, "auto");
    expect(r.druh).toBe("kv_clenenie");
    expect(r.riadky.map((x) => x.kod)).toEqual(KV_19.map((x) => x.kod));
    expect(r.riadky.every((x) => !x.podozrivy)).toBe(true);
    expect(r.riadky[0]).toMatchObject({ popis: "Dodanie tovarov a služieb", kategoria: "A1 Dodanie - Vydané faktúry" });
  });

  it("zvládne ```json obal, holé pole a prázdne polia = null", () => {
    const r = rozoberOdpovedAi('```json\n[{"kod":" B2 ","popis":"","kategoria":null}]\n```', "kv_clenenie");
    expect(r.riadky).toEqual([
      expect.objectContaining({ kod: "B2", popis: null, kategoria: null, ucet_md: null, typ_dokladu: "prijate" }),
    ]);
  });

  it("neplatný JSON aj tvar je chyba, riadok bez kódu sa vynechá", () => {
    expect(() => rozoberOdpovedAi("nič", "auto")).toThrow(/čitateľný/);
    expect(() => rozoberOdpovedAi('{"x":1}', "auto")).toThrow(/tvare/);
    const r = rozoberOdpovedAi('{"riadky":[{"kod":""},{"popis":"bez kódu"},{"kod":"A1"}]}', "kv_clenenie");
    expect(r.riadky.map((x) => x.kod)).toEqual(["A1"]);
    expect(r.vynechanych).toBe(2);
  });

  it("KV: povolené len oficiálne sekcie, ostatné sú podozrivé", () => {
    for (const k of KV_19) expect(jeKodKv(k.kod)).toBe(true);
    for (const k of ["X1", "A3", "B4", "E1", "a1", "UD", "D3", "A1X"]) expect(jeKodKv(k), k).toBe(false);
    const r = normalizujRiadky([{ kod: "UD" }, { kod: "A1" }], "kv_clenenie");
    expect(r.find((x) => x.kod === "UD")?.podozrivy).toBe(true);
    expect(r.find((x) => x.kod === "A1")?.podozrivy).toBe(false);
  });

  it("zachová veľkosť písmen a pomlčky, duplicitu vynechá", () => {
    const r = normalizujRiadky([{ kod: "UDpdp" }, { kod: "C2B1-0" }, { kod: "UDpdp" }], "clenenie_dph");
    expect(r.map((x) => x.kod)).toEqual(["UDpdp", "C2B1-0"]);
  });

  it("rozpozná druh automaticky", () => {
    expect(rozpoznajDruh(KV_19)).toBe("kv_clenenie");
    expect(rozpoznajDruh([{ kod: "1Fv", ucet_md: "311", ucet_d: "604" }, { kod: "2Fp", ucet_md: "501", ucet_d: "321" }])).toBe(
      "predkontacia",
    );
    expect(rozpoznajDruh([{ kod: "UD" }, { kod: "PD" }])).toBe("clenenie_dph");
  });
});

describe("odvodenie typ_dokladu", () => {
  it("A*, C1*, D* = vydané; B*, C2* = prijaté; KN = všetky", () => {
    const ocak: Record<string, string | null> = {
      A1: "vydane", A2CN: "vydane", A2IO: "vydane", A2MT: "vydane", A2SP: "vydane",
      B1: "prijate", "B1-0": "prijate", B2: "prijate", B3: "prijate",
      C1: "vydane", C1CN: "vydane", C1IO: "vydane", C1MT: "vydane",
      C2: "prijate", C2B1: "prijate", "C2B1-0": "prijate",
      D1: "vydane", D2: "vydane", KN: null,
    };
    for (const [k, v] of Object.entries(ocak)) expect(typDokladuKv(k), k).toBe(v);
  });

  it("KV ignoruje typ od AI, členenie DPH ho berie z textu", () => {
    expect(normalizujRiadky([{ kod: "B2", typ_dokladu: "vydane" }], "kv_clenenie")[0].typ_dokladu).toBe("prijate");
    expect(normalizujRiadky([{ kod: "UD", typ_dokladu: "Výstup" }], "clenenie_dph")[0].typ_dokladu).toBe("vydane");
    expect(normalizujRiadky([{ kod: "1Fv", typ_dokladu: "vydane" }], "predkontacia")[0].typ_dokladu).toBe(null);
  });
});

const ex = (o: Partial<ExistujuciZaznam> & { kod: string; zdroj: string }): ExistujuciZaznam => ({
  id: `id-${o.kod}-${o.zdroj}`,
  druh: "kv_clenenie",
  agenda: "",
  popis: null,
  kategoria: null,
  ucet_md: null,
  ucet_d: null,
  typ_dokladu: null,
  ...o,
});

describe("stavy náhľadu", () => {
  const [a1, a2cn, b2, c2] = normalizujRiadky(
    [
      { kod: "A1", popis: "Dodanie", kategoria: "A1 Dodanie - Vydané faktúry" },
      { kod: "A2CN", popis: "Kovy" },
      { kod: "B2", popis: "Odpočet" },
      { kod: "C2", popis: "Opravy" },
    ],
    "kv_clenenie",
  );
  const existujuce = [
    ex({ kod: "A1", zdroj: "obrazok", popis: "Dodanie", kategoria: "A1 Dodanie - Vydané faktúry", typ_dokladu: "vydane" }),
    ex({ kod: "A2CN", zdroj: "subor", popis: "Staré" }),
    ex({ kod: "B2", zdroj: "pohoda", popis: "Z Pohody" }),
    ex({ kod: "C2", zdroj: "rucne", popis: "Ručne" }),
    ex({ kod: "B3", zdroj: "obrazok", druh: "clenenie_dph" }),
  ];

  it("Nový / Zmena / Existuje (z Pohody) / Existuje (ručne) / Bez zmeny", () => {
    expect(stavRiadku(a1, "kv_clenenie", existujuce)).toBe("bez_zmeny");
    expect(stavRiadku(a2cn, "kv_clenenie", existujuce)).toBe("zmena");
    expect(stavRiadku(b2, "kv_clenenie", existujuce)).toBe("existuje_pohoda");
    expect(stavRiadku(c2, "kv_clenenie", existujuce)).toBe("existuje_rucne");
    const [b3] = normalizujRiadky([{ kod: "B3" }], "kv_clenenie");
    // Rovnaký kód v inom druhu číselníka nie je zhoda.
    expect(stavRiadku(b3, "kv_clenenie", existujuce)).toBe("novy");
  });

  it("predvolene zaškrtnuté len nové a zmenené, nie chránené ani podozrivé", () => {
    const n = nahlad([a1, a2cn, b2, c2, ...normalizujRiadky([{ kod: "B3" }, { kod: "ZZ" }], "kv_clenenie")], "kv_clenenie", existujuce);
    expect(Object.fromEntries(n.map((r) => [r.kod, r.vybrany]))).toEqual({
      A1: false,
      A2CN: true,
      B2: false,
      C2: false,
      B3: true,
      ZZ: false,
    });
  });

  it("prázdne pole z obrázka nič nezmení (žiadna Zmena)", () => {
    const [r] = normalizujRiadky([{ kod: "A1", popis: null }], "kv_clenenie");
    expect(stavRiadku(r, "kv_clenenie", existujuce)).toBe("bez_zmeny");
  });
});

describe("uloženie: upsert bez duplicít a bez prepisu Pohody/ručných", () => {
  const riadky = normalizujRiadky(KV_19, "kv_clenenie");

  it("prvý import založí 19, opakovaný 0 nových", () => {
    const p1 = planUlozenia(COMPANY, "kv_clenenie", riadky, []);
    expect(p1.vlozit).toHaveLength(19);
    expect(p1.vlozit.every((r) => r.zdroj === "obrazok" && r.agenda === "" && r.company_id === COMPANY)).toBe(true);
    expect(p1.vlozit.find((r) => r.kod === "B1-0")).toMatchObject({
      typ_dokladu: "prijate",
      druhy_dokladov: ["prijata", "prijata_pdp", "doklady"],
    });
    expect(p1.vlozit.find((r) => r.kod === "KN")).toMatchObject({ typ_dokladu: null, druhy_dokladov: [] });
    // Simulácia DB po prvom importe.
    const db: ExistujuciZaznam[] = p1.vlozit.map((r, i) => ({ ...r, id: `x${i}` }));
    const p2 = planUlozenia(COMPANY, "kv_clenenie", riadky, db);
    expect(p2.vlozit).toHaveLength(0);
    expect(p2.upravit).toHaveLength(0);
    expect(p2.preskocene).toHaveLength(19);
  });

  it("záznamy z Pohody a ručné ostanú bez zaškrtnutia nezmenené, zdroj sa nikdy nemení", () => {
    const db = [
      ex({ kod: "B2", zdroj: "pohoda", popis: "Z Pohody" }),
      ex({ kod: "C2", zdroj: "rucne", popis: "Ručne" }),
      ex({ kod: "A1", zdroj: "subor", popis: "Zo súboru" }),
    ];
    const p = planUlozenia(COMPANY, "kv_clenenie", riadky, db);
    expect(p.upravit.map((u) => u.id)).toEqual(["id-A1-subor"]);
    expect(p.upravit[0].zmeny).not.toHaveProperty("zdroj");
    expect(p.preskocene.filter((x) => x.dovod === "chraneny").map((x) => x.kod).sort()).toEqual(["B2", "C2"]);
    expect(p.vlozit.map((r) => r.kod)).not.toContain("B2");
    expect(p.vlozit.map((r) => r.kod)).not.toContain("C2");
  });

  it("chránený kód sa prepíše len na výslovné zaškrtnutie (prepisat), zdroj ostane", () => {
    const db = [ex({ kod: "B2", zdroj: "pohoda", popis: "Z Pohody" })];
    const p = planUlozenia(
      COMPANY,
      "kv_clenenie",
      riadky.map((r) => (r.kod === "B2" ? { ...r, prepisat: true } : r)),
      db,
    );
    const u = p.upravit.find((x) => x.id === "id-B2-pohoda");
    expect(u?.zmeny).toMatchObject({ popis: "Prijaté faktúry s odpočtom" });
    expect(u?.zmeny).not.toHaveProperty("zdroj");
  });

  it("kód Pohody v inej agende sa páruje (company + druh + kód), neduplikuje sa", () => {
    const db = [ex({ kod: "UD", zdroj: "pohoda", druh: "clenenie_dph", agenda: "inland" })];
    const p = planUlozenia(COMPANY, "clenenie_dph", normalizujRiadky([{ kod: "UD", popis: "Tuzemsko" }], "clenenie_dph"), db);
    expect(p.vlozit).toHaveLength(0);
    expect(p.upravit).toHaveLength(0);
  });

  it("podozrivý KV kód sa neuloží ani zaškrtnutý", () => {
    const p = planUlozenia(COMPANY, "kv_clenenie", normalizujRiadky([{ kod: "ZZ" }], "kv_clenenie"), []);
    expect(p.vlozit).toHaveLength(0);
    expect(p.preskocene).toEqual([{ kod: "ZZ", dovod: "neplatny" }]);
  });

  it("viac obrázkov: rovnaký kód len raz", () => {
    expect(spojRiadky([{ kod: "A1" }, { kod: "B2" }], [{ kod: "B2" }, { kod: "KN" }]).map((r) => r.kod)).toEqual([
      "A1",
      "B2",
      "KN",
    ]);
  });
});

describe("ponuka KV z číselníka firmy a fallback", () => {
  const zaznamy = normalizujRiadky(KV_19, "kv_clenenie").map((r) => ({ ...r, druh: "kv_clenenie", aktivne: true }));

  it("vydané ponúknu A*, C1*, D* a KN; prijaté B*, C2* a KN", () => {
    const v = ponukaKvFirmy(zaznamy, "vydane").map((k) => k.kod);
    expect(v).toEqual(["A1", "A2CN", "A2IO", "A2MT", "A2SP", "C1", "C1CN", "C1IO", "C1MT", "D1", "D2", "KN"]);
    const p = ponukaKvFirmy(zaznamy, "prijate").map((k) => k.kod);
    expect(p).toEqual(["B1", "B1-0", "B2", "B3", "C2", "C2B1", "C2B1-0", "KN"]);
  });

  it("bez číselníka systémový zoznam; uložená hodnota mimo ponuky sa pridá", () => {
    const sys = [{ kod: "B2", nazov: "B.2" }, { kod: "X", nazov: "Nezahŕňať" }];
    expect(moznostiKv([], sys)).toEqual(sys);
    expect(moznostiKv([{ kod: "B2", nazov: "B2" }], sys).map((k) => k.kod)).toEqual(["B2", "X"]);
    expect(moznostiKv([{ kod: "KN", nazov: "KN" }], sys).map((k) => k.kod)).toEqual(["KN"]);
    expect(moznostiKv([], sys, "C2B1").map((k) => k.kod)).toEqual(["B2", "X", "C2B1"]);
  });
});

describe("podkódy: presne do Pohody, sekcia do výkazu", () => {
  it("sekcia výkazu", () => {
    expect(kvSekcia("A2CN")).toBe("A2");
    expect(kvSekcia("B1-0")).toBe("B1");
    expect(kvSekcia("C2B1-0")).toBe("C2");
    expect(kvSekcia("C1IO")).toBe("C1");
    expect(kvSekcia("KN")).toBe("X");
    expect(kvSekcia("D2")).toBe("D2");
    expect(kvSekcia("ZZ")).toBe(null);
    expect(kvPreVykaz("A2SP")).toBe("A2");
    expect(kvVystavenej("A2MT")).toBe("A2");
    expect(kvVystavenej("KN")).toBe("X");
  });

  const zaklad = { cz: false, maDph: true, icDphOdberatela: "SK2020000000" };

  it("vystavená: Pohoda dostane A2CN presne, výkaz A2", () => {
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", kvDokladu: "A2CN", tuzemskePdp: true })).toBe("A2CN");
    expect(kvVystavenehoDokladu({ ...zaklad, typ: "regular", kvDokladu: kvVystavenej("A2CN"), tuzemskePdp: true })).toBe("A2");
    // Opravný doklad s A2CN rozhodne automatika (C.1), ako pri A2.
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "credit_note", kvDokladu: "A2CN", tuzemskePdp: true })).toBe("C1");
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "credit_note", kvDokladu: "C1IO", tuzemskePdp: true })).toBe("C1IO");
    // Neznámy kód = automaticky.
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", kvDokladu: "ZZ" })).toBe("A1");
  });

  it("prijatá: Pohoda dostane B1-0 presne, výkaz B1; KN do výkazu nevojde", () => {
    const p = { cz: false, blocek: false, dobropis: false, pdp: true, maDph: true };
    expect(kvPrijatehoPrePohodu({ ...p, kvDokladu: "B1-0" })).toBe("B1-0");
    expect(kvPrijatehoDokladu({ ...p, kvDokladu: kvPreVykaz("B1-0") })).toBe("B1");
    expect(kvPrijatehoDokladu({ ...p, kvDokladu: kvPreVykaz("KN") })).toBe("");
  });
});

describe("resolveVatClassification s číselníkom KV firmy", () => {
  const firma = { country: "SK", vat_payer: true, vat_scheme: "sk_platitel", ic_dph: "SK2020000001" };
  const faktura = { type: "regular", vat_total: 23, customer_ic_dph: "SK2020000000", customer_ico: "12345678" };
  const vydane = ponukaKvFirmy(
    normalizujRiadky(KV_19, "kv_clenenie").map((r) => ({ ...r, druh: "kv_clenenie" })),
    "vydane",
  ).map((k) => k.kod);

  it("bez číselníka systém (A1), s číselníkom kód firmy", () => {
    expect(resolveVatClassification(firma, faktura).kv_clenenie).toBe("A1");
    expect(resolveVatClassification(firma, faktura, { kvCiselnik: vydane }).kv_clenenie).toBe("A1");
  });

  it("jediný podkód sekcie sa použije, viac podkódov = systémový kód", () => {
    expect(kvKodFirmy("A2", ["A1", "A2SP"])).toBe("A2SP");
    expect(kvKodFirmy("A2", vydane)).toBe("A2");
    expect(kvKodFirmy("C1", ["C1IO"])).toBe("C1IO");
    expect(kvKodFirmy("A1", [])).toBe("A1");
    expect(kvKodFirmy(null, vydane)).toBe(null);
    const pdp = { ...faktura, reverse_charge: true, reverse_charge_type: "domestic_69", vat_total: 0 };
    expect(resolveVatClassification(firma, pdp, { kvCiselnik: ["A1", "A2SP", "KN"] }).kv_clenenie).toBe("A2SP");
  });
});
