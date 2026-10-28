-- 1) Schvaľovanie aj pre Nespracované doklady a Vyúčtovanie výdavkov.
alter table public.schvalovanie drop constraint if exists schvalovanie_agenda_check;
alter table public.schvalovanie add constraint schvalovanie_agenda_check
  check (agenda in ('doklad', 'prijata', 'vystavena', 'nespracovany', 'vyuctovanie'));

-- 2) Údaje o členovi firmy.
--    schvalovanie_prava: {schvalit, zrusit, vratit, zamietnut} — null = podľa roly.
alter table public.company_users
  add column if not exists schvalovanie_prava jsonb,
  add column if not exists cislo_zamestnanca text check (cislo_zamestnanca is null or length(cislo_zamestnanca) <= 40),
  add column if not exists telefon text check (telefon is null or length(telefon) <= 40),
  add column if not exists predvolena_zakazka_id uuid references public.jobs(id) on delete set null;
create index if not exists company_users_predvolena_zakazka on public.company_users (predvolena_zakazka_id)
  where predvolena_zakazka_id is not null;
