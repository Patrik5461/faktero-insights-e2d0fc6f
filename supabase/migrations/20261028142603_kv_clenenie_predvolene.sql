-- Predvolené členenie kontrolného výkazu DPH podľa druhu dokladu.
-- Použije sa pri zaúčtovaní bežného dokladu (nie pri prenesení či opravnom doklade).
alter table public.companies
  add column if not exists kv_clenenie_faktura text,
  add column if not exists kv_clenenie_prijata text,
  add column if not exists kv_clenenie_doklady text;

alter table public.companies drop constraint if exists companies_kv_clenenie_predvolene_chk;
alter table public.companies add constraint companies_kv_clenenie_predvolene_chk check (
  (kv_clenenie_faktura is null or kv_clenenie_faktura in ('A1','A2','C1','D1','D2','X')) and
  (kv_clenenie_prijata is null or kv_clenenie_prijata in ('B1','B2','B3','C2','X')) and
  (kv_clenenie_doklady is null or kv_clenenie_doklady in ('B1','B2','B3','C2','X'))
);
