-- Denník e-mailov o konci súhlasu banky a o pohyboch, ktoré sa pre vypršaný
-- súhlas nesťahujú. Každé upozornenie (pripojenie/účet × druh × deň) ide raz.
-- Píše a číta len server (service_role); používateľ k tabuľke prístup nemá.
create table if not exists public.bank_suhlas_upozornenia (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- id pripojenia (bank_connections) alebo účtu (bank_accounts) — bez FK,
  -- aby denník nebránil mazaniu pripojenia a nikdy nič nekaskádoval.
  ref_id uuid not null,
  druh text not null check (druh in ('suhlas_14', 'suhlas_3', 'suhlas_vyprsal', 'pohyby')),
  termin date not null,
  prijemca text,
  created_at timestamptz not null default now(),
  unique (ref_id, druh, termin)
);

alter table public.bank_suhlas_upozornenia enable row level security;

create policy "mfa ak je zapnute" on public.bank_suhlas_upozornenia
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.bank_suhlas_upozornenia from public, anon, authenticated;
grant select, insert, update, delete on public.bank_suhlas_upozornenia to service_role;

create index if not exists bank_suhlas_upozornenia_company_idx
  on public.bank_suhlas_upozornenia (company_id);
