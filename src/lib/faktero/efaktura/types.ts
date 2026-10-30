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
  documentType: "380" | "381" | "383" | "384" | "386" | "389"; // UNCL1001: 380=invoice, 381=credit, 383=debit (ťarchopis), 384=corrected, 386=prepayment, 389=self-billed
  currency: string;
  /**
   * BT-6 + BT-111 — mena účtovania DPH a celková DPH v nej. Faktúra v cudzej
   * mene musí niesť daň v domácej mene (SK € podľa § 26 zákona o DPH, CZ Kč);
   * v UBL ide o TaxCurrencyCode a druhý TaxTotal bez rozpisu.
   */
  taxCurrency?: { code: string; taxAmount: number };
  buyerReference?: string;
  /** BT-13 — číslo objednávky odberateľa. */
  orderReference?: string;
  /** BT-72 — dátum dodania (nemecká faktúra ho musí niesť, § 14 Abs. 4 Nr. 6 UStG). */
  deliveryDate?: string;
  /** BG-15 — kam sa dodalo (dodanie tovaru do EÚ ho musí mať, BR-IC-12). */
  deliveryAddress?: EN16931Party["address"];
  /** BT-20 — platobné podmienky textom. */
  paymentTerms?: string;
  /** BT-25/BT-26 — pôvodná faktúra, ktorú dobropis opravuje (povinné pri 381). */
  precedingInvoice?: { id: string; issueDate?: string | null };
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
    /** Nezdanená záloha (BT-113). */
    prepaidAmount?: number;
    /** BT-114 — zaokrúhlenie sumy na úhradu (napr. hotovosť na 5 centov). */
    roundingAmount?: number;
    payableAmount: number;
  };
  note?: string;
  /**
   * BG-24 — prílohy (`cac:AdditionalDocumentReference`): PDF faktúry a ďalšie
   * podklady. `obsah` je base64 bez `data:` prefixu.
   */
  prilohy?: { id: string; popis?: string | null; mime: string; nazov: string; obsah: string }[];
};

export type EN16931Party = {
  name: string;
  vatId?: string; // IČ DPH
  taxId?: string; // DIČ
  /**
   * BT-32 — daňové registračné číslo iné než IČ DPH (nemecká Steuernummer).
   * V UBL ide do druhého `PartyTaxScheme` so schémou „FC“, v CII do
   * `SpecifiedTaxRegistration` so `schemeID="FC"`. Slovenský Peppol ho nepíše.
   */
  taxRegistrationId?: string;
  /** BT-33 — doplňujúce právne údaje (Registergericht, Geschäftsführer). */
  legalInfo?: string;
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
  /** Colný kód (KN/HS) — BT-158, CommodityClassification listID="HS". */
  colnyKod?: string;
  /** Krajina pôvodu — BT-159, OriginCountry. */
  krajinaPovodu?: string;
};

export type EN16931TaxSubtotal = {
  taxableAmount: number;
  taxAmount: number;
  vatCategory: EN16931Line["vatCategory"];
  vatPercent: number;
  exemptionReason?: string;
  /** BT-121 — kód dôvodu oslobodenia (VATEX). */
  exemptionReasonCode?: string;
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

/** Stav onboardingu „len odosielanie“ pre zákaznícke rozhranie. */
export type OdosielanieFirmy = {
  stav: string;
  nextAction: string | null;
  /** Text pre firmu od ePoštáka (clientMessage.sk). */
  sprava: string | null;
  prijemPoskytovatel: string | null;
  aktivovaneAt: string | null;
};
