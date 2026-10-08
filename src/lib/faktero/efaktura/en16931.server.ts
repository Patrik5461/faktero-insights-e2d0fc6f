/**
 * EN 16931 mapping layer — converts a Faktero invoice (DB row + items + company)
 * into a normalized EN16931 invoice DTO. The XML generator consumes only this
 * DTO, so swapping the source data model (or future supplier invoices) does not
 * affect XML generation.
 */
import type { EN16931Invoice, EN16931Line, EN16931Party, EN16931TaxSubtotal } from "./types";
import { sUctomFaktury } from "../platobny-ucet";
import { riadkySoZlavou } from "../zlavy";
import { peppolId } from "./peppol-id";
import { textOdpoctu, type OdpocetZalohy } from "../zalohy-odpocty";

type CompanyRow = {
  id: string;
  name: string;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  swift?: string | null;
  vat_payer?: boolean | null;
};

type ProfileRow = {
  peppol_participant_id?: string | null;
  peppol_scheme?: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  type: "regular" | "credit_note" | "advance" | string;
  issue_date: string;
  due_date: string;
  currency: string;
  variable_symbol?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  customer_name?: string | null;
  customer_ico?: string | null;
  customer_dic?: string | null;
  customer_ic_dph?: string | null;
  customer_street?: string | null;
  customer_city?: string | null;
  customer_zip?: string | null;
  customer_country?: string | null;
  customer_email?: string | null;
  reverse_charge?: boolean | null;
  reverse_charge_type?: string | null;
  customer_peppol_id?: string | null;
  advance_amount?: number | null;
};

type InvoiceItemRow = {
  id: string;
  position: number;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
};

/** Unit code translation (Faktero unit string → UN/ECE Rec. 20). */
const UNIT_MAP: Record<string, string> = {
  ks: "C62",
  kus: "C62",
  pc: "H87",
  hod: "HUR",
  h: "HUR",
  hodina: "HUR",
  den: "DAY",
  mes: "MON",
  rok: "ANN",
  km: "KMT",
  kg: "KGM",
  l: "LTR",
  m: "MTR",
  m2: "MTK",
  m3: "MTQ",
};

function mapUnit(unit?: string | null): string {
  if (!unit) return "C62";
  return UNIT_MAP[unit.trim().toLowerCase()] ?? "C62";
}

/** Map Faktero invoice type to UNCL1001 document type code. */
function mapDocType(type: string): EN16931Invoice["documentType"] {
  if (type === "credit_note") return "381";
  // Ťarchopis — opravná faktúra, ktorá základ zvyšuje; nesie väzbu na pôvodnú (BT-25).
  if (type === "debit_note") return "383";
  if (type === "advance") return "386" as any; // advance invoice — kept generic
  return "380";
}

/** Map invoice + rate to EN 16931 category code (UNCL5305). */
function mapVatCategory(
  rate: number,
  invoice?: Pick<InvoiceRow, "reverse_charge" | "reverse_charge_type">,
  neplatitel = false,
): EN16931Line["vatCategory"] {
  // Neplatiteľ DPH daň neuplatňuje vôbec — „Z“ by chcela jeho IČ DPH (BR-Z-02).
  if (neplatitel) return "O";
  if (invoice?.reverse_charge) {
    if (invoice.reverse_charge_type === "eu_b2b") return "K"; // VAT exempt for EEA intra-community supply
    if (invoice.reverse_charge_type === "export") return "G"; // Free export item, tax not charged
    return "AE"; // Reverse charge (domestic §69)
  }
  if (rate === 0) return "Z";
  return "S";
}

const DOVOD_NEPLATITEL = "Dodávateľ nie je platiteľ DPH";

function reverseChargeReason(invoice: Pick<InvoiceRow, "reverse_charge_type">): string {
  if (invoice.reverse_charge_type === "eu_b2b")
    return "Intra-Community supply — reverse charge (§43 zákona o DPH)";
  if (invoice.reverse_charge_type === "export")
    return "Export outside EU — VAT exempt (§47 zákona o DPH)";
  return "Reverse charge — domestic supply (§69 ods. 12 zákona o DPH)";
}

/** Peppol id `schéma:hodnota` rozdelené pre EndpointID; bez neho e-mail (EM). */
function endpoint(
  id: string | null,
  email?: string | null,
): Pick<EN16931Party, "endpointId" | "endpointScheme"> {
  if (id) {
    const i = id.indexOf(":");
    return { endpointScheme: id.slice(0, i), endpointId: id.slice(i + 1) };
  }
  return email ? { endpointScheme: "EM", endpointId: email } : {};
}

function buildSellerParty(company: CompanyRow, profile?: ProfileRow | null): EN16931Party {
  return {
    name: company.name,
    vatId: company.ic_dph || undefined,
    taxId: company.dic || undefined,
    registrationId: company.ico || undefined,
    ...endpoint(
      peppolId({ zadane: profile?.peppol_participant_id, dic: company.dic, icDph: company.ic_dph }),
    ),
    address: {
      street: company.street || undefined,
      city: company.city || undefined,
      postalCode: company.zip || undefined,
      countryCode: (company.country || "SK").toUpperCase(),
    },
    contact: {
      name: company.name,
      email: company.email || undefined,
      phone: company.phone || undefined,
    },
  };
}

function buildBuyerParty(inv: InvoiceRow): EN16931Party {
  return {
    name: inv.customer_name ?? "Unknown",
    vatId: inv.customer_ic_dph || undefined,
    taxId: inv.customer_dic || undefined,
    registrationId: inv.customer_ico || undefined,
    /*
      Adresa ako pri odoslaní cez ePoštáka — `0245:<DIČ>`. Predtým tu bolo
      `9944:<IČ DPH>`, ktoré v sieti nenájde nikoho, a pri dodávateľovi sa
      schéma písala dvakrát (`0245:0245:…`).
    */
    ...endpoint(
      peppolId({ zadane: inv.customer_peppol_id, dic: inv.customer_dic, icDph: inv.customer_ic_dph }),
      inv.customer_email,
    ),
    address: {
      street: inv.customer_street || undefined,
      city: inv.customer_city || undefined,
      postalCode: inv.customer_zip || undefined,
      countryCode: (inv.customer_country || "SK").toUpperCase(),
    },
    contact: { name: inv.customer_name || undefined, email: inv.customer_email || undefined },
  };
}

function buildLines(items: InvoiceItemRow[], invoice: InvoiceRow, neplatitel: boolean): EN16931Line[] {
  return items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((it, idx) => ({
      id: String(idx + 1),
      name: it.name,
      description: it.description || undefined,
      quantity: Number(it.quantity),
      unitCode: mapUnit(it.unit),
      unitPrice: Number(it.unit_price),
      lineExtensionAmount: Number(it.subtotal),
      vatCategory: mapVatCategory(Number(it.vat_rate), invoice, neplatitel),
      vatPercent: invoice.reverse_charge || neplatitel ? 0 : Number(it.vat_rate),
    }));
}

function buildTaxSubtotals(
  items: InvoiceItemRow[],
  invoice: InvoiceRow,
  neplatitel: boolean,
): EN16931TaxSubtotal[] {
  const groups = new Map<string, EN16931TaxSubtotal>();
  const reason = invoice.reverse_charge
    ? reverseChargeReason(invoice)
    : neplatitel
      ? DOVOD_NEPLATITEL
      : undefined;
  for (const it of items) {
    const rate = invoice.reverse_charge || neplatitel ? 0 : Number(it.vat_rate);
    const cat = mapVatCategory(rate, invoice, neplatitel);
    const key = `${cat}:${rate}`;
    const cur = groups.get(key) ?? {
      taxableAmount: 0,
      taxAmount: 0,
      vatCategory: cat,
      vatPercent: rate,
      exemptionReason: reason,
    };
    cur.taxableAmount += Number(it.subtotal);
    cur.taxAmount += invoice.reverse_charge || neplatitel ? 0 : Number(it.vat_amount);
    groups.set(key, cur);
  }
  // UBL 2.1: VAT subtotals sorted by rate ascending (0 → 5 → 19 → 23),
  // aby účtovný softvér zoraďoval sadzby v štandardnom poradí.
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      taxableAmount: Math.round(g.taxableAmount * 100) / 100,
      taxAmount: Math.round(g.taxAmount * 100) / 100,
    }))
    .sort((a, b) => a.vatPercent - b.vatPercent);
}

export function mapToEN16931(args: {
  company: CompanyRow;
  profile?: ProfileRow | null;
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  customizationId?: string;
  profileId?: string;
  /** Pôvodná faktúra pri dobropise (BT-25, BT-26). */
  povodnaFaktura?: { cislo: string; vystavena?: string | null } | null;
  /** Odpočty záloh z `invoice_advances` (`nacitajOdpocty`). */
  zalohy?: OdpocetZalohy[] | null;
}): EN16931Invoice {
  const { profile, invoice } = args;
  /* Zľava na doklad sa rozpočíta do riadkov — UBL sumáre vychádzajú z nich. */
  const vlastne = riadkySoZlavou(args.items, (invoice as any).discount_total);
  const neplatitel = args.company.vat_payer === false;
  /*
    Záloha zdanená dokladom k prijatej platbe sa odpočíta záporným riadkom v
    jeho sadzbe — vyúčtovanie tak nesie len rozdiel dane, ako vo výkaze k DPH.
    Nezdanená záloha (aj starý stĺpec `advance_amount` bez väzby) len zníži
    sumu na úhradu (BT-113).
  */
  const dobropisDok = invoice.type === "credit_note";
  const zalohy = dobropisDok ? [] : (args.zalohy ?? []);
  const odpocty: InvoiceItemRow[] = zalohy.flatMap((o) =>
    o.doklad && o.riadky.length
      ? o.riadky.map((r) => ({
          id: `odpocet-${o.doklad}-${r.sadzba}`,
          position: Number.MAX_SAFE_INTEGER,
          name: textOdpoctu(o),
          quantity: -1,
          unit: "ks",
          unit_price: r.zaklad,
          vat_rate: r.sadzba,
          subtotal: -r.zaklad,
          vat_amount: -r.dph,
          total: -(r.zaklad + r.dph),
        }))
      : [],
  );
  const items = [...vlastne, ...odpocty];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const odpZaklad = odpocty.reduce((a, r) => a - r.subtotal, 0);
  const odpDan = odpocty.reduce((a, r) => a - r.vat_amount, 0);
  const nezdanene = dobropisDok
    ? 0
    : args.zalohy?.length
      ? zalohy.filter((o) => !(o.doklad && o.riadky.length)).reduce((a, o) => a + o.suma, 0)
      : Number(invoice.advance_amount ?? 0) || 0;
  // Účet z faktúry, ak si ho zapamätala — inak účet firmy.
  const company = sUctomFaktury(args.company, invoice as any);
  const customizationId =
    args.customizationId ??
    "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const profileId = args.profileId ?? "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

  const buyer = buildBuyerParty(invoice);
  // Mimo rozsahu DPH (O) nesmie doklad niesť IČ DPH ani jednej strany (BR-O-02 až 04).
  if (neplatitel) buyer.vatId = undefined;
  const dto: EN16931Invoice = {
    customizationId,
    profileId,
    precedingInvoice: args.povodnaFaktura
      ? { id: args.povodnaFaktura.cislo, issueDate: args.povodnaFaktura.vystavena ?? null }
      : undefined,
    documentNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    documentType: mapDocType(invoice.type),
    currency: invoice.currency || "EUR",
    buyerReference: invoice.variable_symbol || undefined,
    seller: {
      ...buildSellerParty(company, profile ?? undefined),
      ...(neplatitel ? { vatId: undefined } : {}),
    },
    buyer,
    paymentMeans:
      company.iban || invoice.variable_symbol
        ? {
            code: "58", // SEPA credit transfer
            iban: company.iban || undefined,
            bic: company.swift || undefined,
            accountName: company.name,
            reference: invoice.variable_symbol || invoice.invoice_number,
          }
        : undefined,
    lines: buildLines(items, invoice, neplatitel),
    taxSubtotals: buildTaxSubtotals(items, invoice, neplatitel),
    totals: (() => {
      const bezDane = r2(Number(invoice.subtotal) - odpZaklad);
      const dan = invoice.reverse_charge || neplatitel ? 0 : r2(Number(invoice.vat_total) - odpDan);
      const sDanou = r2(bezDane + dan);
      return {
        lineExtensionAmount: bezDane,
        taxExclusiveAmount: bezDane,
        taxInclusiveAmount: sDanou,
        taxAmount: dan,
        prepaidAmount: nezdanene > 0 ? r2(Math.min(nezdanene, sDanou)) : undefined,
        payableAmount: r2(sDanou - (nezdanene > 0 ? Math.min(nezdanene, sDanou) : 0)),
      };
    })(),
    note:
      [
        invoice.reverse_charge ? reverseChargeReason(invoice) : null,
        neplatitel ? DOVOD_NEPLATITEL : null,
        invoice.notes || null,
      ]
        .filter(Boolean)
        .join(" | ") || undefined,
  };
  /*
    Dobropis (381) sa v UBL píše ako CreditNote s kladnými sumami — „mínus“
    nesie typ dokladu. Vo Fakteri má dobropis sumy záporné, tak sa otočia.
  */
  if (dto.documentType === "381") {
    const a = (n: number) => Math.abs(Number(n) || 0);
    dto.lines = dto.lines.map((l) => ({
      ...l,
      quantity: a(l.quantity),
      lineExtensionAmount: a(l.lineExtensionAmount),
      unitPrice: a(l.unitPrice),
    }));
    dto.taxSubtotals = dto.taxSubtotals.map((t) => ({
      ...t,
      taxableAmount: a(t.taxableAmount),
      taxAmount: a(t.taxAmount),
    }));
    dto.totals = Object.fromEntries(
      Object.entries(dto.totals).map(([k, v]) => [k, a(v as number)]),
    ) as EN16931Invoice["totals"];
  }
  return dto;
}
