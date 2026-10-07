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

/** Položka prijatej faktúry prepočítaná na základ a daň (sumy so znamienkom dokladu). */
export type PolozkaPrijatej = {
  nazov: string;
  mnozstvo: number;
  mj: string | null;
  /** Jednotková cena bez DPH. */
  cena: number;
  sadzba: number;
  zaklad: number;
  dph: number;
  /** Prenesenie daňovej povinnosti (§ 69 ods. 12) — daň odvedie odberateľ. */
  pdp: boolean;
  predkontacia: string | null;
  clenenie: string | null;
};

const jePdp = (x: any, p: any) =>
  x?.pdp === true ||
  x?.reverse_charge === true ||
  // Celá faktúra v prenesení: položky bez dane sú prenesené.
  ((p?.reverse_charge === true || p?.dph_rezim === "samozdanenie") && !(Number(x?.vat_rate) > 0));

/**
 * Položky prijatej faktúry so základom a daňou — len keď sedia so súčtami
 * faktúry (na pár centov). Sumy položiek z čítania bývajú raz bez DPH, raz
 * s DPH; rozhodne, ktorému súčtu faktúry sa súčet položiek rovná. Inak null
 * a faktúra ide súhrnom.
 */
export function polozkyPrijatej(p: any): PolozkaPrijatej[] | null {
  const items: any[] = Array.isArray(p?.items) ? p.items.filter((x: any) => String(x?.name ?? "").trim()) : [];
  if (!items.length) return null;
  if (items.some((x) => x?.vat_rate === null || x?.vat_rate === undefined || !Number.isFinite(Number(x.vat_rate))))
    return null;
  const suma = (x: any) => {
    const t = Number(x?.total);
    return Number.isFinite(t) && x?.total !== null && x?.total !== undefined
      ? t
      : (Number(x?.quantity ?? 1) || 1) * Number(x?.unit_price ?? 0);
  };
  const zn = Number(p?.amount_total ?? 0) < 0 ? -1 : 1;
  const sucet = items.reduce((a, x) => a + Math.abs(suma(x)), 0);
  const bezDph = Math.abs(Number(p?.amount_without_vat ?? 0));
  const sDph = Math.abs(Number(p?.amount_total ?? 0));
  const tol = Math.max(0.03, 0.01 * items.length);
  const netto = Math.abs(sucet - bezDph) <= tol;
  const brutto = !netto && Math.abs(sucet - sDph) <= tol;
  if (!netto && !brutto) return null;
  const out: PolozkaPrijatej[] = items.map((x) => {
    const sadzba = Number(x.vat_rate) || 0;
    const pdp = jePdp(x, p);
    const t = Math.abs(suma(x));
    const zaklad = r2(netto || pdp ? t : t / (1 + sadzba / 100));
    const dph = pdp ? 0 : r2(netto ? (zaklad * sadzba) / 100 : t - zaklad);
    const mnozstvo = Math.abs(Number(x?.quantity ?? 1)) || 1;
    return {
      nazov: String(x.name).trim(),
      mnozstvo,
      mj: x?.unit ? String(x.unit) : null,
      cena: r2(zaklad / mnozstvo),
      sadzba,
      zaklad,
      dph,
      pdp,
      predkontacia: x?.predkontacia ? String(x.predkontacia) : null,
      clenenie: x?.clenenie ? String(x.clenenie) : null,
    };
  });
  // Daň dorovná položka s najväčšou daňou — na faktúre je daň zaokrúhlená po sadzbách.
  const dphFaktury = Math.abs(Number(p?.vat_amount ?? 0));
  const dphPoloziek = out.reduce((a, x) => a + x.dph, 0);
  const rozdiel = r2(dphFaktury - dphPoloziek);
  if (Math.abs(rozdiel) > Math.max(0.05, 0.01 * out.length)) return null;
  if (rozdiel) {
    const naj = out.filter((x) => !x.pdp).sort((a, b) => b.dph - a.dph)[0];
    if (!naj) return null;
    naj.dph = r2(naj.dph + rozdiel);
  }
  return out.map((x) => ({ ...x, zaklad: zn * x.zaklad, dph: zn * x.dph, cena: zn * x.cena }));
}

export function rozpisPrijatej(p: any): { sadzba: number; zaklad: number; dph: number; pdp?: boolean }[] {
  // Samofaktúra má vlastné položky so sadzbami — rozpis je presný.
  if (p?.samofakturacia && Array.isArray(p.items) && p.items.length) {
    return sumySamofaktury(
      p.items.map((x: any) => prepocitajPolozku(x, Number(x.vat_rate) > 0)),
      Number(p.discount_total ?? 0),
    ).sadzby.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dph: x.dan }));
  }
  // Z položiek po sadzbách (aj so zmiešaným prenesením daňovej povinnosti).
  const polozky = polozkyPrijatej(p);
  if (polozky) {
    const po = new Map<string, { sadzba: number; zaklad: number; dph: number; pdp?: boolean }>();
    for (const x of polozky) {
      const k = `${x.sadzba}|${x.pdp}`;
      const r = po.get(k) ?? { sadzba: x.sadzba, zaklad: 0, dph: 0, ...(x.pdp ? { pdp: true } : {}) };
      r.zaklad = r2(r.zaklad + x.zaklad);
      r.dph = r2(r.dph + x.dph);
      po.set(k, r);
    }
    return [...po.values()].sort((a, b) => b.sadzba - a.sadzba);
  }
  const zaklad = Number(p?.amount_without_vat ?? 0);
  const dph = Number(p?.vat_amount ?? 0);
  if (!zaklad && !dph) return [];
  const sadzba = zaklad ? najblizsiaSadzba((dph / zaklad) * 100, "SK") : 0;
  return [{ sadzba, zaklad: r2(zaklad), dph: r2(dph) }];
}

/** Text prijatej faktúry pre Pohodu — čo sa fakturuje. */
export function textPrijatej(p: any): string {
  const uvod = String(p?.intro_note ?? "").trim();
  if (uvod) return uvod.slice(0, 240);
  const polozky = (Array.isArray(p?.items) ? p.items : [])
    .map((x: any) => String(x?.name ?? "").trim())
    .filter(Boolean);
  if (polozky.length)
    return (polozky.slice(0, 3).join(", ") + (polozky.length > 3 ? " a ďalšie" : "")).slice(0, 240);
  return `Faktúra č. ${p?.invoice_number ?? ""}`.trim();
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
    supplier_dic: p.supplier_dic,
    supplier_street: p.supplier_street,
    supplier_city: p.supplier_city,
    supplier_zip: p.supplier_zip,
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
    // Položky pre Pohodu — len keď sedia so súčtami faktúry.
    _polozkyPrijatej: polozkyPrijatej(p),
    /*
      Text faktúry v Pohode je popis plnenia, nie názov dodávateľa (ten je
      v adrese): text nad položkami, inak názvy položiek, inak číslo faktúry.
    */
    _text: textPrijatej(p),
    _symVar: p.variable_symbol,
    _datumDph: p.delivery_date || p.issue_date,
    _splatnost: p.due_date,
    _typPohody: spolu < 0 || p.opravuje_cislo ? "receivedCreditNotice" : "receivedInvoice",
  };
}
