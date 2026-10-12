/**
 * Náhľad prijatej eFaktúry ako PDF.
 *
 * eFaktúra je XML (UBL, Peppol BIS 3) — človek ju chce vidieť ako faktúru. Keď
 * odosielateľ priložil PDF (AdditionalDocumentReference s EmbeddedDocumentBinaryObject
 * application/pdf), ukáže sa jeho PDF. Inak sa faktúra z XML vykreslí tým istým
 * generátorom ako vystavené faktúry: dodávateľ z AccountingSupplierParty,
 * odberateľ z AccountingCustomerParty, položky z InvoiceLine / CreditNoteLine.
 */
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  textNodeName: "#text",
  parseTagValue: false,
});

const pole = <T>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
const txt = (v: any): string | null => {
  if (v == null) return null;
  if (typeof v === "object") return v["#text"] != null ? String(v["#text"]).trim() : null;
  const s = String(v).trim();
  return s || null;
};
const num = (v: any): number => {
  const n = Number(txt(v));
  return Number.isFinite(n) ? n : 0;
};

/** Priložené PDF z eFaktúry, ak ho odosielateľ poslal. */
export function prilozenePdf(xml: string): Uint8Array | null {
  try {
    const d = parser.parse(xml);
    const koren = d.Invoice ?? d.CreditNote;
    for (const ref of pole(koren?.AdditionalDocumentReference)) {
      const obj = ref?.Attachment?.EmbeddedDocumentBinaryObject;
      if (!obj) continue;
      const mime = String(obj["@mimeCode"] ?? "").toLowerCase();
      const meno = String(obj["@filename"] ?? "").toLowerCase();
      if (mime !== "application/pdf" && !meno.endsWith(".pdf")) continue;
      const b64 = txt(obj);
      if (b64) return new Uint8Array(Buffer.from(b64.replace(/\s/g, ""), "base64"));
    }
  } catch {
    /* poškodené XML — náhľad sa skúsi vykresliť */
  }
  return null;
}

function strana(party: any) {
  const p = party?.Party ?? party;
  const adresa = p?.PostalAddress ?? {};
  const nazov =
    txt(p?.PartyLegalEntity?.RegistrationName) ?? txt(pole(p?.PartyName)[0]?.Name) ?? "—";
  const icDph =
    pole(p?.PartyTaxScheme)
      .map((x: any) => txt(x?.CompanyID))
      .find(Boolean) ?? null;
  const ico = txt(p?.PartyLegalEntity?.CompanyID) ?? txt(pole(p?.PartyIdentification)[0]?.ID);
  return {
    name: nazov,
    street:
      [txt(adresa.StreetName), txt(adresa.AdditionalStreetName)].filter(Boolean).join(", ") || null,
    city: txt(adresa.CityName),
    zip: txt(adresa.PostalZone),
    country: txt(adresa.Country?.IdentificationCode),
    ic_dph: icDph,
    // V UBL býva v PartyLegalEntity/CompanyID IČO; keď je to IČ DPH, IČO sa nevypíše.
    ico: ico && ico !== icDph ? ico.replace(/^\d{4}:/, "") : null,
    email: txt(p?.Contact?.ElectronicMail),
    phone: txt(p?.Contact?.Telephone),
  };
}

/** Údaje pre `generateInvoicePdfBytes` z UBL XML. */
export function ublNaPdfVstup(xml: string): { company: any; invoice: any; items: any[] } {
  const d = parser.parse(xml);
  const dobropis = Boolean(d.CreditNote);
  const k = d.Invoice ?? d.CreditNote;
  if (!k) throw new Error("XML nie je eFaktúra (UBL Invoice ani CreditNote).");

  const dod = strana(k.AccountingSupplierParty);
  const odb = strana(k.AccountingCustomerParty);
  const platba = pole(k.PaymentMeans)[0];
  const ucet = platba?.PayeeFinancialAccount;
  const total = k.LegalMonetaryTotal ?? {};
  const dan = pole(k.TaxTotal).find((t: any) => t?.TaxSubtotal) ?? pole(k.TaxTotal)[0];
  const riadky = pole(dobropis ? k.CreditNoteLine : k.InvoiceLine);
  const mena = txt(k.DocumentCurrencyCode) ?? "EUR";

  const items = riadky.map((r: any, i: number) => {
    const mnozstvo = num(dobropis ? r.CreditedQuantity : r.InvoicedQuantity) || 1;
    const zaklad = num(r.LineExtensionAmount);
    const kat = r.Item?.ClassifiedTaxCategory ?? {};
    const sadzba = num(kat.Percent);
    const pdp = ["AE", "K", "G"].includes(String(txt(kat.ID) ?? ""));
    const popis = pole(r.Item?.Description).map(txt).filter(Boolean).join(" ");
    const vatAmount = Math.round(zaklad * (pdp ? 0 : sadzba)) / 100;
    return {
      position: i + 1,
      name: txt(r.Item?.Name) ?? popis ?? `Položka ${i + 1}`,
      description: popis && popis !== txt(r.Item?.Name) ? popis : null,
      quantity: dobropis ? -mnozstvo : mnozstvo,
      unit:
        txt(dobropis ? r.CreditedQuantity?.["@unitCode"] : r.InvoicedQuantity?.["@unitCode"]) ===
        "HUR"
          ? "hod"
          : "ks",
      unit_price: num(r.Price?.PriceAmount) || zaklad / mnozstvo,
      vat_rate: pdp ? 0 : sadzba,
      subtotal: dobropis ? -zaklad : zaklad,
      vat_amount: dobropis ? -vatAmount : vatAmount,
      total: (dobropis ? -1 : 1) * (zaklad + vatAmount),
      prenesenie: pdp && String(txt(kat.ID)) === "AE",
      colny_kod: txt(pole(r.Item?.CommodityClassification)[0]?.ItemClassificationCode),
      krajina_povodu: txt(r.Item?.OriginCountry?.IdentificationCode),
    };
  });

  const zn = dobropis ? -1 : 1;
  const iban = txt(ucet?.ID);
  const company = {
    ...dod,
    dic: null,
    iban,
    swift: txt(ucet?.FinancialInstitutionBranch?.ID),
    vat_payer: Boolean(dod.ic_dph),
    vat_scheme: null,
  };
  const prenesenieCele = items.length > 0 && items.every((x) => x.prenesenie);
  const invoice = {
    invoice_number: txt(k.ID) ?? "—",
    type: dobropis ? "credit_note" : "regular",
    status: "issued",
    issue_date: txt(k.IssueDate),
    delivery_date: txt(k.Delivery?.ActualDeliveryDate) ?? txt(k.TaxPointDate) ?? txt(k.IssueDate),
    due_date: txt(k.DueDate) ?? txt(pole(k.PaymentTerms)[0]?.Note) ?? null,
    currency: mena,
    variable_symbol: txt(platba?.PaymentID)?.replace(/\D/g, "").slice(0, 10) || null,
    payment_method: "bank_transfer",
    subtotal: zn * num(total.TaxExclusiveAmount),
    vat_total: zn * num(dan?.TaxAmount),
    total: zn * (num(total.PayableAmount) || num(total.TaxInclusiveAmount)),
    notes: pole(k.Note).map(txt).filter(Boolean).join("\n") || null,
    reverse_charge: prenesenieCele,
    reverse_charge_type: prenesenieCele ? "domestic_69" : null,
    customer_name: odb.name,
    customer_street: odb.street,
    customer_city: odb.city,
    customer_zip: odb.zip,
    customer_country: odb.country,
    customer_ico: odb.ico,
    customer_dic: null,
    customer_ic_dph: odb.ic_dph,
    customer_email: odb.email,
    language: "sk",
  };
  return { company, invoice, items };
}

/** PDF prijatej eFaktúry — priložené, inak vykreslené z XML. */
export async function pdfPrijatejEfaktury(
  xml: string,
): Promise<{ bajty: Uint8Array; prilozene: boolean }> {
  const pril = prilozenePdf(xml);
  if (pril) return { bajty: pril, prilozene: true };
  const { generateInvoicePdfBytes } = await import("../pdf-generator.server");
  const vstup = ublNaPdfVstup(xml);
  const bajty = await generateInvoicePdfBytes({
    ...vstup,
    documentLabel:
      vstup.invoice.type === "credit_note" ? "DOBROPIS · eFaktúra" : "FAKTÚRA · eFaktúra",
  });
  return { bajty, prilozene: false };
}

/**
 * PDF eFaktúry priloží k prijatej faktúre (ak ešte prílohu nemá) — detail
 * prijatej faktúry potom ukáže náhľad a príloha ide aj do Pohody. Nezlyhá:
 * faktúra bez náhľadu je stále platná faktúra.
 */
export async function prilozPdfKPrijatej(
  supabase: any,
  companyId: string,
  invoiceId: string,
  xml: string,
): Promise<boolean> {
  try {
    const { data: f } = await supabase
      .from("purchase_invoices")
      .select("file_path")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!f || f.file_path) return false;
    const { bajty } = await pdfPrijatejEfaktury(xml);
    const cesta = `${companyId}/efaktura-${invoiceId}.pdf`;
    const { error: chybaNahratia } = await supabase.storage
      .from("purchase-invoices")
      .upload(cesta, bajty, { contentType: "application/pdf", upsert: true });
    if (chybaNahratia) return false;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ file_path: cesta, file_mime: "application/pdf" })
      .eq("id", invoiceId)
      .is("file_path", null);
    return !error;
  } catch (e) {
    console.warn("[efaktura] náhľad PDF sa nepriložil:", String((e as Error)?.message ?? e));
    return false;
  }
}
