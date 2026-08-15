import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cakajuceFaktury,
  jeCislovanieDopredu,
  nastavCislovanieDopredu,
  nepouziteCisla,
  odosliCakajuceFaktury,
  odstranFakturu,
  pocetCakajucichFaktur,
  rezervacie,
  ulozRezervacie,
  vezmiRezervaciu,
  volnychCisel,
  vycistiFaktury,
  zabudniRezervacie,
  zaradFakturu,
  type VstupFaktury,
} from "./faktury-fronta";

/**
 * Faktúry vystavené bez signálu.
 *
 * Testuje sa to, čo pri zlom správaní stojí peniaze alebo dôveru: že sa faktúra
 * nestratí, že sa neodošle dvakrát, a že sa rezervované číslo nepridelí dvom
 * faktúram.
 */

beforeAll(() => {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
});

const FIRMA = "f1";

const VSTUP: VstupFaktury = {
  company_id: FIRMA,
  customer_id: "c1",
  issue_date: "2026-08-15",
  due_date: "2026-08-29",
  payment_method: "bank_transfer",
  currency: "EUR",
  notes: null,
  items: [
    { name: "Oprava", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, product_id: null },
  ],
};

const POPIS = { odberatel: "Ukážkový odberateľ s.r.o.", spolu: 123 };

function oDni(dni: number): string {
  return new Date(Date.now() + dni * 86_400_000).toISOString();
}

beforeEach(() => {
  localStorage.clear();
  vycistiFaktury();
});

describe("fronta faktúr", () => {
  it("odložená faktúra prežije a dá sa vypísať", () => {
    const z = zaradFakturu(FIRMA, VSTUP, POPIS);
    expect(pocetCakajucichFaktur(FIRMA)).toBe(1);
    const zoznam = cakajuceFaktury(FIRMA);
    expect(zoznam[0].id).toBe(z.id);
    // Meno a suma sa odkladajú spolu s faktúrou — bez signálu sa nemá odkiaľ
    // dopýtať, kto to bol.
    expect(zoznam[0].odberatel).toBe(POPIS.odberatel);
    expect(zoznam[0].spolu).toBe(123);
  });

  it("bez zapnutého číslovania dopredu nemá faktúra číslo", () => {
    const z = zaradFakturu(FIRMA, VSTUP, POPIS);
    expect(z.cislo).toBeNull();
  });

  it("faktúry rôznych firiem sa nemiešajú", () => {
    zaradFakturu(FIRMA, VSTUP, POPIS);
    expect(pocetCakajucichFaktur("f2")).toBe(0);
  });

  it("po odoslaní zo fronty zmizne", async () => {
    zaradFakturu(FIRMA, VSTUP, POPIS);
    const posli = vi.fn(async () => ({ invoice_number: "20260007" }));

    const r = await odosliCakajuceFaktury(FIRMA, posli);

    expect(r).toEqual({ odoslane: 1, zlyhane: 0 });
    expect(pocetCakajucichFaktur(FIRMA)).toBe(0);
  });

  it("posiela sa s `external_id`, aby zo sebe nevznikli dve faktúry", async () => {
    const z = zaradFakturu(FIRMA, VSTUP, POPIS);
    const posli = vi.fn(async () => ({ invoice_number: "20260007" }));

    await odosliCakajuceFaktury(FIRMA, posli);

    // Server podľa neho pozná, že tú istú faktúru už raz dostal — presne to sa
    // stane, keď sa odpoveď stratí cestou a fronta pošle znova.
    expect(posli).toHaveBeenCalledWith(expect.objectContaining({ external_id: z.id }));
  });

  it("keď odoslanie zlyhá, faktúra ostane aj s dôvodom", async () => {
    zaradFakturu(FIRMA, VSTUP, POPIS);
    const posli = vi.fn(async () => {
      throw new Error("Server neodpovedal");
    });

    const r = await odosliCakajuceFaktury(FIRMA, posli);

    expect(r).toEqual({ odoslane: 0, zlyhane: 1 });
    const [f] = cakajuceFaktury(FIRMA);
    expect(f.pokusy).toBe(1);
    expect(f.chyba).toMatch(/neodpovedal/);
  });

  it("zmazanie zo fronty funguje", () => {
    const z = zaradFakturu(FIRMA, VSTUP, POPIS);
    odstranFakturu(FIRMA, z.id);
    expect(pocetCakajucichFaktur(FIRMA)).toBe(0);
  });
});

describe("rezervované čísla", () => {
  const CISLA = [
    {
      invoice_number: "20260007",
      sequence_number: 7,
      issue_date: "2026-08-15",
      expires_at: oDni(14),
    },
    {
      invoice_number: "20260008",
      sequence_number: 8,
      issue_date: "2026-08-15",
      expires_at: oDni(14),
    },
  ];

  it("uložia sa a počítajú sa ako voľné", () => {
    ulozRezervacie(FIRMA, CISLA);
    expect(volnychCisel(FIRMA)).toBe(2);
    expect(nepouziteCisla(FIRMA)).toEqual(["20260007", "20260008"]);
  });

  it("rovnaké číslo sa nepridá dvakrát", () => {
    ulozRezervacie(FIRMA, CISLA);
    ulozRezervacie(FIRMA, CISLA);
    expect(volnychCisel(FIRMA)).toBe(2);
  });

  it("berie sa najnižšie a druhýkrát už nie", () => {
    ulozRezervacie(FIRMA, CISLA);
    expect(vezmiRezervaciu(FIRMA)).toBe("20260007");
    // Toto je to podstatné: to isté číslo sa nesmie dostať na dve faktúry.
    expect(vezmiRezervaciu(FIRMA)).toBe("20260008");
    expect(vezmiRezervaciu(FIRMA)).toBeNull();
    expect(volnychCisel(FIRMA)).toBe(0);
  });

  it("vypršané číslo sa neponúka", () => {
    ulozRezervacie(FIRMA, [{ ...CISLA[0], expires_at: oDni(-1) }]);
    expect(rezervacie(FIRMA)).toHaveLength(0);
    expect(vezmiRezervaciu(FIRMA)).toBeNull();
  });

  it("so zapnutým číslovaním dostane odložená faktúra číslo hneď", () => {
    nastavCislovanieDopredu(FIRMA, true);
    ulozRezervacie(FIRMA, CISLA);

    const z = zaradFakturu(FIRMA, VSTUP, POPIS);

    expect(z.cislo).toBe("20260007");
    expect(volnychCisel(FIRMA)).toBe(1);
  });

  it("zapnuté číslovanie bez zásoby faktúru nezablokuje", () => {
    // Zásoba sa minula a signál nie je. Faktúra sa musí odložiť tak či tak —
    // len bez čísla.
    nastavCislovanieDopredu(FIRMA, true);
    const z = zaradFakturu(FIRMA, VSTUP, POPIS);
    expect(z.cislo).toBeNull();
    expect(pocetCakajucichFaktur(FIRMA)).toBe(1);
  });

  it("po odoslaní sa použité číslo prestane držať", async () => {
    nastavCislovanieDopredu(FIRMA, true);
    ulozRezervacie(FIRMA, CISLA);
    zaradFakturu(FIRMA, VSTUP, POPIS);

    await odosliCakajuceFaktury(FIRMA, async () => ({ invoice_number: "20260007" }));

    expect(rezervacie(FIRMA).map((r) => r.invoice_number)).toEqual(["20260008"]);
  });

  it("rezervované číslo ide na server s faktúrou", async () => {
    nastavCislovanieDopredu(FIRMA, true);
    ulozRezervacie(FIRMA, CISLA);
    zaradFakturu(FIRMA, VSTUP, POPIS);
    const posli = vi.fn(async () => ({ invoice_number: "20260007" }));

    await odosliCakajuceFaktury(FIRMA, posli);

    expect(posli).toHaveBeenCalledWith(expect.objectContaining({ reserved_number: "20260007" }));
  });

  it("nastavenie sa pamätá a vypnutie ho zruší", () => {
    expect(jeCislovanieDopredu(FIRMA)).toBe(false);
    nastavCislovanieDopredu(FIRMA, true);
    expect(jeCislovanieDopredu(FIRMA)).toBe(true);
    nastavCislovanieDopredu(FIRMA, false);
    expect(jeCislovanieDopredu(FIRMA)).toBe(false);
  });

  it("odhlásenie nesmie nechať v telefóne cudzie čísla ani frontu", () => {
    nastavCislovanieDopredu(FIRMA, true);
    ulozRezervacie(FIRMA, CISLA);
    zaradFakturu(FIRMA, VSTUP, POPIS);

    vycistiFaktury();

    expect(pocetCakajucichFaktur(FIRMA)).toBe(0);
    expect(volnychCisel(FIRMA)).toBe(0);
    expect(jeCislovanieDopredu(FIRMA)).toBe(false);
  });

  it("zabudnutie rezervácií nechá frontu na pokoji", () => {
    ulozRezervacie(FIRMA, CISLA);
    zaradFakturu(FIRMA, VSTUP, POPIS);

    zabudniRezervacie(FIRMA);

    expect(volnychCisel(FIRMA)).toBe(0);
    expect(pocetCakajucichFaktur(FIRMA)).toBe(1);
  });
});
