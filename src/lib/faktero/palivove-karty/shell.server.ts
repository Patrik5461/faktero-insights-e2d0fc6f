/*
  Shell Card — B2B Mobility API (Transaction Data + Invoice).

  Dokumentácia:
    https://developer.shell.com/api-catalog/b2b-mobility-card-transaction-data/api-overview
    https://developer.shell.com/api-catalog/b2b-mobility-card-transaction-data/quick-start-guide
    https://developer.shell.com/docs/authentication-authorisation
  Polia a cesty sú overené aj proti oficiálnemu SDK Shellu „data-and-reporting-sdk“ 3.0.0
  (npm, generované z ich OpenAPI): controllers/transactionController.ts,
  controllers/invoiceController.ts, models/filters.ts, models/pricedResponseData.ts,
  models/invoiceSearchDetails.ts.

  Prihlásenie: OAuth 2.0 client credentials.
    POST {oauth}/v2/oauth/token, Authorization: Basic base64(client_id:client_secret),
    telo application/x-www-form-urlencoded `grant_type=client_credentials`.
    Odpoveď { access_token, token_type: "Bearer", expires_in }.
    Ostré: https://api.shell.com, test: https://api-test.shell.com (API pod /test).
  Každé volanie: Authorization: Bearer …, RequestId: UUID (RFC 4122), JSON telo.

  Transakcie: POST /transaction-data/v1/priced — Filters { ColCoCode, PayerNumber,
  AccountNumber, InvoiceStatus "A" (všetky), IncludeFees, FromDate/ToDate "yyyy-MM-dd HH:mm:ss" },
  Page, PageSize. Odpoveď { RequestId, Status, Data[], Page, PageSize, TotalPages }.
  Jeden prvok Data = jeden riadok nákupu (sales item) alebo poplatok (FeeTypeId).
  Pozor: Shell volá sumu bez DPH „Gross“ a s DPH „Net“ (SDK: InvoiceGrossAmount
  „amount before tax“, InvoiceNetAmount „after tax“) — sumy sa preto rozdeľujú
  podľa toho, ktorá je o InvoiceTax väčšia, nie podľa názvu (`rozdelSumy`).

  Faktúry: POST /invoice-management/v1/search — Filters { PayerNumber, ColCoCode (číslo),
  FromDate/ToDate yyyyMMdd }, Page, PageSize. Odpoveď Data[] s InvoiceId, InvoiceNumber,
  InvoiceDate, DueDate, InvoicedBy, Net/VAT/GrossAmountCustomerCurrency, CustomerCurrencyCode,
  Type (Original/Reversal/Replacement), DocumentType, IsInternational.

  Server-only.
*/
import { randomUUID } from "crypto";
import { KartaChyba, type KartaAdapter, type KartaFaktura, type KartaTransakcia } from "./typy";
import { casVBratislave, maskaKarty, rozdelSumy } from "./spracovanie";

type Prihlasenie = Record<string, string>;

const STRANA = 200;
const STROP_STRAN = 50;

export function zakladneUrl(p: Prihlasenie): { api: string; oauth: string } {
  return p.prostredie === "test"
    ? { api: "https://api-test.shell.com/test", oauth: "https://api-test.shell.com" }
    : { api: "https://api.shell.com", oauth: "https://api.shell.com" };
}

/* Token platí typicky 15–60 minút; drží sa v pamäti procesu podľa client ID. */
const tokeny = new Map<string, { token: string; platiDo: number }>();

export function vymazTokeny() {
  tokeny.clear();
}

async function siet(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new KartaChyba("siet", "Shell API neodpovedá. Skúste to o chvíľu znova.");
  }
}

async function token(p: Prihlasenie): Promise<string> {
  const id = String(p.client_id ?? "").trim();
  const tajne = String(p.client_secret ?? "").trim();
  if (!id || !tajne) throw new KartaChyba("prihlasenie", "Chýba client ID alebo client secret.");
  const kluc = `${p.prostredie ?? ""}|${id}`;
  const v = tokeny.get(kluc);
  if (v && v.platiDo > Date.now()) return v.token;

  const r = await siet(`${zakladneUrl(p).oauth}/v2/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${tajne}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    throw new KartaChyba(
      "prihlasenie",
      "Shell neprijal client ID a client secret. Skontrolujte ich a prostredie (ostré/testovacie).",
    );
  }
  if (r.status === 429)
    throw new KartaChyba("limit", "Shell dočasne obmedzil počet volaní. Skúste to neskôr.");
  if (!r.ok) throw new KartaChyba("api", `Prihlásenie do Shell API zlyhalo (${r.status}).`);
  const j = (await r.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!j?.access_token) throw new KartaChyba("api", "Shell nevrátil prístupový token.");
  const sekundy = Math.max(60, Number(j.expires_in) || 900);
  tokeny.set(kluc, { token: j.access_token, platiDo: Date.now() + (sekundy - 30) * 1000 });
  return j.access_token;
}

/** Text chyby zo Shellu bez ozvien tajomstiev — len kód a popis z ich obálky. */
function popisChyby(telo: string): string {
  try {
    const j = JSON.parse(telo);
    const e = Array.isArray(j?.Errors) ? j.Errors[0] : (j?.Error ?? j?.errors?.[0] ?? null);
    const t = [e?.Code ?? e?.code, e?.Description ?? e?.description ?? e?.message]
      .filter(Boolean)
      .join(" ");
    if (t) return t.slice(0, 200);
    if (typeof j?.fault?.faultstring === "string") return j.fault.faultstring.slice(0, 200);
  } catch {
    /* nie JSON */
  }
  return "";
}

async function volaj<T>(p: Prihlasenie, cesta: string, telo: unknown, znova = true): Promise<T> {
  const r = await siet(`${zakladneUrl(p).api}${cesta}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await token(p)}`,
      RequestId: randomUUID(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(telo),
  });
  if (r.status === 401 && znova) {
    // Token mohol vypršať skôr, než sme čakali — jeden nový pokus.
    tokeny.delete(`${p.prostredie ?? ""}|${String(p.client_id ?? "").trim()}`);
    return volaj<T>(p, cesta, telo, false);
  }
  if (r.status === 401 || r.status === 403) {
    throw new KartaChyba(
      "prihlasenie",
      "Shell odmietol prístup k údajom. Overte, že prístup má povolené Transaction Data a Invoice API a správny payer number.",
    );
  }
  if (r.status === 429)
    throw new KartaChyba("limit", "Shell dočasne obmedzil počet volaní. Skúste to neskôr.");
  if (r.status === 404) return { Data: [], TotalPages: 0 } as T; // žiadne záznamy
  if (!r.ok) {
    const popis = popisChyby(await r.text().catch(() => ""));
    throw new KartaChyba("api", `Shell API odpovedalo ${r.status}${popis ? `: ${popis}` : ""}.`);
  }
  const j = (await r.json().catch(() => null)) as any;
  if (j && typeof j.Status === "string" && /fail/i.test(j.Status)) {
    const popis = popisChyby(JSON.stringify(j));
    throw new KartaChyba("api", `Shell API vrátilo chybu${popis ? `: ${popis}` : ""}.`);
  }
  return j as T;
}

/* ------------------------------------------------------------ pomocné */

const dvojmiestne = (n: number) => String(n).padStart(2, "0");

/** Dátum a čas pre filter transakcií: "2024-12-01 00:00:00" (Quick Start). */
export function casFiltra(d: Date): string {
  return `${d.getUTCFullYear()}-${dvojmiestne(d.getUTCMonth() + 1)}-${dvojmiestne(d.getUTCDate())} ${dvojmiestne(d.getUTCHours())}:${dvojmiestne(d.getUTCMinutes())}:${dvojmiestne(d.getUTCSeconds())}`;
}

/** Dátum pre filter faktúr: yyyyMMdd. */
export function datumFiltra(d: Date): string {
  return `${d.getUTCFullYear()}${dvojmiestne(d.getUTCMonth() + 1)}${dvojmiestne(d.getUTCDate())}`;
}

/** "20240131", "2024-01-31", "2024-01-31T00:00:00", "31/01/2024" → "2024-01-31". */
export function datumZoShellu(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[./](\d{2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** "13:45:10", "134510", "13:45" → "13:45:10". */
export function casZoShellu(v: unknown): string {
  const s = String(v ?? "").trim();
  let m = /^(\d{2}):?(\d{2}):?(\d{2})?/.exec(s);
  if (m) return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  return "12:00:00";
}

const cislo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Jeden prvok `Data` z /transaction-data/v1/priced → transakcia. Zrušené vráti null. */
export function transakciaZoShellu(x: any): KartaTransakcia | null {
  if (!x || typeof x !== "object") return null;
  if (x.IsCancelled === true) return null;
  const datum = datumZoShellu(x.TransactionDate) ?? datumZoShellu(x.PostingDate);
  if (!datum) return null;
  const cas = casVBratislave(datum, casZoShellu(x.TransactionTime ?? x.PostingTime));

  const dobropis = String(x.CreditDebitCode ?? "").toUpperCase() === "C";
  const mena = text(x.InvoiceCurrencyCode) ?? text(x.TransactionCurrencyCode) ?? "EUR";
  const zFaktury = x.InvoiceGrossAmount != null || x.InvoiceNetAmount != null;
  const s = rozdelSumy(
    cislo(zFaktury ? x.InvoiceGrossAmount : x.TransactionGrossAmount),
    cislo(zFaktury ? x.InvoiceNetAmount : x.TransactionNetAmount),
    cislo(zFaktury ? x.InvoiceTax : (x.TransactionTax ?? x.VATonNetAmount)),
  );
  const znamienko = dobropis ? -1 : 1;

  const nakupId = text(x.TransactionId);
  const polozka = text(x.TransactionItemId) ?? text(x.TrnIdentifier);
  const poplatok = cislo(x.FeeTypeId);
  const externeId =
    polozka ??
    [
      nakupId ?? "",
      text(x.TransactionLine) ?? "",
      poplatok != null ? `fee${poplatok}:${text(x.FeeRuleId) ?? ""}` : "",
    ]
      .filter(Boolean)
      .join(":");
  if (!externeId) return null;

  const tachometer = cislo(x.OdometerInput);
  const { CardPAN: _pan, ...bezKarty } = x;

  return {
    externeId: String(externeId),
    nakupId,
    cas,
    datum,
    karta: maskaKarty(x.CardPAN),
    spz: text(x.VehicleRegistration),
    vodic: text(x.DriverName),
    produkt: text(x.ProductName) ?? text(x.LineItemDescription) ?? text(x.FeeRuleDescription),
    produktKod: text(x.ProductCode),
    jePalivo: x.FuelProduct === true && poplatok == null,
    mnozstvo: cislo(x.Quantity),
    jednotka: text(x.UnitOfMeasure),
    zaklad: znamienko * Math.abs(s.zaklad),
    dph: znamienko * Math.abs(s.dph),
    sadzbaDph: cislo(x.VATRate),
    spolu: znamienko * Math.abs(s.spolu),
    mena: mena.toUpperCase(),
    krajina: text(x.PurchasedInCountryCode) ?? text(x.SiteCountry),
    krajinaDph: text(x.VATCountry),
    miesto: [text(x.SiteName), text(x.Location)].filter(Boolean).join(", ") || null,
    tachometerKm: tachometer && tachometer > 0 ? tachometer : null,
    fakturaCislo:
      x.InvoiceNumber != null && String(x.InvoiceNumber).trim()
        ? String(x.InvoiceNumber).trim()
        : null,
    fakturaDatum: datumZoShellu(x.InvoiceDate),
    dobropis,
    surove: bezKarty,
  };
}

/** Prvok `Data` z /invoice-management/v1/search → faktúra. */
export function fakturaZoShellu(x: any): KartaFaktura | null {
  if (!x || typeof x !== "object") return null;
  const cislo_ = text(x.InvoiceNumber);
  const datum = datumZoShellu(x.InvoiceDate);
  if (!cislo_ || !datum) return null;
  const vZakaznickej = x.GrossAmountCustomerCurrency != null || x.NetAmountCustomerCurrency != null;
  const s = rozdelSumy(
    cislo(vZakaznickej ? x.NetAmountCustomerCurrency : x.NetAmountTransactionCurrency),
    cislo(vZakaznickej ? x.GrossAmountCustomerCurrency : x.GrossAmountTransactionCurrency),
    cislo(vZakaznickej ? x.VATAmountCustomerCurrency : x.VATAmountTransactionCurrency),
  );
  const druh = `${x.DocumentType ?? ""} ${x.Status ?? ""}`;
  const dobropis = /credit/i.test(druh);
  const z = dobropis ? -1 : 1;
  return {
    externeId: String(x.InvoiceId ?? cislo_),
    cislo: cislo_,
    datum,
    splatnost: datumZoShellu(x.DueDate),
    dodavatel: { nazov: text(x.InvoicedBy) ?? "Shell", krajina: text(x.VATCountryISOCode) },
    mena: (
      (vZakaznickej ? text(x.CustomerCurrencyCode) : text(x.TransactionCurrencyCode)) ?? "EUR"
    ).toUpperCase(),
    zaklad: z * Math.abs(s.zaklad),
    dph: z * Math.abs(s.dph),
    spolu: z * Math.abs(s.spolu),
    typ: text(x.Type),
    dobropis,
    zahranicna: x.IsInternational === true,
    surove: x,
  };
}

function filtrPlatitela(p: Prihlasenie) {
  return {
    ColCoCode: text(p.colco_code),
    PayerNumber: String(p.payer_number ?? "").trim(),
    ...(text(p.account_number) ? { AccountNumber: text(p.account_number) } : {}),
  };
}

async function strankuj(
  p: Prihlasenie,
  cesta: string,
  telo: (strana: number) => unknown,
): Promise<any[]> {
  const vsetky: any[] = [];
  for (let strana = 1; strana <= STROP_STRAN; strana++) {
    const o = await volaj<{ Data?: any[]; TotalPages?: number; Page?: number }>(
      p,
      cesta,
      telo(strana),
    );
    const d = Array.isArray(o?.Data) ? o.Data : [];
    vsetky.push(...d);
    const spolu = Number(o?.TotalPages) || 0;
    if (!d.length || (spolu ? strana >= spolu : d.length < STRANA)) break;
  }
  return vsetky;
}

export const adapter: KartaAdapter = {
  id: "shell",

  async test(p) {
    if (!String(p.payer_number ?? "").trim()) {
      throw new KartaChyba("api", "Zadajte payer number.");
    }
    // Najlacnejšie overenie: jedna transakcia za posledný týždeň.
    const teraz = new Date();
    await volaj(p, "/transaction-data/v1/priced", {
      Filters: {
        ...filtrPlatitela(p),
        InvoiceStatus: "A",
        FromDate: casFiltra(new Date(teraz.getTime() - 7 * 86400_000)),
        ToDate: casFiltra(teraz),
      },
      Page: 1,
      PageSize: 1,
    });
  },

  async transakcie(p, od, do_) {
    const data = await strankuj(p, "/transaction-data/v1/priced", (strana) => ({
      Filters: {
        ...filtrPlatitela(p),
        InvoiceStatus: "A",
        IncludeFees: true,
        FromDate: casFiltra(od),
        ToDate: casFiltra(do_),
      },
      Page: strana,
      PageSize: STRANA,
    }));
    return data.map(transakciaZoShellu).filter((x): x is KartaTransakcia => !!x);
  },

  async faktury(p, od, do_) {
    const colco = cislo(p.colco_code);
    const data = await strankuj(p, "/invoice-management/v1/search", (strana) => ({
      Filters: {
        PayerNumber: String(p.payer_number ?? "").trim(),
        ...(colco != null ? { ColCoCode: colco } : {}),
        ...(text(p.account_number)
          ? { Accounts: [{ AccountNumber: text(p.account_number) }] }
          : {}),
        FromDate: datumFiltra(od),
        ToDate: datumFiltra(do_),
      },
      Page: strana,
      PageSize: STRANA,
    }));
    return data.map(fakturaZoShellu).filter((x): x is KartaFaktura => !!x);
  },

  async transakcieFaktury(p, f) {
    // IncludeFees: true by filter InvoiceNumber ignoroval (models/filters.ts) — poplatky dorovná hlavička faktúry.
    const data = await strankuj(p, "/transaction-data/v1/priced", (strana) => ({
      Filters: { ...filtrPlatitela(p), InvoiceStatus: "I", InvoiceNumber: f.cislo },
      Page: strana,
      PageSize: STRANA,
    }));
    return data.map(transakciaZoShellu).filter((x): x is KartaTransakcia => !!x);
  },
};
