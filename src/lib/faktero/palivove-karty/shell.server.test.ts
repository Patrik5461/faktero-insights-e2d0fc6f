/*
  Shell B2B Mobility API s podvrhnutými odpoveďami.

  Tvar odpovedí podľa Quick Start Guide
  (https://developer.shell.com/api-catalog/b2b-mobility-card-transaction-data/quick-start-guide):
  obálka { RequestId, Status: "SUCCESS", Data[], Page, PageSize, TotalPages }, token
  { access_token, token_type: "Bearer", expires_in: 3600 }. Názvy polí položky podľa
  oficiálneho SDK „data-and-reporting-sdk“ 3.0.0 (models/pricedResponseData.ts,
  models/invoiceSearchDetails.ts).
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adapter,
  casZoShellu,
  datumZoShellu,
  fakturaZoShellu,
  transakciaZoShellu,
  vymazTokeny,
} from "./shell.server";
import { KartaChyba } from "./typy";

const P = {
  client_id: "klient-123",
  client_secret: "tajne-456",
  payer_number: "SK00123456",
  colco_code: "",
  prostredie: "produkcia",
};

/** Nafta 45,20 l v Bratislave — „Gross“ je u Shellu bez DPH, „Net“ s DPH. */
const NAKUP = {
  AccountName: "Firma s.r.o.",
  AccountNumber: "SK00123456",
  TransactionStatus: "Billed",
  DriverName: "Ján Vodič",
  CardPAN: "7002051234567890123",
  CardExpiry: "2027-12-31",
  ColCoCode: 86,
  InvoiceTax: 13.94,
  InvoiceGrossAmount: 60.62,
  InvoiceNetAmount: 74.56,
  InvoiceCurrencyCode: "EUR",
  TransactionNetAmount: 74.56,
  TransactionGrossAmount: 60.62,
  TransactionCurrencyCode: "EUR",
  PostingDate: "2026-10-02",
  PostingTime: "07:00:00",
  ProductCode: 23,
  ProductName: "Shell FuelSave Diesel",
  FuelProduct: true,
  SiteName: "Shell Bratislava Einsteinova",
  SiteCode: 12345,
  Location: "Bratislava",
  InvoiceNumber: 900001234,
  InvoiceDate: "2026-10-15",
  PurchasedInCountryCode: "SK",
  VATCountry: "SK",
  OdometerInput: 123456,
  Quantity: 45.2,
  UnitOfMeasure: "L",
  CreditDebitCode: "D",
  TransactionDate: "2026-10-01",
  TransactionTime: "14:35:10",
  TransactionItemId: "TI-1",
  TransactionId: 7788,
  VATRate: 23,
  VehicleRegistration: "BA-123AB",
  IsInvoiced: true,
  IsCancelled: false,
};

const FAKTURA = {
  AccountNumber: "SK00123456",
  CustomerCurrencyCode: "EUR",
  DocumentType: "Invoice",
  DueDate: "20261030",
  GrossAmountCustomerCurrency: 74.56,
  NetAmountCustomerCurrency: 60.62,
  VATAmountCustomerCurrency: 13.94,
  InvoiceDate: "20261015",
  InvoicedBy: "Shell Slovakia, s.r.o.",
  InvoiceId: 555,
  InvoiceNumber: "900001234",
  IsInternational: false,
  PayerNumber: "SK00123456",
  Status: "Due",
  Type: "Original",
  VATCountryISOCode: "SK",
};

type Volanie = { url: string; init: RequestInit };
let volania: Volanie[];

function json(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function podvrhni(odpovede: (url: string, telo: any) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      volania.push({ url, init });
      if (url.endsWith("/v2/oauth/token")) {
        return json({ access_token: "tok-1", token_type: "Bearer", expires_in: 3600 });
      }
      return odpovede(url, init.body ? JSON.parse(String(init.body)) : null);
    }),
  );
}

beforeEach(() => {
  volania = [];
  vymazTokeny();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Shell — prihlásenie", () => {
  it("token cez client credentials s Basic hlavičkou, volanie s Bearer a RequestId", async () => {
    podvrhni(() =>
      json({ RequestId: "x", Status: "SUCCESS", Data: [], Page: 1, PageSize: 1, TotalPages: 0 }),
    );
    await adapter.test(P);
    const [tok, api] = volania;
    expect(tok.url).toBe("https://api.shell.com/v2/oauth/token");
    const h = tok.init.headers as Record<string, string>;
    expect(h.authorization).toBe(`Basic ${Buffer.from("klient-123:tajne-456").toString("base64")}`);
    expect(String(tok.init.body)).toBe("grant_type=client_credentials");
    expect(api.url).toBe("https://api.shell.com/transaction-data/v1/priced");
    const ha = api.init.headers as Record<string, string>;
    expect(ha.authorization).toBe("Bearer tok-1");
    expect(ha.RequestId).toMatch(/^[0-9a-f-]{36}$/);
    const telo = JSON.parse(String(api.init.body));
    expect(telo.Filters.PayerNumber).toBe("SK00123456");
    expect(telo.Filters.InvoiceStatus).toBe("A");
    expect(telo.Filters.FromDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(telo.PageSize).toBe(1);
  });

  it("testovacie prostredie má API pod /test", async () => {
    podvrhni(() => json({ Data: [], TotalPages: 0 }));
    await adapter.test({ ...P, prostredie: "test" });
    expect(volania[0].url).toBe("https://api-test.shell.com/v2/oauth/token");
    expect(volania[1].url).toBe("https://api-test.shell.com/test/transaction-data/v1/priced");
  });

  it("odmietnuté údaje → KartaChyba prihlasenie bez ozveny tajomstva", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "invalid_client" }, 401)),
    );
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(KartaChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(e.message).not.toContain("tajne-456");
  });

  it("token sa použije znova, kým platí", async () => {
    podvrhni(() => json({ Data: [], TotalPages: 0 }));
    await adapter.test(P);
    await adapter.test(P);
    expect(volania.filter((v) => v.url.endsWith("/v2/oauth/token"))).toHaveLength(1);
  });

  it("429 → limit", async () => {
    podvrhni(() => json({}, 429));
    const e = await adapter.test(P).catch((x) => x);
    expect(e.druh).toBe("limit");
  });
});

describe("Shell — transakcie", () => {
  it("stránkuje podľa TotalPages a mapuje položky", async () => {
    podvrhni((_url, telo) =>
      json({
        RequestId: "r",
        Status: "SUCCESS",
        Data:
          telo.Page === 1 ? [NAKUP] : [{ ...NAKUP, TransactionItemId: "TI-2", IsCancelled: true }],
        Page: telo.Page,
        PageSize: 200,
        TotalPages: 2,
      }),
    );
    const tx = await adapter.transakcie(
      P,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-10-01T00:00:00Z"),
    );
    const api = volania.filter((v) => v.url.includes("/priced"));
    expect(api).toHaveLength(2);
    expect(JSON.parse(String(api[0].init.body)).Filters.IncludeFees).toBe(true);
    expect(JSON.parse(String(api[0].init.body)).Filters.FromDate).toBe("2026-09-01 00:00:00");
    expect(tx).toHaveLength(1); // zrušená položka (IsCancelled) vypadne
  });

  it("položka: sumy podľa veľkosti, maskovaná karta, čas v Bratislave", () => {
    const t = transakciaZoShellu(NAKUP)!;
    expect(t.zaklad).toBe(60.62);
    expect(t.dph).toBe(13.94);
    expect(t.spolu).toBe(74.56);
    expect(t.karta).toBe("…890123");
    expect(JSON.stringify(t.surove)).not.toContain("7002051234567890123");
    expect(t.cas).toBe("2026-10-01T14:35:10+02:00");
    expect(t.datum).toBe("2026-10-01");
    expect(t.tachometerKm).toBe(123456);
    expect(t.spz).toBe("BA-123AB");
    expect(t.jePalivo).toBe(true);
    expect(t.fakturaCislo).toBe("900001234");
    expect(t.nakupId).toBe("7788");
    expect(t.externeId).toBe("TI-1");
  });

  it("dobropis (C) má záporné sumy, poplatok nie je palivo", () => {
    const d = transakciaZoShellu({ ...NAKUP, CreditDebitCode: "C" })!;
    expect(d.dobropis).toBe(true);
    expect(d.spolu).toBe(-74.56);
    const f = transakciaZoShellu({
      ...NAKUP,
      TransactionItemId: null,
      FuelProduct: null,
      FeeTypeId: 4,
      FeeRuleId: 9,
      FeeRuleDescription: "Card fee",
      ProductName: null,
      Quantity: 1,
    })!;
    expect(f.jePalivo).toBe(false);
    expect(f.produkt).toBe("Card fee");
    expect(f.externeId).toBe("7788:fee4:9");
  });

  it("dátumy a časy v rôznych zápisoch", () => {
    expect(datumZoShellu("20240131")).toBe("2024-01-31");
    expect(datumZoShellu("2024-01-31T00:00:00")).toBe("2024-01-31");
    expect(datumZoShellu("31/01/2024")).toBe("2024-01-31");
    expect(datumZoShellu("")).toBeNull();
    expect(casZoShellu("134510")).toBe("13:45:10");
    expect(casZoShellu("13:45")).toBe("13:45:00");
    expect(casZoShellu(null)).toBe("12:00:00");
  });

  it("transakcie faktúry hľadá podľa InvoiceNumber bez poplatkov", async () => {
    podvrhni(() => json({ Data: [NAKUP], TotalPages: 1, Page: 1 }));
    const f = fakturaZoShellu(FAKTURA)!;
    const tx = await adapter.transakcieFaktury!(P, f);
    expect(tx).toHaveLength(1);
    const telo = JSON.parse(String(volania[1].init.body));
    expect(telo.Filters.InvoiceNumber).toBe("900001234");
    expect(telo.Filters.InvoiceStatus).toBe("I");
    expect(telo.Filters.IncludeFees).toBeUndefined();
  });
});

describe("Shell — faktúry", () => {
  it("search s dátumami yyyyMMdd a mapovanie hlavičky", async () => {
    podvrhni(() =>
      json({
        RequestId: "r",
        Status: "SUCCESS",
        Data: [FAKTURA],
        Page: 1,
        PageSize: 200,
        TotalRecords: 1,
        TotalPages: 1,
      }),
    );
    const f = await adapter.faktury!(
      { ...P, colco_code: "86" },
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-31T00:00:00Z"),
    );
    const api = volania[1];
    expect(api.url).toBe("https://api.shell.com/invoice-management/v1/search");
    const telo = JSON.parse(String(api.init.body));
    expect(telo.Filters).toMatchObject({
      PayerNumber: "SK00123456",
      ColCoCode: 86,
      FromDate: "20261001",
      ToDate: "20261031",
    });
    expect(f).toEqual([
      expect.objectContaining({
        externeId: "555",
        cislo: "900001234",
        datum: "2026-10-15",
        splatnost: "2026-10-30",
        dodavatel: { nazov: "Shell Slovakia, s.r.o.", krajina: "SK" },
        zaklad: 60.62,
        dph: 13.94,
        spolu: 74.56,
        typ: "Original",
        dobropis: false,
      }),
    ]);
  });

  it("404 znamená žiadne záznamy, nie chybu", async () => {
    podvrhni(() => json({ Errors: [{ Code: "404", Description: "No data" }] }, 404));
    const f = await adapter.faktury!(P, new Date(), new Date());
    expect(f).toEqual([]);
  });

  it("chyba 400 prenesie kód a popis zo Shellu", async () => {
    podvrhni(() =>
      json(
        {
          RequestId: "r",
          Status: "FAILED",
          Errors: [{ Code: "0005", Description: "Invalid PayerNumber" }],
        },
        400,
      ),
    );
    const e = await adapter.faktury!(P, new Date(), new Date()).catch((x) => x);
    expect(e.message).toContain("Invalid PayerNumber");
  });
});
