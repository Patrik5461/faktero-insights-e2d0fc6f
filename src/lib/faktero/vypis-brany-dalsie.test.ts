import { describe, expect, it } from "vitest";
import { SABLONA_BRANY_CSV, citajVypisBrany, jeVypisBrany } from "./vypis-brany";

// Výkaz vyúčtovania Mollie podľa docs.mollie.com (Settlement report).
const MOLLIE = [
  "Date,Payment method,Currency,Amount,Status,ID,Description,Consumer name,Consumer bank account,Consumer BIC,Settlement currency,Settlement amount,Settlement reference,Amount refunded",
  "2026-10-01 10:12:00,ideal,EUR,100.00,paidout,tr_aaa111,Order 1001,Ján Novák,NL01BANK0123456789,BANKNL2A,EUR,100.00,1234567.2610.01,",
  "2026-10-02 11:00:00,creditcard,EUR,50.00,paidout,tr_bbb222,Order 1002,Eva Malá,,,EUR,50.00,1234567.2610.01,",
  "2026-10-03 09:00:00,refund,EUR,-20.00,refunded,re_ccc333,Refund Order 1001,,,,EUR,-20.00,1234567.2610.01,20.00",
  "2026-10-04 00:00:00,,EUR,-2.88,paidout,,Withheld fees MOL-2026-0001,,,,EUR,-2.88,1234567.2610.01,",
].join("\n");

// Export faktúr Packeta CSV v7 (stĺpce podľa dokumentácie Packety).
const PACKETA = [
  "Your eshop;Data entry date;Consign date;Delivery or return date;Your order number;Name;Surname;Barcode;Invoiced services;VAT %;Services with VAT;Currency of invoiced services;Collected COD;COD currency;COD day;Note;Status;Weight;Base price;C.O.D. fee",
  "shop;01.10.2026;01.10.2026;03.10.2026;WC-1501;Ján;Novák;Z123;3,50;23;4,31;EUR;45,90;EUR;04.10.2026;;delivered;1,2;3,00;0,50",
  "shop;01.10.2026;01.10.2026;02.10.2026;WC-1502;Eva;Malá;Z124;3,00;23;3,69;EUR;0,00;EUR;;;delivered;0,5;3,00;0,00",
].join("\n");

describe("ďalšie brány a šablóna", () => {
  it("Mollie: platby, vrátenie, poplatok a výplata vyúčtovania", () => {
    expect(jeVypisBrany(MOLLIE)).toBe(true);
    const v = citajVypisBrany(MOLLIE);
    expect(v.brana).toBe("mollie");
    expect(v.pocty).toEqual({ platby: 2, poplatky: 1, vybery: 1, vratenia: 1 });
    const prijem = v.pohyby.filter((p) => p.smer === "prijem").reduce((a, p) => a + p.suma, 0);
    const vydaj = v.pohyby.filter((p) => p.smer === "vydaj").reduce((a, p) => a + p.suma, 0);
    expect(prijem).toBe(150);
    // vrátenie 20 + poplatok 2,88 + výber 127,12 — zostatok brány po výplate je nula
    expect(Math.round(vydaj * 100) / 100).toBe(150);
    const vyber = v.pohyby.find((p) => p.oznacenie === "prevod")!;
    expect(vyber.suma).toBe(127.12);
    expect(v.pohyby.find((p) => p.vs === "1001")?.protistrana).toBe("Ján Novák");
  });

  it("Packeta: vybraná dobierka ako príjem, služby ako poplatok", () => {
    const v = citajVypisBrany(PACKETA);
    expect(v.brana).toBe("packeta");
    const dobierka = v.pohyby.find((p) => p.smer === "prijem")!;
    expect(dobierka).toMatchObject({
      suma: 45.9,
      vs: "1501",
      protistrana: "Ján Novák",
      datum: "2026-10-04",
    });
    const poplatky = v.pohyby.filter((p) => p.oznacenie === "poplatok");
    expect(poplatky.map((p) => p.suma).sort()).toEqual([3.69, 4.31]);
    // Zásielka bez dobierky dátum dobierky nemá — berie sa dátum doručenia.
    expect(poplatky.find((p) => p.suma === 3.69)?.datum).toBe("2026-10-02");
    expect(v.varovanie).toMatch(/Packety/);
  });

  it("všeobecná šablóna", () => {
    const v = citajVypisBrany(SABLONA_BRANY_CSV);
    expect(v.brana).toBe("sablona");
    expect(v.pocty).toEqual({ platby: 1, poplatky: 2, vybery: 1, vratenia: 1 });
    expect(v.pohyby.map((p) => `${p.smer}:${p.suma}:${p.oznacenie}`)).toEqual([
      "prijem:120:faktura",
      "vydaj:2.4:poplatok",
      "vydaj:30:faktura",
      "vydaj:9.9:poplatok",
      "vydaj:80:prevod",
    ]);
  });
});
