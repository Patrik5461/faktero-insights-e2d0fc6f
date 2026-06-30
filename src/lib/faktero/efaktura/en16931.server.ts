/**
 * EN 16931 mapping layer — converts a Faktero invoice (DB row + items + company)
 * into a normalized EN16931 invoice DTO. The XML generator consumes only this
 * DTO, so swapping the source data model (or future supplier invoices) does not
 * affect XML generation.
 */
import type { EN16931Invoice, EN16931Line, EN16931Party, EN16931TaxSubtotal } from "./types";

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
  if (type === "advance") return "386" as any; // advance invoice — kept generic
  return "380";
}

/** Map invoice + rate to EN 16931 category code (UNCL5305). */
function mapVatCategory(rate: number, invoice?: Pick<InvoiceRow, "reverse_charge" | "reverse_charge_type">): EN16931Line["vatCategory"] {
  if (invoice?.reverse_charge) {
    if (invoice.reverse_charge_type === "eu_b2b") return "K";   // VAT exempt for EEA intra-community supply
    if (invoice.reverse_charge_type === "export") return "G";   // Free export item, tax not charged
    return "AE";                                                 // Reverse charge (domestic §69)
  }
  if (rate === 0) return "Z";
  return "S";
}

function reverseChargeReason(invoice: Pick<InvoiceRow, "reverse_charge_type">): string {
  if (invoice.reverse_charge_type === "eu_b2b")
    return "Intra-Community supply — reverse charge (§43 zákona o DPH)";
  if (invoice.reverse_charge_type === "export")
    return "Export outside EU — VAT exempt (§47 zákona o DPH)";
  return "Reverse charge — domestic supply (§69 ods. 12 zákona o DPH)";
}


function buildSellerParty(company: CompanyRow, profile?: ProfileRow | null): EN16931Party {
  return {
    name: company.name,
    vatId: company.ic_dph || undefined,
    taxId: company.dic || undefined,
    registrationId: company.ico || undefined,
    endpointId: profile?.peppol_participant_id || company.ic_dph || undefined,
    endpointScheme: profile?.peppol_scheme || (company.ic_dph ? "9944" : undefined), // 9944 = SK VAT
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
    endpointId: inv.customer_ic_dph || inv.customer_email || undefined,
    endpointScheme: inv.customer_ic_dph ? "9944" : inv.customer_email ? "EM" : undefined,
    address: {
      street: inv.customer_street || undefined,
      city: inv.customer_city || undefined,
      postalCode: inv.customer_zip || undefined,
      countryCode: (inv.customer_country || "SK").toUpperCase(),
    },
    contact: { name: inv.customer_name || undefined, email: inv.customer_email || undefined },
  };
}

function buildLines(items: InvoiceItemRow[]): EN16931Line[] {
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
      vatCategory: mapVatCategory(Number(it.vat_rate)),
      vatPercent: Number(it.vat_rate),
    }));
}

function buildTaxSubtotals(items: InvoiceItemRow[]): EN16931TaxSubtotal[] {
  const groups = new Map<string, EN16931TaxSubtotal>();
  for (const it of items) {
    const rate = Number(it.vat_rate);
    const cat = mapVatCategory(rate);
    const key = `${cat}:${rate}`;
    const cur = groups.get(key) ?? {
      taxableAmount: 0,
      taxAmount: 0,
      vatCategory: cat,
      vatPercent: rate,
    };
    cur.taxableAmount += Number(it.subtotal);
    cur.taxAmount += Number(it.vat_amount);
    groups.set(key, cur);
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    taxableAmount: Math.round(g.taxableAmount * 100) / 100,
    taxAmount: Math.round(g.taxAmount * 100) / 100,
  }));
}

export function mapToEN16931(args: {
  company: CompanyRow;
  profile?: ProfileRow | null;
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  customizationId?: string;
  profileId?: string;
}): EN16931Invoice {
  const { company, profile, invoice, items } = args;
  const customizationId =
    args.customizationId ??
    "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const profileId = args.profileId ?? "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

  return {
    customizationId,
    profileId,
    documentNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    documentType: mapDocType(invoice.type),
    currency: invoice.currency || "EUR",
    buyerReference: invoice.variable_symbol || undefined,
    seller: buildSellerParty(company, profile ?? undefined),
    buyer: buildBuyerParty(invoice),
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
    lines: buildLines(items),
    taxSubtotals: buildTaxSubtotals(items),
    totals: {
      lineExtensionAmount: Number(invoice.subtotal),
      taxExclusiveAmount: Number(invoice.subtotal),
      taxInclusiveAmount: Number(invoice.total),
      taxAmount: Number(invoice.vat_total),
      payableAmount: Number(invoice.total),
    },
    note: invoice.notes || undefined,
  };
}