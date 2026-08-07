-- Údaje potrebné na zaplatenie prijatej faktúry. Doteraz sa neevidovali,
-- takže platobný príkaz nemal odkiaľ vziať účet dodávateľa ani symbol.
alter table public.purchase_invoices
  add column if not exists supplier_iban text,
  add column if not exists variable_symbol text,
  add column if not exists constant_symbol text,
  add column if not exists specific_symbol text;

comment on column public.purchase_invoices.supplier_iban is
  'Účet dodávateľa, na ktorý sa faktúra uhrádza (platobný príkaz cez TB Premium API).';
