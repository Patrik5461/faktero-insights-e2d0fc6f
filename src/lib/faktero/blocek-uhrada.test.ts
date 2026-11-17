import { describe, expect, it } from "vitest";
import {
  aiBlocku,
  jeBlocekUhradou,
  ostatnyZBlocku,
  rozhodnutieBlocku,
  textSuhrnuBlockov,
  udajeUhradyBlocku,
  zamokBlocku,
} from "./blocek-uhrada";

/** Bloček METRO „ÚHRADA FAKTÚRY“ (RHJ 11/2026) — `ai_raw` ako ho uloží nahratie medzi Bločky. */
const METRO = {
  id: "b1",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  document_number: null,
  issue_date: "2026-10-12",
  total_amount: 621.7,
  vat_amount: 0,
  currency: "EUR",
  payment_method: "karta",
  file_path: "firma/b1.jpeg",
  ai_raw: {
    document_title: "ÚHRADA FAKTÚRY",
    items: [{ name: "Faktúra č.0/0/0002/052152", total: 621.7, vat_rate: 0 }],
  },
};

const NAFTA = {
  id: "b2",
  supplier_name: "OMV",
  document_number: "5376",
  issue_date: "2026-10-26",
  total_amount: 125.5,
  vat_amount: 23.47,
  vat_breakdown: [{ dph: 23.47, sadzba: 23, zaklad: 102.03 }],
  qr_raw: "O-73F46F77A28945B8B46F77A28905B83F",
  items: [{ name: "Diesel Ultra + ST(3)", total: 125.5, vat_rate: 23 }],
  payment_method: "hotovost",
};

describe("jeBlocekUhradou", () => {
  it("METRO s nadpisom „ÚHRADA FAKTÚRY“ je úhrada", () => {
    expect(jeBlocekUhradou(METRO)).toBe(true);
  });
  it("aj bez nadpisu: bloček bez DPH, ktorého riadky sú „Faktúra č. …“", () => {
    expect(jeBlocekUhradou({ ...METRO, ai_raw: { items: METRO.ai_raw.items } })).toBe(true);
  });
  it("bloček z QR (bez AI) s UID eKasy a riadkom „Faktúra č.0/0/0002/…“ v `items`", () => {
    const qr = {
      id: "b3",
      qr_raw: "O-4A1B2C3D4E5F40718293A4B5C6D7E8F9",
      items: [{ name: "Faktúra č.0/0/0002/052152", total: 621.7, vat_rate: 0 }],
      vat_amount: 0,
      total_amount: 621.7,
    };
    expect(aiBlocku(qr).ekasa_uid).toBe("O-4A1B2C3D4E5F40718293A4B5C6D7E8F9");
    expect(jeBlocekUhradou(qr)).toBe(true);
  });
  it("bežný bloček za naftu ani bloček s DPH a riadkom „Faktúra“ nie je úhrada", () => {
    expect(jeBlocekUhradou(NAFTA)).toBe(false);
    expect(
      jeBlocekUhradou({ ...NAFTA, items: [{ name: "Faktúra č. 123456", total: 125.5, vat_rate: 23 }] }),
    ).toBe(false);
    expect(jeBlocekUhradou(null)).toBe(false);
  });
});

describe("udajeUhradyBlocku", () => {
  it("číslo z riadku, suma, deň a spôsob z bločku", () => {
    expect(udajeUhradyBlocku(METRO)).toEqual({
      cisloFaktury: "0/0/0002/052152",
      suma: 621.7,
      datum: "2026-10-12",
      sposob: "karta",
    });
  });
  it("UID z eKasy nie je číslo faktúry; bez čísla na bločku ostáva prázdne", () => {
    const u = udajeUhradyBlocku({ id: "x", document_number: "O-4A1B2C3D4E5F40718293A4B5C6D7E8F9", total_amount: -10 });
    expect(u.cisloFaktury).toBe("");
    expect(u.suma).toBe(10);
  });
});

describe("zámok a rozhodnutie", () => {
  it("odovzdaný, zamknutý a v uzavretom období", () => {
    expect(zamokBlocku({ ...METRO, exported_at: "2026-11-01" }, null)?.text).toMatch(/vráťte z Pohody/);
    expect(zamokBlocku({ ...METRO, locked_at: "2026-11-01" }, null)?.text).toBe("Zamknutý doklad");
    expect(zamokBlocku(METRO, "2026-10-31")?.text).toMatch(/Uzavreté obdobie/);
    expect(zamokBlocku(METRO, "2026-09-30")).toBeNull();
  });

  const f = (id: string, cislo: string, suma: number) => ({ id, invoice_number: cislo, amount_total: suma, status: "booked" });
  const uhrada = udajeUhradyBlocku(METRO);
  it("presná jedinečná zhoda → faktúra; inak dôvod", () => {
    expect(
      rozhodnutieBlocku({ r: METRO, zamok: null, uhrada, zhody: [{ faktura: f("f1", "0/0(022)0002/052152", 621.7), cislo: 2, sumaSedi: true }] }),
    ).toEqual({ purchaseInvoiceId: "f1" });
    expect(
      rozhodnutieBlocku({
        r: METRO,
        zamok: null,
        uhrada,
        zhody: [
          { faktura: f("f1", "0/0(022)0002/052152", 621.7), cislo: 2, sumaSedi: true },
          { faktura: f("f2", "0/0/0002/052152", 621.7), cislo: 3, sumaSedi: true },
        ],
      }),
    ).toHaveProperty("dovod.text", "Faktúra {cislo} sa nedá priradiť naisto (iná suma alebo viac faktúr) — rozhodnite v detaile");
    expect(rozhodnutieBlocku({ r: METRO, zamok: null, uhrada, zhody: [] })).toHaveProperty(
      "dovod.text",
      "Faktúra {cislo} ešte nie je vo Fakteri — najprv ju zapíšte do Prijatých faktúr",
    );
    expect(rozhodnutieBlocku({ r: NAFTA, zamok: null, uhrada, zhody: [] })).toHaveProperty(
      "dovod.text",
      "Nevyzerá ako úhrada faktúry — priraďte ho v detaile bločku",
    );
    expect(rozhodnutieBlocku({ r: { ...METRO, file_path: null }, zamok: null, uhrada, zhody: [] })).toHaveProperty(
      "dovod.text",
      "Bloček nemá súbor, ktorý by sa dal priložiť",
    );
    expect(rozhodnutieBlocku({ r: METRO, zamok: { text: "Zamknutý doklad" }, uhrada, zhody: [] })).toEqual({
      dovod: { text: "Zamknutý doklad" },
    });
  });
});

describe("ostatnyZBlocku", () => {
  it("úhrada faktúry → Iný doklad „Úhrada faktúry č. …“, uhradený dňom bločku", () => {
    expect(ostatnyZBlocku({ ...METRO, status: "new" }, "2026-11-17")).toEqual({
      kind: "ine",
      sender: "METRO Cash & Carry SR s.r.o.",
      subject: "Úhrada faktúry č. 0/0/0002/052152",
      received_date: "2026-10-12",
      amount: 621.7,
      currency: "EUR",
      note: "Presunuté z Bločkov (úhrada faktúry)",
      paid_at: "2026-10-12",
      status: "new",
    });
  });
  it("bežný bloček bez dátumu → „Bloček 5376“, dnešný dátum", () => {
    const o = ostatnyZBlocku({ ...NAFTA, issue_date: null, status: "processed" }, "2026-11-17");
    expect(o).toMatchObject({ subject: "Bloček 5376", received_date: "2026-11-17", note: "Presunuté z Bločkov", status: "processed" });
  });
  it("súhrn", () => {
    expect(textSuhrnuBlockov(2, 0, "priradenie")).toEqual({ text: "Priradené k faktúram: {n}", params: { n: 2 } });
    expect(textSuhrnuBlockov(1, 1, "presun")).toEqual({ text: "Presunuté {ok}, preskočené {n}", params: { ok: 1, n: 1 } });
  });
});
