import { describe, expect, it } from "vitest";
import {
  FakturaZadarmoZ,
  KLUC_PRENOSU,
  LIMITY_ZADARMO,
  doplnenieKonceptu,
  firmaZPrenosu,
  konceptZPrenosu,
  nacitajPrenos,
  naVstupPdf,
  novaFakturaZadarmo,
  ocistiFakturu,
  odberatelZPrenosu,
  rozbalPrenos,
  sadzbyZadarmo,
  skontrolujFakturuZadarmo,
  spocitajZadarmo,
  ulozPrenos,
  upozorneniaZadarmo,
  vsZadarmo,
  zabalPrenos,
  zmazPrenos,
  type FakturaZadarmo,
} from "./faktura-zadarmo";
import { sadzbyKrajiny } from "./vat-rates";
import { cistyText } from "@/lib/bezpecny-text";

const DNES = "2026-10-19";

function vzorovaFaktura(o: Partial<FakturaZadarmo> = {}): FakturaZadarmo {
  const f = novaFakturaZadarmo("SK", DNES);
  return {
    ...f,
    dodavatel: {
      ...f.dodavatel,
      nazov: "Ján Novák – Webdizajn",
      ulica: "Hlavná 1",
      mesto: "Žilina",
      psc: "010 01",
      ico: "12345678",
      dic: "1012345678",
      iban: "SK3112000000198742637541",
      platitel: false,
    },
    odberatel: {
      ...f.odberatel,
      nazov: "Odberateľ s.r.o.",
      ulica: "Obchodná 5",
      mesto: "Bratislava",
      psc: "811 01",
      ico: "87654321",
    },
    cislo: "2026001",
    polozky: [{ nazov: "Tvorba webu", mnozstvo: 1, mj: "ks", cena: 500, sadzba: 0 }],
    ...o,
  };
}

function platitelSk(): FakturaZadarmo {
  const f = vzorovaFaktura();
  return {
    ...f,
    dodavatel: { ...f.dodavatel, platitel: true, icDph: "SK1012345678" },
    polozky: [
      { nazov: "Služba", mnozstvo: 2, mj: "hod", cena: 40, sadzba: 23 },
      { nazov: "Kniha", mnozstvo: 1, mj: "ks", cena: 10.01, sadzba: 5 },
    ],
  };
}

describe("predvolený formulár", () => {
  it("splatnosť je o 14 dní a krajina určuje menu aj jazyk", () => {
    const sk = novaFakturaZadarmo("SK", DNES);
    expect(sk.datumSplatnosti).toBe("2026-11-02");
    expect([sk.mena, sk.jazyk]).toEqual(["EUR", "sk"]);
    const cz = novaFakturaZadarmo("CZ", DNES);
    expect([cz.mena, cz.jazyk, cz.odberatel.krajina]).toEqual(["CZK", "cs", "CZ"]);
  });

  it("sadzby berie z vat-rates — neplatiteľ len 0 %", () => {
    expect(sadzbyZadarmo(platitelSk())).toEqual(sadzbyKrajiny("SK", DNES));
    const cz = { ...platitelSk(), krajina: "CZ" as const };
    expect(sadzbyZadarmo(cz)).toEqual(sadzbyKrajiny("CZ", DNES));
    expect(sadzbyZadarmo(vzorovaFaktura())).toEqual([0]);
  });
});

describe("validácia vstupu", () => {
  it("vzorová faktúra prejde", () => {
    const f = ocistiFakturu(FakturaZadarmoZ.parse(vzorovaFaktura()));
    expect(skontrolujFakturuZadarmo(f, DNES)).toEqual([]);
    expect(skontrolujFakturuZadarmo(ocistiFakturu(platitelSk()), DNES)).toEqual([]);
  });

  it("strop položiek a dĺžky textov drží zod", () => {
    const vela = vzorovaFaktura({
      polozky: Array.from({ length: LIMITY_ZADARMO.polozky + 1 }, () => ({
        nazov: "x",
        mnozstvo: 1,
        mj: "ks",
        cena: 1,
        sadzba: 0,
      })),
    });
    expect(FakturaZadarmoZ.safeParse(vela).success).toBe(false);
    const dlhe = vzorovaFaktura({ poznamka: "a".repeat(5000) });
    expect(FakturaZadarmoZ.safeParse(dlhe).success).toBe(false);
    expect(FakturaZadarmoZ.safeParse(vzorovaFaktura({ polozky: [] })).success).toBe(false);
    const nekonecno = vzorovaFaktura({
      polozky: [{ nazov: "x", mnozstvo: Infinity, mj: "ks", cena: 1, sadzba: 0 }],
    });
    expect(FakturaZadarmoZ.safeParse(nekonecno).success).toBe(false);
  });

  it("čistenie oreže dĺžky a vyhodí riadiace a neviditeľné znaky", () => {
    const f = ocistiFakturu(
      vzorovaFaktura({
        dodavatel: {
          ...vzorovaFaktura().dodavatel,
          nazov: "Firma‮ moc\u0000 " + "x".repeat(250),
          iban: "sk31 1200 0000 1987 4263 7541",
        },
      }),
    );
    expect(f.dodavatel.nazov.length).toBeLessThanOrEqual(LIMITY_ZADARMO.nazov);
    expect(f.dodavatel.nazov).not.toMatch(/[‮\u0000]/);
    expect(f.dodavatel.iban).toBe("SK3112000000198742637541");
    expect(cistyText("a\n\nb 😀", 50, { riadky: true })).toBe("a\n\nb");
  });

  it("chýbajúce povinné údaje a zlý IBAN", () => {
    const f = ocistiFakturu(
      vzorovaFaktura({
        dodavatel: { ...vzorovaFaktura().dodavatel, nazov: "", ico: "12", iban: "SK0012" },
      }),
    );
    const polia = skontrolujFakturuZadarmo(f, DNES).map((c) => c.pole);
    expect(polia).toEqual(
      expect.arrayContaining(["dodavatel.nazov", "dodavatel.ico", "dodavatel.iban"]),
    );
  });

  it("platiteľ potrebuje IČ DPH a dátum dodania, sadzba musí platiť", () => {
    const p = platitelSk();
    const f = ocistiFakturu({
      ...p,
      datumDodania: "",
      dodavatel: { ...p.dodavatel, icDph: "" },
      polozky: [{ ...p.polozky[0], sadzba: 20 }],
    });
    const polia = skontrolujFakturuZadarmo(f, DNES).map((c) => c.pole);
    expect(polia).toEqual(
      expect.arrayContaining(["dodavatel.icDph", "datumDodania", "polozky.0.sadzba"]),
    );
  });

  it("česká firma dostane hlášku podľa zákona 235/2004 Sb.", () => {
    const p = platitelSk();
    const f = ocistiFakturu({
      ...p,
      krajina: "CZ",
      datumDodania: "",
      dodavatel: { ...p.dodavatel, icDph: "CZ12345678", iban: "CZ6508000000192000145399" },
      polozky: [{ ...p.polozky[0], sadzba: 21 }],
    });
    const c = skontrolujFakturuZadarmo(f, DNES).find((x) => x.pole === "datumDodania");
    expect(c?.sprava).toMatch(/235\/2004 Sb\./);
  });

  it("dodanie do EÚ chce IČ DPH odberateľa z iného štátu", () => {
    const p = platitelSk();
    const f = ocistiFakturu({ ...p, rezim: "eu_tovar" });
    expect(skontrolujFakturuZadarmo(f, DNES).some((c) => c.pole === "odberatel.icDph")).toBe(true);
    const ok = ocistiFakturu({
      ...p,
      rezim: "eu_tovar",
      odberatel: { ...p.odberatel, krajina: "AT", icDph: "ATU12345678" },
    });
    expect(skontrolujFakturuZadarmo(ok, DNES)).toEqual([]);
  });

  it("neplatiteľovi sa režim aj IČ DPH zahodia", () => {
    const f = ocistiFakturu({
      ...vzorovaFaktura(),
      rezim: "pdp_tuzemsko",
      dodavatel: { ...vzorovaFaktura().dodavatel, icDph: "SK1012345678" },
    });
    expect(f.rezim).toBe("bezny");
    expect(f.dodavatel.icDph).toBe("");
  });

  it("upozornenie na 15-dňovú lehotu má parameter s počtom dní", () => {
    const f = ocistiFakturu({ ...platitelSk(), datumDodania: "2026-09-01" });
    const [w] = upozorneniaZadarmo(f, DNES);
    expect(w.parametre).toEqual({ n: 48 });
  });
});

describe("súčty a vstup PDF", () => {
  it("zaokrúhľuje riadok na centy ako computeInvoiceTotals", () => {
    const s = spocitajZadarmo(platitelSk());
    expect(s.riadky.map((r) => [r.zaklad, r.dan])).toEqual([
      [80, 18.4],
      [10.01, 0.5],
    ]);
    expect([s.zaklad, s.dan, s.spolu]).toEqual([90.01, 18.9, 108.91]);
  });

  it("prenesenie daňovej povinnosti — bez dane a s príznakom", () => {
    const p = platitelSk();
    const v = naVstupPdf({ ...p, rezim: "pdp_tuzemsko" });
    expect(v.invoice.reverse_charge).toBe(true);
    expect(v.invoice.reverse_charge_type).toBe("domestic_69");
    expect(v.invoice.vat_total).toBe(0);
    expect(v.items.every((i) => i.vat_rate === 0)).toBe(true);
  });

  it("neplatiteľ má schému bez DPH a pätičku Faktera", () => {
    const v = naVstupPdf(vzorovaFaktura());
    expect(v.company.vat_payer).toBe(false);
    expect(v.company.vat_scheme).toBe("sk_neplatitel");
    expect(v.company.invoice_footer).toBe("Vystavené vo Faktero — faktero.sk");
    expect(v.invoice.variable_symbol).toBe("2026001");
  });

  it("variabilný symbol nad 10 číslic sa nevymýšľa", () => {
    expect(vsZadarmo({ vs: "", cislo: "FA-2026-0000000001" })).toBeNull();
    expect(vsZadarmo({ vs: "77", cislo: "x" })).toBe("77");
  });
});

describe("prenos do účtu", () => {
  function pamat() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      m,
    };
  }

  it("uloží, prečíta a zmaže; poškodené alebo staré neponúkne", () => {
    const u = pamat();
    const f = ocistiFakturu(platitelSk());
    expect(ulozPrenos(f, u)).toBe(true);
    expect(nacitajPrenos(u)).toEqual(f);
    zmazPrenos(u);
    expect(nacitajPrenos(u)).toBeNull();
    u.setItem(KLUC_PRENOSU, "{nie json");
    expect(nacitajPrenos(u)).toBeNull();
    const stare = zabalPrenos(f, Date.now() - 31 * 86_400_000);
    expect(rozbalPrenos(stare)).toBeNull();
    expect(
      rozbalPrenos(JSON.stringify({ verzia: 1, ulozene: Date.now(), faktura: { x: 1 } })),
    ).toBeNull();
  });

  it("plné úložisko nezhodí stránku", () => {
    const zle = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(ulozPrenos(vzorovaFaktura(), zle)).toBe(false);
    expect(nacitajPrenos(zle)).toBeNull();
    expect(() => zmazPrenos(zle)).not.toThrow();
  });

  it("firma, odberateľ a koncept z faktúry", () => {
    const f = ocistiFakturu(platitelSk());
    expect(firmaZPrenosu(f)).toMatchObject({
      name: "Ján Novák – Webdizajn",
      ico: "12345678",
      ic_dph: "SK1012345678",
      country: "SK",
      default_currency: "EUR",
      vat_payer: true,
      vat_scheme: "sk_4",
    });
    expect(odberatelZPrenosu(f, "c1")).toMatchObject({
      company_id: "c1",
      name: "Odberateľ s.r.o.",
      typ: "firma",
      ico: "87654321",
      country: "SK",
    });
    const k = konceptZPrenosu(f, "c1", "o1");
    expect(k).toMatchObject({
      company_id: "c1",
      customer_id: "o1",
      status: "draft",
      currency: "EUR",
    });
    expect(k.items.map((i) => i.vat_rate)).toEqual([23, 5]);
    const d = doplnenieKonceptu({ ...f, rezim: "eu_sluzba" });
    expect(d).toMatchObject({
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "sluzba",
    });
    expect(
      konceptZPrenosu({ ...f, rezim: "eu_sluzba" }, "c", "o").items.every((i) => i.vat_rate === 0),
    ).toBe(true);
  });

  it("neplatiteľ a česká firma dostanú správnu schému DPH", () => {
    expect(firmaZPrenosu(ocistiFakturu(vzorovaFaktura())).vat_scheme).toBe("sk_neplatitel");
    const cz = ocistiFakturu({ ...vzorovaFaktura(), krajina: "CZ", mena: "CZK" });
    expect(firmaZPrenosu(cz)).toMatchObject({
      country: "CZ",
      vat_scheme: "cz_neplatce",
      default_currency: "CZK",
    });
  });
});
