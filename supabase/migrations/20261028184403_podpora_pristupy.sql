-- 3) Dočasný prístup technickej podpory (udeľuje majiteľ, zapisuje len server).
create table if not exists public.podpora_pristupy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rozsah text not null check (rozsah in ('citanie', 'plny')),
  platne_do timestamptz not null,
  stav text not null default 'aktivny' check (stav in ('aktivny', 'odobraty', 'vyprsal')),
  dovod text check (dovod is null or length(dovod) <= 500),
  udelil uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ukoncil uuid references auth.users(id) on delete set null,
  ukoncene_at timestamptz
);
create index if not exists podpora_pristupy_firma on public.podpora_pristupy (company_id, created_at desc);
create index if not exists podpora_pristupy_aktivne on public.podpora_pristupy (platne_do) where stav = 'aktivny';
create index if not exists podpora_pristupy_udelil on public.podpora_pristupy (udelil) where udelil is not null;
create index if not exists podpora_pristupy_ukoncil on public.podpora_pristupy (ukoncil) where ukoncil is not null;

alter table public.podpora_pristupy enable row level security;
create policy "spravca firmy cita" on public.podpora_pristupy for select to authenticated
  using (public.is_company_admin(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.podpora_pristupy as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.podpora_pristupy from public, anon;
grant select on public.podpora_pristupy to authenticated;
grant all on public.podpora_pristupy to service_role;

-- Členstvo, ktoré vzniklo z prístupu podpory — zmizne s ním.
alter table public.company_users
  add column if not exists podpora_pristup_id uuid references public.podpora_pristupy(id) on delete cascade;
create index if not exists company_users_podpora on public.company_users (podpora_pristup_id)
  where podpora_pristup_id is not null;
