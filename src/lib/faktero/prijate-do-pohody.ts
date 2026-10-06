/*
  Prijatá faktúra v tvare prijatého dokladu pre export do Pohody.

  Export dokladov (`polozkyDokladov`) zapisuje súhrn po sadzbách, nie položky
  — rovnako ako účtovník zadáva prijatú faktúru ručne. Tu sa prijatá faktúra
  len prevedie na ten istý tvar: rozpis DPH, predkontácia a členenie z
  zaúčtovania, číslo faktúry dodávateľa ako `originalDocument`.
*/

import { najblizsiaSadzba } from "./vat-rates";
import { prepocitajPolozku, sumySamofaktury } from "./samofakturacia";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function rozpisPrijatej(p: any): { sadzba: number; zaklad: number; dph: number }[] {
  // Samofaktúra má vlastné položky so sadzbami — rozpis je presný.
  if (p?.samofakturacia && Array.isArray(p.items) && p.items.length) {
    return sumySamofaktury(
      p.items.map((x: any) => prepocitajPolozku(x, Number(x.vat_rate) > 0)),
      Number(p.discount_total ?? 0),
    ).sadzby.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dph: x.dan }));
  }
  const zaklad = Number(p?.amount_without_vat ?? 0);
  const dph = Number(p?.vat_amount ?? 0);
  if (!zaklad && !dph) return [];
  const sadzba = zaklad ? najblizsiaSadzba((dph / zaklad) * 100, "SK") : 0;
  return [{ sadzba, zaklad: r2(zaklad), dph: r2(dph) }];
}

/** Riadok `purchase_invoices` → doklad pre `polozkyDokladov`. */
export function prijataAkoDoklad(p: any): Record<string, unknown> {
  const spolu = Number(p?.amount_total ?? 0);
  return {
    id: p.id,
    company_id: p.company_id,
    supplier_name: p.supplier_name,
    supplier_ico: p.supplier_ico,
    supplier_ic_dph: p.supplier_ic_dph,
    document_number: p.invoice_number,
    issue_date: p.issue_date,
    currency: p.currency,
    payment_method: p.payment_method,
    note: p.note,
    category: p.category,
    pohoda_predkontacia: p.pohoda_predkontacia,
    pohoda_clenenie_dph: p.pohoda_clenenie_dph,
    rozuctovanie: p.rozuctovanie,
    job_id: p.job_id,
    stredisko: p.stredisko,
    cinnost: p.cinnost,
    pohoda_rad: p.pohoda_rad,
    int_poznamka: p.int_poznamka,
    kv_clenenie: p.kv_clenenie,
    file_path: p.file_path,
    pdf_token: p.pdf_token,
    total_amount: spolu,
    vat_breakdown: rozpisPrijatej(p),
    _povodneCislo: p.invoice_number,
    _symVar: p.variable_symbol,
    _datumDph: p.delivery_date || p.issue_date,
    _splatnost: p.due_date,
    _typPohody: spolu < 0 || p.opravuje_cislo ? "receivedCreditNotice" : "receivedInvoice",
  };
}
