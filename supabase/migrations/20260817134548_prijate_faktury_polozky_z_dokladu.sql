-- Položky prečítané z dokladu. Rovnaký tvar ako `expense_documents.items`,
-- teda jsonb a nie vlastná tabuľka: sú to údaje **z papiera**, nie doklad, na
-- ktorý by sa dalo odvolávať — nikto ich nespája so skladom ani s cenníkom.
alter table public.purchase_invoices
  add column if not exists items jsonb;

comment on column public.purchase_invoices.items is
  'Položky prečítané z dokladu: [{name, quantity, unit, unit_price, vat_rate, total}]. Informatívne, needitujú sa.';
