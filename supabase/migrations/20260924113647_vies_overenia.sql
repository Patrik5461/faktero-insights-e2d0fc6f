-- Overenie IČ DPH vo VIES a dôkaz o ňom.
--
-- Pri dodaní tovaru do iného členského štátu je platné IČ DPH odberateľa
-- hmotnoprávnou podmienkou oslobodenia od dane (§ 43 a tzv. quick fixes od
-- roku 2020). Pri kontrole treba vedieť preukázať, že sa overovalo — a kedy.
create table if not exists public.vies_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  ic_dph text not null,
  platne boolean not null,
  nazov text,
  adresa text,
  /* Identifikátor konzultácie z VIES — ten je pri kontrole ten pravý dôkaz. */
  potvrdenie text,
  chyba text,
  overene_at timestamptz not null default now(),
  overil uuid references auth.users(id) on delete set null
);

create index if not exists vies_checks_firma_ic on public.vies_checks (company_id, ic_dph, overene_at desc);

alter table public.vies_checks enable row level security;

revoke all on public.vies_checks from public;
revoke all on public.vies_checks from anon;
grant select, insert on public.vies_checks to authenticated;
grant all on public.vies_checks to service_role;

drop policy if exists "clenovia firmy citaju" on public.vies_checks;
create policy "clenovia firmy citaju" on public.vies_checks for select to authenticated
  using (public.is_company_member(company_id, auth.uid()));
drop policy if exists "clenovia firmy zapisuju" on public.vies_checks;
create policy "clenovia firmy zapisuju" on public.vies_checks for insert to authenticated
  with check (public.is_company_writer(company_id, auth.uid()));

drop policy if exists "mfa ak je zapnute" on public.vies_checks;
create policy "mfa ak je zapnute" on public.vies_checks as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Overenia patria k odberateľom, teda do oblasti kontaktov.
select public.vlastny_pristup_politiky_na('vies_checks', 'company_id', 'kontakty');

-- Posledný výsledok priamo na odberateľovi — aby sa pri fakturácii nemuselo
-- hľadať v histórii.
alter table public.customers
  add column if not exists vies_platne boolean,
  add column if not exists vies_overene_at timestamptz;
