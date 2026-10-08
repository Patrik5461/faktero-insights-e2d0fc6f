/*
  Hľadanie tej istej prijatej faktúry v databáze. Kandidátov vyberie podľa
  presného čísla a podľa IČO či názvu dodávateľa (číslo býva zapísané rôzne —
  s nulami, pomlčkami), o zhode rozhodne `jeTaIstaPrijata`.
*/
import { jeTaIstaPrijata, normCislo, type OdtlacokPrijatej } from "./prijate-duplicity";

type Klient = any;

export type NajdenaDuplicita = {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  amount_total: number | null;
  issue_date: string | null;
  kde: "prijate" | "nespracovane";
};

export async function najdiDuplicituPrijatej(
  supabase: Klient,
  companyId: string,
  o: OdtlacokPrijatej,
  vylucit: { prijataId?: string | null; nespracovanyId?: string | null } = {},
): Promise<NajdenaDuplicita | null> {
  if (!normCislo(o.invoice_number)) return null;
  const stlpce =
    "id, invoice_number, supplier_name, supplier_ico, supplier_iban, amount_total, issue_date";
  const dotazy: PromiseLike<{ data: any[] | null }>[] = [
    supabase
      .from("purchase_invoices")
      .select(stlpce)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("invoice_number", String(o.invoice_number).trim())
      .limit(50),
  ];
  const ico = String(o.supplier_ico ?? "").trim();
  if (ico)
    dotazy.push(
      supabase
        .from("purchase_invoices")
        .select(stlpce)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("supplier_ico", ico)
        .order("issue_date", { ascending: false })
        .limit(1000),
    );
  else if (String(o.supplier_name ?? "").trim())
    dotazy.push(
      supabase
        .from("purchase_invoices")
        .select(stlpce)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .ilike("supplier_name", String(o.supplier_name).trim())
        .order("issue_date", { ascending: false })
        .limit(1000),
    );
  const vysledky = await Promise.all(dotazy);
  for (const { data } of vysledky)
    for (const r of data ?? []) {
      if (vylucit.prijataId && r.id === vylucit.prijataId) continue;
      if (jeTaIstaPrijata(o, r))
        return {
          id: r.id,
          invoice_number: r.invoice_number,
          supplier_name: r.supplier_name,
          amount_total: r.amount_total == null ? null : Number(r.amount_total),
          issue_date: r.issue_date,
          kde: "prijate",
        };
    }

  // Tá istá faktúra môže ešte čakať v Nespracovaných (prišla mailom dvakrát).
  const { data: cakajuce } = await supabase
    .from("nespracovane_doklady")
    .select("id, udaje")
    .eq("company_id", companyId)
    .eq("udaje->>cislo", String(o.invoice_number).trim())
    .limit(20);
  for (const r of (cakajuce ?? []) as any[]) {
    if (vylucit.nespracovanyId && r.id === vylucit.nespracovanyId) continue;
    const u = r.udaje ?? {};
    const kandidat = {
      invoice_number: u.cislo ?? null,
      supplier_ico: u.dodavatel?.ico ?? null,
      supplier_name: u.dodavatel?.nazov ?? null,
      supplier_iban: u.dodavatel?.iban ?? u.iban ?? null,
      amount_total: u.celkom ?? null,
    };
    if (jeTaIstaPrijata(o, kandidat))
      return {
        id: r.id,
        invoice_number: kandidat.invoice_number,
        supplier_name: kandidat.supplier_name,
        amount_total: kandidat.amount_total == null ? null : Number(kandidat.amount_total),
        issue_date: u.datumVystavenia ?? null,
        kde: "nespracovane",
      };
  }
  return null;
}
