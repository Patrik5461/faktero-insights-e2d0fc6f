/**
 * Pohoda a mPohoda — čítanie exportov.
 *
 * **Nie sú to rovnaké formáty.** Pohoda (Stormware) vyváža XML: dokladový balík
 * `dataPack` pri importe a `responsePack` pri exporte z programu. mPohoda je
 * cloudová aplikácia toho istého výrobcu, ale pracuje cez rozhranie REST a
 * dáta vydáva ako **JSON**. Preto sú tu dva prevodníky a jedna stránka importu,
 * ktorá si formát rozpozná sama.
 *
 * Pohoda vie doklad vyviezť aj do ISDOC — ten číta `isdoc.ts`.
 *
 * Výstupom sú riadky, kde jeden riadok je jedna položka faktúry a hlavička sa
 * na nich opakuje; tak ich zvyšok importu zoskupuje do faktúr.
 */

import {
  jeOprava25a,
  kodPohody,
  kurzZPohody,
  kvZPohody,
  predkontaciaZPohody,
  sadzbaZPohody,
} from "./pohoda-citanie";

export type PohodaRiadok = Record<string, string>;

/** Sadzby DPH pre kódy, ktoré neuvádzajú percento. Slovenské sadzby 2025. */
const SADZBY: Record<string, number> = {
  none: 0,
  zerovatrate: 0,
  third: 5,
  secondreducedvatrate: 5,
  low: 19,
  firstreducedvatrate: 19,
  high: 23,
  historyhigh: 23,
  basicvatrate: 23,
};

function cislo(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

function uzol(o: any, ...cesta: string[]): any {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

function hodnota(o: any, ...cesta: string[]): string {
  return text(uzol(o, ...cesta));
}

function pole(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function suma(n: number): string {
  return n === 0 ? "" : String(Math.round((n + Number.EPSILON) * 100) / 100);
}

/** `2025-03-04` alebo `4.3.2025` → `2025-03-04`. */
function datum(v: string): string {
  const s = (v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

/* ---------------- Pohoda XML ---------------- */

export function jePohodaXml(xml: string): boolean {
  if (!xml) return false;
  const z = xml.slice(0, 3000);
  return /stormware\.cz\/schema/i.test(z) || /<(dat:)?(dataPack|responsePack)[\s>]/i.test(z);
}

/**
 * Sadzba položky — spoločné pravidlo s importom prijatých dokladov
 * (`pohoda-citanie.ts`): `percentVAT`, priehradka podľa krajiny a dňa
 * plnenia overená sumami, inak sumy prilepené k známej sadzbe.
 */
function sadzbaPolozky(
  kod: string,
  zaklad: number,
  dan: number,
  krajina?: string | null,
  den?: string,
): number {
  return sadzbaZPohody({ kod, zaklad, dan, krajina, den });
}

const TYPY_VYDANYCH: Record<string, string> = {
  issuedinvoice: "regular",
  issuedcreditnotice: "credit_note",
  issueddebitnote: "debit_note",
  issuedadvanceinvoice: "proforma",
  issuedproformainvoice: "proforma",
  // CZ opravný daňový doklad — smer určí znamienko (zníženie je záporné).
  issuedcorrectivetax: "corrective",
  // Ostatné pohľadávky ako bežná faktúra.
  receivable: "regular",
};

/** Priehradky súhrnu Pohody a kód sadzby, pod ktorý patria. */
const PRIEHRADKY: [string, string | null, string][] = [
  ["priceNone", null, "none"],
  ["price3", "price3VAT", "third"],
  ["priceLow", "priceLowVAT", "low"],
  ["priceHigh", "priceHighVAT", "high"],
];

/**
 * Riadky z Pohoda XML (vydané faktúry, zálohové, dobropisy, CZ opravné
 * doklady a daňové doklady k platbe z interných dokladov).
 *
 * Prijaté doklady sa tu preskakujú — tie číta import prijatých dokladov.
 * `krajina` je krajina firmy, do ktorej sa importuje: priehradky Pohody sú
 * pre SK a CZ iné percentá.
 */
export function pohodaNaRiadky(doc: any, opts: { krajina?: string | null } = {}): PohodaRiadok[] {
  const balik = doc?.dataPack ?? doc?.responsePack ?? doc;
  const polozkyBalika = [
    ...pole(uzol(balik, "dataPackItem")),
    ...pole(uzol(balik, "responsePackItem")),
  ];
  const kandidati = polozkyBalika.length ? polozkyBalika : pole(balik);

  const riadky: PohodaRiadok[] = [];
  for (const item of kandidati) {
    const faktury = [
      ...pole(uzol(item, "invoice")),
      ...pole(uzol(item, "listInvoice", "invoice")),
      ...(uzol(item, "invoiceHeader") ? [item] : []),
    ];
    for (const faktura of faktury) riadky.push(...fakturaNaRiadky(faktura, opts.krajina));
    const interne = [...pole(uzol(item, "intDoc")), ...pole(uzol(item, "listIntDoc", "intDoc"))];
    for (const d of interne) riadky.push(...dokladKPlatbeNaRiadky(d, opts.krajina));
  }
  return riadky;
}

function adresaRiadku(h: any): PohodaRiadok {
  const adresa = uzol(h, "partnerIdentity", "address") ?? {};
  return {
    customer_name: hodnota(adresa, "company") || hodnota(adresa, "name"),
    customer_ico: hodnota(adresa, "ico"),
    customer_dic: hodnota(adresa, "dic"),
    customer_ic_dph: hodnota(adresa, "icDph") || hodnota(adresa, "vatId"),
    customer_street: hodnota(adresa, "street"),
    customer_city: hodnota(adresa, "city"),
    customer_zip: hodnota(adresa, "zip"),
    customer_country: hodnota(adresa, "country", "ids") || hodnota(adresa, "country"),
    customer_email: hodnota(adresa, "email"),
    customer_phone: hodnota(adresa, "phone") || hodnota(adresa, "mobilPhone"),
  };
}

/** Sumy riadku Pohody: základ a daň zo súboru, inak z jednotkovej ceny. */
function sumyPolozky(p: any, mena: any, sadzbaBezSum: () => number) {
  const mnozstvo = cislo(hodnota(p, "quantity") || "1");
  const jc = cislo(hodnota(mena, "unitPrice"));
  const zlava = cislo(hodnota(p, "discountPercentage"));
  const sDph = /^true$/i.test(hodnota(p, "payVAT"));
  const cenaText = hodnota(mena, "price");
  const danText = hodnota(mena, "priceVAT");
  if (cenaText !== "")
    return {
      zaklad: cislo(cenaText),
      dan: danText !== "" ? cislo(danText) : null,
      sDph,
      jc,
      mnozstvo,
      zlava,
    };
  const sadzba = sadzbaBezSum();
  const hruba = jc * mnozstvo * (1 - zlava / 100);
  const zaklad = sDph
    ? Math.round((hruba / (1 + sadzba / 100)) * 100) / 100
    : Math.round(hruba * 100) / 100;
  const dan = sDph ? Math.round((hruba - zaklad) * 100) / 100 : Math.round(zaklad * sadzba) / 100;
  return { zaklad, dan, sDph, jc, mnozstvo, zlava };
}

/**
 * Storná v Pohoda XML (vydané doklady).
 *
 *  - `cislaNaStorno`: blok `cancelDocument` (dávka na import, aj z Faktera) —
 *    „stornuj doklad s týmto číslom“. Doklad sa vo Fakteri označí ako
 *    stornovaný (`status = cancelled`), ak ho firma má alebo prišiel v tom
 *    istom súbore.
 *  - `stornujuce`: doklady z exportu Pohody s príznakom `storno =
 *    cancelDocument` (stornujúci doklad s opačnými sumami). Vo Fakteri ho
 *    netreba — pôvodný doklad príde s príznakom `cancelledDocument` a uloží sa
 *    ako stornovaný; stornujúci by tržby odpočítal druhý raz.
 */
export function pohodaStorna(doc: any): { cislaNaStorno: string[]; stornujuce: string[] } {
  const balik = doc?.dataPack ?? doc?.responsePack ?? doc;
  const polozkyBalika = [
    ...pole(uzol(balik, "dataPackItem")),
    ...pole(uzol(balik, "responsePackItem")),
  ];
  const cislaNaStorno: string[] = [];
  const stornujuce: string[] = [];
  for (const item of polozkyBalika.length ? polozkyBalika : pole(balik)) {
    const faktury = [...pole(uzol(item, "invoice")), ...pole(uzol(item, "listInvoice", "invoice"))];
    for (const f of faktury) {
      const h = uzol(f, "invoiceHeader");
      const typ = hodnota(h, "invoiceType").toLowerCase();
      if (typ && !(typ in TYPY_VYDANYCH)) continue;
      const cislo = hodnota(f, "cancelDocument", "sourceDocument", "number");
      if (uzol(f, "cancelDocument") !== undefined) {
        if (cislo) cislaNaStorno.push(cislo);
        continue;
      }
      if (h && hodnota(h, "storno") === "cancelDocument")
        stornujuce.push(
          hodnota(h, "number", "numberRequested") || hodnota(h, "number", "id") || hodnota(h, "id"),
        );
    }
  }
  return { cislaNaStorno, stornujuce };
}

function fakturaNaRiadky(faktura: any, krajinaFirmy?: string | null): PohodaRiadok[] {
  // Storno (`cancelDocument`) nie je doklad na import — rieši ho `pohodaStorna`.
  if (uzol(faktura, "cancelDocument") !== undefined) return [];
  const h = uzol(faktura, "invoiceHeader");
  if (!h) return [];
  // Stornujúci doklad z exportu Pohody — pôvodný príde ako stornovaný.
  if (hodnota(h, "storno") === "cancelDocument") return [];
  const typ = hodnota(h, "invoiceType").toLowerCase();
  // Prijaté doklady číta import prijatých dokladov.
  if (typ && !(typ in TYPY_VYDANYCH)) return [];
  const krajina = typ === "issuedcorrectivetax" || hodnota(h, "dateKHDPH") ? "CZ" : krajinaFirmy;

  const suhrn = uzol(faktura, "invoiceSummary") ?? {};
  const cudziaMena = uzol(suhrn, "foreignCurrency");
  const mena = hodnota(cudziaMena, "currency", "ids");
  const cudzia = !!mena;
  const blok = cudzia ? "foreignCurrency" : "homeCurrency";
  const den = datum(hodnota(h, "dateTax")) || datum(hodnota(h, "date"));

  const cisloDokladu =
    hodnota(h, "number", "numberRequested") || hodnota(h, "number", "id") || hodnota(h, "id");
  const vsetky = pole(uzol(faktura, "invoiceDetail", "invoiceItem"));
  /*
   * Odpočet zálohy nie je položka — Faktero ho vedie ako zúčtovanú zálohu na
   * doklade. Pohoda (aj export Faktera) ho dáva ako `invoiceAdvancePaymentItem`,
   * iné programy ako zápornú položku s textom o zálohe.
   */
  const jeOdpocetZalohy = (p: any) => {
    const m = uzol(p, blok) ?? {};
    return (
      cislo(hodnota(m, "price") || hodnota(m, "unitPrice")) < 0 &&
      /z[aá]loh|advance/i.test(hodnota(p, "text"))
    );
  };
  const odpocty = [
    ...vsetky.filter(jeOdpocetZalohy),
    ...pole(uzol(faktura, "invoiceDetail", "invoiceAdvancePaymentItem")),
  ];
  const skutocne = vsetky.filter((p: any) => !jeOdpocetZalohy(p));
  let zaloha = 0;
  let zalohaCislo = "";
  for (const p of odpocty) {
    const m = uzol(p, blok) ?? {};
    const sumaSDph = hodnota(m, "priceSum");
    zaloha -=
      sumaSDph !== ""
        ? cislo(sumaSDph)
        : cislo(hodnota(m, "price")) + cislo(hodnota(m, "priceVAT"));
    zalohaCislo ||= hodnota(p, "sourceDocument", "number");
  }

  const polozky = skutocne.map((p: any) => {
    const m = uzol(p, blok) ?? {};
    const kod = hodnota(p, "rateVAT");
    const percento = hodnota(p, "percentVAT");
    const s = sumyPolozky(p, m, () =>
      percento !== ""
        ? cislo(percento)
        : sadzbaZPohody({ kod, zaklad: null, dan: null, krajina, den }),
    );
    const sadzba =
      percento !== "" ? cislo(percento) : sadzbaPolozky(kod, s.zaklad, s.dan ?? NaN, krajina, den);
    return { p, m, s, sadzba };
  });

  // Zaokrúhlenie dokladu (domáca mena v súhrne, cudzia v `foreignCurrency/round`).
  const zaokruhlenie = cudzia
    ? cislo(hodnota(cudziaMena, "round", "priceRound"))
    : cislo(hodnota(suhrn, "homeCurrency", "round", "priceRound"));

  let zaklady: number;
  let dane: number;
  if (polozky.length && polozky.every((x) => x.s.dan != null)) {
    zaklady = polozky.reduce((a, x) => a + x.s.zaklad, 0);
    dane = polozky.reduce((a, x) => a + (x.s.dan ?? 0), 0);
  } else {
    // Bez rozpisu položiek (alebo bez súm v nich) rozhoduje súhrn — po odpočte zálohy.
    const dom = uzol(suhrn, "homeCurrency") ?? {};
    zaklady = PRIEHRADKY.reduce((a, [z]) => a + cislo(hodnota(dom, z)), 0);
    dane = PRIEHRADKY.reduce((a, [, d]) => a + (d ? cislo(hodnota(dom, d)) : 0), 0);
    if (zaloha) {
      // Súhrn je po odpočte — plnenie je o zálohu vyššie.
      const zalohaZaklad = odpocty.reduce(
        (a: number, p: any) => a - cislo(hodnota(uzol(p, blok) ?? {}, "price")),
        0,
      );
      zaklady += zalohaZaklad;
      dane += zaloha - zalohaZaklad;
    }
  }
  const celkom = zaklady + dane + zaokruhlenie;

  let druh = TYPY_VYDANYCH[typ] ?? "regular";
  if (druh === "corrective") druh = celkom < 0 ? "credit_note" : "debit_note";
  /*
    Opravný doklad podľa § 25a je vo Fakteri vždy `credit_note` s príznakom
    `oprava_25a` — zníženie záporné, vrátenie po zaplatení (v Pohode vrubopis)
    kladné. Bez toho sa vrátenie vracalo ako ťarchopis a zníženie ako obyčajný
    dobropis, ktorý výkazy dávajú do iných riadkov (r. 26/27, ONP v C.1).
  */
  const oprava25a =
    (typ === "issuedcreditnotice" || typ === "issueddebitnote") &&
    jeOprava25a(hodnota(h, "text"), hodnota(h, "note"));
  if (oprava25a) druh = "credit_note";

  const vsetkyPdp = polozky.length > 0 && polozky.every((x) => /^true$/i.test(hodnota(x.p, "PDP")));
  const poznamka = hodnota(h, "note");
  const prenesenieCele =
    vsetkyPdp ||
    /^Prenesenie da[nň]ovej povinnosti(?! pri polo)|^P[řr]enesen[ií] da[nň]ov[eé] povinnosti(?! u polo)/i.test(
      poznamka,
    );

  const kurz = cudzia
    ? kurzZPohody(hodnota(cudziaMena, "rate"), hodnota(cudziaMena, "amount"))
    : null;

  const hlavicka: PohodaRiadok = {
    invoice_number: cisloDokladu,
    variable_symbol: hodnota(h, "symVar"),
    issue_date: datum(hodnota(h, "date")),
    // `dateTax` je dátum zdaniteľného plnenia — u nás dátum dodania.
    delivery_date: datum(hodnota(h, "dateTax")),
    due_date: datum(hodnota(h, "dateDue")),
    notes: hodnota(h, "text"),
    external_id: hodnota(h, "id") || hodnota(h, "extId", "ids"),
    document_type: druh,
    ...(oprava25a ? { oprava_25a: typ === "issueddebitnote" ? "vratenie" : "znizenie" } : {}),
    // Stornovaný doklad z exportu Pohody (`storno = cancelledDocument`).
    ...(hodnota(h, "storno") === "cancelledDocument" ? { status: "cancelled" } : {}),
    subtotal: suma(zaklady),
    vat_total: suma(dane),
    total: suma(celkom),
    ...(cudzia ? { currency: mena } : {}),
    ...(kurz ? { exchange_rate: String(kurz) } : {}),
    ...(zaloha > 0.004 ? { advance_amount: suma(zaloha) } : {}),
    ...(zalohaCislo ? { zaloha_cislo: zalohaCislo } : {}),
    kv_clenenie: kvZPohody(kodPohody(h, "classificationKVDPH")) ?? "",
    pohoda_predkontacia: predkontaciaZPohody(kodPohody(h, "accounting")) ?? "",
    pohoda_clenenie_dph: kodPohody(h, "classificationVAT"),
    ...(prenesenieCele ? { reverse_charge: "true" } : {}),
    opravuje_cislo:
      hodnota(faktura, "correctiveDocument", "sourceDocument", "number") ||
      hodnota(h, "originalDocumentNumber"),
    oss_country: kodPohody(h, "MOSS"),
    ...adresaRiadku(h),
  };

  if (!polozky.length)
    return hlavicka.invoice_number || hlavicka.customer_name
      ? riadky1(hlavicka, suhrn, krajina, den)
      : [];

  return polozky.map(({ p, m, s, sadzba }) => {
    /*
     * `payVAT` znamená, že jednotková cena je s DPH. Bez prepočtu sa cena
     * s DPH zapísala ako základ — 504 € namiesto 420 € + 84 € DPH.
     */
    const jcBezDph = s.sDph && sadzba > 0 ? s.jc / (1 + sadzba / 100) : s.jc;
    return {
      ...hlavicka,
      item_name: hodnota(p, "text"),
      item_description: hodnota(p, "note"),
      item_quantity: hodnota(p, "quantity") || "1",
      item_unit: hodnota(p, "unit") || "ks",
      item_unit_price:
        jcBezDph === s.jc ? hodnota(m, "unitPrice") : String(Math.round(jcBezDph * 10000) / 10000),
      item_vat_rate: String(sadzba),
      /* Základ a daň položky už po zľave — Pohoda ich počíta sama, netreba hádať. */
      item_subtotal: String(Math.round(s.zaklad * 100) / 100),
      ...(s.dan != null ? { item_vat_amount: String(Math.round(s.dan * 100) / 100) } : {}),
      item_discount_percent: hodnota(p, "discountPercentage"),
      item_total: suma(cislo(hodnota(m, "priceSum")) || s.zaklad + (s.dan ?? 0)),
      item_sku: hodnota(p, "code"),
      ...(!prenesenieCele && /^true$/i.test(hodnota(p, "PDP")) ? { item_pdp: "true" } : {}),
    };
  });
}

/**
 * Doklad bez položiek (daňový doklad k platbe, súhrn bez rozpisu): položka
 * za každú priehradku súhrnu, aby sadzby ostali, ako boli — jedna položka zo
 * súčtov by dostala predvolenú sadzbu firmy.
 */
function riadky1(
  hlavicka: PohodaRiadok,
  suhrn: any,
  krajina: string | null | undefined,
  den: string,
): PohodaRiadok[] {
  const dom = uzol(suhrn, "homeCurrency") ?? {};
  const riadky: PohodaRiadok[] = [];
  for (const [z, d, kod] of PRIEHRADKY) {
    const zaklad = cislo(hodnota(dom, z));
    const dan = d ? cislo(hodnota(dom, d)) : 0;
    if (!zaklad && !dan) continue;
    const sadzba = sadzbaZPohody({ kod, zaklad, dan, krajina, den });
    riadky.push({
      ...hlavicka,
      item_name: hlavicka.notes || `Doklad ${hlavicka.invoice_number}`,
      item_quantity: "1",
      item_unit: "ks",
      item_unit_price: String(zaklad),
      item_vat_rate: String(sadzba),
      item_subtotal: String(zaklad),
      item_vat_amount: String(dan),
      item_total: suma(zaklad + dan),
    });
  }
  return riadky.length ? riadky : [hlavicka];
}

/**
 * Daňový doklad k prijatej platbe — Pohoda SK ho vedie v Interných dokladoch.
 * Ostatné interné doklady (bloček platený kartou…) sú náklady, nie vydané.
 */
function dokladKPlatbeNaRiadky(d: any, krajina?: string | null): PohodaRiadok[] {
  const h = uzol(d, "intDocHeader") ?? {};
  const text = hodnota(h, "text");
  if (!/da[nň]ov[yý] doklad k p[rř][ií]jat/i.test(text)) return [];
  const suhrn = uzol(d, "intDocSummary") ?? {};
  const dom = uzol(suhrn, "homeCurrency") ?? {};
  const zaklady = PRIEHRADKY.reduce((a, [z]) => a + cislo(hodnota(dom, z)), 0);
  const dane = PRIEHRADKY.reduce((a, [, x]) => a + (x ? cislo(hodnota(dom, x)) : 0), 0);
  const zaokr = cislo(hodnota(dom, "round", "priceRound"));
  const den = datum(hodnota(h, "dateTax")) || datum(hodnota(h, "date"));
  const cisloDokladu =
    hodnota(h, "originalDocumentNumber") ||
    hodnota(h, "number", "numberRequested") ||
    text.replace(/^.*?platb[eě]\s*/i, "").trim();
  const hlavicka: PohodaRiadok = {
    invoice_number: cisloDokladu,
    variable_symbol: hodnota(h, "symVar") || hodnota(h, "symPar"),
    issue_date: datum(hodnota(h, "date")),
    delivery_date: datum(hodnota(h, "dateTax")),
    due_date: datum(hodnota(h, "date")),
    notes: text,
    external_id: hodnota(h, "id"),
    document_type: "advance_payment",
    subtotal: suma(zaklady),
    vat_total: suma(dane),
    total: suma(zaklady + dane + zaokr),
    kv_clenenie: kvZPohody(kodPohody(h, "classificationKVDPH")) ?? "",
    pohoda_predkontacia: predkontaciaZPohody(kodPohody(h, "accounting")) ?? "",
    pohoda_clenenie_dph: kodPohody(h, "classificationVAT"),
    ...adresaRiadku(h),
  };
  return riadky1(hlavicka, suhrn, krajina, den);
}

/* ---------------- mPohoda JSON ---------------- */

/** Sadzba z mPohody: zo súm, inak podľa druhu sadzby (slovenské priehradky). */
function sadzbaMPohody(kod: string, zaklad: number, dan: number): number {
  if (zaklad > 0 && dan > 0) return Math.round((dan / zaklad) * 100);
  return SADZBY[(kod ?? "").toLowerCase()] ?? 0;
}

export function jeMPohodaJson(t: string): boolean {
  if (!t) return false;
  const z = t.slice(0, 4000);
  if (!/^[\s﻿]*[[{]/.test(z)) return false;
  return /"DocumentNumber"|"BusinessPartnerAddress"|"DocumentRecapitulation"/.test(z);
}

/** Vyzerá objekt na faktúru, nie na jej položku? */
function jeFaktura(x: any): boolean {
  return (
    !!x &&
    typeof x === "object" &&
    (x.DocumentNumber != null || x.BusinessPartnerAddress != null || x.VariableSymbol != null)
  );
}

/**
 * Rozhranie mPohody vracia zoznam buď priamo, alebo v obale `Items`/`Data`.
 *
 * Pozor: **samotná faktúra má tiež pole `Items`** — svoje položky. Bez kontroly,
 * či prvky vyzerajú na faktúru, by sa z jedinej faktúry stali „faktúry" z jej
 * riadkov a doklad by sa stratil.
 */
function zoznamFaktur(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (jeFaktura(json)) return [json];
  for (const k of ["Items", "Data", "items", "data", "value"]) {
    const v = json?.[k];
    if (Array.isArray(v) && v.some(jeFaktura)) return v;
    if (v && typeof v === "object" && Array.isArray(v.Items) && v.Items.some(jeFaktura))
      return v.Items;
  }
  return [];
}

export function mpohodaNaRiadky(json: any): PohodaRiadok[] {
  const riadky: PohodaRiadok[] = [];
  for (const f of zoznamFaktur(json)) {
    if (!f || typeof f !== "object") continue;
    const a = f.BusinessPartnerAddress ?? {};
    const rekapitulacia = f.DocumentRecapitulation ?? {};

    const polozky = Array.isArray(f.Items) ? f.Items : [];
    const zaklad = polozky.reduce((s: number, p: any) => s + cislo(p.PriceWithoutVat), 0);
    const dan = polozky.reduce((s: number, p: any) => s + cislo(p.Vat), 0);
    const celkom = cislo(rekapitulacia.TotalPrice) || zaklad + dan;

    const hlavicka: PohodaRiadok = {
      invoice_number: String(f.DocumentNumber ?? ""),
      variable_symbol: String(f.VariableSymbol ?? ""),
      issue_date: datum(String(f.IssueDate ?? "")),
      due_date: datum(String(f.DueDate ?? "")),
      // V mPohode je `TaxDate` dátum zdaniteľného plnenia.
      delivery_date: datum(String(f.TaxDate ?? "")),
      currency: String(f.CurrencyId ?? "") || "EUR",
      notes: String(f.Text ?? f.Note ?? ""),
      external_id: String(f.Id ?? ""),
      subtotal: suma(zaklad),
      vat_total: suma(dan),
      total: suma(celkom),
      customer_name: String(a.CompanyName ?? a.Name ?? ""),
      customer_ico: String(a.IdentificationNumber ?? ""),
      customer_dic: String(a.TaxIdentificationNumber ?? ""),
      customer_ic_dph: String(a.VatIdentificationNumber ?? ""),
      customer_street: String(a.Street ?? ""),
      customer_city: String(a.City ?? ""),
      customer_zip: String(a.PostCode ?? ""),
      customer_country: String(a.Country ?? ""),
      customer_email: String(a.Email ?? ""),
      customer_phone: String(a.PhoneNumber ?? a.MobilePhoneNumber ?? ""),
    };

    if (!polozky.length) {
      if (hlavicka.invoice_number || hlavicka.customer_name) riadky.push(hlavicka);
      continue;
    }

    for (const p of polozky) {
      const zakladP = cislo(p.PriceWithoutVat);
      const danP = cislo(p.Vat);
      riadky.push({
        ...hlavicka,
        item_name: String(p.Text ?? ""),
        item_quantity: String(p.Quantity ?? 1),
        item_unit: String(p.Unit ?? "ks"),
        item_unit_price: String(cislo(p.UnitPrice)),
        // `VatRateType` je len druh sadzby (základná, znížená…), nie percento —
        // to sa spoľahlivejšie odvodí zo súm položky.
        item_vat_rate: String(sadzbaMPohody(String(p.VatRateType ?? ""), zakladP, danP)),
        item_total: suma(cislo(p.PriceWithVat) || zakladP + danP),
        item_sku: String(p.Code ?? ""),
      });
    }
  }
  return riadky;
}
