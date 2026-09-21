-- Import prijatých dokladov z inej aplikácie (Doklado, Pohoda, tabuľka).
-- Zdroj „import" odlíši takýto doklad od ručne zapísaného a z mailu.
alter table public.purchase_invoices drop constraint purchase_invoices_source_check;
alter table public.purchase_invoices add constraint purchase_invoices_source_check
  check (source = any (array['rucne', 'mail', 'doklad', 'efaktura', 'import']));

alter table public.expense_documents drop constraint expense_documents_source_check;
alter table public.expense_documents add constraint expense_documents_source_check
  check (source = any (array['photo', 'qr', 'upload', 'web', 'import']));

-- Priebeh importu pre stránku: koľko je hotovo z koľkých a čo sa preskočilo.
alter table public.import_jobs
  add column if not exists processed_rows integer not null default 0,
  add column if not exists result jsonb;
