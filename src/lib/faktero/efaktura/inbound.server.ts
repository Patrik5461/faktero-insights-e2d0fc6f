/**
 * Incoming eFaktúra processing architecture.
 *
 * Inbound documents (from Peppol AP, Digitálny poštár, or e-mail attachment)
 * arrive as raw XML. This module owns the pipeline:
 *
 *   raw XML -> parse minimal envelope -> persist as efaktura_received_documents
 *           -> mark `received` -> async parser fills `parsed_data` -> match
 *           -> human approves -> link to supplier invoice.
 *
 * Only the parsing scaffold is implemented; matching to a supplier-invoices
 * module is a future step.
 */
import type {
  EfakturaChannel,
  EfakturaDocFormat,
  EfakturaReceivedStatus,
} from "./types";

export type IncomingDocumentInput = {
  companyId: string;
  channel: EfakturaChannel;
  format?: EfakturaDocFormat;
  xml: string;
  providerMessageId?: string;
  sender?: { participantId?: string; scheme?: string };
  receivedAt?: string;
};

export type ParsedEfaktura = {
  format: EfakturaDocFormat;
  documentNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  total?: number;
  vatTotal?: number;
  senderName?: string;
  senderVatId?: string;
  errors: { code: string; message: string }[];
};

/**
 * Minimal regex-based extraction. A real XML parser will replace this when
 * we ship inbound support; the pipeline contract stays the same.
 */
export function parseEfakturaEnvelope(xml: string): ParsedEfaktura {
  const errors: ParsedEfaktura[ "errors" ] = [];
  const pick = (re: RegExp): string | undefined => {
    const m = xml.match(re);
    return m?.[1]?.trim();
  };
  const num = (s?: string): number | undefined => {
    if (!s) return undefined;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const documentNumber = pick(/<cbc:ID>([^<]+)<\/cbc:ID>/);
  const issueDate = pick(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
  const dueDate = pick(/<cbc:DueDate>([^<]+)<\/cbc:DueDate>/);
  const currency = pick(/<cbc:DocumentCurrencyCode>([^<]+)<\/cbc:DocumentCurrencyCode>/);
  const total = num(pick(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/));
  const vatTotal = num(pick(/<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/));
  const senderName = pick(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/);
  const senderVatId = pick(/<cac:AccountingSupplierParty>[\s\S]*?<cac:PartyTaxScheme>[\s\S]*?<cbc:CompanyID>([^<]+)<\/cbc:CompanyID>/);

  if (!documentNumber) errors.push({ code: "PARSE_NO_ID", message: "Missing invoice number" });
  if (!issueDate) errors.push({ code: "PARSE_NO_DATE", message: "Missing issue date" });

  return {
    format: "peppol_bis_3",
    documentNumber,
    issueDate,
    dueDate,
    currency,
    total,
    vatTotal,
    senderName,
    senderVatId,
    errors,
  };
}

export function statusFromParse(parsed: ParsedEfaktura): EfakturaReceivedStatus {
  if (parsed.errors.length > 0) return "received";
  return "parsed";
}

/**
 * High-level entry point used by inbound providers / webhooks.
 * Persistence is delegated to the caller so this stays free of DB coupling
 * (and easy to unit-test).
 */
export type PersistIncoming = (row: {
  company_id: string;
  channel: EfakturaChannel;
  format: EfakturaDocFormat;
  xml_payload: string;
  parsed_data: ParsedEfaktura;
  status: EfakturaReceivedStatus;
  document_number?: string;
  issue_date?: string;
  due_date?: string;
  currency?: string;
  total?: number;
  vat_total?: number;
  sender_name?: string;
  sender_vat_id?: string;
  sender_participant_id?: string;
  sender_scheme?: string;
  received_at: string;
  parse_errors: ParsedEfaktura["errors"];
}) => Promise<{ id: string }>;

export async function ingestIncoming(input: IncomingDocumentInput, persist: PersistIncoming) {
  const parsed = parseEfakturaEnvelope(input.xml);
  const status = statusFromParse(parsed);
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const result = await persist({
    company_id: input.companyId,
    channel: input.channel,
    format: input.format ?? parsed.format,
    xml_payload: input.xml,
    parsed_data: parsed,
    status,
    document_number: parsed.documentNumber,
    issue_date: parsed.issueDate,
    due_date: parsed.dueDate,
    currency: parsed.currency,
    total: parsed.total,
    vat_total: parsed.vatTotal,
    sender_name: parsed.senderName,
    sender_vat_id: parsed.senderVatId,
    sender_participant_id: input.sender?.participantId,
    sender_scheme: input.sender?.scheme,
    received_at: receivedAt,
    parse_errors: parsed.errors,
  });
  return { id: result.id, parsed, status };
}