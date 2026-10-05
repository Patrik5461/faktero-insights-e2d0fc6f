import { describe, expect, it } from "vitest";
import {
  odberatelNaZapis,
  odberatelZAdresara,
  odberatelZFaktury,
  upozorneniaZmeny,
  zmenilSaOdberatel,
} from "./odberatel-faktury";

const faktura = {
  customer_id: "c1",
  customer_name: "Stará s.r.o.",
  customer_ico: "11111111",
  customer_dic: null,
  customer_ic_dph: null,
  customer_street: "Hlavná 1",
  customer_city: "Trnava",
  customer_zip: "917 01",
  customer_country: "SK",
  customer_email: "stara@example.com",
};

describe("odberateľ na faktúre", () => {
  it("kópia z adresára prevezme všetko a prázdne ukladá ako null", () => {
    const novy = odberatelZAdresara({
      id: "c2",
      name: "Nová a.s.",
      ico: "22222222",
      country: "CZ",
    });
    expect(novy).toMatchObject({
      customer_id: "c2",
      customer_name: "Nová a.s.",
      customer_country: "CZ",
    });
    expect(odberatelNaZapis(novy)).toMatchObject({ customer_email: null, customer_street: null });
  });

  it("zmena sa pozná aj pri oprave preklepu, nie pri prázdnom vs. null", () => {
    const a = odberatelZFaktury(faktura);
    expect(zmenilSaOdberatel(a, odberatelZFaktury(faktura))).toBe(false);
    expect(zmenilSaOdberatel(a, { ...a, customer_street: "Hlavná 11" })).toBe(true);
  });

  it("upozornenia: eFaktúra, poslané PDF, krajina", () => {
    const p = odberatelZFaktury(faktura);
    const n = odberatelZAdresara({ id: "c2", name: "Nová", ico: "22222222", country: "CZ" });
    const u = upozorneniaZmeny({
      povodny: p,
      novy: n,
      stav: "sent",
      reverseCharge: false,
      efakturaOdoslana: true,
    });
    expect(u[0]).toMatch(/eFaktúru/);
    expect(u[1]).toMatch(/SK → CZ/);
    expect(
      upozorneniaZmeny({
        povodny: p,
        novy: { ...n, customer_country: "SK" },
        stav: "issued",
        reverseCharge: false,
        efakturaOdoslana: false,
      }),
    ).toEqual(["Pôvodný odberateľ mohol faktúru dostať — novému pošlite nové PDF."]);
    // Oprava adresy toho istého odberateľa nie je zmena odberateľa.
    expect(
      upozorneniaZmeny({
        povodny: p,
        novy: { ...p, customer_city: "Nitra" },
        stav: "sent",
        reverseCharge: false,
        efakturaOdoslana: true,
      }),
    ).toEqual([]);
  });
});
