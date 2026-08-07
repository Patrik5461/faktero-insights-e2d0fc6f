-- Odkiaľ výpis pochádza: 'bank' = vydala ho banka (TB Premium API),
-- 'faktero' = zostavili sme ho sami z natiahnutých transakcií (účty mimo TB).
alter table public.bank_statements
  add column if not exists source text not null default 'bank';

alter table public.bank_statements
  drop constraint if exists bank_statements_source_check;
alter table public.bank_statements
  add constraint bank_statements_source_check check (source in ('bank', 'faktero'));
