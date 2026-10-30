import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dnesBratislava,
  dovodNemoznejZmeny,
  ineObdobie,
  jeChybaStarehoDatumu,
  kontrolaDatumu,
  posunOLehotu,
  trebaAktualnyDatum,
  uzOdoslana,
  zmenaNaDnes,
} from "./datum-vystavenia";

/* Napodobnený supabaseAdmin: každá tabuľka vráti, čo je v `stav`. */
const stav = vi.hoisted(() => ({
  faktura: null as any,
  firma: { locked_until: null } as any,
  maily: 0,
  dokumenty: [] as any[],
  dorucenia: [] as any[],
  zapisy: [] as any[],
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const vysledok = (tabulka: string) => {
    switch (tabulka) {
      case "invoices":
        return { data: stav.faktura, error: null };
      case "companies":
        return { data: stav.firma, error: null };
      case "invoice_email_logs":
        return { data: null, count: stav.maily, error: null };
      case "efaktura_documents":
        return { data: stav.dokumenty, error: null };
      case "efaktura_deliveries":
        return { data: stav.dorucenia, count: stav.dorucenia.length, error: null };
      default:
        return { data: null, error: null };
    }
  };
  const supabaseAdmin = {
    from: (tabulka: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        update: (z: any) => {
          stav.zapisy.push({ tabulka, z });
          return q;
        },
        delete: () => q,
        maybeSingle: async () => vysledok(tabulka),
        single: async () => vysledok(tabulka),
        then: (ok: any, zle: any) => Promise.resolve(vysledok(tabulka)).then(ok, zle),
      };
      return q;
    },
    storage: { from: () => ({ remove: async () => ({}) }) },
  };
  return { supabaseAdmin };
});

import {
  kontrolaPredOdoslanim,
  overDatumPredOdoslanim,
  StaryDatumVystavenia,
  zmenDatumNaDnes,
} from "./datum-vystavenia.server";

const faktura = (v: Partial<any> = {}) => ({
  id: "i1",
  company_id: "c1",
  type: "regular",
  status: "issued",
  issue_date: "2026-10-20",
  delivery_date: "2026-10-20",
  due_date: "2026-11-03",
  povodna_splatnost: null,
  invoice_number: "2026010",
  exported_at: null,
  sent_at: null,
  ...v,
});

describe("dnes v Bratislave", () => {
  it("o polnoci UTC je v Bratislave už ďalší deň", () => {
    // 21. 10. 2026 23:30 UTC = 22. 10. 01:30 v Bratislave (letný čas).
    expect(dnesBratislava(new Date("2026-10-21T23:30:00Z"))).toBe("2026-10-22");
    // Zimný čas (UTC+1): 31. 12. 23:30 UTC je už Nový rok.
    expect(dnesBratislava(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(dnesBratislava(new Date("2026-10-21T21:59:00Z"))).toBe("2026-10-21");
  });

  it("faktúra vystavená večer podľa UTC nie je včerajšia", () => {
    // Faktúra s dátumom 22. 10., odosiela sa 22. 10. o 1:00 v Bratislave —
    // v UTC je ešte 21. 10., okno sa ukázať nesmie.
    const dnes = dnesBratislava(new Date("2026-10-21T23:00:00Z"));
    expect(trebaAktualnyDatum(faktura({ issue_date: "2026-10-22" }), false, dnes)).toBe(false);
    expect(trebaAktualnyDatum(faktura({ issue_date: "2026-10-21" }), false, dnes)).toBe(true);
  });
});

describe("kedy treba aktuálny dátum", () => {
  const dnes = "2026-10-21";
  it("len pri prvom odoslaní a staršom dátume", () => {
    expect(trebaAktualnyDatum(faktura(), false, dnes)).toBe(true);
    expect(trebaAktualnyDatum(faktura({ issue_date: dnes }), false, dnes)).toBe(false);
    expect(trebaAktualnyDatum(faktura(), true, dnes)).toBe(false);
  });

  it("všetky typy vydaných dokladov", () => {
    for (const type of ["regular", "proforma", "credit_note", "debit_note", "advance_payment"]) {
      expect(trebaAktualnyDatum(faktura({ type }), false, dnes)).toBe(true);
    }
    expect(trebaAktualnyDatum(faktura({ type: "nieco" }), false, dnes)).toBe(false);
  });

  it("stornovaná ani uhradená sa nekontroluje", () => {
    expect(trebaAktualnyDatum(faktura({ status: "cancelled" }), false, dnes)).toBe(false);
    expect(trebaAktualnyDatum(faktura({ status: "paid" }), false, dnes)).toBe(false);
    expect(trebaAktualnyDatum(faktura({ status: "draft" }), false, dnes)).toBe(true);
  });

  it("odoslaná = e-mail, eFaktúra, sent_at alebo „iným spôsobom“", () => {
    expect(uzOdoslana({ status: "issued", sent_at: null })).toBe(false);
    expect(uzOdoslana({ status: "sent", sent_at: null })).toBe(true);
    expect(uzOdoslana({ status: "issued", sent_at: "2026-10-20T10:00:00Z" })).toBe(true);
    expect(uzOdoslana({ status: "issued" }, { emailOdoslany: true })).toBe(true);
    expect(uzOdoslana({ status: "issued" }, { efakturaOdoslana: true })).toBe(true);
  });
});

describe("posun splatnosti", () => {
  it("lehota ostáva rovnaká", () => {
    expect(posunOLehotu("2026-11-03", "2026-10-20", "2026-10-21")).toBe("2026-11-04");
    expect(posunOLehotu("2026-12-31", "2026-12-17", "2027-01-02")).toBe("2027-01-16");
    // Cez zmenu času (25. 10.) sa deň nesmie stratiť.
    expect(posunOLehotu("2026-10-30", "2026-10-16", "2026-10-26")).toBe("2026-11-09");
    expect(posunOLehotu(null, "2026-10-20", "2026-10-21")).toBe(null);
  });

  it("dátum dodania sa nemení, chýbajúci sa doplní pôvodným dátumom vystavenia", () => {
    expect(zmenaNaDnes(faktura(), "2026-10-21")).toEqual({
      issue_date: "2026-10-21",
      due_date: "2026-11-04",
      delivery_date: "2026-10-20",
      povodna_splatnost: null,
    });
    expect(zmenaNaDnes(faktura({ delivery_date: "2026-10-01" }), "2026-10-21").delivery_date).toBe(
      "2026-10-01",
    );
    expect(zmenaNaDnes(faktura({ delivery_date: null }), "2026-10-21").delivery_date).toBe(
      "2026-10-20",
    );
    // Dobropis patrí do obdobia vystavenia — dodanie sa mu nevymýšľa.
    expect(
      zmenaNaDnes(faktura({ type: "credit_note", delivery_date: null }), "2026-10-21")
        .delivery_date,
    ).toBe(null);
  });

  it("prechod do iného mesiaca či roka", () => {
    expect(ineObdobie("2026-10-20", "2026-10-21")).toBe(null);
    expect(ineObdobie("2026-09-30", "2026-10-01")).toBe("mesiac");
    expect(ineObdobie("2026-12-31", "2027-01-01")).toBe("rok");
  });
});

describe("kedy sa dátum zmeniť nedá", () => {
  it("uzamknuté obdobie", () => {
    expect(dovodNemoznejZmeny(faktura(), "2026-10-20")).toMatch(/uzamknuté/);
    expect(dovodNemoznejZmeny(faktura(), "2026-10-19")).toBe(null);
    expect(dovodNemoznejZmeny(faktura(), null)).toBe(null);
  });

  it("vyvezená do účtovníctva", () => {
    expect(dovodNemoznejZmeny(faktura({ exported_at: "2026-10-20T12:00:00Z" }), null)).toMatch(
      /účtovníctva/,
    );
  });

  it("kontrola to zhrnie aj so zámkom", () => {
    const k = kontrolaDatumu(faktura(), false, "2026-10-31", "2026-11-02");
    expect(k).toMatchObject({
      treba: true,
      mozno: false,
      zamknuteDo: "2026-10-31",
      ineObdobie: "mesiac",
    });
    const k2 = kontrolaDatumu(faktura(), false, null, "2026-10-21");
    expect(k2).toMatchObject({
      treba: true,
      mozno: true,
      novaSplatnost: "2026-11-04",
      dodanie: "2026-10-20",
    });
  });
});

describe("server pri odoslaní", () => {
  beforeEach(() => {
    stav.faktura = faktura({
      issue_date: "2000-01-01",
      delivery_date: null,
      due_date: "2000-01-15",
    });
    stav.firma = { locked_until: null };
    stav.maily = 0;
    stav.dokumenty = [];
    stav.dorucenia = [];
    stav.zapisy = [];
  });

  it("odmietne prvé odoslanie so starým dátumom", async () => {
    const e = await overDatumPredOdoslanim("i1", "c1").catch((x) => x);
    expect(e).toBeInstanceOf(StaryDatumVystavenia);
    expect(e.code).toBe("issue_date_in_past");
    expect(jeChybaStarehoDatumu(e)).toBe(true);
  });

  it("príznak starého dátumu nepomôže, keď sa dátum zmeniť dá", async () => {
    await expect(overDatumPredOdoslanim("i1", "c1", true)).rejects.toBeInstanceOf(
      StaryDatumVystavenia,
    );
  });

  it("uzamknutú faktúru pustí len s výslovným potvrdením", async () => {
    stav.firma = { locked_until: "2000-12-31" };
    await expect(overDatumPredOdoslanim("i1", "c1")).rejects.toBeInstanceOf(StaryDatumVystavenia);
    await expect(overDatumPredOdoslanim("i1", "c1", true)).resolves.toBeUndefined();
  });

  it("opätovné odoslanie nekontroluje", async () => {
    stav.maily = 1;
    await expect(overDatumPredOdoslanim("i1", "c1")).resolves.toBeUndefined();
    stav.maily = 0;
    stav.dokumenty = [{ id: "d1" }];
    stav.dorucenia = [{ status: "sent" }];
    await expect(overDatumPredOdoslanim("i1", "c1")).resolves.toBeUndefined();
  });

  it("zlyhaná eFaktúra sa za odoslanie neráta", async () => {
    stav.dokumenty = [{ id: "d1" }];
    stav.dorucenia = [{ status: "failed" }];
    const k = await kontrolaPredOdoslanim("i1", "c1");
    expect(k.treba).toBe(true);
  });

  it("zmena zapíše dnešok, posunutú splatnosť a zahodí PDF", async () => {
    const zapisane: any[] = [];
    const klient: any = {
      from: () => {
        const q: any = {
          update: (z: any) => {
            zapisane.push(z);
            return q;
          },
          eq: () => q,
          select: async () => ({ data: [{ id: "i1" }], error: null }),
          then: (ok: any) => Promise.resolve({ error: null }).then(ok),
        };
        return q;
      },
    };
    const r = await zmenDatumNaDnes(klient, "i1", "c1");
    expect(r.zmenene).toBe(true);
    const dnes = dnesBratislava();
    expect(zapisane[0]).toMatchObject({
      issue_date: dnes,
      due_date: posunOLehotu("2000-01-15", "2000-01-01", dnes),
      delivery_date: "2000-01-01",
      pdf_url: null,
      pdf_source_hash: null,
    });
    // Posun s dátumom vystavenia nie je predĺženie splatnosti — stopa spúšťača sa vráti.
    expect(zapisane[1]).toEqual({ povodna_splatnost: null, predlzene_at: null, predlzil: null });
  });

  it("uzamknutú faktúru nezmení", async () => {
    stav.firma = { locked_until: "2000-12-31" };
    await expect(zmenDatumNaDnes({ from: () => ({}) } as any, "i1", "c1")).rejects.toThrow(
      /uzamknuté/,
    );
  });
});

describe("polnoc, prelom roka a 29. 2.", () => {
  it("dnes podľa Bratislavy, nie UTC", async () => {
    const { dnesBratislava } = await import("./datum-vystavenia");
    // 31. 12. 23:30 UTC = 1. 1. 0:30 v Bratislave (zima, +1 h)
    expect(dnesBratislava(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // leto (+2 h): 22:30 UTC je už ďalší deň
    expect(dnesBratislava(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(dnesBratislava(new Date("2026-06-30T21:59:00Z"))).toBe("2026-06-30");
  });

  it("posunDni je kalendárny — bez posunu o deň cez letný čas a prelom roka", async () => {
    const { posunDni } = await import("./datum-vystavenia");
    expect(posunDni("2026-10-30", 14)).toBe("2026-11-13");
    expect(posunDni("2026-03-20", 14)).toBe("2026-04-03"); // cez prechod na letný čas
    expect(posunDni("2026-10-20", 14)).toBe("2026-11-03"); // cez prechod na zimný čas
    expect(posunDni("2026-12-25", 14)).toBe("2027-01-08");
    expect(posunDni("2028-02-15", 14)).toBe("2028-02-29");
    expect(posunDni("2027-02-15", 14)).toBe("2027-03-01");
    expect(posunDni("2028-02-29", 365)).toBe("2029-02-28");
    expect(posunDni("2026-01-10", -14)).toBe("2025-12-27");
    expect(posunDni("nie-je-datum", 3)).toBe("nie-je-datum");
  });
});
