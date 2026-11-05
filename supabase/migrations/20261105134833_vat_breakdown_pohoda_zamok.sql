-- Zámok odovzdaných prijatých faktúr: aj rozpis DPH po sadzbách
-- (`purchase_invoices.vat_breakdown`, 20261105134823_oprava_rozpisu_dph).
-- Po odovzdaní do Pohody/účtovníctva sa rozpis nesmie meniť rovnako ako sumy.
-- Zoznam polí sa musí zhodovať so `ZAMOK_PRIJATEJ` v src/lib/faktero/pohoda-zamok.ts
-- (kontroluje pohoda-zamok.test.ts). Idempotentné.

drop trigger if exists purchase_invoices_zamok_odovzdania on public.purchase_invoices;
create trigger purchase_invoices_zamok_odovzdania
  before delete or update on public.purchase_invoices
  for each row execute function public.zamok_odovzdaneho_dokladu('type', 'invoice_number', 'variable_symbol', 'constant_symbol', 'specific_symbol', 'order_number', 'delivery_note_number', 'opravuje_cislo', 'issue_date', 'delivery_date', 'due_date', 'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph', 'supplier_street', 'supplier_city', 'supplier_zip', 'supplier_country', 'supplier_iban', 'amount_without_vat', 'vat_amount', 'amount_total', 'discount_total', 'items', 'vat_breakdown', 'currency', 'exchange_rate', 'dph_rezim', 'reverse_charge', 'odpocet', 'payment_method', 'intro_note', 'note', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'rozuctovanie', 'stredisko', 'cinnost', 'pohoda_rad', 'job_id', 'category', 'deleted_at');
