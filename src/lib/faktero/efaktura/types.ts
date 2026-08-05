/**
 * eFaktúra 2027 Core — shared types (client-safe).
 */

export type EfakturaChannel = "peppol" | "digitalny_postar" | "email" | "manual";
export type EfakturaDocFormat = "ubl_2_1" | "peppol_bis_3" | "cii_d16b";
export type EfakturaDocStatus = "draft" | "generated" | "validated" | "invalid" | "archived";
export type EfakturaDeliveryStatus =
  "pending" | "sent" | "accepted" | "delivered" | "failed" | "rejected";

export type EfakturaReceivedStatus =
  "received" | "parsed" | "matched" | "accepted" | "rejected" | "archived";

export type ReadinessCheckSeverity = "blocker" | "warning" | "info";

export type ReadinessCheck = {
  key: string;
  label: string;
  group: "company" | "vat" | "peppol" | "xml" | "process";
  ok: boolean;
  severity: ReadinessCheckSeverity;
  weight: number; // 0–100 contribution when ok
  hint?: string;
  fixUrl?: string;
};

export type ReadinessReport = {
  companyId: string;
  score: number; // 0–100
  checkedAt: string;
  groups: Record<ReadinessCheck["group"], { score: number; max: number }>;
  checks: ReadinessCheck[];
  missing: ReadinessCheck[];
  blockers: ReadinessCheck[];
};

/** EN 16931 normalized invoice DTO — single source of truth for the XML layer. */
export type EN16931Invoice = {
  customizationId: string;
  profileId: string;
  documentNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  documentType: "380" | "381" | "384" | "389"; // UNCL1001: 380=invoice, 381=credit, 384=corrected, 389=self-billed
  currency: string;
  buyerReference?: string;
  seller: EN16931Party;
  buyer: EN16931Party;
  paymentMeans?: {
    code: string; // UNCL4461 (58 = SEPA credit transfer)
    iban?: string;
    bic?: string;
    accountName?: string;
    reference?: string; // remittance / variable symbol
  };
  lines: EN16931Line[];
  taxSubtotals: EN16931TaxSubtotal[];
  totals: {
    lineExtensionAmount: number;
    taxExclusiveAmount: number;
    taxInclusiveAmount: number;
    taxAmount: number;
    payableAmount: number;
  };
  note?: string;
};

export type EN16931Party = {
  name: string;
  vatId?: string; // IČ DPH
  taxId?: string; // DIČ
  registrationId?: string; // IČO
  endpointId?: string; // Peppol participant id
  endpointScheme?: string; // iso6523 scheme
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    countryCode: string;
  };
  contact?: { name?: string; email?: string; phone?: string };
};

export type EN16931Line = {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unitCode: string; // UN/ECE Rec. 20 (e.g. "C62" piece, "HUR" hour)
  unitPrice: number;
  lineExtensionAmount: number; // net
  vatCategory: "S" | "Z" | "E" | "AE" | "K" | "G" | "O"; // UNCL5305
  vatPercent: number;
};

export type EN16931TaxSubtotal = {
  taxableAmount: number;
  taxAmount: number;
  vatCategory: EN16931Line["vatCategory"];
  vatPercent: number;
  exemptionReason?: string;
};

/** Result returned from XML generation pipeline. */
export type XmlGenerationResult = {
  format: EfakturaDocFormat;
  schemaVersion: string;
  customizationId: string;
  profileId: string;
  xml: string;
  payloadHash: string;
  validationErrors: { code: string; message: string; path?: string }[];
  valid: boolean;
};
