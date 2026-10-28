-- Zápis prijatých faktúr, bločkov a produktov cez verejné API.
-- external_id: idempotencia (to isté external_id = ten istý záznam, nič sa nezdvojí).
alter table public.purchase_invoices add column if not exists external_id text;
alter table public.expense_documents add column if not exists external_id text;
alter table public.products add column if not exists external_id text;

create unique index if not exists purchase_invoices_external_id_uniq
  on public.purchase_invoices (company_id, external_id) where external_id is not null;
create unique index if not exists expense_documents_external_id_uniq
  on public.expense_documents (company_id, external_id) where external_id is not null;
create unique index if not exists products_external_id_uniq
  on public.products (company_id, external_id) where external_id is not null;

-- Zdroj „api“, nech je v zozname vidieť, odkiaľ doklad prišiel.
alter table public.purchase_invoices drop constraint if exists purchase_invoices_source_check;
alter table public.purchase_invoices add constraint purchase_invoices_source_check
  check (source = any (array['rucne','mail','doklad','efaktura','import','nahrate','api']));
alter table public.expense_documents drop constraint if exists expense_documents_source_check;
alter table public.expense_documents add constraint expense_documents_source_check
  check (source = any (array['photo','qr','upload','web','import','api']));
