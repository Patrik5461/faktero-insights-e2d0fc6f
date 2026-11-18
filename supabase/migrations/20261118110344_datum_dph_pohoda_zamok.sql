-- Dátum daňovej povinnosti (`datum_dph`) je zamknutý aj po odovzdaní do Pohody —
-- určuje dateTax/dateKVDPH, zmena by sa s účtovníctvom rozišla. Spúšťače
-- `*_zamok_odovzdania` sú rovnaké ako doteraz, len s poľom datum_dph za delivery_date.

drop trigger if exists invoices_zamok_odovzdania on public.invoices;
create trigger invoices_zamok_odovzdania
  before delete or update on public.invoices
  for each row execute function public.zamok_odovzdanej_faktury(
    'type', 'invoice_number', 'number_series_id', 'sequence_number', 'variable_symbol',
    'constant_symbol', 'specific_symbol', 'order_number', 'issue_date', 'delivery_date',
    'datum_dph', 'due_date', 'customer_id', 'customer_name', 'customer_street', 'customer_city',
    'customer_zip', 'customer_country', 'customer_ico', 'customer_dic', 'customer_ic_dph',
    'customer_email', 'subtotal', 'vat_total', 'total', 'subtotal_eur', 'vat_total_eur',
    'total_eur', 'discount_total', 'discount_type', 'discount_value', 'rounding_mode',
    'advance_invoice_id', 'advance_amount', 'reverse_charge', 'reverse_charge_type',
    'eu_plnenie', 'oss', 'oss_country', 'osobitna_uprava', 'oprava_25a', 'opravuje_fakturu_id',
    'currency', 'exchange_rate', 'exchange_rate_date', 'intro_note', 'notes', 'payment_method',
    'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost',
    'rozuctovanie', 'cancelled_at', 'deleted_at');

drop trigger if exists purchase_invoices_zamok_odovzdania on public.purchase_invoices;
create trigger purchase_invoices_zamok_odovzdania
  before delete or update on public.purchase_invoices
  for each row execute function public.zamok_odovzdaneho_dokladu(
    'type', 'invoice_number', 'variable_symbol', 'constant_symbol', 'specific_symbol',
    'order_number', 'delivery_note_number', 'opravuje_cislo', 'issue_date', 'delivery_date',
    'datum_dph', 'due_date', 'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph',
    'supplier_street', 'supplier_city', 'supplier_zip', 'supplier_country', 'supplier_iban',
    'amount_without_vat', 'vat_amount', 'amount_total', 'discount_total', 'items',
    'vat_breakdown', 'currency', 'exchange_rate', 'dph_rezim', 'reverse_charge', 'odpocet',
    'payment_method', 'intro_note', 'note', 'pohoda_predkontacia', 'pohoda_clenenie_dph',
    'kv_clenenie', 'rozuctovanie', 'stredisko', 'cinnost', 'pohoda_rad', 'job_id', 'category',
    'deleted_at');
