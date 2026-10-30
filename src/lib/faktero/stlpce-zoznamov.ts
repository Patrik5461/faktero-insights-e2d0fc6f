/*
  Stĺpce, ktoré zoznamy dokladov naozaj čítajú. `select("*")` ťahal aj
  položky (`items`, JSON s riadkami dokladu) a rozpis DPH — u PALIERY 3,9 MB
  prijatých a 5,8 MB bločkov pri každom otvorení zoznamu. Položky potrebuje
  len export do Excelu; ten si ich dotiahne sám (`polozkyDokladov`).

  Zoznam vznikol prechodom zdrojákov zoznamu a všetkého, čo importuje, do
  dvoch úrovní (každý stĺpec, ktorého meno sa tam vyskytuje). Keď zoznam,
  hromadná akcia alebo pomocník začne čítať nový stĺpec, treba ho sem doplniť
  — inak bude v riadku `undefined`.
*/

import { supabase } from "@/integrations/supabase/client";
import { riadkyPreIds } from "@/lib/faktero/strankovanie";

/** Prijaté faktúry (`purchase_invoices`) bez `items`. */
export const SELECT_PRIJATYCH =
  "id,company_id,supplier_name,supplier_ico,supplier_dic,supplier_ic_dph,invoice_number,issue_date,received_date,due_date,payment_date,payment_method,amount_without_vat,vat_amount,amount_total,currency,status,note,file_path,file_mime,file_size,created_by,deleted_at,created_at,updated_at,supplier_iban,variable_symbol,constant_symbol,specific_symbol,job_id,source,dph_rezim,delivery_date,odpocet,opravuje_cislo,exchange_rate,type,advance_invoice_id,samofakturacia,samofakturacia_stav,customer_id,supplier_street,supplier_city,supplier_zip,supplier_country,reverse_charge,reverse_charge_type,eu_plnenie,intro_note,discount_total,advance_amount,povodna_splatnost,category,pohoda_predkontacia,pohoda_clenenie_dph,pravidlo_id,zauctovane_at,zauctoval,exported_at,pohoda_cislo,export_job_id,rozuctovanie,kv_clenenie,stredisko,cinnost,pohoda_rad,int_poznamka,pdf_token,order_number,delivery_note_number,locked_at,predmet_mailu,stitky,inbox_message_id,vyuctovanie_id,pohoda_verzia,spracoval,spracovane_at,vehicle_id,zauctovanie_zdroj,zauctovanie_istota,auto_uctovanie_navrh,odosielatel_mailu,stav_id,komentar,prvy_export_at,pocet_exportov,export_cesta,vratene_z_pohody_at,oprava_zauctovania_at,oprava_zauctovania_povodne,odberatel_nesedi";

/** Doklady/bločky (`expense_documents`) bez `items` a `vat_breakdown`. */
export const SELECT_DOKLADOV =
  "id,company_id,created_by,status,source,supplier_name,supplier_ico,supplier_ic_dph,document_number,issue_date,total_amount,vat_amount,net_amount,vat_rate,currency,category,note,file_path,file_mime,file_size,qr_raw,ai_raw,exported_at,export_job_id,created_at,updated_at,payment_method,pohoda_cislo,processed_at,processed_by,odpocet,pohoda_predkontacia,pohoda_clenenie_dph,pravidlo_id,rozuctovanie,kv_clenenie,job_id,stredisko,cinnost,pohoda_rad,int_poznamka,pohoda_pokladna,locked_at,stitky,inbox_message_id,vyuctovanie_id,zauctovane_at,zauctoval,zauctovanie_zdroj,zauctovanie_istota,auto_uctovanie_navrh,stav_id,komentar,prvy_export_at,pocet_exportov,export_cesta,vratene_z_pohody_at,oprava_zauctovania_at,oprava_zauctovania_povodne";

/** Vystavené faktúry (`invoices`) — zoznam je stránkovaný, toto len zmenší stránku. */
export const SELECT_VYSTAVENYCH =
  "id,company_id,customer_id,type,status,invoice_number,variable_symbol,issue_date,delivery_date,due_date,currency,payment_method,customer_name,customer_ico,customer_dic,customer_ic_dph,customer_street,customer_city,customer_zip,customer_country,customer_email,subtotal,vat_total,total,notes,sent_at,paid_at,created_by,created_at,updated_at,deleted_at,constant_symbol,specific_symbol,order_number,delivery_method,rounding_mode,advance_invoice_id,reverse_charge,reverse_charge_type,sequence_number,job_id,opravuje_fakturu_id,intro_note,payment_account_id,eu_plnenie,subtotal_eur,vat_total_eur,total_eur,oss,language,discount_type,discount_value,discount_total,number_series_id,oprava_25a,povodna_splatnost,pohoda_predkontacia,pohoda_clenenie_dph,kv_clenenie,zauctovane_at,zauctoval,stredisko,cinnost,int_poznamka,pravidlo_id,exported_at,zauctovanie_zdroj,zauctovanie_istota,auto_uctovanie_navrh,stav_id,komentar,stitky,prvy_export_at,pocet_exportov,export_cesta,vratene_z_pohody_at,oprava_zauctovania_at,oprava_zauctovania_povodne";

/**
 * Riadky zoznamu doplnené o položky (`items`) — pre export do Excelu, ktorý
 * ich jediný potrebuje. Dotiahnu sa až pri akcii, po dávkach id.
 */
export async function sPolozkami<T extends { id: string }>(
  tabulka: "purchase_invoices" | "expense_documents",
  riadky: T[],
): Promise<(T & { items: unknown })[]> {
  if (!riadky.length) return [];
  const polozky = await riadkyPreIds<{ id: string; items: unknown }>(
    riadky.map((r) => r.id),
    (kus, od, po) =>
      supabase.from(tabulka).select("id, items").in("id", kus).order("id").range(od, po) as any,
  );
  const podlaId = new Map(polozky.map((p) => [p.id, p.items]));
  return riadky.map((r) => ({ ...r, items: podlaId.get(r.id) ?? null }));
}
