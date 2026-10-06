-- Zaúčtovanie vystavenej faktúry pre Pohodu: kódy na hlavičke aj na položkách.
alter table public.invoices
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists kv_clenenie text,
  add column if not exists zauctovane_at timestamptz,
  add column if not exists zauctoval uuid references auth.users(id) on delete set null;

alter table public.invoice_items
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists kv_clenenie text;

create index if not exists invoices_zauctoval_idx on public.invoices (zauctoval) where zauctoval is not null;
