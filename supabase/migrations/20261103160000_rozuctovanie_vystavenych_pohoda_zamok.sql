-- Rozúčtovanie vystavených faktúr (3. 11. 2026, bod 4 „Povoľ rozúčtovanie
-- položiek pri faktúrach“).
--
-- 1) `invoices.rozuctovanie` — rozúčtovanie sumy faktúry na viac riadkov
--    (predkontácia, členenie DPH, KV, stredisko, činnosť, sadzba, základ, DPH),
--    rovnaký tvar ako na purchase_invoices / expense_documents. Súčty po
--    sadzbách musia sedieť s položkami (kontroluje server aj export).
-- 2) `invoice_items.stredisko` / `cinnost` — stredisko a činnosť pri položke
--    (do Pohody `inv:centre` / `inv:activity` položky).
-- 3) Zámok odovzdaných (pohoda_zamok): nové polia idú do XML, po odovzdaní
--    sa nesmú meniť — spúšťače dostanú nové stĺpce. Zoznamy sú v
--    `src/lib/faktero/pohoda-zamok.ts` (test drží zhodu s touto migráciou).
--
-- Len súbor — aplikuje sa cez MCP (verzie migrácií nesedia s `db push`).

alter table public.invoices add column if not exists rozuctovanie jsonb;
alter table public.invoice_items add column if not exists stredisko text;
alter table public.invoice_items add column if not exists cinnost text;

comment on column public.invoices.rozuctovanie is
  'Rozúčtovanie faktúry na riadky [{predkontacia, clenenie, kv, stredisko, cinnost, sadzba, zaklad, dph, text}] — sumy kladné, súčty po sadzbách = položky.';
comment on column public.invoice_items.stredisko is 'Stredisko položky (Pohoda inv:centre); prázdne = z faktúry.';
comment on column public.invoice_items.cinnost is 'Činnosť položky (Pohoda inv:activity); prázdne = z faktúry.';

drop trigger if exists invoices_zamok_odovzdania on public.invoices;
create trigger invoices_zamok_odovzdania
  before update or delete on public.invoices
  for each row execute function public.zamok_odovzdanej_faktury(
    'type', 'invoice_number', 'number_series_id', 'sequence_number', 'variable_symbol', 'constant_symbol',
    'specific_symbol', 'order_number', 'issue_date', 'delivery_date', 'due_date', 'customer_id',
    'customer_name', 'customer_street', 'customer_city', 'customer_zip', 'customer_country', 'customer_ico',
    'customer_dic', 'customer_ic_dph', 'customer_email', 'subtotal', 'vat_total', 'total', 'subtotal_eur',
    'vat_total_eur', 'total_eur', 'discount_total', 'discount_type', 'discount_value', 'rounding_mode',
    'advance_invoice_id', 'advance_amount', 'reverse_charge', 'reverse_charge_type', 'eu_plnenie', 'oss',
    'oss_country', 'osobitna_uprava', 'oprava_25a', 'opravuje_fakturu_id', 'currency', 'exchange_rate',
    'exchange_rate_date', 'intro_note', 'notes', 'payment_method', 'pohoda_predkontacia',
    'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'rozuctovanie', 'cancelled_at', 'deleted_at'
  );

drop trigger if exists invoice_items_zamok_odovzdania on public.invoice_items;
create trigger invoice_items_zamok_odovzdania
  before insert or update or delete on public.invoice_items
  for each row execute function public.zamok_polozky_odovzdanej_faktury(
    'invoice_id', 'position', 'name', 'description', 'quantity', 'unit', 'unit_price', 'discount_percent',
    'vat_rate', 'subtotal', 'vat_amount', 'total', 'prenesenie', 'colny_kod', 'krajina_povodu',
    'hmotnost_kg', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost'
  );
