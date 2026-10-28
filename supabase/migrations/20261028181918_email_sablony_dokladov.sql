/*
  E-mailové šablóny pre odosielanie dokladov — viac šablón podľa typu dokladu
  a jazyka. Pri odoslaní sa vyberie tá, ktorá najlepšie sedí na typ a jazyk
  dokladu (presná zhoda > „všetky“); v okne odoslania sa dá zmeniť.

  Staré `email_templates` (jedna šablóna na druh) ostávajú — upomienky
  a schvaľovanie z nich čítajú ďalej a sú poistkou, keď firma novú nemá.
*/
create table public.email_sablony (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (char_length(nazov) between 1 and 120),
  typ_dokladu text not null default 'vsetky'
    check (typ_dokladu in ('vsetky', 'regular', 'proforma', 'advance_payment', 'credit_note', 'debit_note', 'upomienka', 'ponuka')),
  jazyk text not null default 'vsetky' check (jazyk in ('vsetky', 'sk', 'cs', 'de', 'en', 'hu')),
  predmet text not null check (char_length(predmet) between 1 and 500),
  text text not null check (char_length(text) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_sablony_firma_idx on public.email_sablony (company_id, typ_dokladu, jazyk);

alter table public.email_sablony enable row level security;

create policy "clenovia citaju sablony" on public.email_sablony for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju sablony" on public.email_sablony for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju sablony" on public.email_sablony for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu sablony" on public.email_sablony for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.email_sablony as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));

select public.vlastny_pristup_politiky_na('email_sablony', 'company_id', 'faktury');

revoke all on public.email_sablony from anon, public;
grant select, insert, update, delete on public.email_sablony to authenticated;
grant all on public.email_sablony to service_role;
