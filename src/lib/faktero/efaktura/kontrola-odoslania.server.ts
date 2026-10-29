/**
 * Kontrola eFaktúry pred odoslaním — vlastné UBL z tých istých údajov, aké
 * dostane ePošták, a `skontrolujEfakturu` nad ním.
 *
 * ePošták si UBL skladá sám z JSON tela (`epostak-telo.ts`), tak sa kontroluje
 * náš obraz toho istého dokladu: rovnaký mapovací kód ako „Vygenerovať eFaktúru
 * XML“ (`mapToEN16931` + `generatePeppolBisXml`), doplnený o to, čo ePošták
 * píše inak — referenciu kupujúceho, dátum dodania a typ dokladu podľa
 * `druhZFaktury` (ťarchopis 383, doklad k prijatej platbe 386).
 *
 * Samofaktúra (Peppol BIS Self-Billing 3.0) vlastný generátor nemá. Skladá sa
 * cez ten istý mapovací kód s vymenenými stranami (predávajúci = dodávateľ)
 * a profilom samofakturácie; výsledok je len orientačný a neblokuje.
 */
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { skontrolujEfakturu } from "./kontrola";
import { CUSTOMIZATION_SAMOFAKTURY, PROFIL_SAMOFAKTURY } from "./kontrola/ciselniky";
import { druhZFaktury } from "./epostak-telo";
import { peppolId } from "./peppol-id";
import {
  KOD_ROZDIEL_SUMY,
  POPIS_ROZDIEL_SUMY,
  vyhodnotNaOdoslanie,
  type KontrolaPredOdoslanim,
} from "./kontrola-odoslania";
import type { OdpocetZalohy } from "../zalohy-odpocty";
import type { EN16931Invoice } from "./types";

type MapArgs = Parameters<typeof mapToEN16931>[0];

/** Typ dokladu UNCL1001 tak, ako ho pošle ePošták (`druhZFaktury`). */
const TYP_PODLA_DRUHU: Record<string, EN16931Invoice["documentType"]> = {
  invoice: "380",
  credit_note: "381",
  debit_note: "383",
  advance_payment: "386",
};

/** Referencia kupujúceho (BT-10) — rovnaké poradie ako v `sendEfaktura`. */
export function referenciaKupujuceho(invoice: {
  order_number?: string | null;
  variable_symbol?: string | null;
  invoice_number: string;
}): string {
  return invoice.order_number || invoice.variable_symbol || invoice.invoice_number;
}

export type UdajeFakturyNaKontrolu = {
  company: MapArgs["company"];
  profile?: MapArgs["profile"];
  invoice: MapArgs["invoice"] & Record<string, any>;
  items: MapArgs["items"];
  povodnaFaktura?: { cislo: string; vystavena?: string | null } | null;
  zalohy?: OdpocetZalohy[] | null;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * EN 16931 obraz faktúry tak, ako ju zloží ePošták. Ten nedostáva súčty
 * hlavičky — daň a sumy počíta sám z položiek (množstvo × cena, sadzba).
 * Súčty sa preto prepočítajú z riadkov; rozdiel proti uloženej faktúre
 * vráti `rozdielSDph` (odberateľ by dostal inú sumu ako na PDF).
 */
export function dtoFakturyNaKontrolu(u: UdajeFakturyNaKontrolu): {
  dto: EN16931Invoice;
  /** Suma s DPH podľa položiek mínus suma s DPH na faktúre (v absolútnej hodnote). */
  rozdielSDph: number;
  sumaFaktury: number;
} {
  // Zálohová faktúra (proforma) sa neposiela vôbec — `druhZFaktury` vyhodí hlášku.
  const druh = druhZFaktury(u.invoice.type, Number(u.invoice.total ?? 0));
  // Ťarchopis vedený ako „credit_note“ s kladnou sumou ide ako 383.
  const typ = TYP_PODLA_DRUHU[druh] ?? "380";
  const dto = mapToEN16931({
    company: u.company,
    profile: u.profile,
    invoice: typ === "383" ? { ...u.invoice, type: "debit_note" } : u.invoice,
    items: u.items,
    povodnaFaktura: u.povodnaFaktura,
    zalohy: u.zalohy,
  });
  dto.documentType = typ;
  dto.buyerReference = referenciaKupujuceho(u.invoice);
  if (u.invoice.delivery_date) dto.deliveryDate = u.invoice.delivery_date;
  /*
    Bez IBAN ePoštákovi účet neposielame — náš generátor by inak napísal
    úhradu prevodom (58) bez účtu a hlásil BR-61, ktoré v odoslanej faktúre nie je.
  */
  if (dto.paymentMeans && !dto.paymentMeans.iban) dto.paymentMeans = undefined;

  const sumaFaktury = r2(dto.totals.taxInclusiveAmount);
  dto.taxSubtotals = dto.taxSubtotals.map((t) => ({
    ...t,
    taxAmount: t.vatCategory === "S" ? r2((t.taxableAmount * t.vatPercent) / 100) : 0,
  }));
  const bezDane = r2(dto.lines.reduce((a, l) => a + l.lineExtensionAmount, 0));
  const dan = r2(dto.taxSubtotals.reduce((a, t) => a + t.taxAmount, 0));
  const sDanou = r2(bezDane + dan);
  const zaplatene = dto.totals.prepaidAmount ? Math.min(dto.totals.prepaidAmount, sDanou) : 0;
  dto.totals = {
    ...dto.totals,
    lineExtensionAmount: bezDane,
    taxExclusiveAmount: bezDane,
    taxAmount: dan,
    taxInclusiveAmount: sDanou,
    prepaidAmount: zaplatene > 0 ? r2(zaplatene) : undefined,
    payableAmount: r2(sDanou - zaplatene),
  };
  return { dto, rozdielSDph: r2(Math.abs(sDanou - sumaFaktury)), sumaFaktury };
}

/** UBL vystavenej faktúry, dobropisu, ťarchopisu alebo dokladu k platbe. */
export function xmlFakturyNaKontrolu(u: UdajeFakturyNaKontrolu): string {
  return generatePeppolBisXml(dtoFakturyNaKontrolu(u).dto).xml;
}

/** Od tohto rozdielu (EUR) je iná suma eFaktúry chybou, pod ním len varovaním. */
export const ROZDIEL_SUMY_CHYBA = 1;

export function skontrolujFakturuPredOdoslanim(u: UdajeFakturyNaKontrolu): KontrolaPredOdoslanim {
  const { dto, rozdielSDph, sumaFaktury } = dtoFakturyNaKontrolu(u);
  const v = skontrolujEfakturu(generatePeppolBisXml(dto).xml);
  if (rozdielSDph >= 0.01) {
    v.nalezy.unshift({
      kod: KOD_ROZDIEL_SUMY,
      oblast: "sk",
      zavaznost: rozdielSDph >= ROZDIEL_SUMY_CHYBA ? "chyba" : "varovanie",
      popis: POPIS_ROZDIEL_SUMY,
      parametre: {
        efaktura: dto.totals.taxInclusiveAmount.toFixed(2),
        faktura: sumaFaktury.toFixed(2),
        mena: dto.currency,
      },
    });
  }
  return vyhodnotNaOdoslanie(v);
}

/** Samofaktúra z `purchase_invoices` a naša firma (odberateľ, ktorý ju vystavil). */
export function xmlSamofakturyNaKontrolu(
  sf: Record<string, any>,
  firma: MapArgs["company"],
  polozky: {
    name: string;
    description?: string | null;
    quantity: number;
    unit?: string | null;
    unit_price: number;
    vat_rate: number;
    total: number;
  }[],
): string {
  const dobropis = Boolean(sf.opravuje_cislo);
  const items = polozky.map((p, i) => ({
    id: String(i + 1),
    position: i + 1,
    name: p.name,
    description: p.description,
    quantity: p.quantity,
    unit: p.unit ?? "ks",
    unit_price: p.unit_price,
    vat_rate: p.vat_rate,
    subtotal: p.total,
    vat_amount: Math.round(p.total * p.vat_rate) / 100,
    total: p.total + Math.round(p.total * p.vat_rate) / 100,
  }));
  const dto = mapToEN16931({
    // Predávajúci je dodávateľ — samofaktúru vystavuje odberateľ v jeho mene.
    company: {
      id: "dodavatel",
      name: sf.supplier_name ?? "",
      ico: sf.supplier_ico,
      dic: sf.supplier_dic,
      ic_dph: sf.supplier_ic_dph,
      street: sf.supplier_street,
      city: sf.supplier_city,
      zip: sf.supplier_zip,
      country: sf.supplier_country,
      email: sf.supplier_email,
      iban: sf.supplier_iban,
      vat_payer: Boolean(String(sf.supplier_ic_dph ?? "").trim()),
    },
    invoice: {
      id: sf.id,
      invoice_number: sf.invoice_number,
      type: dobropis ? "credit_note" : "regular",
      issue_date: sf.issue_date,
      due_date: sf.due_date,
      currency: sf.currency ?? "EUR",
      variable_symbol: sf.variable_symbol,
      notes: [sf.intro_note, sf.note].filter(Boolean).join(" — ") || null,
      subtotal: Number(sf.amount_without_vat ?? 0),
      vat_total: Number(sf.vat_amount ?? 0),
      total: Number(sf.amount_total ?? 0),
      customer_name: firma.name,
      customer_ico: firma.ico,
      customer_dic: firma.dic,
      customer_ic_dph: firma.ic_dph,
      customer_street: firma.street,
      customer_city: firma.city,
      customer_zip: firma.zip,
      customer_country: firma.country,
      customer_email: firma.email,
      reverse_charge: sf.reverse_charge,
      reverse_charge_type: sf.reverse_charge_type,
      advance_amount: sf.advance_amount,
      discount_total: sf.discount_total,
    } as MapArgs["invoice"],
    items,
    povodnaFaktura: sf.opravuje_cislo ? { cislo: sf.opravuje_cislo } : null,
    customizationId: CUSTOMIZATION_SAMOFAKTURY,
    profileId: PROFIL_SAMOFAKTURY,
  });
  dto.buyerReference = sf.variable_symbol || sf.invoice_number;
  if (sf.delivery_date) dto.deliveryDate = sf.delivery_date;
  const xml = generatePeppolBisXml(dto).xml;
  // Generátor pozná len 380 a 381 — samofaktúra je 389, jej dobropis 261.
  return dobropis
    ? xml.replace(
        "<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>",
        "<cbc:CreditNoteTypeCode>261</cbc:CreditNoteTypeCode>",
      )
    : xml.replace(
        "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>",
        "<cbc:InvoiceTypeCode>389</cbc:InvoiceTypeCode>",
      );
}

/** Samofaktúra — kontrola je orientačná, nálezy len varujú. */
export function skontrolujSamofakturuPredOdoslanim(
  ...args: Parameters<typeof xmlSamofakturyNaKontrolu>
): KontrolaPredOdoslanim {
  return vyhodnotNaOdoslanie(skontrolujEfakturu(xmlSamofakturyNaKontrolu(...args)), {
    orientacna: true,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export type VysledokPredOdoslanim =
  | { kontrola: KontrolaPredOdoslanim; nedaSa?: undefined }
  /** Doklad sa eFaktúrou poslať nedá vôbec (zálohová faktúra, chýba adresa…). */
  | { kontrola?: undefined; nedaSa: string };

/**
 * Načíta faktúru so všetkým, čo kontrola potrebuje, a skontroluje ju.
 * Klient s RLS (okno odoslania) — prístup k firme musí overiť volajúci.
 * Faktúra mimo firmy vráti `null`.
 */
export async function nacitajAKontrolujFakturu(
  sb: Klient,
  companyId: string,
  invoiceId: string,
): Promise<VysledokPredOdoslanim | null> {
  const [{ data: invoice }, { data: items }, { data: company }, { data: profile }] =
    await Promise.all([
      sb.from("invoices").select("*").eq("id", invoiceId).eq("company_id", companyId).maybeSingle(),
      sb
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("position", { ascending: true }),
      sb.from("companies").select("*").eq("id", companyId).maybeSingle(),
      sb.from("efaktura_profiles").select("*").eq("company_id", companyId).maybeSingle(),
    ]);
  if (!invoice || !company) return null;
  // Rovnaké podmienky ako `sendEfaktura` — bez adresy príjemcu sa nedá poslať nič.
  if (
    !peppolId({
      zadane: invoice.customer_peppol_id,
      dic: invoice.customer_dic,
      icDph: invoice.customer_ic_dph,
    })
  ) {
    return { nedaSa: "Odberateľ nemá DIČ ani IČ DPH — bez nich sa eFaktúra nemá kam poslať." };
  }
  let povodnaFaktura: UdajeFakturyNaKontrolu["povodnaFaktura"] = null;
  if (invoice.opravuje_fakturu_id) {
    const { data: p } = await sb
      .from("invoices")
      .select("invoice_number, issue_date")
      .eq("id", invoice.opravuje_fakturu_id)
      .maybeSingle();
    if (p) povodnaFaktura = { cislo: p.invoice_number, vystavena: p.issue_date };
  }
  const { nacitajOdpocty } = await import("../zalohy-odpocty.server");
  const zalohy = (await nacitajOdpocty(sb, companyId, [invoiceId]))[invoiceId] ?? null;
  try {
    return {
      kontrola: skontrolujFakturuPredOdoslanim({
        company,
        profile,
        invoice,
        items: items ?? [],
        povodnaFaktura,
        zalohy,
      }),
    };
  } catch (e) {
    // `druhZFaktury` odmietne zálohovú faktúru (proforma) zrozumiteľnou hláškou.
    return { nedaSa: String((e as Error)?.message ?? e) };
  }
}
