import { describe, expect, it } from "vitest";
import {
  cisloFakturyZTextu,
  fakturaZDokladuUhrady,
  hladanaCastCisla,
  jeDokladOUhrade,
  planUhrady,
  presnaZhoda,
  rozhodnutieUhrady,
  udajePreUhradu,
  udajeUhradyZAi,
  zhodaCisla,
  zhodyPrijatych,
  type KandidatPrijatej,
} from "./nespracovane-uhrada";
import { chybajuce, navrhDruhu, udajeZAi, textVytvorenia, naUhraduZNespracovaneho } from "./nespracovane";
import { kontrolaNespracovaneho } from "@/components/faktero/dph-formular";

/*
  Skutočný doklad z Nespracovaných (RHJ s. r. o., z Doklada, 11/2026): bloček
  z eKasy METRO „ÚHRADA FAKTÚRY — Faktúra č.0/0/0002/052152 621,70 — NA ÚHRADU
  EUR 621,70 — KARTA 621,70“. Model ho prečítal ako bloček s 23 % DPH, ktorú
  na doklade nemá — Faktero sa potom sťažovalo na sadzbu.
*/
const METRO_UHRADA = {
  document_type: "faktura",
  document_subtype: "blocek",
  document_title: "ÚHRADA FAKTÚRY",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  supplier_ico: "45952671",
  supplier_ic_dph: "SK2023150701",
  ekasa_uid: "O-4A1B2C3D4E5F40718293A4B5C6D7E8F9",
  cash_register_code: "88812345678900123",
  issue_date: "2026-10-12",
  amount_total: 621.7,
  payment_method: "karta",
  items: [{ name: "Faktúra č.0/0/0002/052152", quantity: 1, unit_price: 621.7, vat_rate: 23, total: 621.7 }],
  vat_breakdown: [{ rate: 23, base: 505.45, vat: 116.25 }],
};

/** Ten istý bloček, ako ho prečíta model po novom pokyne (bez vymyslenej DPH). */
const METRO_UHRADA_NOVA = {
  document_type: "faktura",
  document_subtype: "uhrada_faktury",
  document_title: "ÚHRADA FAKTÚRY",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  ekasa_uid: "O-4A1B2C3D4E5F40718293A4B5C6D7E8F9",
  paid_invoice_number: "0/0/0002/052152",
  paid_amount: 621.7,
  payment_date: "2026-10-12",
  payment_method: "karta",
  contains_invoice: false,
  amount_total: 621.7,
  vat_breakdown: [],
  items: [{ name: "Faktúra č.0/0/0002/052152", total: 621.7 }],
};

const FAKTURY: KandidatPrijatej[] = [
  { id: "f1", invoice_number: "0/0(022)0002/052152", amount_total: 621.7, status: "booked", type: "regular" },
  { id: "f2", invoice_number: "0/0(021)0002/040110", amount_total: 467.58, status: "booked", type: "regular" },
  { id: "f3", invoice_number: "Faktúrač.0/0/0033/016037", amount_total: 382.54, status: "paid", type: "regular" },
  { id: "f4", invoice_number: "0/0(021/0005/034734", variable_symbol: "5034734", amount_total: 392.84, status: "paid", type: "regular" },
  { id: "f5", invoice_number: "000210005046351", amount_total: 355.85, status: "paid", type: "regular" },
];

describe("rozpoznanie dokladu o úhrade", () => {
  it("METRO „ÚHRADA FAKTÚRY“ je doklad o úhrade, nie bloček — aj s DPH, ktorú model vymyslel", () => {
    expect(jeDokladOUhrade(METRO_UHRADA)).toBe(true);
    expect(navrhDruhu(METRO_UHRADA)).toBe("uhrada");
    expect(navrhDruhu(METRO_UHRADA_NOVA)).toBe("uhrada");
  });

  it("eKasa bez DPH, ktorej jediný riadok je faktúra, je doklad o úhrade aj bez nadpisu", () => {
    const bezNadpisu = { ...METRO_UHRADA, document_title: "METRO", vat_breakdown: [], vat_amount: null };
    expect(jeDokladOUhrade(bezNadpisu)).toBe(true);
    // S DPH na doklade (skutočný nákup) ostáva bločkom.
    expect(jeDokladOUhrade({ ...bezNadpisu, items: [{ name: "Rožky", total: 1.2 }] })).toBe(false);
  });

  it("nadpis „Úhrada faktúry č.“, „Platba faktúry“, „Zaplatenie faktúry“ aj názov súboru", () => {
    expect(jeDokladOUhrade({ document_title: "Úhrada faktúry č. 2026001" })).toBe(true);
    expect(jeDokladOUhrade({ document_title: "Platba faktúry" })).toBe(true);
    expect(jeDokladOUhrade({ document_title: "Zaplatenie faktúry 2026-15" })).toBe(true);
    expect(jeDokladOUhrade({ document_title: "Pokladničný doklad" }, "uhrada_faktury_052152.pdf")).toBe(true);
  });

  it("faktúra zaplatená pri pokladnici s nadpisom faktúry ostáva faktúrou, bežný bloček bločkom", () => {
    expect(
      navrhDruhu({
        document_type: "faktura",
        document_subtype: "blocek",
        document_title: "Faktúra č. 0/0(021)0002/040110",
        invoice_number: "0/0(021)0002/040110",
        supplier_ico: "45952671",
        supplier_ic_dph: "SK2023150701",
        ekasa_uid: "O-47D735CEC4A04FD79735CEC4A05FD7C5",
        amount_total: 467.58,
      }),
    ).toBe("faktura");
    expect(
      navrhDruhu({
        document_type: "faktura",
        document_title: "Pokladničný doklad",
        ekasa_uid: "O-47D735CEC4A04FD79735CEC4A05FD7C5",
        items: [{ name: "Chlieb", total: 2.1, vat_rate: 19 }],
        vat_breakdown: [{ rate: 19, base: 1.76, vat: 0.34 }],
      }),
    ).toBe("blocek");
    expect(jeDokladOUhrade({ document_title: "FAKTÚRA č. 262100191", invoice_number: "262100191" })).toBe(false);
  });
});

describe("údaje úhrady", () => {
  it("číslo faktúry, suma, deň a spôsob z bločku METRO", () => {
    expect(udajeUhradyZAi(METRO_UHRADA)).toEqual({
      cisloFaktury: "0/0/0002/052152",
      suma: 621.7,
      datum: "2026-10-12",
      sposob: "karta",
    });
    expect(udajeUhradyZAi(METRO_UHRADA_NOVA).cisloFaktury).toBe("0/0/0002/052152");
  });

  it("číslo faktúry z textu", () => {
    expect(cisloFakturyZTextu("Faktúra č.0/0/0002/052152 621,70")).toBe("0/0/0002/052152");
    expect(cisloFakturyZTextu("Úhrada faktúry č. 2026001")).toBe("2026001");
    expect(cisloFakturyZTextu("ÚHRADA FAKTÚRY Faktúrač.0/0/0033/016037")).toBe("0/0/0033/016037");
    expect(cisloFakturyZTextu("FA 2026-015.")).toBe("2026-015");
    expect(cisloFakturyZTextu("ÚHRADA FAKTÚRY")).toBe("");
  });

  it("druh Doklad o úhrade: bez rozpisu DPH a položiek, bez kontroly sadzieb a povinných polí", () => {
    const u = udajePreUhradu(udajeZAi(METRO_UHRADA, "2026-11-17"), METRO_UHRADA);
    expect(u.rozpis).toEqual([]);
    expect(u.polozky).toEqual([]);
    expect(u.kontrolaDph).toBeUndefined();
    expect(u.uhrada).toEqual({ cisloFaktury: "0/0/0002/052152", suma: 621.7, datum: "2026-10-12", sposob: "karta" });
    expect(kontrolaNespracovaneho({ ...u, kontrolaDph: { dph: 116.25, dovod: "x" } }, "SK", "uhrada").ok).toBe(true);
    expect(chybajuce("uhrada", u)).toEqual([]);
    expect(textVytvorenia("uhrada")).toBe("Priradiť k faktúre ako doklad o úhrade");
    expect(naUhraduZNespracovaneho({ id: "x", druh: "uhrada", udaje: u }, "2026-11-17").dovod).toMatch(/úhrade/);
  });

  it("údaje úhrady, ktoré človek opravil, ostávajú", () => {
    const u0 = udajePreUhradu(udajeZAi(METRO_UHRADA, "2026-11-17"), METRO_UHRADA);
    const u = udajePreUhradu({ ...u0, uhrada: { ...u0.uhrada!, cisloFaktury: "0/0(022)0002/052152", suma: 600 } }, METRO_UHRADA);
    expect(u.uhrada).toMatchObject({ cisloFaktury: "0/0(022)0002/052152", suma: 600 });
  });
});

describe("porovnanie čísel faktúr", () => {
  it("METRO: „0/0/0002/052152“ = „0/0(022)0002/052152“, nie iná faktúra", () => {
    expect(zhodaCisla("0/0/0002/052152", "0/0(022)0002/052152")).toBe(2);
    expect(zhodaCisla("0/0/0002/052152", "0/0(021)0002/040110")).toBe(0);
    expect(zhodaCisla("0/0/0033/016037", "Faktúrač.0/0/0033/016037")).toBe(3);
    expect(zhodaCisla("0/0/0005/046351", "000210005046351")).toBe(2);
    expect(zhodaCisla("0/0/0005/034734", "0/0(021/0005/034734", "5034734")).toBe(2);
    expect(zhodaCisla("2026001", "2026001")).toBe(3);
    expect(zhodaCisla("2026 001", "2026001")).toBe(3);
    expect(zhodaCisla("", "2026001")).toBe(0);
  });

  it("len posledná skupina číslic je slabá zhoda — platí len so sumou", () => {
    expect(zhodaCisla("1/0099/052152", "0/0(022)0002/052152")).toBe(1);
    const z = zhodyPrijatych(FAKTURY, { cisloFaktury: "1/0099/052152", suma: 100 });
    expect(z).toEqual([]);
    expect(zhodyPrijatych(FAKTURY, { cisloFaktury: "1/0099/052152", suma: 621.7 })[0]?.faktura.id).toBe("f1");
  });

  it("najlepšia zhoda prvá, presná zhoda pre hromadné priradenie", () => {
    const z = zhodyPrijatych(FAKTURY, { cisloFaktury: "0/0/0002/052152", suma: 621.7 });
    expect(z.map((x) => x.faktura.id)).toEqual(["f1"]);
    expect(z[0]).toMatchObject({ cislo: 2, sumaSedi: true });
    expect(presnaZhoda(z)?.faktura.id).toBe("f1");
    // Iná suma — zhoda ostáva, ale naisto (hromadne) nie.
    const ina = zhodyPrijatych(FAKTURY, { cisloFaktury: "0/0/0002/052152", suma: 600 });
    expect(ina[0]?.sumaSedi).toBe(false);
    expect(presnaZhoda(ina)).toBeNull();
    // Dve faktúry s tým istým číslom a sumou (duplicita z importu) — rozhodne človek.
    const dve = zhodyPrijatych(
      [...FAKTURY, { id: "f6", invoice_number: ".0/0/0002/052152", amount_total: 621.7, status: "received" }],
      { cisloFaktury: "0/0/0002/052152", suma: 621.7 },
    );
    expect(presnaZhoda(dve)).toBeNull();
  });

  it("hľadaná časť čísla pre databázu", () => {
    expect(hladanaCastCisla("0/0/0002/052152")).toBe("052152");
    expect(hladanaCastCisla("2026001")).toBe("2026001");
    expect(hladanaCastCisla("A1")).toBe("");
  });
});

describe("rozhodnutia", () => {
  const uhrada = { cisloFaktury: "0/0/0002/052152", suma: 621.7, datum: "2026-10-12", sposob: "karta" };
  it("hromadné priradenie: len doklad o úhrade so súborom a presnou zhodou", () => {
    const zhody = zhodyPrijatych(FAKTURY, uhrada);
    expect(rozhodnutieUhrady({ druh: "uhrada", navrh: false, maSubor: true, uhrada, zhody })).toEqual({ purchaseInvoiceId: "f1" });
    expect(rozhodnutieUhrady({ druh: "blocek", navrh: true, maSubor: true, uhrada, zhody })).toEqual({ purchaseInvoiceId: "f1" });
    expect(rozhodnutieUhrady({ druh: "faktura", navrh: false, maSubor: true, uhrada, zhody })).toHaveProperty("dovod");
    expect(rozhodnutieUhrady({ druh: "uhrada", navrh: false, maSubor: false, uhrada, zhody })).toHaveProperty("dovod");
    expect(rozhodnutieUhrady({ druh: "uhrada", navrh: false, stav: "cita", maSubor: true, uhrada, zhody })).toHaveProperty("dovod");
    const nie = rozhodnutieUhrady({ druh: "uhrada", navrh: false, maSubor: true, uhrada, zhody: [] });
    expect("dovod" in nie && nie.dovod.text).toMatch(/ešte nie je vo Fakteri/);
  });

  it("úhrada: nezaplatená sa uhradí sumou a dňom dokladu, zaplatená či stornovaná len dostane prílohu", () => {
    expect(planUhrady({ status: "booked", type: "regular", zostava: 621.7, uhrada, dnes: "2026-11-17" })).toEqual({
      uhradit: { suma: 621.7, datum: "2026-10-12" },
    });
    expect(planUhrady({ status: "received", type: "regular", zostava: 621.7, uhrada: { suma: null, datum: "" }, dnes: "2026-11-17" })).toEqual({
      uhradit: { suma: 621.7, datum: "2026-11-17" },
    });
    expect(planUhrady({ status: "paid", type: "regular", zostava: 0, uhrada, dnes: "2026-11-17" })).toHaveProperty("lenPriloha");
    expect(planUhrady({ status: "booked", type: "regular", zostava: 0, uhrada, dnes: "2026-11-17" })).toHaveProperty("lenPriloha");
    expect(planUhrady({ status: "cancelled", type: "regular", zostava: 621.7, uhrada, dnes: "2026-11-17" })).toHaveProperty("lenPriloha");
    expect(planUhrady({ status: "received", type: "advance_payment", zostava: 621.7, uhrada, dnes: "2026-11-17" })).toHaveProperty("lenPriloha");
  });

  it("faktúra z dokladu len keď súbor nesie faktúru s rozpisom DPH", () => {
    const len = fakturaZDokladuUhrady({ ai: METRO_UHRADA_NOVA, uhrada, udajeFaktury: udajeZAi(METRO_UHRADA_NOVA, "2026-11-17") });
    expect(len.ok).toBe(false);
    const sFakturou = {
      ...METRO_UHRADA_NOVA,
      contains_invoice: true,
      invoice_number: "0/0(022)0002/052152",
      supplier_ic_dph: "SK2023150701",
      issue_date: "2026-10-12",
      amount_without_vat: 505.45,
      vat_amount: 116.25,
      vat_breakdown: [{ rate: 23, base: 505.45, vat: 116.25 }],
    };
    const z = fakturaZDokladuUhrady({ ai: sFakturou, uhrada, udajeFaktury: udajeZAi(sFakturou, "2026-11-17", { krajina: "SK" }) });
    expect(z.ok).toBe(true);
    if (z.ok) {
      expect(z.udaje.cislo).toBe("0/0(022)0002/052152");
      expect(z.udaje.splatnost).toBe("2026-10-12");
      expect(z.udaje.platba).toBe("karta");
      expect(z.udaje.rozpis).toHaveLength(1);
      expect(chybajuce("faktura", z.udaje)).toEqual([]);
    }
    // Faktúra v súbore má iné číslo než uhrádzaná — nezaloží sa.
    const ina = { ...sFakturou, invoice_number: "0/0(021)0002/040110" };
    expect(fakturaZDokladuUhrady({ ai: ina, uhrada, udajeFaktury: udajeZAi(ina, "2026-11-17") }).ok).toBe(false);
  });
});
