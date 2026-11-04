/*
  Ktoré doklady sa účtujú — jediné miesto, podľa ktorého sa riadi kontrola
  zaúčtovania pred exportom (predkontácia, členenie DPH, KV DPH), XML pre
  Pohodu, panel zaúčtovania aj pravidlá automatického účtovania.

  Účtujú sa: faktúra, dobropis, ťarchopis, daňový doklad k prijatej platbe,
  prijatá faktúra a dobropis, bloček. Zálohová faktúra (vydaná aj prijatá),
  cenová ponuka, objednávka a koncept nie sú daňový ani účtovný doklad — v
  Pohode sa neúčtujú, takže predkontáciu ani členenia nepotrebujú a nedostanú.
*/

/** Typy dokladov, ktoré sa účtujú — typ vo Fakteri aj druh dokladu v Pohode. */
const UCTOVNE_TYPY = new Set([
  // invoices.type / purchase_invoices.type
  "regular",
  "credit_note",
  "debit_note",
  "advance_payment",
  // `_typPohody` dokladov pre export (prijaté faktúry, daňový doklad k platbe)
  "issuedInvoice",
  "issuedCreditNotice",
  "issuedDebitNote",
  "receivedInvoice",
  "receivedCreditNotice",
  "receivedDebitNote",
  "danovyDokladKPlatbe",
]);

/**
 * Účtuje sa doklad tohto typu? Bez typu (bloček, výdavkový doklad) áno.
 * Zálohová faktúra (`proforma`, `issuedAdvanceInvoice`,
 * `receivedAdvanceInvoice`), ponuka, objednávka a koncept (`status = draft`) nie.
 */
export function isAccountingDocument(type?: string | null, status?: string | null): boolean {
  if (String(status ?? "") === "draft") return false;
  const t = String(type ?? "").trim();
  return !t || UCTOVNE_TYPY.has(t);
}
