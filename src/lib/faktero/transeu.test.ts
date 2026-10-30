import { describe, expect, it } from "vitest";
import {
  autorizacnaUrl,
  cenaObjednavky,
  cestaZoznamu,
  chybaTranseu,
  daSaFakturovat,
  icDphZakaznika,
  nazovPolozky,
  popisPolozky,
  riadokObjednavky,
  teloFaktury,
  teloTokenu,
  type TranseuObjednavka,
} from "./transeu";

/* Odpoveď z dokumentácie „List of received orders“ (www.trans.eu/api, 2026-10). */
const ZO_ZOZNAMU: TranseuObjednavka = {
  created_at: "2021-06-09T13:52:29.552Z",
  freight: {
    carrier: { legal_name: "Firma Testowa", vat_id: "111111111" },
    reference_number: null,
    shipper: { legal_name: "Firma Testowa Załadowca", vat_id: "2222222222" },
    spots: [
      {
        name: "Magazine 1",
        operations: [
          {
            timespans: { begin: "2021-06-12T13:52:27.000Z", end: "2021-06-12T15:52:27.000Z" },
            type: "loading",
          },
        ],
        place: {
          address: {
            country: "pl",
            locality: "Kraków",
            number: "5",
            postal_code: "31-001",
            street: "Wawel",
          },
        },
        spot_order: 1,
      },
      {
        name: null,
        operations: [
          {
            timespans: { begin: "2021-06-15T13:52:27.000Z", end: "2021-06-15T15:52:27.000Z" },
            type: "unloading",
          },
        ],
        place: {
          address: {
            country: "pl",
            locality: "Dąbrowa Środkowa",
            number: "34",
            postal_code: "59-330",
            street: "Średnia",
          },
        },
        spot_order: 2,
      },
    ],
  },
  id: "efc4dea5-ddd2-44d7-834d-d53d433a4de8",
  invoice: null,
  number: "123xy4z",
  payment: { days: 365, price: { currency: "eur", type: "km", value: 100 } },
  status: { comment: null, value: "proposal-waiting" },
};

/* Detail „Details of a received order“ — vzdialenosť v metroch a odhad celku. */
const DETAIL: TranseuObjednavka = {
  ...ZO_ZOZNAMU,
  id: "da012de9-faca-4b14-b380-9b94aadff6fa",
  number: "2021/07/01/1",
  status: { value: "waiting-for-confirmation", comment: null },
  freight: { ...ZO_ZOZNAMU.freight!, distance: 2036000, shipment_external_id: "ABC123" },
  payment: {
    days: 30,
    price: { currency: "pln", type: "km", value: 1500 },
    total_estimated_price: { currency: "eur", value: 3333, type: "route" },
  },
};

describe("Trans.eu — prevod objednávky", () => {
  it("vytiahne zákazníka, trasu, termíny a menu", () => {
    const r = riadokObjednavky(ZO_ZOZNAMU);
    expect(r).toMatchObject({
      transeu_id: "efc4dea5-ddd2-44d7-834d-d53d433a4de8",
      cislo: "123xy4z",
      stav: "proposal-waiting",
      zakaznik_nazov: "Firma Testowa Załadowca",
      zakaznik_vat_id: "2222222222",
      nakladka: "PL 31-001 Kraków",
      nakladka_krajina: "PL",
      nakladka_od: "2021-06-12T13:52:27.000Z",
      vykladka: "PL 59-330 Dąbrowa Środkowa",
      vykladka_do: "2021-06-15T15:52:27.000Z",
      mena: "EUR",
      splatnost_dni: 365,
      ma_fakturu_v_transeu: false,
    });
  });

  it("cena za trasu je priamo hodnota", () => {
    const o = {
      ...ZO_ZOZNAMU,
      payment: { price: { currency: "eur", type: "route", value: 850.5 } },
    };
    expect(cenaObjednavky(o)).toEqual({ suma: 850.5, mena: "EUR", typ: "route", iste: true });
  });

  it("cena za km: sadzba × vzdialenosť, keď odhad celku je v inej mene", () => {
    // 1500 PLN/km × 2036 km; odhad v EUR sa nepoužije — mena by nesedela
    expect(cenaObjednavky(DETAIL)).toEqual({ suma: 3054000, mena: "PLN", typ: "km", iste: true });
    expect(riadokObjednavky(DETAIL).vzdialenost_km).toBe(2036);
  });

  it("cena za km: odhad celku v rovnakej mene má prednosť", () => {
    const o = {
      ...DETAIL,
      payment: {
        price: { currency: "eur", type: "km", value: 1.2 },
        total_estimated_price: { currency: "EUR", value: 2400 },
      },
    };
    expect(cenaObjednavky(o).suma).toBe(2400);
  });

  it("cena za km bez vzdialenosti nie je istá", () => {
    expect(cenaObjednavky(ZO_ZOZNAMU)).toMatchObject({ suma: 100, iste: false });
  });

  it("fakturovať sa dá len prijatá objednávka", () => {
    expect(daSaFakturovat("proposal-waiting")).toBe(false);
    expect(daSaFakturovat("proposal-rejected")).toBe(false);
    expect(daSaFakturovat("cancelled")).toBe(false);
    expect(daSaFakturovat("in-preparation")).toBe(false);
    expect(daSaFakturovat("waiting-for-confirmation")).toBe(true);
    expect(daSaFakturovat("delivery-confirmed")).toBe(true);
    expect(daSaFakturovat("completed")).toBe(true);
    expect(daSaFakturovat(null)).toBe(false);
  });

  it("text položky", () => {
    const r = riadokObjednavky(DETAIL);
    expect(nazovPolozky(r)).toBe("Preprava PL 31-001 Kraków → PL 59-330 Dąbrowa Środkowa");
    expect(popisPolozky(r)).toBe(
      "Trans.eu 2021/07/01/1, ref. ABC123, 2021-06-12 – 2021-06-15, 2036 km",
    );
    expect(nazovPolozky({ nakladka: null, vykladka: null })).toBe("Preprava");
  });
});

describe("Trans.eu — IČ DPH zákazníka", () => {
  it("s predponou štátu", () => {
    expect(icDphZakaznika("PL 111-111-11-11")).toEqual({ ic_dph: "PL1111111111", krajina: "PL" });
    expect(icDphZakaznika("EL123456789")).toEqual({ ic_dph: "EL123456789", krajina: "GR" });
  });
  it("bez predpony doplní krajinu z adresy partnera", () => {
    expect(icDphZakaznika("2222222222", "pl")).toEqual({ ic_dph: "PL2222222222", krajina: "PL" });
    expect(icDphZakaznika("123456789", "GR")).toEqual({ ic_dph: "EL123456789", krajina: "GR" });
  });
  it("bez predpony a bez krajiny IČ DPH nevymýšľa", () => {
    expect(icDphZakaznika("2222222222", null)).toEqual({ ic_dph: null, krajina: null });
    expect(icDphZakaznika(null, "DE")).toEqual({ ic_dph: null, krajina: "DE" });
  });
});

describe("Trans.eu — OAuth a volania", () => {
  it("adresa autorizácie", () => {
    const u = new URL(
      autorizacnaUrl("cid", "https://www.faktero.sk/api/public/transeu/callback", "st4te"),
    );
    expect(u.origin + u.pathname).toBe("https://auth.platform.trans.eu/oauth2/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      response_type: "code",
      state: "st4te",
      redirect_uri: "https://www.faktero.sk/api/public/transeu/callback",
    });
  });

  it("telo výmeny kódu a obnovy tokenu", () => {
    const kod = new URLSearchParams(
      teloTokenu({ druh: "kod", code: "abc", redirectUri: "https://x/cb" }, "cid", "tajne"),
    );
    expect(Object.fromEntries(kod)).toEqual({
      grant_type: "authorization_code",
      code: "abc",
      redirect_uri: "https://x/cb",
      client_id: "cid",
      client_secret: "tajne",
    });
    const obnova = new URLSearchParams(
      teloTokenu({ druh: "obnova", refreshToken: "d52d1d99" }, "cid", "tajne"),
    );
    expect(obnova.get("grant_type")).toBe("refresh_token");
    expect(obnova.get("refresh_token")).toBe("d52d1d99");
  });

  it("cesta zoznamu s filtrom dátumu a stránkou", () => {
    const c = cestaZoznamu("2026-09-01T00:00:00.000Z", 3);
    const u = new URL("https://api.platform.trans.eu" + c);
    expect(u.pathname).toBe("/ext/orders-api/v1/orders-received");
    expect(JSON.parse(u.searchParams.get("filter")!)).toEqual({
      created_at: { $gt: "2026-09-01T00:00:00.000Z" },
    });
    expect(u.searchParams.get("page")).toBe("3");
    expect(new URL("https://a" + cestaZoznamu(null, 1)).searchParams.has("filter")).toBe(false);
  });

  it("chyby: invalid_grant znamená nové prihlásenie", () => {
    expect(chybaTranseu(400, { error: "invalid_grant" })).toMatch(/pripojte účet znova/);
    expect(chybaTranseu(403, null)).toMatch(/odmietol/);
    expect(chybaTranseu(422, { message: "Invalid currency" })).toBe("Trans.eu: Invalid currency");
    expect(chybaTranseu(500, "")).toBe("Trans.eu: HTTP 500");
  });
});

describe("Trans.eu — faktúra späť k objednávke", () => {
  const f = {
    invoice_number: "2026100012",
    issue_date: "2026-10-30",
    delivery_date: "2026-10-28",
    due_date: "2026-11-29",
    currency: "EUR",
    subtotal: 1230,
    total: 1512.9,
    reverse_charge: false,
  };

  it("telo podľa dokumentácie (invoice_data + media)", () => {
    expect(teloFaktury(f, [23], "72d71c93-355b-4119-9c5d-2460f368297b", "2026100012.pdf")).toEqual({
      invoice_data: {
        invoice_number: "2026100012",
        invoice_issuance_date: "2026-10-30",
        sales_date: "2026-10-28",
        net_value: 1230,
        currency: "eur",
        payment_due_date: "2026-11-29",
        payment_offset_days: 30,
        gross_value: 1512.9,
        tax_value: 23,
      },
      media_name: "2026100012.pdf",
      media_id: "72d71c93-355b-4119-9c5d-2460f368297b",
      visible_to_contractor: true,
      description: "Faktúra 2026100012",
    });
  });

  it("prenesenie daňovej povinnosti = sadzba 0", () => {
    const t = teloFaktury({ ...f, reverse_charge: true, total: 1230 }, [0], "m", "a.pdf");
    expect(t.invoice_data.tax_value).toBe(0);
  });

  it("sadzbu, ktorú Trans.eu nepozná (19 %, 21 %) alebo viac sadzieb, vynechá", () => {
    expect("tax_value" in teloFaktury(f, [19], "m", "a.pdf").invoice_data).toBe(false);
    expect("tax_value" in teloFaktury(f, [21], "m", "a.pdf").invoice_data).toBe(false);
    expect("tax_value" in teloFaktury(f, [23, 5], "m", "a.pdf").invoice_data).toBe(false);
  });

  it("bez dátumu dodania je dátum predaja deň vystavenia", () => {
    expect(
      teloFaktury({ ...f, delivery_date: null }, [23], "m", "a.pdf").invoice_data.sales_date,
    ).toBe("2026-10-30");
  });
});
