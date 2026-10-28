import { describe, expect, it } from "vitest";
import {
  UhradaVstup,
  VybavenieVstup,
  ZAMKNUTE_STLPCE,
  ZnackyVstup,
  dovodZamkuApi,
  jeSparovany,
  maZnacky,
  normalizujStitky,
  sposobUhradyPrijatej,
  stitkyPoZmene,
  suhrnUhrad,
  textyZnaciek,
  uhradaVystup,
  zamknuteZmeny,
} from "./api-evidencia";

describe("štítky z API", () => {
  it("orezané, bez prázdnych a duplicít bez ohľadu na veľkosť písmen", () => {
    expect(normalizujStitky([" Auto ", "auto", "", "x".repeat(50)])).toEqual({
      ok: true,
      stitky: ["Auto", "x".repeat(40)],
    });
  });
  it("viac ako päť je chyba", () => {
    const r = normalizujStitky(["a", "b", "c", "d", "e", "f"]);
    expect(r.ok).toBe(false);
  });
  it("pridanie a odobratie jedného na pôvodnom zozname", () => {
    expect(stitkyPoZmene(["Auto", "Kontrola"], "Nový", "kontrola")).toEqual({
      ok: true,
      stitky: ["Auto", "Nový"],
    });
    // Ten istý štítok sa nepridá druhýkrát.
    expect(stitkyPoZmene(["Auto"], "AUTO")).toEqual({ ok: true, stitky: ["Auto"] });
    expect(stitkyPoZmene(["a", "b", "c", "d", "e"], "f").ok).toBe(false);
  });
});

describe("značky dokladu", () => {
  it("prázdny komentár znamená zmazať, nezadaný sa nemení", () => {
    expect(textyZnaciek({ komentar: "  ", int_poznamka: " Účtovať 518 " })).toEqual({
      komentar: null,
      int_poznamka: "Účtovať 518",
    });
    expect(textyZnaciek({})).toEqual({});
  });
  it("maZnacky pozná každé pole, ostatné polia dokladu nie", () => {
    expect(maZnacky(ZnackyVstup.parse({ note: "x" }))).toBe(false);
    expect(maZnacky(ZnackyVstup.parse({ stav: null }))).toBe(true);
    expect(maZnacky(ZnackyVstup.parse({ stitky_odobrat: "a" }))).toBe(true);
  });
  it("komentár nad 1000 znakov neprejde", () => {
    expect(ZnackyVstup.safeParse({ komentar: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("zámok odovzdaných dokladov", () => {
  const odovzdana = { exported_at: "2026-10-01T10:00:00Z", amount_total: 120, stitky: ["a"] };
  it("dôvod: odovzdaný, zamknutý; vystavená faktúra nemá locked_at", () => {
    expect(dovodZamkuApi("purchase_invoices", odovzdana)).toBe("odovzdany");
    expect(dovodZamkuApi("expense_documents", { locked_at: "2026-10-01" })).toBe("zamknuty");
    expect(dovodZamkuApi("invoices", { locked_at: "2026-10-01" })).toBeNull();
    expect(dovodZamkuApi("invoices", {})).toBeNull();
  });
  it("zmena sumy a predkontácie je zamknutá, rovnaká hodnota nie", () => {
    expect(
      zamknuteZmeny("purchase_invoices", odovzdana, {
        amount_total: 120.0,
        pohoda_predkontacia: "1Pz",
      }),
    ).toEqual(["pohoda_predkontacia"]);
    expect(
      zamknuteZmeny("purchase_invoices", { amount_total: "120.00" }, { amount_total: 120 }),
    ).toEqual([]);
  });
  it("stav, štítky, komentár a úhrada zámok nepoznajú; účtovná poznámka áno", () => {
    for (const t of ["invoices", "purchase_invoices", "expense_documents"] as const) {
      for (const s of ["stav_id", "stitky", "komentar", "status", "payment_date", "paid_at"])
        expect(ZAMKNUTE_STLPCE[t]).not.toContain(s);
      expect(ZAMKNUTE_STLPCE[t]).toContain("int_poznamka");
      expect(ZAMKNUTE_STLPCE[t]).toContain("pohoda_predkontacia");
    }
  });
});

describe("úhrady prijatých faktúr", () => {
  it("vstup: suma musí byť kladná, dátum v tvare RRRR-MM-DD", () => {
    expect(UhradaVstup.safeParse({ amount: 0 }).success).toBe(false);
    expect(UhradaVstup.safeParse({ amount: 10, paid_at: "28.10.2026" }).success).toBe(false);
    expect(UhradaVstup.safeParse({ amount: 10, paid_at: "2026-10-28" }).success).toBe(true);
  });
  it("spôsob úhrady aj v anglických kódoch", () => {
    expect(sposobUhradyPrijatej("bank_transfer")).toBe("prevod");
    expect(sposobUhradyPrijatej("CASH")).toBe("hotovost");
    expect(sposobUhradyPrijatej("card")).toBe("karta");
    expect(sposobUhradyPrijatej("bitcoin")).toBeNull();
    expect(sposobUhradyPrijatej(null)).toBeNull();
  });
  it("súhrn: čiastočná úhrada, záloha a dobropis", () => {
    expect(
      suhrnUhrad(
        { amount_total: 100, status: "received", currency: "EUR" },
        [{ id: "1", amount: "40", paid_at: "2026-10-01" }],
        0,
      ),
    ).toMatchObject({
      amount_due: 100,
      amount_paid: 40,
      amount_remaining: 60,
      payment_status: "partially_paid",
    });
    // Zaplatená záloha sa odpočíta.
    expect(suhrnUhrad({ amount_total: 100 }, [], 30)).toMatchObject({
      advance_deducted: 30,
      amount_due: 70,
      payment_status: "unpaid",
    });
    // Dobropis je v databáze záporný — vracia sa jeho absolútna hodnota.
    expect(
      suhrnUhrad({ amount_total: -50 }, [{ id: "1", amount: 50, paid_at: "2026-10-01" }], 0)
        .payment_status,
    ).toBe("paid");
  });
  it("úhradu z banky API nezmaže", () => {
    expect(
      uhradaVystup({ id: "1", amount: "5", zdroj: "banka", bank_transaction_id: "b" }),
    ).toMatchObject({ amount: 5, source: "bank", deletable: false });
    expect(uhradaVystup({ id: "2", amount: 5, zdroj: "rucne" })).toMatchObject({
      source: "manual",
      deletable: true,
    });
  });
});

describe("vybavenie bankových pohybov", () => {
  it("len dve hodnoty alebo null", () => {
    expect(VybavenieVstup.safeParse({ resolution: "transakcna_dan" }).success).toBe(true);
    expect(VybavenieVstup.safeParse({ resolution: null }).success).toBe(true);
    expect(VybavenieVstup.safeParse({ resolution: "ine" }).success).toBe(false);
    expect(VybavenieVstup.safeParse({}).success).toBe(false);
  });
  it("spárovaný je aj pohyb so splátkou alebo poplatkom financovania", () => {
    expect(jeSparovany({})).toBe(false);
    expect(jeSparovany({ matched_installment_id: "x" })).toBe(true);
    expect(jeSparovany({}, 1)).toBe(true);
  });
});
