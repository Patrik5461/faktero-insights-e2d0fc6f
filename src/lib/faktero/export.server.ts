// Server-only helpers for accounting exports.
// Format strategies are pluggable so we can add Omega/Money/Alfa Plus later.

type InvoiceRow = any;
type ItemRow = any;
type CompanyRow = any;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fixed2(n: any) {
  return Number(n ?? 0).toFixed(2);
}

/**
 * Build a Pohoda XML data pack (Stormware) containing N invoice entries.
 * Conforms to the Pohoda XML schema family (invoice / invoiceItem).
 * Reference: data_xml_invoice.xsd
 */
export function buildPohodaInvoiceXml(opts: {
  company: CompanyRow;
  invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
}): string {
  const { company, invoices } = opts;
  const ico = esc(company?.ico ?? "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataPackId = `FAKTERO_${stamp}`;

  const entries = invoices
    .map(({ invoice, items }, idx) => {
      const isCreditNote = invoice.type === "credit_note";
      const invoiceType = isCreditNote ? "issuedCreditNotice" : "issuedInvoice";
      // Pohoda rateVAT enum: "none" = 0 %, "third" = super-znížená (5 %),
      // "low" = znížená (19 %; historicky 10 %), "high" = základná (23 %; historicky 20 %).
      const rateVatCode = (r: number) => {
        const n = Number(r);
        if (n === 0) return "none";
        if (n === 5) return "third";
        if (n === 19 || n === 10) return "low";
        return "high"; // 23, 20 alebo iné → základná
      };
      const bucket = (code: "none" | "third" | "low" | "high") =>
        items.filter((it) => rateVatCode(Number(it.vat_rate)) === code);
      const sum0 = bucket("none");
      const sumThird = bucket("third");
      const sumLow = bucket("low");
      const sumHigh = bucket("high");
      const sumBase = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.subtotal ?? 0), 0);
      const sumVat = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.vat_amount ?? 0), 0);

      const itemRows = items
        .map(
          (it) => `
        <inv:invoiceItem>
          <inv:text>${esc(it.name)}</inv:text>
          <inv:quantity>${Number(it.quantity ?? 0)}</inv:quantity>
          <inv:unit>${esc(it.unit ?? "ks")}</inv:unit>
          <inv:rateVAT>${rateVatCode(Number(it.vat_rate))}</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>${fixed2(it.unit_price)}</typ:unitPrice>
            <typ:price>${fixed2(it.subtotal)}</typ:price>
            <typ:priceVAT>${fixed2(it.vat_amount)}</typ:priceVAT>
            <typ:priceSum>${fixed2(it.total)}</typ:priceSum>
          </inv:homeCurrency>
        </inv:invoiceItem>`,
        )
        .join("");

      return `
  <dat:dataPackItem id="INV${idx + 1}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>${invoiceType}</inv:invoiceType>
        <inv:number><typ:numberRequested>${esc(invoice.invoice_number)}</typ:numberRequested></inv:number>
        <inv:symVar>${esc(invoice.variable_symbol ?? invoice.invoice_number)}</inv:symVar>
        <inv:date>${esc(invoice.issue_date)}</inv:date>
        <inv:dateTax>${esc(invoice.delivery_date ?? invoice.issue_date)}</inv:dateTax>
        <inv:dateDue>${esc(invoice.due_date)}</inv:dateDue>
        <inv:text>${esc(invoice.notes ?? `Faktúra ${invoice.invoice_number}`)}</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>${esc(invoice.customer_name)}</typ:company>
            <typ:street>${esc(invoice.customer_street ?? "")}</typ:street>
            <typ:city>${esc(invoice.customer_city ?? "")}</typ:city>
            <typ:zip>${esc(invoice.customer_zip ?? "")}</typ:zip>
            <typ:country><typ:ids>${esc(invoice.customer_country ?? "SK")}</typ:ids></typ:country>
            <typ:ico>${esc(invoice.customer_ico ?? "")}</typ:ico>
            <typ:dic>${esc(invoice.customer_dic ?? "")}</typ:dic>
            <typ:icDph>${esc(invoice.customer_ic_dph ?? "")}</typ:icDph>
            <typ:email>${esc(invoice.customer_email ?? "")}</typ:email>
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>
        <inv:account><typ:accountNo>${esc(company?.iban ?? "")}</typ:accountNo></inv:account>
      </inv:invoiceHeader>
      <inv:invoiceDetail>${itemRows}
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceNone>${fixed2(sumBase(sum0))}</typ:priceNone>
          <typ:priceThird>${fixed2(sumBase(sumThird))}</typ:priceThird>
          <typ:priceThirdVAT>${fixed2(sumVat(sumThird))}</typ:priceThirdVAT>
          <typ:priceLow>${fixed2(sumBase(sumLow))}</typ:priceLow>
          <typ:priceLowVAT>${fixed2(sumVat(sumLow))}</typ:priceLowVAT>
          <typ:priceHigh>${fixed2(sumBase(sumHigh))}</typ:priceHigh>
          <typ:priceHighVAT>${fixed2(sumVat(sumHigh))}</typ:priceHighVAT>
          <typ:round><typ:priceRound>0.00</typ:priceRound></typ:round>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="${dataPackId}" ico="${ico}" application="Faktero" version="2.0" note="Export z Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${entries}
</dat:dataPack>`;
}

export type ExportFormat = "pohoda_xml";

export interface ExportStrategy {
  format: ExportFormat;
  target_system: "pohoda";
  build(input: { company: CompanyRow; invoices: { invoice: InvoiceRow; items: ItemRow[] }[] }): {
    content: string;
    fileName: string;
    mime: string;
  };
}

export const POHODA_XML: ExportStrategy = {
  format: "pohoda_xml",
  target_system: "pohoda",
  build({ company, invoices }) {
    const content = buildPohodaInvoiceXml({ company, invoices });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `pohoda-faktury-${stamp}.xml`;
    return { content, fileName, mime: "application/xml" };
  },
};

export const EXPORT_STRATEGIES: Record<ExportFormat, ExportStrategy> = {
  pohoda_xml: POHODA_XML,
};
