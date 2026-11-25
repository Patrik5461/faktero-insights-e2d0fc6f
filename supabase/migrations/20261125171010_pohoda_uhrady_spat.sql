-- Obojsmerný most s Pohodou (25. 11. 2026): úhrady z Pohody do Faktera.
-- Každá likvidácia z Pohody = jedna úhrada s external_id `pohoda:<id>`, aby sa nezapísala dvakrát.
alter table public.payments add column if not exists external_id text
  check (external_id is null or char_length(external_id) between 1 and 120);
create unique index if not exists payments_external_id_uq
  on public.payments (company_id, external_id) where external_id is not null;

alter table public.purchase_invoice_payments drop constraint if exists purchase_invoice_payments_zdroj_check;
alter table public.purchase_invoice_payments add constraint purchase_invoice_payments_zdroj_check
  check (zdroj = any (array['rucne'::text, 'banka'::text, 'oznacenie'::text, 'pohoda'::text]));

alter table public.companies
  add column if not exists pohoda_uhrady_zapnute boolean not null default true,
  add column if not exists pohoda_uhrady_ziadost_at timestamptz,
  add column if not exists pohoda_uhrady_sync_at timestamptz,
  add column if not exists pohoda_uhrady_vysledok jsonb;
