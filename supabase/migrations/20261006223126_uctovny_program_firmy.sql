-- Účtovný program firmy a jeho nastavenia (Omega evidencie/rady/účty, Money S3, ABRA Flexi…).
alter table public.companies
  add column if not exists uctovny_program text not null default 'pohoda'
    check (uctovny_program in ('pohoda','omega','money_s3','flexi','csv')),
  add column if not exists uctovanie_nastavenia jsonb not null default '{}'::jsonb;
comment on column public.companies.uctovny_program is 'Kam ide zaúčtovanie dokladov: pohoda, omega, money_s3, flexi, csv';
comment on column public.companies.uctovanie_nastavenia is 'Nastavenia exportu podľa programu, kľúč = program';
